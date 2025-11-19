from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import json
import numpy as np
from typing import List, Dict, Set
import cv2
from PIL import Image
import io
import base64
from collections import defaultdict
import random
import time

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active connections
audio_connections: Set[WebSocket] = set()
map_connections: Set[WebSocket] = set()

# Map data
road_mask = None
map_image_data = None
large_humans = []
MAP_FILE_PATH = "../map.png"  # Static map file in root directory
MASK_FILE_PATH = "../mask.png"  # Green road mask

class RoadMask:
    def __init__(self, mask_array):
        self.mask = mask_array  # Boolean array where True = road
        self.height, self.width = mask_array.shape
        
        # Get all valid road positions
        self.road_positions = np.argwhere(mask_array)
        print(f"📍 Valid road area: {len(self.road_positions)} pixels")
    
    def is_on_road(self, x, y):
        """Check if position is on a valid road"""
        if x < 0 or x >= self.width or y < 0 or y >= self.height:
            return False
        return self.mask[int(y), int(x)]
    
    def get_random_position(self):
        """Get a random position on the road"""
        if len(self.road_positions) == 0:
            return (self.width // 2, self.height // 2)
        
        pos = self.road_positions[random.randint(0, len(self.road_positions) - 1)]
        return (int(pos[1]), int(pos[0]))  # Return as (x, y)
    
    def find_nearest_road_position(self, x, y):
        """Find nearest valid road position to given coordinates"""
        if self.is_on_road(x, y):
            return (x, y)
        
        # Find closest road pixel
        min_dist = float('inf')
        nearest = self.get_random_position()
        
        for pos in self.road_positions[:1000]:  # Sample first 1000 for performance
            px, py = int(pos[1]), int(pos[0])
            dist = (px - x)**2 + (py - y)**2
            if dist < min_dist:
                min_dist = dist
                nearest = (px, py)
        
        return nearest

class LargeHuman:
    def __init__(self, road_mask: RoadMask, human_id: int):
        self.id = human_id
        self.road_mask = road_mask
        
        # Start at random road position
        start_x, start_y = road_mask.get_random_position()
        self.x = float(start_x)
        self.y = float(start_y)
        
        # Movement properties - consistent moderate speed for all humans
        self.speed = 25  # Fixed speed so all move at same pace
        self.direction = random.uniform(0, 2 * np.pi)  # Random initial direction
        self.direction_change_timer = 0.0
        self.direction_change_interval = random.uniform(1.0, 2.5)  # More frequent direction changes
        
        # Smooth direction transitions
        self.target_direction = self.direction
        self.direction_transition_speed = 1.0  # Radians per second for faster turning
        
        self.phase_offset = random.uniform(0, 2 * np.pi)
        self.stuck_counter = 0
    
    def update(self, dt=0.033):
        """Update position with free movement constrained to road"""
        # Update direction change timer
        self.direction_change_timer += dt
        
        # Gradually change direction for smoother movement
        if self.direction_change_timer >= self.direction_change_interval:
            # Set new target direction instead of instant change
            angle_change = random.uniform(-np.pi / 3, np.pi / 3)  # Smaller turns (was -π/2 to π/2)
            self.target_direction = self.direction + angle_change
            self.direction_change_interval = random.uniform(1.0, 2.5)
            self.direction_change_timer = 0.0
        
        # Smoothly interpolate to target direction
        angle_diff = self.target_direction - self.direction
        # Normalize angle difference to [-π, π]
        while angle_diff > np.pi:
            angle_diff -= 2 * np.pi
        while angle_diff < -np.pi:
            angle_diff += 2 * np.pi
        
        # Apply smooth rotation
        max_rotation = self.direction_transition_speed * dt
        if abs(angle_diff) < max_rotation:
            self.direction = self.target_direction
        else:
            self.direction += np.sign(angle_diff) * max_rotation
        
        # Calculate new position
        dx = np.cos(self.direction) * self.speed * dt
        dy = np.sin(self.direction) * self.speed * dt
        
        new_x = self.x + dx
        new_y = self.y + dy
        
        # Check if new position is valid
        if self.road_mask.is_on_road(new_x, new_y):
            self.x = new_x
            self.y = new_y
            self.stuck_counter = 0
        else:
            # Hit a wall - gentle bounce
            self.stuck_counter += 1
            
            if self.stuck_counter > 8:  # More patient before teleporting (was 5)
                # Very stuck - teleport to nearest valid position
                self.x, self.y = self.road_mask.find_nearest_road_position(int(self.x), int(self.y))
                self.stuck_counter = 0
                self.target_direction = random.uniform(0, 2 * np.pi)
            else:
                # Try gentle bounce - set target direction instead of instant change
                self.target_direction = self.direction + random.uniform(np.pi / 2, np.pi)
                
                # Try small random walk to escape
                for _ in range(8):
                    test_angle = random.uniform(0, 2 * np.pi)
                    test_dist = random.uniform(3, 10)  # Smaller steps (was 5-15)
                    test_x = self.x + np.cos(test_angle) * test_dist
                    test_y = self.y + np.sin(test_angle) * test_dist
                    
                    if self.road_mask.is_on_road(test_x, test_y):
                        self.target_direction = test_angle
                        break
    
    def get_state(self):
        return {
            "id": self.id,
            "x": float(self.x),
            "y": float(self.y),
            "phase": self.phase_offset,
            "paused": False
        }

def load_road_mask_from_image(mask_path):
    """Load road mask from green-highlighted image"""
    try:
        img = cv2.imread(mask_path)
        if img is None:
            raise RuntimeError(f"Failed to load mask: {mask_path}")
        
        # Extract green channel - road is where G > 150 and G > R and G > B
        g = img[:, :, 1]  # Green channel
        r = img[:, :, 0]  # Blue in BGR
        b = img[:, :, 2]  # Red in BGR
        
        # Create boolean mask
        mask = (g > 150) & (g > r) & (g > b)
        
        print(f"📍 Loaded road mask: {mask.shape[1]}x{mask.shape[0]} pixels")
        print(f"✅ Road area: {np.sum(mask)} pixels ({100 * np.sum(mask) / mask.size:.1f}%)")
        
        return RoadMask(mask)
        
    except Exception as e:
        print(f"❌ Error loading mask: {e}")
        return None

def load_static_map():
    """Load and process the static map file"""
    global road_mask, map_image_data, large_humans
    
    try:
        # Read map file
        with open(MAP_FILE_PATH, 'rb') as f:
            contents = f.read()
        
        # Encode for frontend
        map_image_data = base64.b64encode(contents).decode('utf-8')
        
        # Load road mask
        print("🗺️ Loading road mask...")
        road_mask = load_road_mask_from_image(MASK_FILE_PATH)
        
        if road_mask is None:
            raise RuntimeError("Failed to load road mask")
        
        # Initialize large humans with free movement
        large_humans = [LargeHuman(road_mask, i) for i in range(15)]
        
        print(f"✅ Map loaded successfully")
        print(f"✅ {len(large_humans)} humans initialized")
        
    except Exception as e:
        print(f"❌ Error loading map: {e}")
        # Create dummy mask as fallback
        dummy_mask = np.ones((600, 800), dtype=bool)
        road_mask = RoadMask(dummy_mask)
        large_humans = [LargeHuman(road_mask, i) for i in range(15)]
        map_image_data = None

@app.on_event("startup")
async def startup_event():
    """Load map on server startup"""
    load_static_map()

@app.get("/map-image")
async def get_map_image():
    """Get the static map image"""
    if map_image_data:
        return JSONResponse({"image": map_image_data})
    return JSONResponse({"error": "No map file found"}, status_code=404)

@app.get("/map-info")
async def get_map_info():
    """Get information about the loaded map"""
    if road_mask:
        return JSONResponse({
            "road_pixels": len(road_mask.road_positions),
            "humans": len(large_humans),
            "map_file": MAP_FILE_PATH,
            "width": road_mask.width,
            "height": road_mask.height
        })
    return JSONResponse({"error": "Map not loaded"}, status_code=404)

@app.get("/road-mask")
async def get_road_mask():
    """Get the road mask as a base64 image for overlay"""
    if road_mask:
        # Create an image where walkable areas are white, non-walkable are transparent
        mask_img = np.zeros((road_mask.height, road_mask.width, 4), dtype=np.uint8)
        
        # Set walkable areas to semi-transparent black
        mask_img[road_mask.mask] = [0, 0, 0, 180]  # Black with 70% opacity
        
        # Encode as PNG
        success, buffer = cv2.imencode('.png', mask_img)
        if success:
            mask_base64 = base64.b64encode(buffer).decode('utf-8')
            return JSONResponse({"mask": mask_base64})
    
    return JSONResponse({"error": "Road mask not loaded"}, status_code=404)

@app.websocket("/ws/audio")
async def audio_websocket(websocket: WebSocket):
    """WebSocket for audio processing (Module 1)"""
    await websocket.accept()
    audio_connections.add(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Process different audio events
            if message.get("type") == "audio_chunk":
                # Audio data for STT processing
                # Client will handle STT with Web Speech API
                pass
            
            elif message.get("type") == "amplitude":
                # Danger detection - check for shockwave
                amplitude = message.get("amplitude", 0)
                low_freq = message.get("low_freq", 0)
                
                # Threshold for danger detection
                if amplitude > 0.7 or low_freq > 0.6:
                    await websocket.send_json({
                        "type": "danger_alert",
                        "level": "high" if amplitude > 0.85 else "medium",
                        "timestamp": time.time()
                    })
    
    except WebSocketDisconnect:
        audio_connections.remove(websocket)

@app.websocket("/ws/map")
async def map_websocket(websocket: WebSocket):
    """WebSocket for map animation updates (Module 2)"""
    await websocket.accept()
    map_connections.add(websocket)
    
    try:
        # Send initial map data
        if map_image_data:
            await websocket.send_json({
                "type": "map_init",
                "image": map_image_data
            })
        
        while True:
            # Update positions with delta time
            dt = 0.016  # ~60 FPS for smoother movement
            if road_mask and large_humans:
                for human in large_humans:
                    human.update(dt)
                
                # Send positions to client
                await websocket.send_json({
                    "type": "positions_update",
                    "humans": [h.get_state() for h in large_humans]
                })
            
            await asyncio.sleep(dt)
    
    except WebSocketDisconnect:
        map_connections.remove(websocket)

@app.get("/")
async def root():
    return {"message": "Miniature Human Systems API"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
