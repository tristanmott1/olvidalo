import type { DrawPoint, DrawView } from "./map";

export const DRAW_SWING: DrawPoint = { x: 0, y: 0 };
export const DEFAULT_DRAW_VIEW: DrawView = {
  center: DRAW_SWING,
  zoom: 1.8,
};
export const DRAW_COLORS = [
  "#111111",
  "#1f5f3a",
  "#258f5d",
  "#74a85c",
  "#a6c96a",
  "#4a2f1c",
  "#7a4b2a",
  "#a87444",
  "#c49a62",
  "#c64235",
  "#f2bd3d",
  "#1f7fe5",
  "#ffffff",
] as const;
export const ERASER_COLOR = "#ffffff";
export const DEFAULT_DRAW_SIZE = 8;
export const MIN_DRAW_ZOOM = 0.12;
export const MAX_DRAW_ZOOM = 4;

export function clampDrawZoom(zoom: number) {
  return Math.min(MAX_DRAW_ZOOM, Math.max(MIN_DRAW_ZOOM, zoom));
}

export function worldToScreen(point: DrawPoint, view: DrawView, width: number, height: number): DrawPoint {
  return {
    x: width / 2 + (point.x - view.center.x) * view.zoom,
    y: height / 2 + (point.y - view.center.y) * view.zoom,
  };
}

export function screenToWorld(point: DrawPoint, view: DrawView, width: number, height: number): DrawPoint {
  return {
    x: view.center.x + (point.x - width / 2) / view.zoom,
    y: view.center.y + (point.y - height / 2) / view.zoom,
  };
}

export function distance(left: DrawPoint, right: DrawPoint) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function midpoint(left: DrawPoint, right: DrawPoint): DrawPoint {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

export function getCanvasPoint(event: { clientX: number; clientY: number }, element: HTMLElement): DrawPoint {
  const rect = element.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}
