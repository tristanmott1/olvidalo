import { X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_DRAW_SIZE,
  DRAW_COLORS,
  DRAW_SWING,
  ERASER_COLOR,
  clampDrawZoom,
  distance,
  getCanvasPoint,
  midpoint,
  screenToWorld,
  worldToScreen,
} from "./drawMap";
import type { DrawKickMarker, DrawPoint, DrawStroke, DrawView, DrawnMapSetup } from "./map";

const DRAW_FAIR_COLOR = "#3f6f45";
const DRAW_OUT_COLOR = "#8a5a35";
const DRAW_SWING_COLOR = "#183f34";
const DRAW_MARKER_STROKE = "#fff9ec";

type PlayerOption = {
  id: string;
  name: string;
};

type DrawMapModalProps =
  | {
      color: string;
      mode: "setup";
      onCancel: () => void;
      onClear: () => void;
      onColorChange: (color: string) => void;
      onSave: (setup: DrawnMapSetup) => void;
      onSizeChange: (size: number) => void;
      onStrokesChange: (strokes: DrawStroke[]) => void;
      onViewChange: (view: DrawView) => void;
      size: number;
      strokes: DrawStroke[];
      view: DrawView;
    }
  | {
      mode: "picker";
      onCancel: () => void;
      onSave: () => void;
      onSelect: (point: DrawPoint) => void;
      selected: DrawPoint | null;
      selectedKind: DrawKickMarker["kind"];
      setup: DrawnMapSetup;
    }
  | {
      markers: DrawKickMarker[];
      mode: "viewer";
      onClose: () => void;
      onPlayerChange: (playerId: string | "all") => void;
      onRoundChange: (round: number | "all") => void;
      players: PlayerOption[];
      rounds: number;
      selectedPlayerId: string | "all";
      selectedRound: number | "all";
      setup: DrawnMapSetup;
    };

type GestureState = {
  distance: number;
  midpoint: DrawPoint;
  view: DrawView;
};

type PanState = {
  moved: boolean;
  point: DrawPoint;
  view: DrawView;
};

function getTitle(mode: DrawMapModalProps["mode"]) {
  if (mode === "setup") {
    return "Draw Course";
  }

  return mode === "picker" ? "Kick Location" : "Kick Map";
}

function drawCircle(ctx: CanvasRenderingContext2D, point: DrawPoint, radius: number, fill: string, label?: string) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = DRAW_MARKER_STROKE;
  ctx.stroke();

  if (label) {
    ctx.fillStyle = DRAW_MARKER_STROKE;
    ctx.font = "800 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, point.x, point.y + 0.4);
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: DrawStroke, view: DrawView, width: number, height: number) {
  if (stroke.points.length === 0) {
    return;
  }

  ctx.beginPath();
  stroke.points.forEach((point, index) => {
    const screenPoint = worldToScreen(point, view, width, height);

    if (index === 0) {
      ctx.moveTo(screenPoint.x, screenPoint.y);
      return;
    }

    ctx.lineTo(screenPoint.x, screenPoint.y);
  });
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, stroke.size * view.zoom);
  ctx.strokeStyle = stroke.color;
  ctx.stroke();
}

