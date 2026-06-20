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

export type MapSetup = {
  swing: LocationPoint;
  view: MapView;
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
