import L from "leaflet";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  createCurrentLocationIcon,
  createKickIcon,
  createSwingIcon,
  type KickMarker,
  type LocationPoint,
  type MapView,
  type RealMapSetup,
  toLeafletPoint,
} from "./map";

type PlayerOption = {
  id: string;
  name: string;
};

type MapModalProps =
  | {
      center: LocationPoint;
      currentLocation: LocationPoint;
      mode: "setup";
      onCancel: () => void;
      onSave: (setup: RealMapSetup) => void;
      onSelectSwing: (point: LocationPoint) => void;
      selectedSwing: LocationPoint | null;
      zoom: number;
    }
  | {
      currentLocation: LocationPoint | null;
      mode: "picker";
      onCancel: () => void;
      onSave: () => void;
      onSelect: (point: LocationPoint) => void;
      selected: LocationPoint | null;
      selectedKind: KickMarker["kind"];
      setup: RealMapSetup;
    }
  | {
      currentLocation: LocationPoint | null;
      markers: KickMarker[];
      mode: "viewer";
      onClose: () => void;
      onPlayerChange: (playerId: string | "all") => void;
      onRoundChange: (round: number | "all") => void;
      players: PlayerOption[];
      rounds: number;
      selectedPlayerId: string | "all";
      selectedRound: number | "all";
      setup: RealMapSetup;
    };

function describeMarker(marker: KickMarker) {
  const label = marker.kind === "fair" ? "Hit" : "Out";
  return `${label} - ${marker.playerName} - Round ${marker.round}`;
}

function createPoint(point: L.LatLng): LocationPoint {
  return {
    lat: point.lat,
    lng: point.lng,
    accuracy: null,
  };
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const sign = totalSeconds < 0 ? "-" : "";
  const absoluteSeconds = Math.abs(totalSeconds);
  const minutes = Math.floor(absoluteSeconds / 60);
  const seconds = absoluteSeconds % 60;

  return `${sign}${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getInitialView(props: MapModalProps): MapView {
  if (props.mode === "setup") {
    return { center: props.center, zoom: props.zoom };
  }

  return props.setup.view;
}

function getMapView(map: L.Map): MapView {
  const center = map.getCenter();

  return {
    center: createPoint(center),
    zoom: map.getZoom(),
  };
}

function getTitle(mode: MapModalProps["mode"]) {
  if (mode === "setup") {
    return "Set Swing";
  }

  return mode === "picker" ? "Kick Location" : "Kick Map";
}

function MapModal(props: MapModalProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const onMapClickRef = useRef<((point: LocationPoint) => void) | null>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return undefined;
    }

    const view = getInitialView(props);
    const map = L.map(mapElementRef.current, {
      attributionControl: true,
      zoomControl: true,
    }).setView(toLeafletPoint(view.center), view.zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (props.mode === "setup") {
      onMapClickRef.current = props.onSelectSwing;
      return;
    }

    onMapClickRef.current = props.mode === "picker" ? props.onSelect : null;
  }, [props]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return undefined;
    }

    function handleClick(event: L.LeafletMouseEvent) {
      onMapClickRef.current?.(createPoint(event.latlng));
    }

    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const view = getInitialView(props);

    // Setup captures user pan/zoom, while picker/viewer reuse the saved setup view.
    if (props.mode !== "setup") {
      map.setView(toLeafletPoint(view.center), view.zoom);
    }
  }, [props.mode]);

  useEffect(() => {
    const markerLayer = markerLayerRef.current;

    if (!markerLayer) {
      return;
    }

    markerLayer.clearLayers();

    if (props.mode === "setup") {
      if (props.currentLocation) {
        L.marker(toLeafletPoint(props.currentLocation), { icon: createCurrentLocationIcon() }).addTo(markerLayer);
      }

      if (props.selectedSwing) {
        L.marker(toLeafletPoint(props.selectedSwing), { icon: createSwingIcon() }).addTo(markerLayer);
      }

      return;
    }

    L.marker(toLeafletPoint(props.setup.swing), { icon: createSwingIcon() }).addTo(markerLayer);

    if (props.currentLocation) {
      L.marker(toLeafletPoint(props.currentLocation), { icon: createCurrentLocationIcon() }).addTo(markerLayer);
    }

    if (props.mode === "picker") {
      if (props.selected) {
        L.marker(toLeafletPoint(props.selected), { icon: createKickIcon(props.selectedKind) }).addTo(markerLayer);
      }

      return;
    }

    // Rebuild markers from React state so filtering has one source of truth.
    props.markers.forEach((marker) => {
      L.marker(toLeafletPoint(marker.location), { icon: createKickIcon(marker.kind) })
        .bindPopup(`${describeMarker(marker)}<br>${formatElapsed(marker.elapsedMs)}`)
        .addTo(markerLayer);
    });
  }, [props]);

  function saveSetup() {
    if (props.mode !== "setup" || !props.selectedSwing || !mapRef.current) {
      return;
    }

    // Save the user's current pan/zoom as the reusable game map orientation.
    props.onSave({
      kind: "real",
      swing: props.selectedSwing,
      view: getMapView(mapRef.current),
    });
  }

  return (
    <div className="modal-backdrop">
      <section className="map-modal" role="dialog" aria-modal="true">
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

        <div className="map-surface" ref={mapElementRef} />

        {props.mode === "viewer" && props.markers.length === 0 ? (
          <p className="map-empty">No saved kick locations.</p>
        ) : null}

        {props.mode !== "viewer" ? (
          <div className="map-actions">
            <button className="secondary" type="button" onClick={props.onCancel}>
              {props.mode === "setup" ? "Skip" : "Dismiss"}
            </button>
            <button
              className="primary"
              type="button"
              onClick={props.mode === "setup" ? saveSetup : props.onSave}
              disabled={props.mode === "setup" ? !props.selectedSwing : !props.selected}
            >
              Save
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default MapModal;
