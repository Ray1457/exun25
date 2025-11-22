import asyncio
import contextlib
import json
import math
import random
import time
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT_DIR = Path(__file__).resolve().parent.parent
MAP_PATH = ROOT_DIR / "map.png"

class CollisionField:

    TARGET_HEX = "bfb387"
    TARGET_BGR = np.array([0x87, 0xB3, 0xBF], dtype=np.uint8)
    COLOR_TOLERANCE = 24.0
    DEFAULT_SPAWN_MARGIN = 30

    def __init__(self, image_path: Path):
        self.source_image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if self.source_image is None:
            raise FileNotFoundError(f"Map image not found at {image_path}")

        self.walkable_mask = self._build_walkable_mask(self.source_image)
        self.height, self.width = self.walkable_mask.shape

        walkable_coords = np.column_stack(np.where(self.walkable_mask))
        if walkable_coords.size == 0:
            raise ValueError(
                "No walkable region detected in map.png. Ensure paths use #bfb387 (and similar hues)."
            )
        self.walkable_coords = walkable_coords
        self._margin_cache: Dict[int, np.ndarray] = {}

    def _build_walkable_mask(self, image: np.ndarray) -> np.ndarray:
        lab_image = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        target_lab = cv2.cvtColor(self.TARGET_BGR.reshape(1, 1, 3), cv2.COLOR_BGR2LAB)[0, 0]

        delta = np.linalg.norm(lab_image.astype(np.int16) - target_lab.astype(np.int16), axis=2)
        mask = (delta <= self.COLOR_TOLERANCE).astype(np.uint8) * 255

        kernel_close = np.ones((5, 5), np.uint8)
        kernel_open = np.ones((3, 3), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_close)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_open)

        return mask == 255

    def is_walkable(self, x: float, y: float) -> bool:
        ix, iy = int(round(x)), int(round(y))
        if ix < 0 or iy < 0 or ix >= self.width or iy >= self.height:
            return False
        return bool(self.walkable_mask[iy, ix])

    def random_walkable_point(self, margin: int = 0) -> Tuple[float, float]:
        coords = self._coords_with_margin(margin)
        iy, ix = coords[np.random.randint(len(coords))]
        return float(ix), float(iy)

    def _coords_with_margin(self, margin: int) -> np.ndarray:
        if margin <= 0:
            return self.walkable_coords

        cached = self._margin_cache.get(margin)
        if cached is not None and len(cached) > 0:
            return cached

        coords = self.walkable_coords
        mask = (
            (coords[:, 0] >= margin)
            & (coords[:, 0] < self.height - margin)
            & (coords[:, 1] >= margin)
            & (coords[:, 1] < self.width - margin)
        )
        filtered = coords[mask]
        if len(filtered) == 0:
            self._margin_cache[margin] = self.walkable_coords
            return self.walkable_coords

        self._margin_cache[margin] = filtered
        return filtered

    def cluster_origin(self) -> Tuple[float, float]:
        sample_size = min(500, len(self.walkable_coords))
        sample_indices = np.random.choice(len(self.walkable_coords), size=sample_size, replace=False)
        subset = self.walkable_coords[sample_indices]
        mean_y, mean_x = subset.mean(axis=0)
        return float(mean_x), float(mean_y)

    def snap_to_walkable(self, x: float, y: float, max_radius: int = 80) -> Tuple[float, float]:

        if self.is_walkable(x, y):
            return float(x), float(y)

        ix, iy = int(round(x)), int(round(y))
        anchor = np.array([x, y], dtype=np.float32)

        for radius in range(4, max_radius + 1, 4):
            min_x = max(ix - radius, 0)
            max_x = min(ix + radius, self.width - 1)
            min_y = max(iy - radius, 0)
            max_y = min(iy + radius, self.height - 1)

            region = self.walkable_mask[min_y : max_y + 1, min_x : max_x + 1]
            coords = np.argwhere(region)
            if coords.size == 0:
                continue

            abs_coords = coords + np.array([min_y, min_x])
            points = np.stack((abs_coords[:, 1], abs_coords[:, 0]), axis=1).astype(np.float32)
            distances = np.sum((points - anchor) ** 2, axis=1)
            best_idx = int(np.argmin(distances))
            px, py = points[best_idx]
            return float(px), float(py)

        return self.random_walkable_point()


