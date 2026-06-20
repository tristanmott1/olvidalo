import L from "leaflet";

export type LocationPoint = {
  lat: number;
  lng: number;
  accuracy: number | null;
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
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function createSelectedIcon() {
  return L.divIcon({
    className: "kick-marker selected-marker",
    html: "<span></span>",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function fitMarkers(map: L.Map, markers: KickMarker[], fallbackCenter: LocationPoint) {
  if (markers.length === 0) {
    map.setView(toLeafletPoint(fallbackCenter), 16);
    return;
  }

  const bounds = L.latLngBounds(markers.map((marker) => toLeafletPoint(marker.location)));
  map.fitBounds(bounds, { maxZoom: 18, padding: [28, 28] });
}
