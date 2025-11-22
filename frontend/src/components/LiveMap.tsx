import { useCallback, useEffect, useRef, useState } from "react";
import { envConfig } from "@/lib/env";

type PersonState = {
  id: number;
  x: number;
  y: number;
  state: "small" | "large";
  last_unshrinked_at: number;
};

type MapStatePayload = {
  type: string;
  timestamp: number;
  people: PersonState[];
  fhu: {
    x: number;
    y: number;
    confidence: number;
  };
  map: {
    width: number;
    height: number;
  };
  counts: {
    large: number;
    small: number;
  };
};

const { apiBaseUrl: API_BASE, buildApiPath, buildWsPath } = envConfig;
const MAP_META_URL = buildApiPath("/map/meta");
const MAP_IMAGE_URL = buildApiPath("/map/image");
const MAP_WS_URL = buildWsPath("/ws/map");

const CrowdMap = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<MapStatePayload | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hoveredIdRef = useRef<number | null>(null);
  const pinnedIdRef = useRef<number | null>(null);
  const draggingIdRef = useRef<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const dragClickBlockRef = useRef(false);
  const [status, setStatus] = useState("connecting");
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<{ large: number; small: number }>({ large: 0, small: 0 });
  const [hoveredLargeId, setHoveredLargeId] = useState<number | null>(null);
  const [pinnedLargeId, setPinnedLargeId] = useState<number | null>(null);

  const sendControlMessage = useCallback((payload: Record<string, unknown>) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    hoveredIdRef.current = hoveredLargeId;
  }, [hoveredLargeId]);

  useEffect(() => {
    pinnedIdRef.current = pinnedLargeId;
  }, [pinnedLargeId]);

  useEffect(() => {
    let isMounted = true;
    fetch(MAP_META_URL)
      .then((res) => res.json())
      .then((meta) => {
        if (!isMounted) return;
        setDimensions(meta);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = `${MAP_IMAGE_URL}?cache=${Date.now()}`;
        img.onload = () => {
          imageRef.current = img;
        };
      })
      .catch(() => {
        setStatus("offline");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "r" || event.key === "R") && event.shiftKey) {
        sendControlMessage({ type: "reset_map" });
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sendControlMessage]);

  useEffect(() => {
    const ws = new WebSocket(MAP_WS_URL);
    wsRef.current = ws;
    ws.onopen = () => setStatus("live");
    ws.onclose = () => setStatus("offline");
    ws.onerror = () => setStatus("offline");
    ws.onmessage = (event) => {
      const payload: MapStatePayload = JSON.parse(event.data);
      if (payload.type === "state") {
        stateRef.current = payload;
        setCategoryCounts(payload.counts);
      }
    };

    return () => {
      wsRef.current = null;
      ws.close();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    const render = () => {
      const data = stateRef.current;
      const mapImage = imageRef.current;
      if (!data || !mapImage) {
        raf = requestAnimationFrame(render);
        return;
      }

      if (canvas.width !== data.map.width || canvas.height !== data.map.height) {
        canvas.width = data.map.width;
        canvas.height = data.map.height;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(mapImage, 0, 0, canvas.width, canvas.height);

      data.people.forEach((person) => {
        const isLarge = person.state === "large";
        const recency = Math.max(0, data.timestamp - person.last_unshrinked_at);
        const flashStrength = isLarge ? Math.max(0, 1 - recency / 4) : 0;
        const pulse = 0.5 + 0.5 * Math.sin(recency * 5);

        if (isLarge) {
          const auraRadius = 42 + flashStrength * 25;
          const aura = ctx.createRadialGradient(person.x, person.y, 0, person.x, person.y, auraRadius);
          aura.addColorStop(0, `rgba(${255}, ${200 + pulse * 40}, ${120 + pulse * 60}, ${0.95})`);
          aura.addColorStop(1, "rgba(255, 200, 120, 0.04)");
          ctx.beginPath();
          ctx.fillStyle = aura;
          ctx.arc(person.x, person.y, auraRadius, 0, Math.PI * 2);
          ctx.fill();

          const bodyRadius = 13 + flashStrength * 6;
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, ${180 + pulse * 60}, ${90 + pulse * 110}, 0.98)`;
          ctx.shadowBlur = 25;
          ctx.shadowColor = "rgba(255, 180, 120, 0.8)";
          ctx.arc(person.x, person.y, bodyRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          const shouldShowLabel = person.id === hoveredIdRef.current || person.id === pinnedIdRef.current;
          if (shouldShowLabel) {
            const minutes = Math.floor(recency / 60);
            const seconds = Math.floor(recency % 60);
            const label = `${minutes}m ${seconds}s ago`;

            ctx.font = "48px 'VT323', monospace";
            ctx.textBaseline = "top";
            ctx.textAlign = "left";
            const textX = person.x + bodyRadius + 24;
            const textY = person.y - bodyRadius - 18;
            const textWidth = ctx.measureText(label).width + 48;
            const textHeight = 72;
            ctx.fillStyle = "rgba(0, 0, 0, 0.84)";
            ctx.fillRect(textX - 18, textY - 14, textWidth, textHeight);
            ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
            ctx.fillText(label, textX, textY);
          }
        } else {
          const auraRadius = 26;
          const aura = ctx.createRadialGradient(person.x, person.y, 0, person.x, person.y, auraRadius);
          aura.addColorStop(0, "rgba(110, 240, 180, 0.95)");
          aura.addColorStop(1, "rgba(110, 240, 180, 0.08)");
          ctx.beginPath();
          ctx.fillStyle = aura;
          ctx.arc(person.x, person.y, auraRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.fillStyle = "rgba(90, 255, 170, 0.98)";
          ctx.shadowBlur = 18;
          ctx.shadowColor = "rgba(80, 255, 190, 0.8)";
          ctx.arc(person.x, person.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      const pinHeight = 72;
      const headRadius = 18 + data.fhu.confidence * 4;
      const headCenterOffset = -pinHeight * 0.55;

      ctx.save();
      ctx.translate(data.fhu.x, data.fhu.y);

      const pinGradient = ctx.createLinearGradient(0, headCenterOffset - headRadius - 10, 0, 10);
      pinGradient.addColorStop(0, "rgba(255, 90, 150, 0.98)");
      pinGradient.addColorStop(0.7, "rgba(215, 55, 120, 0.95)");
      pinGradient.addColorStop(1, "rgba(120, 15, 60, 0.85)");

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(headRadius * 1.15, -pinHeight * 0.2, headRadius * 0.95, headCenterOffset + headRadius * 0.6);
      ctx.arc(0, headCenterOffset, headRadius, Math.PI * 0.2, Math.PI * 0.8, true);
      ctx.quadraticCurveTo(-headRadius * 1.15, -pinHeight * 0.2, 0, 0);
      ctx.closePath();
      ctx.fillStyle = pinGradient;
      ctx.shadowColor = "rgba(255, 120, 180, 0.7)";
      ctx.shadowBlur = 30;
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = "600 20px 'Space Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("FHU", 0, headCenterOffset - headRadius - 8);

      ctx.restore();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    type PointerLikeEvent = PointerEvent | MouseEvent;

    const getPointerPosition = (event: PointerLikeEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
      };
    };

    const findPersonNear = (
      data: MapStatePayload,
      point: { x: number; y: number },
      radius = 42,
      predicate: (person: PersonState) => boolean = () => true,
    ) => {
      let winner: PersonState | null = null;
      let bestDistance = radius;
      for (const person of data.people) {
        if (!predicate(person)) continue;
        const distance = Math.hypot(person.x - point.x, person.y - point.y);
        if (distance <= bestDistance) {
          bestDistance = distance;
          winner = person;
        }
      }
      return winner;
    };

    const updateHoverFromPoint = (data: MapStatePayload, point: { x: number; y: number }) => {
      const target = findPersonNear(data, point, 42, (person) => person.state === "large");
      setHoveredLargeId(target ? target.id : null);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const data = stateRef.current;
      if (!data) return;
      const point = getPointerPosition(event);

      if (event.ctrlKey) {
        const target = findPersonNear(data, point);
        if (target) {
          draggingIdRef.current = target.id;
          dragPointerIdRef.current = event.pointerId;
          dragMovedRef.current = false;
          dragClickBlockRef.current = true;
          canvas.setPointerCapture(event.pointerId);
          sendControlMessage({ type: "move_person", id: target.id, x: point.x, y: point.y });
        }
        event.preventDefault();
        return;
      }

      if (event.altKey) {
        const target = findPersonNear(data, point);
        if (target) {
          sendControlMessage({ type: "toggle_state", id: target.id });
          dragClickBlockRef.current = true;
        }
        event.preventDefault();
        return;
      }

      updateHoverFromPoint(data, point);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const data = stateRef.current;
      if (!data) return;
      const point = getPointerPosition(event);

      if (draggingIdRef.current !== null) {
        dragMovedRef.current = true;
        dragClickBlockRef.current = true;
        sendControlMessage({ type: "move_person", id: draggingIdRef.current, x: point.x, y: point.y });
        return;
      }

      updateHoverFromPoint(data, point);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (draggingIdRef.current === null) {
        return;
      }
      if (dragPointerIdRef.current !== null && dragPointerIdRef.current === event.pointerId) {
        const point = getPointerPosition(event);
        sendControlMessage({ type: "move_person", id: draggingIdRef.current, x: point.x, y: point.y });
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch (_) {
          /* noop */
        }
        draggingIdRef.current = null;
        dragPointerIdRef.current = null;
      }
    };

    const handlePointerLeave = () => {
      if (draggingIdRef.current !== null) {
        return;
      }
      setHoveredLargeId(null);
    };

    const handleClick = (event: MouseEvent) => {
      if (event.ctrlKey || event.altKey) {
        return;
      }
      if (dragClickBlockRef.current) {
        dragClickBlockRef.current = false;
        return;
      }
      const data = stateRef.current;
      if (!data) return;
      const point = getPointerPosition(event);
      const target = findPersonNear(data, point, 46, (person) => person.state === "large");
      setPinnedLargeId((prev) => (target ? (prev === target.id ? null : target.id) : null));
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("click", handleClick);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("click", handleClick);
    };
  }, [sendControlMessage]);

  const aspectRatio = dimensions ? dimensions.width / dimensions.height : 4 / 3;

  return (
    <div className="relative w-full" style={{ aspectRatio }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full rounded-xl border border-primary/30 bg-black/60"
      />
      <div className="absolute top-4 left-4 bg-background/70 backdrop-blur px-4 py-1 rounded-full text-xs pixel-text">
        STATUS: {status.toUpperCase()}
      </div>
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2 text-xs pixel-text text-foreground/80">
        <div className="bg-background/70 backdrop-blur px-4 py-1 rounded-full">
          LARGE: {categoryCounts.large} • SMALL: {categoryCounts.small}
        </div>
        <div className="bg-background/80 backdrop-blur px-3 py-2 rounded-lg border border-primary/20 text-[11px] space-y-1">
          <div className="text-[10px] tracking-[0.3em] text-foreground/60">LEGEND</div>
          <div className="flex items-center gap-2">
            <span
              className="h-3.5 w-3.5 rounded-full shadow-[0_0_8px_rgba(255,180,120,0.9)]"
              style={{ background: "linear-gradient(135deg, rgba(255,190,120,1), rgba(255,130,90,1))" }}
            />
            <span className="text-foreground/80">Large presence</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full shadow-[0_0_6px_rgba(110,240,180,0.8)]"
              style={{ backgroundColor: "rgba(90,255,170,1)" }}
            />
            <span className="text-foreground/80">Small scout</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-pink-400" />
            <span className="text-foreground/80">FHU pin</span>
          </div>
        </div>
      </div>
      {dimensions && (
        <div className="absolute bottom-4 right-4 bg-background/70 backdrop-blur px-3 py-1 rounded-full text-xs pixel-text text-foreground/70">
          {dimensions.width} × {dimensions.height} px
        </div>
      )}
    </div>
  );
};

export default CrowdMap;