class Agent:
    def __init__(self, agent_id: int, origin: Tuple[float, float], spawned_at: float):
        offset_radius = random.uniform(8, 18)
        angle = random.uniform(0, 2 * math.pi)
        self.position = np.array(
            [origin[0] + math.cos(angle) * offset_radius, origin[1] + math.sin(angle) * offset_radius],
            dtype=np.float32,
        )
        self.agent_id = agent_id
        self.speed = random.uniform(18, 35)
        self.heading = random.uniform(0, 2 * math.pi)
        self.turn_rate = random.uniform(0.5, 1.2)
        self.is_large = False
        self.last_unshrinked_at = spawned_at - random.uniform(0, 90)

    def _proposed_step(self, dt: float) -> np.ndarray:
        vx = math.cos(self.heading) * self.speed * dt
        vy = math.sin(self.heading) * self.speed * dt
        return self.position + np.array([vx, vy], dtype=np.float32)

    def step(self, field: CollisionField, dt: float) -> None:
        self.heading += random.uniform(-self.turn_rate, self.turn_rate) * dt
        proposed = self._proposed_step(dt)
        for _ in range(5):
            if field.is_walkable(proposed[0], proposed[1]):
                self.position = proposed
                return
            self.heading = random.uniform(0, 2 * math.pi)
            proposed = self._proposed_step(dt)

        self.position = np.array(field.snap_to_walkable(self.position[0], self.position[1]), dtype=np.float32)


