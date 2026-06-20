import L from "leaflet";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  createKickIcon,
  createSelectedIcon,
  fitMarkers,
  type KickMarker,
  type LocationPoint,
  toLeafletPoint,
} from "./map";

type PlayerOption = {
  id: string;
  name: string;
};

type MapModalProps =
  | {
      center: LocationPoint;
      mode: "picker";
      onCancel: () => void;
      onSave: () => void;
      onSelect: (point: LocationPoint) => void;
      selected: LocationPoint | null;
    }
  | {
      fallbackCenter: LocationPoint;
      markers: KickMarker[];
      mode: "viewer";
      onClose: () => void;
      onPlayerChange: (playerId: string | "all") => void;
      onRoundChange: (round: number | "all") => void;
      players: PlayerOption[];
      rounds: number;
      selectedPlayerId: string | "all";
      selectedRound: number | "all";
    };

function describeMarker(marker: KickMarker) {
  const label = marker.kind === "fair" ? "Fair" : "Out";
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

function MapModal(props: MapModalProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const selectedMarkerRef = useRef<L.Marker | null>(null);
  const onSelectRef = useRef<((point: LocationPoint) => void) | null>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return undefined;
    }

    const center = props.mode === "picker" ? props.center : props.fallbackCenter;
    const map = L.map(mapElementRef.current, {
      attributionControl: true,
      zoomControl: true,
    }).setView(toLeafletPoint(center), 16);

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
      selectedMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    onSelectRef.current = props.mode === "picker" ? props.onSelect : null;
  }, [props]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || props.mode !== "picker") {
      return undefined;
    }

    // The picker records a single point and intentionally shows no old kicks.
    function handleClick(event: L.LeafletMouseEvent) {
      onSelectRef.current?.(createPoint(event.latlng));
    }

    map.on("click", handleClick);
    map.setView(toLeafletPoint(props.center), 16);

    return () => {
      map.off("click", handleClick);
    };
  }, [props.mode, props.mode === "picker" ? props.center.lat : null, props.mode === "picker" ? props.center.lng : null]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || props.mode !== "picker") {
      return;
    }

    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.remove();
      selectedMarkerRef.current = null;
    }

    if (props.selected) {
      selectedMarkerRef.current = L.marker(toLeafletPoint(props.selected), {
        icon: createSelectedIcon(),
      }).addTo(map);
    }
  }, [props]);

  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;

    if (!map || !markerLayer || props.mode !== "viewer") {
      return;
    }

    // Rebuild markers from React state so filtering has one source of truth.
    markerLayer.clearLayers();

    props.markers.forEach((marker) => {
      L.marker(toLeafletPoint(marker.location), { icon: createKickIcon(marker.kind) })
        .bindPopup(`${describeMarker(marker)}<br>${formatElapsed(marker.elapsedMs)}`)
        .addTo(markerLayer);
    });

    fitMarkers(map, props.markers, props.fallbackCenter);
  }, [props]);

  return (
    <div className="modal-backdrop">
      <section className="map-modal" role="dialog" aria-modal="true">
        <div className="map-modal-top">
          <strong>{props.mode === "picker" ? "Kick Location" : "Kick Map"}</strong>
          <button
            className="icon-button"
            type="button"
            onClick={props.mode === "picker" ? props.onCancel : props.onClose}
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

        {props.mode === "picker" ? (
          <div className="map-actions">
            <button className="secondary" type="button" onClick={props.onCancel}>
              Dismiss
            </button>
            <button className="primary" type="button" onClick={props.onSave} disabled={!props.selected}>
              Save
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default MapModal;
