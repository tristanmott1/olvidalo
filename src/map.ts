import L from "leaflet";

export type LocationPoint = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

export type MapView = {
  center: LocationPoint;
  zoom: number;
};

export type DrawPoint = {
  x: number;
  y: number;
};

export type DrawView = {
  center: DrawPoint;
  zoom: number;
};

export type DrawStroke = {
  id: string;
  color: string;
  size: number;
  points: DrawPoint[];
};

export type RealMapSetup = {
  kind: "real";
  swing: LocationPoint;
  view: MapView;
};

export type DrawnMapSetup = {
  kind: "drawn";
  swing: DrawPoint;
  view: DrawView;
  strokes: DrawStroke[];
};

export type MapSetup = RealMapSetup | DrawnMapSetup;

export type KickLocation =
  | {
      kind: "real";
      point: LocationPoint;
    }
  | {
      kind: "drawn";
      point: DrawPoint;
    };

export type KickMarker = {
  id: string;
  kind: "fair" | "out";
  playerId: string;
  playerName: string;
  round: number;
  elapsedMs: number;
  location: LocationPoint;
};

export type DrawKickMarker = {
  id: string;
  kind: "fair" | "out";
  playerId: string;
  playerName: string;
  round: number;
  elapsedMs: number;
  point: DrawPoint;
};

export function toLeafletPoint(point: LocationPoint): L.LatLngExpression {
  return [point.lat, point.lng];
}

export function createKickIcon(kind: KickMarker["kind"]) {
  return L.divIcon({
    className: `kick-marker ${kind}-marker`,
    html: `<span>${kind === "fair" ? "F" : "O"}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function createSelectedIcon() {
  return L.divIcon({
    className: "kick-marker selected-marker",
    html: "<span></span>",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function createSwingIcon() {
  return L.divIcon({
    className: "kick-marker swing-marker",
    html: "<span>S</span>",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function createCurrentLocationIcon() {
  return L.divIcon({
    className: "current-location-marker",
    html: "<span></span>",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