class Crowd:
    def __init__(self, field: CollisionField):
        self.field = field
        self.people: List[Agent] = []
        self.lock = asyncio.Lock()
        self.update_task: Optional[asyncio.Task] = None
        self.max_unshrink_interval = 300.0
        self.min_event_interval = 6.0
        self.max_event_interval = 14.0
        self.next_unshrink_event = 0.0
        self.min_random_shrink_interval = 8.0
        self.max_random_shrink_interval = 20.0
        self.next_shrink_event = 0.0
        self.max_agents = 10
        self.next_agent_id = 0
        self._sigma_memory: Dict[int, np.ndarray] = {}
        self._smoothing_alpha = 0.22
        self._last_state: Dict[str, object] = {
            "timestamp": time.time(),
            "people": [],
            "fhu": {"x": 0.0, "y": 0.0, "confidence": 0.0},
            "map": {"width": self.field.width, "height": self.field.height},
            "counts": {"small": 0, "large": 0},
        }
        self._spawn_agents()

    def _spawn_agents(self) -> None:
        crowd_size = random.randint(5, 7)
        center = self.field.cluster_origin()
        now = time.time()
        spawned: List[Agent] = []
        for _ in range(crowd_size):
            jitter_x = center[0] + random.uniform(-40.0, 40.0)
            jitter_y = center[1] + random.uniform(-40.0, 40.0)
            snapped = self.field.snap_to_walkable(jitter_x, jitter_y)
            spawned.append(self._create_agent(snapped, now))
        self.people = spawned
        self.next_unshrink_event = now
        self._schedule_next_shrink(now)

    def _create_agent(self, origin: Tuple[float, float], timestamp: float) -> Agent:
        agent = Agent(self.next_agent_id, origin, timestamp)
        self.next_agent_id += 1
        return agent

    def _schedule_next_shrink(self, now: float) -> None:
        self.next_shrink_event = now + random.uniform(self.min_random_shrink_interval, self.max_random_shrink_interval)

    def _find_person(self, person_id: int) -> Optional[Agent]:
        for person in self.people:
            if person.agent_id == person_id:
                return person
        return None

    async def apply_move(self, person_id: int, x: float, y: float) -> bool:
        async with self.lock:
            person = self._find_person(person_id)
            if person is None:
                return False
            clamped_x = float(np.clip(x, 0, self.field.width - 1))
            clamped_y = float(np.clip(y, 0, self.field.height - 1))
            if not self.field.is_walkable(clamped_x, clamped_y):
                clamped_x, clamped_y = self.field.snap_to_walkable(clamped_x, clamped_y)
            person.position = np.array([clamped_x, clamped_y], dtype=np.float32)
            return True

    async def toggle_state(self, person_id: int, desired_state: Optional[str] = None) -> bool:
        async with self.lock:
            person = self._find_person(person_id)
            if person is None:
                return False
            if desired_state in {"large", "small"}:
                make_large = desired_state == "large"
            else:
                make_large = not person.is_large
            now = time.time()
            if make_large:
                person.is_large = True
                person.last_unshrinked_at = now
                self.next_unshrink_event = now + random.uniform(self.min_event_interval, self.max_event_interval)
            else:
                person.is_large = False
                self._schedule_next_shrink(now)
            return True

    async def start(self) -> None:
        if self.update_task is None:
            self.update_task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self.update_task:
            self.update_task.cancel()
            try:
                await self.update_task
            except asyncio.CancelledError:
                pass
            self.update_task = None

    async def _run(self) -> None:
        dt = 1.0 / 30.0
        while True:
            async with self.lock:
                current_time = time.time()
                for person in self.people:
                    person.step(self.field, dt)
                    self._apply_sigma_wave(person)
                self._update_unshrink_states(current_time)
                self._maybe_random_shrink(current_time)
                self._maybe_spawn_small_agents(current_time)

                tracker_payload = self._compute_fhu_estimate()
                large_count = sum(1 for p in self.people if p.is_large)
                small_count = len(self.people) - large_count
                self._last_state = {
                    "timestamp": current_time,
                    "people": [
                        {
                            "id": person.agent_id,
                            "x": float(person.position[0]),
                            "y": float(person.position[1]),
                            "state": "large" if person.is_large else "small",
                            "last_unshrinked_at": person.last_unshrinked_at,
                        }
                        for person in self.people
                    ],
                    "fhu": tracker_payload,
                    "map": {"width": self.field.width, "height": self.field.height},
                    "counts": {"large": large_count, "small": small_count},
                }
            await asyncio.sleep(dt)

    def _update_unshrink_states(self, now: float) -> None:
        candidates = [agent for agent in self.people if not agent.is_large]
        tardy_agents = [agent for agent in candidates if now - agent.last_unshrinked_at >= self.max_unshrink_interval]

        def promote(target: Agent) -> None:
            target.is_large = True
            target.last_unshrinked_at = now
            self.next_unshrink_event = now + random.uniform(self.min_event_interval, self.max_event_interval)

        if tardy_agents:
            promote(random.choice(tardy_agents))
            return

        if candidates and now >= self.next_unshrink_event:
            promote(random.choice(candidates))

    def _maybe_random_shrink(self, now: float) -> None:
        large_agents = [agent for agent in self.people if agent.is_large]
        if not large_agents:
            self._schedule_next_shrink(now)
            return
        if now >= self.next_shrink_event:
            victim = random.choice(large_agents)
            victim.is_large = False
            self._schedule_next_shrink(now)

    def _maybe_spawn_small_agents(self, now: float) -> None:
        large_count = sum(1 for agent in self.people if agent.is_large)
        small_count = len(self.people) - large_count
        if small_count >= large_count:
            return

        available_slots = self.max_agents - len(self.people)
        if available_slots <= 0:
            return

        deficit = min(large_count - small_count, available_slots)
        for _ in range(deficit):
            spawn_origin = self.field.random_walkable_point(margin=CollisionField.DEFAULT_SPAWN_MARGIN)
            snapped = self.field.snap_to_walkable(*spawn_origin)
            new_agent = self._create_agent(snapped, now)
            new_agent.last_unshrinked_at = now - random.uniform(10, 60)
            self.people.append(new_agent)
            self._sigma_memory[new_agent.agent_id] = new_agent.position.copy()

    async def snapshot(self) -> Dict[str, object]:
        async with self.lock:
            return dict(self._last_state)

    async def reset(self) -> None:
        async with self.lock:
            self._spawn_agents()
            self._sigma_memory.clear()

    def _compute_fhu_estimate(self) -> Dict[str, float]:
        large_agents = [agent for agent in self.people if agent.is_large]
        if large_agents:
            positions = np.stack([agent.position for agent in large_agents])
            centroid = positions.mean(axis=0)
            confidence = len(large_agents) / max(1, len(self.people))
            return {
                "x": float(centroid[0]),
                "y": float(centroid[1]),
                "confidence": float(confidence),
            }

        if not self.people:
            return {"x": 0.0, "y": 0.0, "confidence": 0.0}

        fallback_positions = np.stack([agent.position for agent in self.people])
        centroid = fallback_positions.mean(axis=0)
        return {
            "x": float(centroid[0]),
            "y": float(centroid[1]),
            "confidence": 0.1,
        }

    def _apply_sigma_wave(self, person: Agent) -> None:
        previous = self._sigma_memory.get(person.agent_id)
        if previous is None:
            smoothed = person.position.copy()
        else:
            smoothed = self._smoothing_alpha * person.position + (1 - self._smoothing_alpha) * previous
        person.position = smoothed
        self._sigma_memory[person.agent_id] = smoothed.copy()