function createDrawId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function DrawMapModal(props: DrawMapModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointersRef = useRef(new Map<number, DrawPoint>());
  const gestureRef = useRef<GestureState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const drawingStrokeIdRef = useRef<string | null>(null);
  const strokesRef = useRef<DrawStroke[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [localView, setLocalView] = useState(props.mode === "setup" ? props.view : props.setup.view);
  const strokes = props.mode === "setup" ? props.strokes : props.setup.strokes;
  const selected = props.mode === "picker" ? props.selected : null;
  const markers = props.mode === "viewer" ? props.markers : [];

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      const { height, width } = entry.contentRect;
      setCanvasSize({ width: Math.max(1, width), height: Math.max(1, height) });
    });

    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (props.mode === "setup") {
      setLocalView(props.view);
      return;
    }

    setLocalView(props.setup.view);
  }, [props.mode]);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const width = canvasSize.width;
    const height = canvasSize.height;
    canvas.width = width * ratio;
    canvas.height = height * ratio;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    strokes.forEach((stroke) => drawStroke(ctx, stroke, localView, width, height));

    const swingPoint = worldToScreen(DRAW_SWING, localView, width, height);
    drawCircle(ctx, swingPoint, 12, DRAW_SWING_COLOR, "S");

    if (props.mode === "picker" && selected) {
      const color = props.selectedKind === "fair" ? DRAW_FAIR_COLOR : DRAW_OUT_COLOR;
      drawCircle(
        ctx,
        worldToScreen(selected, localView, width, height),
        9,
        color,
        props.selectedKind === "fair" ? "H" : "O",
      );
    }

    markers.forEach((marker) => {
      const color = marker.kind === "fair" ? DRAW_FAIR_COLOR : DRAW_OUT_COLOR;
      drawCircle(
        ctx,
        worldToScreen(marker.point, localView, width, height),
        9,
        color,
        marker.kind === "fair" ? "H" : "O",
      );
    });
  }, [canvasSize, localView, markers, selected, strokes]);

  function updateView(view: DrawView) {
    const nextView = {
      center: view.center,
      zoom: clampDrawZoom(view.zoom),
    };

    setLocalView(nextView);

    if (props.mode === "setup") {
      props.onViewChange(nextView);
    }
  }

  function appendStrokePoint(point: DrawPoint) {
    if (props.mode !== "setup" || !drawingStrokeIdRef.current) {
      return;
    }

    // Keep drawing responsive even when pointer events arrive faster than React renders.
    const nextStrokes = strokesRef.current.map((stroke) =>
      stroke.id === drawingStrokeIdRef.current
        ? { ...stroke, points: [...stroke.points, point] }
        : stroke,
    );

    strokesRef.current = nextStrokes;
    props.onStrokesChange(nextStrokes);
  }

  function startStroke(point: DrawPoint) {
    if (props.mode !== "setup") {
      return;
    }

    const stroke = {
      id: createDrawId(),
      color: props.color,
      // Store stroke width in world coordinates so it scales with the drawing.
      size: props.size / localView.zoom,
      points: [point],
    };

    drawingStrokeIdRef.current = stroke.id;
    const nextStrokes = [...strokesRef.current, stroke];
    strokesRef.current = nextStrokes;
    props.onStrokesChange(nextStrokes);
  }

  function startGesture() {
    const points = [...pointersRef.current.values()];

    if (points.length < 2) {
      return;
    }

    drawingStrokeIdRef.current = null;
    panRef.current = null;
    gestureRef.current = {
      distance: distance(points[0], points[1]),
      midpoint: midpoint(points[0], points[1]),
      view: localView,
    };
  }

  function updateGesture() {
    const canvas = canvasRef.current;
    const gesture = gestureRef.current;
    const points = [...pointersRef.current.values()];

    if (!canvas || !gesture || points.length < 2) {
      return;
    }

    const width = canvasSize.width;
    const height = canvasSize.height;
    const nextMidpoint = midpoint(points[0], points[1]);
    const nextZoom = clampDrawZoom(gesture.view.zoom * (distance(points[0], points[1]) / Math.max(1, gesture.distance)));
    const startWorldPoint = screenToWorld(gesture.midpoint, gesture.view, width, height);

    updateView({
      center: {
        x: startWorldPoint.x - (nextMidpoint.x - width / 2) / nextZoom,
        y: startWorldPoint.y - (nextMidpoint.y - height / 2) / nextZoom,
      },
      zoom: nextZoom,
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(event, canvas);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size >= 2) {
      startGesture();
      return;
    }

    if (props.mode === "setup") {
      startStroke(screenToWorld(point, localView, canvasSize.width, canvasSize.height));
      return;
    }

    panRef.current = {
      moved: false,
      point,
      view: localView,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas || !pointersRef.current.has(event.pointerId)) {
      return;
    }

    const point = getCanvasPoint(event, canvas);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size >= 2) {
      updateGesture();
      return;
    }

    if (props.mode === "setup" && drawingStrokeIdRef.current) {
      appendStrokePoint(screenToWorld(point, localView, canvasSize.width, canvasSize.height));
      return;
    }

    if (panRef.current) {
      const movement = distance(panRef.current.point, point);
      const start = panRef.current.point;
      const startView = panRef.current.view;

      panRef.current.moved = panRef.current.moved || movement > 4;
      updateView({
        center: {
          x: startView.center.x - (point.x - start.x) / startView.zoom,
          y: startView.center.y - (point.y - start.y) / startView.zoom,
        },
        zoom: startView.zoom,
      });
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const point = canvas ? getCanvasPoint(event, canvas) : null;
    const pan = panRef.current;

    pointersRef.current.delete(event.pointerId);
    drawingStrokeIdRef.current = null;
    gestureRef.current = null;

    if (pointersRef.current.size === 0) {
      panRef.current = null;
    }

    if (props.mode === "picker" && pan && !pan.moved && point) {
      props.onSelect(screenToWorld(point, localView, canvasSize.width, canvasSize.height));
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    event.preventDefault();
    const point = getCanvasPoint(event, canvas);
    const worldPoint = screenToWorld(point, localView, canvasSize.width, canvasSize.height);
    const nextZoom = clampDrawZoom(localView.zoom * (event.deltaY < 0 ? 1.1 : 0.9));

    updateView({
      center: {
        x: worldPoint.x - (point.x - canvasSize.width / 2) / nextZoom,
        y: worldPoint.y - (point.y - canvasSize.height / 2) / nextZoom,
      },
      zoom: nextZoom,
    });
  }

  function saveSetup() {
    if (props.mode !== "setup") {
      return;
    }

    props.onSave({
      kind: "drawn",
      swing: DRAW_SWING,
      view: localView,
      strokes: props.strokes,
    });
  }

  return (
    <div className="modal-backdrop">
      <section
        className="map-modal draw-map-modal"
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="map-modal-top">
          <strong>{getTitle(props.mode)}</strong>
          <button
            className="icon-button"
            type="button"
            onClick={props.mode === "viewer" ? props.onClose : props.onCancel}
            aria-label="Close map"
          >
            <X size={17} />
          </button>
        </div>

        {props.mode === "setup" ? (
          <div className="draw-colors">
            {DRAW_COLORS.map((color) => (
              <button
                aria-label={color === ERASER_COLOR ? "Eraser" : `Draw ${color}`}
                className={props.color === color ? "draw-color selected" : "draw-color"}
                key={color}
                onClick={() => props.onColorChange(color)}
                style={{ background: color }}
                type="button"
              >
                {color === ERASER_COLOR ? "E" : ""}
              </button>
            ))}
          </div>
        ) : null}

        {props.mode === "viewer" ? (
          <div className="map-filters">
            <label className="field">
              <span>Player</span>
              <select value={props.selectedPlayerId} onChange={(event) => props.onPlayerChange(event.target.value)}>
                <option value="all">All</option>
                {props.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Round</span>
              <select
                value={props.selectedRound}
                onChange={(event) =>
                  props.onRoundChange(event.target.value === "all" ? "all" : Number(event.target.value))
                }
              >
                <option value="all">All</option>
                {Array.from({ length: props.rounds }, (_, index) => index + 1).map((round) => (
                  <option key={round} value={round}>
                    {round}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <canvas
          className="draw-surface"
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          ref={canvasRef}
        />

        {props.mode === "viewer" && props.markers.length === 0 ? (
          <p className="map-empty">No saved kick locations.</p>
        ) : null}

        {props.mode === "setup" ? (
          <label className="draw-size field">
            <span>Size</span>
            <div className="draw-size-control">
              <input
                max="44"
                min="2"
                onChange={(event) => props.onSizeChange(Number(event.target.value))}
                step="1"
                type="range"
                value={props.size}
              />
              <i
                className="brush-preview"
                style={{
                  height: `${props.size}px`,
                  width: `${props.size}px`,
                }}
              />
            </div>
          </label>
        ) : null}

        {props.mode !== "viewer" ? (
          <div className="map-actions">
            {props.mode === "setup" ? (
              <button className="secondary" type="button" onClick={props.onClear}>
                Clear
              </button>
            ) : null}
            <button className="secondary" type="button" onClick={props.onCancel}>
              {props.mode === "setup" ? "Skip" : "Dismiss"}
            </button>
            <button
              className="primary"
              type="button"
              onClick={props.mode === "setup" ? saveSetup : props.onSave}
              disabled={props.mode === "picker" ? !props.selected : false}
            >
              Save
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default DrawMapModal;