collision_field = CollisionField(MAP_PATH)
simulation = Crowd(collision_field)


@app.on_event("startup")
async def startup_event() -> None:
    await simulation.start()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await simulation.stop()


audio_connections: Set[WebSocket] = set()


async def _map_state_stream(websocket: WebSocket) -> None:
    try:
        while True:
            payload = await simulation.snapshot()
            await websocket.send_json({"type": "state", **payload})
            await asyncio.sleep(1.0 / 15.0)
    except WebSocketDisconnect:
        raise



def modify_audio_frequency(audio_data: np.ndarray, frequency_modifier: float, sample_rate: int) -> np.ndarray:

    try:
        if frequency_modifier == 1.0:
            return audio_data

        audio_float = audio_data.astype(np.float32) / 32768.0
        new_length = max(1, int(len(audio_float) / frequency_modifier))
        old_indices = np.arange(len(audio_float))
        new_indices = np.linspace(0, len(audio_float) - 1, new_length)
        modified_audio = np.interp(new_indices, old_indices, audio_float)
        return (modified_audio * 32768.0).astype(np.int16)
    except Exception as exc:
        print(f"Error in modify_audio_frequency_realtime: {exc}")
        return audio_data


@app.websocket("/ws/audio")
async def audio_websocket(websocket: WebSocket):
    await websocket.accept()
    audio_connections.add(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message.get("type") == "audio_chunk":
                continue

            if message.get("type") == "amplitude":
                amplitude = message.get("amplitude", 0)
                low_freq = message.get("low_freq", 0)
                if amplitude > 0.7 or low_freq > 0.6:
                    await websocket.send_json(
                        {
                            "type": "danger_alert",
                            "level": "high" if amplitude > 0.85 else "medium",
                            "timestamp": time.time(),
                        }
                    )

            elif message.get("type") == "audio_stream":
                try:
                    audio_data = message.get("audio_data", [])
                    sample_rate = message.get("sample_rate", 44100)
                    frequency_modifier = message.get("frequency_modifier", 1.0)
                    audio_array = np.array(audio_data, dtype=np.int16)
                    modified_audio = modify_audio_frequency(audio_array, frequency_modifier, sample_rate)
                    await websocket.send_json(
                        {
                            "type": "modified_audio_stream",
                            "audio_data": modified_audio.tolist(),
                            "sample_rate": sample_rate,
                        }
                    )
                except Exception as exc:
                    print(f"Error in real-time audio processing: {exc}")

    except WebSocketDisconnect:
        audio_connections.remove(websocket)


@app.websocket("/ws/map")
async def map_websocket(websocket: WebSocket):
    await websocket.accept()
    sender = asyncio.create_task(_map_state_stream(websocket))
    try:
        while True:
            message = await websocket.receive_text()
            payload = json.loads(message)
            action = payload.get("type")
            if action == "move_person":
                person_id = payload.get("id")
                x = payload.get("x")
                y = payload.get("y")
                if isinstance(person_id, int) and isinstance(x, (int, float)) and isinstance(y, (int, float)):
                    await simulation.apply_move(person_id, float(x), float(y))
            elif action == "toggle_state":
                person_id = payload.get("id")
                desired_state = payload.get("state")
                if isinstance(person_id, int):
                    await simulation.toggle_state(person_id, desired_state if isinstance(desired_state, str) else None)
            elif action == "reset_map":
                await simulation.reset()
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sender


@app.get("/map/meta")
async def map_meta():
    return {"width": collision_field.width, "height": collision_field.height}


@app.get("/map/image")
async def map_image():
    return FileResponse(str(MAP_PATH))


@app.get("/")
async def root():
    return {"message": "Audio + Spatial Tracking API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
