import {
  ArrowDown,
  GripVertical,
  Info,
  Map as MapIcon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import DrawMapModal from "./DrawMapModal";
import { DEFAULT_DRAW_SIZE, DEFAULT_DRAW_VIEW, DRAW_COLORS } from "./drawMap";
import MapModal from "./MapModal";
import type {
  DrawKickMarker,
  DrawPoint,
  DrawStroke,
  DrawView,
  DrawnMapSetup,
  KickLocation,
  KickMarker,
  LocationPoint,
  MapSetup,
  RealMapSetup,
} from "./map";

type Player = {
  id: string;
  name: string;
  outLimit: number;
};

type Page = "home" | "play" | "results" | "rules";
type HitKind = "fair" | "out";
type AdjustmentKind = "bonus" | "penalty";
type ScoringType = "longest" | "hits";
type RoundScoring = "cumulative" | "best";
type TimerStatus = "idle" | "running" | "paused" | "done";
type LeaderboardTab = "overall" | "current";

type GameSettings = {
  rounds: number;
  scoringType: ScoringType;
  roundScoring: RoundScoring;
  bonusSeconds: number;
  penaltySeconds: number;
};

type TurnEvent =
  | {
      id: string;
      kind: HitKind;
      elapsedMs: number;
      location: KickLocation | null;
    }
  | {
      id: string;
      kind: AdjustmentKind;
      elapsedMs: number;
      deltaMs: number;
    };

type TurnState = {
  playerId: string;
  round: number;
  status: TimerStatus;
  startedAt: number | null;
  elapsedMs: number;
  events: TurnEvent[];
};

type TurnResult = {
  playerId: string;
  round: number;
  elapsedMs: number;
  fairHits: number;
  outHits: number;
  events: TurnEvent[];
};

type ActiveGame = {
  page: "play" | "results";
  players: Player[];
  settings: GameSettings;
  currentPlayerIndex: number;
  currentRound: number;
  currentTurn: TurnState | null;
  completedTurns: TurnResult[];
  mapSetup: MapSetup | null;
};

type RealSetupState = {
  center: LocationPoint;
  currentLocation: LocationPoint;
  selectedSwing: LocationPoint | null;
  zoom: number;
};

type DrawSetupState = {
  color: string;
  size: number;
  strokes: DrawStroke[];
  view: DrawView;
};

type PickerState = {
  eventId: string;
  kind: HitKind;
  currentLocation: LocationPoint | null;
  selected: KickLocation | null;
};

type ViewerState = {
  source: "play" | "results";
  playerId: string | "all";
  round: number | "all";
  currentLocation: LocationPoint | null;
};

type ScoreKey = {
  roundScoring: RoundScoring;
  scoringType: ScoringType;
};

type LeaderboardEntry = {
  player: Player;
  score: number;
  elapsedMs: number;
  fairHits: number;
  outHits: number;
  rounds: number;
};

const PLAYERS_KEY = "olvidalo.players.v1";
const SETTINGS_KEY = "olvidalo.settings.v1";
const ACTIVE_GAME_KEY = "olvidalo.activeGame.v1";
const DEFAULT_OUT_LIMIT = 2;
const OUT_LIMIT_OPTIONS = [1, 2, 3, 4, 5] as const;
const ROUND_OPTIONS = [1, 2, 3, 4, 5] as const;
const MAX_SETTING_SECONDS = 9999;
const TIMER_WRAP_MS = 10000 * 60 * 1000;
const DEFAULT_SETTINGS: GameSettings = {
  rounds: 1,
  scoringType: "longest",
  roundScoring: "best",
  bonusSeconds: 60,
  penaltySeconds: 15,
};
const DEFAULT_MAP_ZOOM = 17;
const SCORING_LABELS: Record<ScoringType, string> = {
  longest: "Longest",
  hits: "Hits",
};
const ROUND_SCORING_LABELS: Record<RoundScoring, string> = {
  best: "Best",
  cumulative: "Cumulative",
};
const RULES = [
  "The goal of the game is to stay on the swing for the longest amount of time. Every player not on the swing is considered an outfielder, and is playing as if on the same team. They should try to get the ball back to the pitcher as quickly as possible, so as to get more pitches and outs.",
  "The swinger's time stops when the outfielders (including pitcher) catch the live ball the specified number of times.",
  "The ball is still live if it is moving, and not on a surface that is considered the ground (eg. bouncing down through the branches of a tree), and can be caught for an out.",
  "If the ball gets stuck somewhere difficult, time continues. The outfielders must retrieve the ball and keep playing if they want the swinger to get out.",
  "If the ball is impossible to retrieve, the swinger wins by default.",
  "The pitcher must give the swinger the best opportunities for kicking possible.",
  "The swinger must give their best effort to kick the ball - full leg extension, top of foot, no bunting, or overtly side-of-foot kicks. Warnings and time penalties can be given by the pitcher.",
  "If a pitch that is clearly above the shin results in an out, the out does not count (bad pitch).",
  "The swinger can try to kick the pitcher and a dead ball if they come within the vicinity of the swing's arc.",
  "The best kind of ball is one that is about soccer ball sized that is a soft rubber, has enough weight to go far, but would not hurt excessively if hit in the face.",
];

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampChoice(value: number, allowed: readonly number[], fallback: number) {
  return allowed.includes(value) ? value : fallback;
}

function clampSeconds(value: number) {
  return Math.min(MAX_SETTING_SECONDS, Math.max(0, value));
}

function readSeconds(value: unknown, fallback: number) {
  const seconds = Math.floor(Number(value));
  return Number.isFinite(seconds) ? clampSeconds(seconds) : fallback;
}

function readSecondsDraft(value: string) {
  const seconds = Math.floor(Number(value));
  return Number.isFinite(seconds) ? clampSeconds(seconds) : 0;
}

function normalizeTimerMs(ms: number) {
  if (!Number.isFinite(ms)) {
    return 0;
  }

  if (ms >= TIMER_WRAP_MS) {
    return ms % TIMER_WRAP_MS;
  }

  if (ms <= -TIMER_WRAP_MS) {
    const remainder = Math.abs(ms) % TIMER_WRAP_MS;
    return remainder === 0 ? 0 : -remainder;
  }

  return ms;
}

function readStoredPlayers(): Player[] {
  try {
    const raw = localStorage.getItem(PLAYERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((player) => ({
        id: typeof player.id === "string" ? player.id : createId(),
        name: typeof player.name === "string" ? player.name : "",
        outLimit: clampChoice(Number(player.outLimit), OUT_LIMIT_OPTIONS, DEFAULT_OUT_LIMIT),
      }))
      .filter((player) => player.name.trim().length > 0);
  } catch {
    return [];
  }
}

function readStoredSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const scoringType = parsed.scoringType === "hits" || parsed.scoringType === "mostHits" ? "hits" : "longest";
    const roundScoring = parsed.roundScoring === "cumulative" ? "cumulative" : "best";

    return {
      rounds: clampChoice(Number(parsed.rounds), ROUND_OPTIONS, DEFAULT_SETTINGS.rounds),
      scoringType,
      roundScoring,
      bonusSeconds: readSeconds(parsed.bonusSeconds, DEFAULT_SETTINGS.bonusSeconds),
      penaltySeconds: readSeconds(parsed.penaltySeconds, DEFAULT_SETTINGS.penaltySeconds),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function readLocation(value: unknown): LocationPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const point = value as Partial<LocationPoint>;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  const accuracy = point.accuracy === null ? null : Number(point.accuracy);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  };
}

function readDrawPoint(value: unknown): DrawPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const point = value as Partial<DrawPoint>;
  const x = Number(point.x);
  const y = Number(point.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function readDrawStroke(value: unknown): DrawStroke | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const stroke = value as Partial<DrawStroke>;
  const points = Array.isArray(stroke.points)
    ? stroke.points.map(readDrawPoint).filter((point): point is DrawPoint => Boolean(point))
    : [];
  const size = Number(stroke.size);

  if (typeof stroke.id !== "string" || typeof stroke.color !== "string" || !Number.isFinite(size)) {
    return null;
  }

  return {
    id: stroke.id,
    color: stroke.color,
    size,
    points,
  };
}

function readMapSetup(value: unknown): MapSetup | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const setup = value as {
    kind?: unknown;
    strokes?: unknown;
    swing?: unknown;
    view?: {
      center?: unknown;
      zoom?: unknown;
    };
  };
  const zoom = Number(setup.view?.zoom);

  if (!Number.isFinite(zoom)) {
    return null;
  }

  if (setup.kind === "drawn") {
    const swing = readDrawPoint(setup.swing);
    const center = readDrawPoint(setup.view?.center);
    const strokes = Array.isArray(setup.strokes)
      ? setup.strokes.map(readDrawStroke).filter((stroke): stroke is DrawStroke => Boolean(stroke))
      : [];

    if (!swing || !center) {
      return null;
    }

    return {
      kind: "drawn",
      swing,
      view: { center, zoom },
      strokes,
    };
  }

  const swing = readLocation(setup.swing);
  const center = readLocation(setup.view?.center);

  if (!swing || !center) {
    return null;
  }

  return {
    kind: "real",
    swing,
    view: { center, zoom },
  };
}

function readKickLocation(value: unknown): KickLocation | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const location = value as {
    kind?: unknown;
    point?: unknown;
  };

  if (location.kind === "drawn") {
    const point = readDrawPoint(location.point);
    return point ? { kind: "drawn", point } : null;
  }

  if (location.kind === "real") {
    const point = readLocation(location.point);
    return point ? { kind: "real", point } : null;
  }

  const legacyPoint = readLocation(value);
  return legacyPoint ? { kind: "real", point: legacyPoint } : null;
}

function readTurnEvent(value: unknown): TurnEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const event = value as {
    deltaMs?: unknown;
    elapsedMs?: unknown;
    id?: unknown;
    kind?: unknown;
    location?: unknown;
  };
  const rawElapsedMs = Number(event.elapsedMs);

  if (!Number.isFinite(rawElapsedMs)) {
    return null;
  }

  const elapsedMs = normalizeTimerMs(rawElapsedMs);

  if (event.kind === "fair" || event.kind === "out") {
    return {
      id: typeof event.id === "string" ? event.id : createId(),
      kind: event.kind,
      elapsedMs,
      location: readKickLocation(event.location),
    };
  }

  if (event.kind === "bonus" || event.kind === "penalty") {
    const deltaMs = Number(event.deltaMs);

    if (!Number.isFinite(deltaMs)) {
      return null;
    }

    return {
      id: typeof event.id === "string" ? event.id : createId(),
      kind: event.kind,
      elapsedMs,
      deltaMs,
    };
  }

  return null;
}

function readTurn(value: unknown): TurnState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const turn = value as {
    elapsedMs?: unknown;
    events?: unknown;
    playerId?: unknown;
    round?: unknown;
    status?: unknown;
  };
  const elapsedMs = Number(turn.elapsedMs);
  const round = Number(turn.round);
  const events = Array.isArray(turn.events)
    ? turn.events.map(readTurnEvent).filter((event): event is TurnEvent => Boolean(event))
    : [];

  if (typeof turn.playerId !== "string" || !Number.isFinite(round) || !Number.isFinite(elapsedMs)) {
    return null;
  }

  const status = turn.status === "done" || turn.status === "paused" || turn.status === "idle"
    ? turn.status
    : "paused";

  return {
    playerId: turn.playerId,
    round,
    // A restored running timer always reopens paused so closing the app never adds surprise time.
    status,
    startedAt: null,
    elapsedMs,
    events,
  };
}

function readTurnResult(value: unknown): TurnResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result = value as {
    elapsedMs?: unknown;
    events?: unknown;
    fairHits?: unknown;
    outHits?: unknown;
    playerId?: unknown;
    round?: unknown;
  };
  const rawElapsedMs = Number(result.elapsedMs);
  const fairHits = Number(result.fairHits);
  const outHits = Number(result.outHits);
  const round = Number(result.round);
  const events = Array.isArray(result.events)
    ? result.events.map(readTurnEvent).filter((event): event is TurnEvent => Boolean(event))
    : [];

  if (
    typeof result.playerId !== "string" ||
    !Number.isFinite(round) ||
    !Number.isFinite(rawElapsedMs) ||
    !Number.isFinite(fairHits) ||
    !Number.isFinite(outHits)
  ) {
    return null;
  }

  return {
    playerId: result.playerId,
    round,
    elapsedMs: normalizeTimerMs(rawElapsedMs),
    fairHits,
    outHits,
    events,
  };
}

function readActiveGame(): ActiveGame | null {
  try {
    const raw = localStorage.getItem(ACTIVE_GAME_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const game = parsed as Partial<ActiveGame>;
    const players = Array.isArray(game.players)
      ? game.players
          .map((player) => ({
            id: typeof player.id === "string" ? player.id : createId(),
            name: typeof player.name === "string" ? player.name : "",
            outLimit: clampChoice(Number(player.outLimit), OUT_LIMIT_OPTIONS, DEFAULT_OUT_LIMIT),
          }))
          .filter((player) => player.name.trim().length > 0)
      : [];
    const settings: GameSettings = game.settings
      ? {
          rounds: clampChoice(Number(game.settings.rounds), ROUND_OPTIONS, DEFAULT_SETTINGS.rounds),
          scoringType: game.settings.scoringType === "hits" ? "hits" : "longest",
          roundScoring: game.settings.roundScoring === "cumulative" ? "cumulative" : "best",
          bonusSeconds: readSeconds(game.settings.bonusSeconds, DEFAULT_SETTINGS.bonusSeconds),
          penaltySeconds: readSeconds(game.settings.penaltySeconds, DEFAULT_SETTINGS.penaltySeconds),
        }
      : DEFAULT_SETTINGS;
    const currentPlayerIndex = Number(game.currentPlayerIndex);
    const currentRound = Number(game.currentRound);
    const completedTurns = Array.isArray(game.completedTurns)
      ? game.completedTurns.map(readTurnResult).filter((result): result is TurnResult => Boolean(result))
      : [];
    const mapSetup = readMapSetup(game.mapSetup);

    if (
      (game.page !== "play" && game.page !== "results") ||
      players.length === 0 ||
      !Number.isFinite(currentPlayerIndex) ||
      !Number.isFinite(currentRound)
    ) {
      return null;
    }

    return {
      page: game.page,
      players,
      settings,
      currentPlayerIndex,
      currentRound,
      currentTurn: readTurn(game.currentTurn),
      completedTurns,
      mapSetup,
    };
  } catch {
    return null;
  }
}

function shufflePlayers(players: Player[]) {
  const shuffled = [...players];

  // Walk backward for a compact Fisher-Yates shuffle.
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function countHits(events: TurnEvent[]) {
  return events.reduce(
    (counts, event) => ({
      fair: counts.fair + (event.kind === "fair" ? 1 : 0),
      out: counts.out + (event.kind === "out" ? 1 : 0),
    }),
    { fair: 0, out: 0 },
  );
}

function getAdjustmentMs(events: TurnEvent[]) {
  // Add bonus and penalty events without changing the frozen base clock.
  return events.reduce((total, event) => total + ("deltaMs" in event ? event.deltaMs : 0), 0);
}

function getTurnBaseElapsedMs(turn: TurnState, now: number) {
  // Keep the clock math separate from bonus and penalty adjustments.
  if (turn.status !== "running" || !turn.startedAt) {
    return turn.elapsedMs;
  }

  return turn.elapsedMs + Math.max(0, now - turn.startedAt);
}

function getTurnElapsedMs(turn: TurnState, now: number) {
  return normalizeTimerMs(getTurnBaseElapsedMs(turn, now) + getAdjustmentMs(turn.events));
}

function createTurn(playerId: string, round: number): TurnState {
  return {
    playerId,
    round,
    status: "idle",
    startedAt: null,
    elapsedMs: 0,
    events: [],
  };
}

function toTurnResult(turn: TurnState, now: number): TurnResult {
  const counts = countHits(turn.events);

  return {
    playerId: turn.playerId,
    round: turn.round,
    elapsedMs: getTurnElapsedMs(turn, now),
    fairHits: counts.fair,
    outHits: counts.out,
    events: turn.events,
  };
}

function formatTime(ms: number) {
  const sign = ms < 0 ? "-" : "";
  const totalTenths = Math.floor(Math.abs(ms) / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;

  return `${sign}${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}

function effectiveRoundScoring(settings: GameSettings): RoundScoring {
  return settings.rounds === 1 ? "cumulative" : settings.roundScoring;
}

function oppositeScoringType(scoringType: ScoringType): ScoringType {
  return scoringType === "longest" ? "hits" : "longest";
}

function oppositeRoundScoring(roundScoring: RoundScoring): RoundScoring {
  return roundScoring === "cumulative" ? "best" : "cumulative";
}

function scoreResults(results: TurnResult[], key: ScoreKey) {
  const values = results.map((result) => (key.scoringType === "longest" ? result.elapsedMs : result.fairHits));

  if (values.length === 0) {
    return 0;
  }

  return key.roundScoring === "cumulative"
    ? values.reduce((total, value) => total + value, 0)
    : Math.max(...values);
}

function getResultScore(result: TurnResult, scoringType: ScoringType) {
  return scoringType === "longest" ? result.elapsedMs : result.fairHits;
}

function getBestDisplayResult(results: TurnResult[], scoringType: ScoringType) {
  const otherScoringType = oppositeScoringType(scoringType);

  // Choose one real round for Best display so the detail stats stay together.
  return [...results].sort((left, right) => {
    const primaryDifference = getResultScore(right, scoringType) - getResultScore(left, scoringType);

    if (primaryDifference !== 0) {
      return primaryDifference;
    }

    const otherDifference = getResultScore(right, otherScoringType) - getResultScore(left, otherScoringType);

    if (otherDifference !== 0) {
      return otherDifference;
    }

    return left.round - right.round;
  })[0];
}

function getDisplayStats(results: TurnResult[], settings: GameSettings) {
  if (effectiveRoundScoring(settings) === "best") {
    const bestResult = getBestDisplayResult(results, settings.scoringType);

    return {
      elapsedMs: bestResult?.elapsedMs ?? 0,
      fairHits: bestResult?.fairHits ?? 0,
      outHits: bestResult?.outHits ?? 0,
    };
  }

  return {
    elapsedMs: scoreResults(results, { roundScoring: "cumulative", scoringType: "longest" }),
    fairHits: scoreResults(results, { roundScoring: "cumulative", scoringType: "hits" }),
    outHits: results.reduce((total, result) => total + result.outHits, 0),
  };
}

function makeScoreKeys(settings: GameSettings): ScoreKey[] {
  const selectedRoundScoring = effectiveRoundScoring(settings);
  const otherRoundScoring = oppositeRoundScoring(selectedRoundScoring);
  const otherScoringType = oppositeScoringType(settings.scoringType);

  // Build tie-breakers by crossing the selected and alternate score dimensions.
  return [
    { roundScoring: selectedRoundScoring, scoringType: settings.scoringType },
    { roundScoring: otherRoundScoring, scoringType: settings.scoringType },
    { roundScoring: selectedRoundScoring, scoringType: otherScoringType },
    { roundScoring: otherRoundScoring, scoringType: otherScoringType },
  ];
}

function buildLeaderboard(results: TurnResult[], players: Player[], settings: GameSettings): LeaderboardEntry[] {
  const scoreKeys = makeScoreKeys(settings);
  const orderIndex = new Map(players.map((player, index) => [player.id, index]));

  return players
    .map((player) => {
      const playerResults = results.filter((result) => result.playerId === player.id);
      const primaryScore = scoreResults(playerResults, scoreKeys[0]);
      const displayStats = getDisplayStats(playerResults, settings);

      return {
        player,
        score: primaryScore,
        elapsedMs: displayStats.elapsedMs,
        fairHits: displayStats.fairHits,
        outHits: displayStats.outHits,
        rounds: playerResults.length,
        tieScores: scoreKeys.map((key) => scoreResults(playerResults, key)),
      };
    })
    .filter((entry) => entry.rounds > 0)
    .sort((left, right) => {
      // Compare all score dimensions before falling back to the initial order.
      for (let index = 0; index < left.tieScores.length; index += 1) {
        const difference = right.tieScores[index] - left.tieScores[index];

        if (difference !== 0) {
          return difference;
        }
      }

      return (orderIndex.get(left.player.id) ?? 0) - (orderIndex.get(right.player.id) ?? 0);
    });
}

function getMainScoreLabel(entry: LeaderboardEntry, settings: GameSettings) {
  return settings.scoringType === "longest" ? formatTime(entry.score) : `${entry.score} hits`;
}

function getSubScoreLabel(entry: LeaderboardEntry, settings: GameSettings) {
  const otherScore = settings.scoringType === "longest" ? `${entry.fairHits} hits` : formatTime(entry.elapsedMs);
  return `${otherScore} / ${entry.outHits} out`;
}

function toLocationPoint(position: GeolocationPosition): LocationPoint {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
  };
}

function requestCurrentLocation() {
  return new Promise<LocationPoint>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location unavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toLocationPoint(position)),
      reject,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      },
    );
  });
}

function buildMarkerTurns(results: TurnResult[], currentTurn: TurnState | null) {
  return [
    ...results.map((result) => ({
      playerId: result.playerId,
      round: result.round,
      events: result.events,
    })),
    ...(currentTurn
      ? [{
          playerId: currentTurn.playerId,
          round: currentTurn.round,
          events: currentTurn.events,
        }]
      : []),
  ];
}

function buildRealKickMarkers(results: TurnResult[], currentTurn: TurnState | null, players: Player[]): KickMarker[] {
  const playerNames = new Map(players.map((player) => [player.id, player.name]));
  const turns = buildMarkerTurns(results, currentTurn);

  return turns.flatMap((turn) => {
    const markers: KickMarker[] = [];

    // Only real located Hit and Out events become Leaflet markers.
    turn.events.forEach((event) => {
      if ((event.kind === "fair" || event.kind === "out") && event.location?.kind === "real") {
        markers.push({
          id: `${turn.playerId}-${turn.round}-${event.id}`,
          kind: event.kind,
          playerId: turn.playerId,
          playerName: playerNames.get(turn.playerId) ?? "Player",
          round: turn.round,
          elapsedMs: event.elapsedMs,
          location: event.location.point,
        });
      }
    });

    return markers;
  });
}

function buildDrawKickMarkers(results: TurnResult[], currentTurn: TurnState | null, players: Player[]): DrawKickMarker[] {
  const playerNames = new Map(players.map((player) => [player.id, player.name]));
  const turns = buildMarkerTurns(results, currentTurn);

  return turns.flatMap((turn) => {
    const markers: DrawKickMarker[] = [];

    // Only drawn located Hit and Out events become canvas markers.
    turn.events.forEach((event) => {
      if ((event.kind === "fair" || event.kind === "out") && event.location?.kind === "drawn") {
        markers.push({
          id: `${turn.playerId}-${turn.round}-${event.id}`,
          kind: event.kind,
          playerId: turn.playerId,
          playerName: playerNames.get(turn.playerId) ?? "Player",
          round: turn.round,
          elapsedMs: event.elapsedMs,
          point: event.location.point,
        });
      }
    });

    return markers;
  });
}

function filterKickMarkers<T extends { playerId: string; round: number }>(markers: T[], viewer: ViewerState) {
  return markers.filter((marker) => {
    const playerMatches = viewer.playerId === "all" || marker.playerId === viewer.playerId;
    const roundMatches = viewer.round === "all" || marker.round === viewer.round;

    return playerMatches && roundMatches;
  });
}

function App() {
  const savedGameRef = useRef<ActiveGame | null>(readActiveGame());
  const savedGame = savedGameRef.current;
  const [page, setPage] = useState<Page>(savedGame?.page ?? "home");
  const [players, setPlayers] = useState<Player[]>(savedGame?.players ?? readStoredPlayers);
  const [settings, setSettings] = useState<GameSettings>(savedGame?.settings ?? readStoredSettings);
  const [draftName, setDraftName] = useState("");
  const [draftOutLimit, setDraftOutLimit] = useState(DEFAULT_OUT_LIMIT);
  const [bonusSecondsDraft, setBonusSecondsDraft] = useState(String(settings.bonusSeconds));
  const [penaltySecondsDraft, setPenaltySecondsDraft] = useState(String(settings.penaltySeconds));
  const [gamePlayers, setGamePlayers] = useState<Player[]>(savedGame?.players ?? []);
  const [currentRound, setCurrentRound] = useState(savedGame?.currentRound ?? 1);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(savedGame?.currentPlayerIndex ?? 0);
  const [currentTurn, setCurrentTurn] = useState<TurnState | null>(savedGame?.currentTurn ?? null);
  const [completedTurns, setCompletedTurns] = useState<TurnResult[]>(savedGame?.completedTurns ?? []);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>("overall");
  const [mapSetup, setMapSetup] = useState<MapSetup | null>(savedGame?.mapSetup ?? null);
  const [locationPromptOpen, setLocationPromptOpen] = useState(false);
  const [locationRequesting, setLocationRequesting] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const [pendingStartPlayers, setPendingStartPlayers] = useState<Player[]>([]);
  const [realSetupState, setRealSetupState] = useState<RealSetupState | null>(null);
  const [drawSetupState, setDrawSetupState] = useState<DrawSetupState | null>(null);
  const [pickerState, setPickerState] = useState<PickerState | null>(null);
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const draftNameInputRef = useRef<HTMLInputElement>(null);

  function getSavedCurrentTurn(timestamp: number) {
    if (!currentTurn) {
      return null;
    }

    if (currentTurn.status !== "running") {
      return currentTurn;
    }

    return {
      ...currentTurn,
      // Save a running timer as paused at the visible time so reopening never adds surprise time.
      elapsedMs: getTurnBaseElapsedMs(currentTurn, timestamp),
      startedAt: null,
      status: "paused" as const,
    };
  }

  function saveActiveGame(timestamp = Date.now()) {
    if (page !== "play" && page !== "results") {
      return;
    }

    const activeGame: ActiveGame = {
      page,
      players: gamePlayers,
      settings,
      currentPlayerIndex,
      currentRound,
      currentTurn: getSavedCurrentTurn(timestamp),
      completedTurns,
      mapSetup,
    };

    localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(activeGame));
  }

  useEffect(() => {
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    saveActiveGame();
  }, [
    page,
    gamePlayers,
    settings,
    currentPlayerIndex,
    currentRound,
    currentTurn,
    completedTurns,
    mapSetup,
  ]);

  useEffect(() => {
    function saveBeforeClose() {
      saveActiveGame();
    }

    window.addEventListener("pagehide", saveBeforeClose);
    document.addEventListener("visibilitychange", saveBeforeClose);

    return () => {
      window.removeEventListener("pagehide", saveBeforeClose);
      document.removeEventListener("visibilitychange", saveBeforeClose);
    };
  });

  useEffect(() => {
    if (currentTurn?.status !== "running") {
      return undefined;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(interval);
  }, [currentTurn?.status]);

  useEffect(() => {
    if (!draggingPlayerId) {
      return undefined;
    }

    const activeDraggingPlayerId = draggingPlayerId;

    function handlePointerMove(event: PointerEvent) {
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-player-id]");
      const overPlayerId = row?.dataset.playerId;

      // Move the dragged row as soon as the pointer crosses another row.
      if (overPlayerId && overPlayerId !== activeDraggingPlayerId) {
        reorderPlayer(activeDraggingPlayerId, overPlayerId);
      }
    }

    function handlePointerUp() {
      setDraggingPlayerId(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [draggingPlayerId, players]);

  const currentPlayer = currentTurn
    ? gamePlayers.find((player) => player.id === currentTurn.playerId) ?? null
    : null;
  const currentCounts = countHits(currentTurn?.events ?? []);
  const currentElapsedMs = currentTurn ? getTurnElapsedMs(currentTurn, now) : 0;
  const currentDoneResult = currentTurn?.status === "done" ? toTurnResult(currentTurn, now) : null;
  const scoredTurns = useMemo(
    () => [...completedTurns, ...(currentDoneResult ? [currentDoneResult] : [])],
    [completedTurns, currentDoneResult],
  );
  const overallLeaderboard = useMemo(
    () => buildLeaderboard(scoredTurns, gamePlayers, settings),
    [scoredTurns, gamePlayers, settings],
  );
  const currentRoundLeaderboard = useMemo(
    () => buildLeaderboard(scoredTurns.filter((result) => result.round === currentRound), gamePlayers, settings),
    [scoredTurns, currentRound, gamePlayers, settings],
  );
  const realKickMarkers = useMemo(
    () => buildRealKickMarkers(completedTurns, currentTurn, gamePlayers),
    [completedTurns, currentTurn, gamePlayers],
  );
  const drawKickMarkers = useMemo(
    () => buildDrawKickMarkers(completedTurns, currentTurn, gamePlayers),
    [completedTurns, currentTurn, gamePlayers],
  );
  const visibleRealKickMarkers = useMemo(
    () => (viewerState ? filterKickMarkers(realKickMarkers, viewerState) : []),
    [realKickMarkers, viewerState],
  );
  const visibleDrawKickMarkers = useMemo(
    () => (viewerState ? filterKickMarkers(drawKickMarkers, viewerState) : []),
    [drawKickMarkers, viewerState],
  );
  const onDeckPlayers = getOnDeckPlayers(gamePlayers, currentRound, currentPlayerIndex, settings.rounds);
  const canStart = players.length > 0 && players.every((player) => player.name.trim().length > 0);
  const roundScoring = effectiveRoundScoring(settings);

  function updateSettings(updates: Partial<GameSettings>) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      ...updates,
    }));
  }

  function commitBonusSeconds() {
    const bonusSeconds = readSecondsDraft(bonusSecondsDraft);
    setBonusSecondsDraft(String(bonusSeconds));
    updateSettings({ bonusSeconds });
    return bonusSeconds;
  }

  function commitPenaltySeconds() {
    const penaltySeconds = readSecondsDraft(penaltySecondsDraft);
    setPenaltySecondsDraft(String(penaltySeconds));
    updateSettings({ penaltySeconds });
    return penaltySeconds;
  }

  function commitTimeSettings() {
    const bonusSeconds = readSecondsDraft(bonusSecondsDraft);
    const penaltySeconds = readSecondsDraft(penaltySecondsDraft);

    setBonusSecondsDraft(String(bonusSeconds));
    setPenaltySecondsDraft(String(penaltySeconds));
    setSettings((currentSettings) => ({
      ...currentSettings,
      bonusSeconds,
      penaltySeconds,
    }));
  }

  function commitSecondsOnEnter(event: ReactKeyboardEvent<HTMLInputElement>, commitSeconds: () => number) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitSeconds();
    }
  }

  function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = draftName.trim();
    if (!name) {
      return;
    }

    setPlayers((currentPlayers) => [
      ...currentPlayers,
      { id: createId(), name, outLimit: draftOutLimit },
    ]);
    setDraftName("");
    setDraftOutLimit(DEFAULT_OUT_LIMIT);
    draftNameInputRef.current?.focus();
  }

  function updatePlayer(playerId: string, updates: Partial<Player>) {
    setPlayers((currentPlayers) =>
      currentPlayers.map((player) => (player.id === playerId ? { ...player, ...updates } : player)),
    );
  }

  function removePlayer(playerId: string) {
    setPlayers((currentPlayers) => currentPlayers.filter((player) => player.id !== playerId));
  }

  function reorderPlayer(playerId: string, overPlayerId: string) {
    setPlayers((currentPlayers) => {
      const fromIndex = currentPlayers.findIndex((player) => player.id === playerId);
      const toIndex = currentPlayers.findIndex((player) => player.id === overPlayerId);

      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return currentPlayers;
      }

      return moveItem(currentPlayers, fromIndex, toIndex);
    });
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, playerId: string) {
    event.preventDefault();
    setDraggingPlayerId(playerId);
  }

  function prepareStartGame(order: Player[]) {
    const orderedPlayers = order.map((player) => ({
      ...player,
      name: player.name.trim(),
    }));

    if (orderedPlayers.length === 0) {
      return;
    }

    localStorage.removeItem(ACTIVE_GAME_KEY);
    setLocationNotice("");
    setPendingStartPlayers(orderedPlayers);
    setLocationPromptOpen(true);
  }

  function startGame(order: Player[], nextMapSetup: MapSetup | null) {
    const orderedPlayers = order.map((player) => ({
      ...player,
      name: player.name.trim(),
    }));

    if (orderedPlayers.length === 0) {
      return;
    }

    setPlayers(orderedPlayers);
    setGamePlayers(orderedPlayers);
    setCompletedTurns([]);
    setCurrentRound(1);
    setCurrentPlayerIndex(0);
    setCurrentTurn(createTurn(orderedPlayers[0].id, 1));
    setLeaderboardTab("overall");
    setMapSetup(nextMapSetup);
    setRealSetupState(null);
    setDrawSetupState(null);
    setPickerState(null);
    setViewerState(null);
    setLocationPromptOpen(false);
    setLocationRequesting(false);
    setPendingStartPlayers([]);
    setPage("play");
    setNow(Date.now());
  }

  async function startWithLocation() {
    if (locationRequesting) {
      return;
    }

    setLocationRequesting(true);

    try {
      const center = await requestCurrentLocation();
      setLocationPromptOpen(false);
      setLocationRequesting(false);
      setRealSetupState({
        center,
        currentLocation: center,
        selectedSwing: null,
        zoom: DEFAULT_MAP_ZOOM,
      });
    } catch {
      setLocationNotice("Location unavailable. Maps are off for this game.");
      startGame(pendingStartPlayers, null);
    }
  }

  function startWithoutLocation() {
    startGame(pendingStartPlayers, null);
  }

  function startDrawSetup() {
    setLocationPromptOpen(false);
    setDrawSetupState({
      color: DRAW_COLORS[0],
      size: DEFAULT_DRAW_SIZE,
      strokes: [],
      view: DEFAULT_DRAW_VIEW,
    });
  }

  function saveMapSetup(nextMapSetup: RealMapSetup) {
    startGame(pendingStartPlayers, nextMapSetup);
  }

  function saveDrawSetup(nextMapSetup: DrawnMapSetup) {
    startGame(pendingStartPlayers, nextMapSetup);
  }

  function skipMapSetup() {
    startGame(pendingStartPlayers, null);
  }

  function exitToHome() {
    localStorage.removeItem(ACTIVE_GAME_KEY);
    setPage("home");
    setGamePlayers([]);
    setCompletedTurns([]);
    setCurrentRound(1);
    setCurrentPlayerIndex(0);
    setCurrentTurn(null);
    setLeaderboardTab("overall");
    setMapSetup(null);
    setRealSetupState(null);
    setDrawSetupState(null);
    setPickerState(null);
    setViewerState(null);
    setLocationPromptOpen(false);
    setLocationRequesting(false);
    setPendingStartPlayers([]);
    setLocationNotice("");
  }

  function startTurn() {
    setCurrentTurn((turn) =>
      turn && turn.status === "idle"
        ? { ...turn, status: "running", startedAt: Date.now() }
        : turn,
    );
    setNow(Date.now());
  }

  function pauseTurn() {
    const timestamp = Date.now();

    setCurrentTurn((turn) =>
      turn && turn.status === "running"
        ? {
            ...turn,
            // Freeze elapsed time before leaving the running state.
            elapsedMs: getTurnBaseElapsedMs(turn, timestamp),
            startedAt: null,
            status: "paused",
          }
        : turn,
    );
    setNow(timestamp);
  }

  function resumeTurn() {
    setCurrentTurn((turn) =>
      turn && turn.status === "paused"
        ? { ...turn, status: "running", startedAt: Date.now() }
        : turn,
    );
    setNow(Date.now());
  }

  async function openPickerForKick(eventId: string, kind: HitKind) {
    setPickerState({
      eventId,
      kind,
      currentLocation: null,
      selected: null,
    });

    if (mapSetup?.kind !== "real") {
      return;
    }

    try {
      const currentLocation = await requestCurrentLocation();
      setPickerState((state) => (state?.eventId === eventId ? { ...state, currentLocation } : state));
    } catch {
      setLocationNotice("Current location unavailable. You can still select a kick location.");
    }
  }

  function recordHit(kind: HitKind) {
    const timestamp = Date.now();
    const eventId = createId();

    setCurrentTurn((turn) => {
      if (!turn || turn.status === "done" || !currentPlayer) {
        return turn;
      }

      const baseElapsedMs = getTurnBaseElapsedMs(turn, timestamp);
      const elapsedMs = getTurnElapsedMs(turn, timestamp);
      const events = [...turn.events, { id: eventId, kind, elapsedMs, location: null }];
      const outs = countHits(events).out;

      // Freeze the base clock when the final out lands; adjustments stay event-derived.
      if (outs >= currentPlayer.outLimit) {
        return { ...turn, elapsedMs: baseElapsedMs, events, startedAt: null, status: "done" };
      }

      return { ...turn, events };
    });
    setNow(timestamp);

    // Location picking happens after the kick is recorded and never pauses the timer.
    if (currentTurn?.status !== "done" && currentPlayer && mapSetup) {
      void openPickerForKick(eventId, kind);
    }
  }

  function recordAdjustment(kind: AdjustmentKind) {
    const timestamp = Date.now();
    const deltaMs = (kind === "bonus" ? settings.bonusSeconds : -settings.penaltySeconds) * 1000;

    setCurrentTurn((turn) => {
      if (!turn) {
        return turn;
      }

      const currentElapsedMs = getTurnElapsedMs(turn, timestamp);
      const elapsedMs = normalizeTimerMs(currentElapsedMs + deltaMs);
      // Store the effective delta so wrapped timers stay consistent after undo and reload.
      const normalizedDeltaMs = elapsedMs - currentElapsedMs;

      return { ...turn, events: [...turn.events, { id: createId(), kind, elapsedMs, deltaMs: normalizedDeltaMs }] };
    });
    setNow(timestamp);
  }

  function savePickerLocation() {
    if (!pickerState?.selected) {
      return;
    }

    const { eventId, selected } = pickerState;

    setCurrentTurn((turn) => {
      if (!turn) {
        return turn;
      }

      return {
        ...turn,
        events: turn.events.map((event) =>
          event.id === eventId && (event.kind === "fair" || event.kind === "out")
            ? { ...event, location: selected }
            : event,
        ),
      };
    });
    setPickerState(null);
  }

  async function refreshViewerLocation(source: ViewerState["source"]) {
    try {
      const currentLocation = await requestCurrentLocation();
      setViewerState((state) => (state?.source === source ? { ...state, currentLocation } : state));
    } catch {
      // Current location is only a temporary reference dot; the map still works without it.
    }
  }

  function openPlayMap() {
    if (!mapSetup) {
      return;
    }

    setViewerState({
      source: "play",
      playerId: currentPlayer?.id ?? "all",
      round: "all",
      currentLocation: null,
    });

    if (mapSetup.kind === "real") {
      void refreshViewerLocation("play");
    }
  }

  function openResultsMap() {
    if (!mapSetup) {
      return;
    }

    setViewerState({
      source: "results",
      playerId: "all",
      round: "all",
      currentLocation: null,
    });

    if (mapSetup.kind === "real") {
      void refreshViewerLocation("results");
    }
  }

  function undoLastEvent() {
    const removedEventId = currentTurn?.events.at(-1)?.id ?? null;

    if (pickerState?.eventId === removedEventId) {
      setPickerState(null);
    }

    setCurrentTurn((turn) => {
      if (!turn || turn.events.length === 0) {
        return turn;
      }

      const lastEvent = turn.events[turn.events.length - 1];
      const events = turn.events.slice(0, -1);

      // Undoing the final out reopens the turn in a paused state.
      if (turn.status === "done" && lastEvent.kind === "out") {
        return { ...turn, events, status: "paused" };
      }

      return { ...turn, events };
    });
    setNow(Date.now());
  }

  function advanceTurn() {
    if (!currentTurn || currentTurn.status !== "done") {
      return;
    }

    const result = toTurnResult(currentTurn, now);
    const isLastPlayer = currentPlayerIndex === gamePlayers.length - 1;
    const isLastRound = currentRound === settings.rounds;

    setCompletedTurns((currentTurns) => [...currentTurns, result]);

    if (isLastPlayer && isLastRound) {
      setCurrentTurn(null);
      setPage("results");
      return;
    }

    if (isLastPlayer) {
      const nextRound = currentRound + 1;

      setCurrentRound(nextRound);
      setCurrentPlayerIndex(0);
      setCurrentTurn(createTurn(gamePlayers[0].id, nextRound));
      setLeaderboardTab("overall");
      return;
    }

    const nextPlayerIndex = currentPlayerIndex + 1;
    setCurrentPlayerIndex(nextPlayerIndex);
    setCurrentTurn(createTurn(gamePlayers[nextPlayerIndex].id, currentRound));
    setLeaderboardTab("overall");
  }

  function handleTurnAction() {
    if (!currentTurn) {
      return;
    }

    if (currentTurn.status === "idle") {
      startTurn();
      return;
    }

    if (currentTurn.status === "running") {
      pauseTurn();
      return;
    }

    if (currentTurn.status === "paused") {
      resumeTurn();
      return;
    }

    advanceTurn();
  }

  function getTurnActionLabel() {
    if (!currentTurn) {
      return "Start";
    }

    if (currentTurn.status === "idle") {
      return "Start";
    }

    if (currentTurn.status === "running") {
      return "Pause";
    }

    if (currentTurn.status === "paused") {
      return "Resume";
    }

    if (currentPlayerIndex === gamePlayers.length - 1) {
      return currentRound === settings.rounds ? "Results" : "Next Round";
    }

    return "Next Player";
  }

  function renderTurnActionIcon() {
    if (currentTurn?.status === "running") {
      return <Pause size={20} />;
    }

    if (currentTurn?.status === "done") {
      return <ArrowDown size={20} />;
    }

    return <Play size={20} />;
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src="./icon.svg" alt="" className="brand-mark" />
          <strong>Olvídalo</strong>
        </div>
        {page === "home" ? (
          <button className="info-button" type="button" onClick={() => setPage("rules")} aria-label="Rules">
            <Info size={19} />
          </button>
        ) : null}
      </header>

      {page === "home" ? (
        <div className="page-stack">
          <section className="section-panel">
            <div className="section-heading">
              <h1>Players</h1>
              <div className="heading-actions">
                <button className="secondary" type="button" onClick={() => setPlayers(shufflePlayers(players))}>
                  <Shuffle size={18} />
                  Randomize
                </button>
                <button
                  className="secondary danger-button"
                  type="button"
                  onClick={() => setPlayers([])}
                  disabled={players.length === 0}
                >
                  <Trash2 size={18} />
                  Clear
                </button>
              </div>
            </div>

            <form className="add-player" onSubmit={addPlayer}>
              <input
                ref={draftNameInputRef}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Name"
                autoComplete="off"
              />
              <select
                aria-label="Out limit"
                value={draftOutLimit}
                onChange={(event) => setDraftOutLimit(Number(event.target.value))}
              >
                {OUT_LIMIT_OPTIONS.map((outLimit) => (
                  <option key={outLimit} value={outLimit}>
                    {outLimit}
                  </option>
                ))}
              </select>
              <button className="primary icon-only-mobile" type="submit" disabled={!draftName.trim()}>
                <Plus size={18} />
                Add
              </button>
            </form>

            <div className="player-list">
              {players.map((player) => (
                <article
                  className={draggingPlayerId === player.id ? "player-row dragging" : "player-row"}
                  data-player-id={player.id}
                  key={player.id}
                >
                  <button
                    className="drag-handle"
                    type="button"
                    onPointerDown={(event) => beginDrag(event, player.id)}
                    aria-label={`Move ${player.name}`}
                  >
                    <GripVertical size={18} />
                  </button>
                  <input
                    value={player.name}
                    onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
                    autoComplete="off"
                  />
                  <select
                    aria-label={`${player.name || "Player"} outs`}
                    value={player.outLimit}
                    onChange={(event) => updatePlayer(player.id, { outLimit: Number(event.target.value) })}
                  >
                    {OUT_LIMIT_OPTIONS.map((outLimit) => (
                      <option key={outLimit} value={outLimit}>
                        {outLimit}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button danger"
                    type="button"
                    onClick={() => removePlayer(player.id)}
                    aria-label={`Remove ${player.name || "player"}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="section-panel compact-panel">
            <div className="section-heading">
              <h1>Game</h1>
            </div>

            <div className="settings-grid">
              <label className="field">
                <span>Rounds</span>
                <select
                  value={settings.rounds}
                  onChange={(event) => updateSettings({ rounds: Number(event.target.value) })}
                >
                  {ROUND_OPTIONS.map((roundOption) => (
                    <option key={roundOption} value={roundOption}>
                      {roundOption}
                    </option>
                  ))}
                </select>
              </label>

              <div className="field">
                <span>Scoring</span>
                <SegmentedControl
                  options={SCORING_LABELS}
                  value={settings.scoringType}
                  onChange={(scoringType) => updateSettings({ scoringType })}
                />
              </div>

              {settings.rounds > 1 ? (
                <div className="field">
                  <span>Round scoring</span>
                  <SegmentedControl
                    options={ROUND_SCORING_LABELS}
                    value={settings.roundScoring}
                    onChange={(roundScoring) => updateSettings({ roundScoring })}
                  />
                </div>
              ) : null}

              <div className="time-settings">
                <label className="field">
                  <span>Bonus seconds</span>
                  <input
                    inputMode="numeric"
                    type="text"
                    value={bonusSecondsDraft}
                    onBlur={commitBonusSeconds}
                    onChange={(event) => setBonusSecondsDraft(event.target.value)}
                    onKeyDown={(event) => commitSecondsOnEnter(event, commitBonusSeconds)}
                  />
                </label>
                <label className="field">
                  <span>Penalty seconds</span>
                  <input
                    inputMode="numeric"
                    type="text"
                    value={penaltySecondsDraft}
                    onBlur={commitPenaltySeconds}
                    onChange={(event) => setPenaltySecondsDraft(event.target.value)}
                    onKeyDown={(event) => commitSecondsOnEnter(event, commitPenaltySeconds)}
                  />
                </label>
              </div>
            </div>

            <button
              className="primary wide-button"
              type="button"
              onClick={() => {
                commitTimeSettings();
                prepareStartGame(players);
              }}
              disabled={!canStart}
            >
              Start
            </button>
          </section>
        </div>
      ) : null}

      {page === "play" && currentTurn && currentPlayer ? (
        <div className="page-stack">
          <section className="section-panel play-panel">
            <div className="top-actions">
              <button className="secondary" type="button" onClick={exitToHome}>
                <X size={18} />
                Exit
              </button>
              {mapSetup ? (
                <button className="secondary" type="button" onClick={openPlayMap}>
                  <MapIcon size={18} />
                  Map
                </button>
              ) : null}
            </div>

            {locationNotice ? <p className="notice">{locationNotice}</p> : null}

            <div className="status-row">
              <span>
                Round {currentRound}/{settings.rounds}
              </span>
              <span>
                Player {currentPlayerIndex + 1}/{gamePlayers.length}
              </span>
              <span>{SCORING_LABELS[settings.scoringType]}</span>
              {settings.rounds > 1 ? <span>{ROUND_SCORING_LABELS[roundScoring]}</span> : null}
            </div>

            <h1 className="player-title">
              {currentPlayer.name} <span>({currentPlayer.outLimit} outs)</span>
            </h1>

            <div className={currentTurn.status === "done" ? "timer done" : "timer"}>
              {formatTime(currentElapsedMs)}
            </div>

            <div className="hit-buttons">
              <button
                className="hit-button fair-hit"
                type="button"
                onClick={() => recordHit("fair")}
                disabled={currentTurn.status === "done"}
              >
                Hit {currentCounts.fair}
              </button>
              <button
                className="hit-button out-hit"
                type="button"
                onClick={() => recordHit("out")}
                disabled={currentTurn.status === "done"}
              >
                Out {currentCounts.out}/{currentPlayer.outLimit}
              </button>
              <button
                className="hit-button bonus-hit"
                type="button"
                onClick={() => recordAdjustment("bonus")}
              >
                Bonus +{settings.bonusSeconds}s
              </button>
              <button
                className="hit-button penalty-hit"
                type="button"
                onClick={() => recordAdjustment("penalty")}
              >
                Penalty -{settings.penaltySeconds}s
              </button>
            </div>

            <button
              className="secondary wide-button"
              type="button"
              onClick={undoLastEvent}
              disabled={currentTurn.events.length === 0}
            >
              <Undo2 size={18} />
              Undo
            </button>

            <button className="primary wide-button control-button" type="button" onClick={handleTurnAction}>
              {renderTurnActionIcon()}
              {getTurnActionLabel()}
            </button>
          </section>

          <OnDeck players={onDeckPlayers} />

          <section className="section-panel">
            <SegmentedControl
              options={{ overall: "Overall", current: "Current" }}
              value={leaderboardTab}
              onChange={setLeaderboardTab}
            />
            <Leaderboard
              entries={leaderboardTab === "overall" ? overallLeaderboard : currentRoundLeaderboard}
              settings={settings}
            />
          </section>
        </div>
      ) : null}

      {page === "results" ? (
        <div className="page-stack">
          <section className="section-panel">
            <div className="top-actions split">
              <button className="secondary" type="button" onClick={exitToHome}>
                <X size={18} />
                Exit
              </button>
              <button className="primary" type="button" onClick={() => startGame(gamePlayers, mapSetup)}>
                <RotateCcw size={18} />
                Play Again
              </button>
              {mapSetup ? (
                <button className="secondary" type="button" onClick={openResultsMap}>
                  <MapIcon size={18} />
                  Map
                </button>
              ) : null}
            </div>

            <div className="section-heading small">
              <h2>Overall</h2>
            </div>
            <Leaderboard entries={overallLeaderboard} settings={settings} />
          </section>

          {ROUND_OPTIONS.slice(0, settings.rounds).map((round) => (
            <section className="section-panel" key={round}>
              <div className="section-heading small">
                <h2>Round {round}</h2>
              </div>
              <Leaderboard
                entries={buildLeaderboard(
                  completedTurns.filter((result) => result.round === round),
                  gamePlayers,
                  settings,
                )}
                settings={settings}
              />
            </section>
          ))}
        </div>
      ) : null}

      {page === "rules" ? (
        <div className="page-stack">
          <section className="section-panel rules-panel">
            <div className="top-actions">
              <button className="secondary" type="button" onClick={() => setPage("home")}>
                <X size={18} />
                Back
              </button>
            </div>

            <div className="section-heading small">
              <h1>Sacred Rules</h1>
            </div>

            <ol className="rules-list">
              {RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}

      {locationPromptOpen ? (
        <div className="modal-backdrop">
          <section className="choice-modal" role="dialog" aria-modal="true">
            <strong>Choose Map</strong>
            <p>Hit and Out kicks can be saved to a real or drawn course.</p>
            <div className="choice-actions">
              <button className="secondary" type="button" onClick={startWithoutLocation} disabled={locationRequesting}>
                No Map
              </button>
              <button className="primary" type="button" onClick={startWithLocation} disabled={locationRequesting}>
                {locationRequesting ? "Connecting" : "Use Location"}
              </button>
              <button className="secondary" type="button" onClick={startDrawSetup} disabled={locationRequesting}>
                Draw Course
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {realSetupState ? (
        <MapModal
          center={realSetupState.center}
          currentLocation={realSetupState.currentLocation}
          mode="setup"
          onCancel={skipMapSetup}
          onSave={saveMapSetup}
          onSelectSwing={(selectedSwing) => setRealSetupState((state) => (state ? { ...state, selectedSwing } : state))}
          selectedSwing={realSetupState.selectedSwing}
          zoom={realSetupState.zoom}
        />
      ) : null}

      {drawSetupState ? (
        <DrawMapModal
          color={drawSetupState.color}
          mode="setup"
          onCancel={skipMapSetup}
          onClear={() => setDrawSetupState((state) => (state ? { ...state, strokes: [] } : state))}
          onColorChange={(color) => setDrawSetupState((state) => (state ? { ...state, color } : state))}
          onSave={saveDrawSetup}
          onSizeChange={(size) => setDrawSetupState((state) => (state ? { ...state, size } : state))}
          onStrokesChange={(strokes) => setDrawSetupState((state) => (state ? { ...state, strokes } : state))}
          onViewChange={(view) => setDrawSetupState((state) => (state ? { ...state, view } : state))}
          size={drawSetupState.size}
          strokes={drawSetupState.strokes}
          view={drawSetupState.view}
        />
      ) : null}

      {pickerState && mapSetup?.kind === "real" ? (
        <MapModal
          currentLocation={pickerState.currentLocation}
          mode="picker"
          onCancel={() => setPickerState(null)}
          onSave={savePickerLocation}
          onSelect={(point) => setPickerState((state) => (state ? { ...state, selected: { kind: "real", point } } : state))}
          selected={pickerState.selected?.kind === "real" ? pickerState.selected.point : null}
          selectedKind={pickerState.kind}
          setup={mapSetup}
        />
      ) : null}

      {pickerState && mapSetup?.kind === "drawn" ? (
        <DrawMapModal
          mode="picker"
          onCancel={() => setPickerState(null)}
          onSave={savePickerLocation}
          onSelect={(point) => setPickerState((state) => (state ? { ...state, selected: { kind: "drawn", point } } : state))}
          selected={pickerState.selected?.kind === "drawn" ? pickerState.selected.point : null}
          selectedKind={pickerState.kind}
          setup={mapSetup}
        />
      ) : null}

      {viewerState && mapSetup?.kind === "real" ? (
        <MapModal
          currentLocation={viewerState.currentLocation}
          markers={visibleRealKickMarkers}
          mode="viewer"
          onClose={() => setViewerState(null)}
          onPlayerChange={(playerId) => setViewerState((state) => (state ? { ...state, playerId } : state))}
          onRoundChange={(round) => setViewerState((state) => (state ? { ...state, round } : state))}
          players={gamePlayers}
          rounds={settings.rounds}
          selectedPlayerId={viewerState.playerId}
          selectedRound={viewerState.round}
          setup={mapSetup}
        />
      ) : null}

      {viewerState && mapSetup?.kind === "drawn" ? (
        <DrawMapModal
          markers={visibleDrawKickMarkers}
          mode="viewer"
          onClose={() => setViewerState(null)}
          onPlayerChange={(playerId) => setViewerState((state) => (state ? { ...state, playerId } : state))}
          onRoundChange={(round) => setViewerState((state) => (state ? { ...state, round } : state))}
          players={gamePlayers}
          rounds={settings.rounds}
          selectedPlayerId={viewerState.playerId}
          selectedRound={viewerState.round}
          setup={mapSetup}
        />
      ) : null}
    </main>
  );
}

function getOnDeckPlayers(players: Player[], round: number, playerIndex: number, rounds: number) {
  if (players.length === 0) {
    return [];
  }

  const currentTurnNumber = (round - 1) * players.length + playerIndex;
  const totalTurns = rounds * players.length;

  return [1, 2, 3]
    .map((offset) => currentTurnNumber + offset)
    .filter((turnNumber) => turnNumber < totalTurns)
    .map((turnNumber) => players[turnNumber % players.length]);
}

function SegmentedControl<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: Record<T, string>;
  value: T;
}) {
  return (
    <div className="segmented-control">
      {Object.entries(options).map(([optionValue, label]) => (
        <button
          className={value === optionValue ? "selected" : ""}
          key={optionValue}
          onClick={() => onChange(optionValue as T)}
          type="button"
        >
          {label as string}
        </button>
      ))}
    </div>
  );
}

function Leaderboard({ entries, settings }: { entries: LeaderboardEntry[]; settings: GameSettings }) {
  if (entries.length === 0) {
    return <p className="empty-state">No scores yet.</p>;
  }

  return (
    <ol className="leaderboard-list">
      {entries.map((entry, index) => (
        <li className={index === 0 ? "leader-row leader" : "leader-row"} key={entry.player.id}>
          <span className="rank">{index + 1}</span>
          <div>
            <strong>{entry.player.name}</strong>
            <span>{getSubScoreLabel(entry, settings)}</span>
          </div>
          <strong className="leader-score">{getMainScoreLabel(entry, settings)}</strong>
        </li>
      ))}
    </ol>
  );
}

function OnDeck({ players }: { players: Player[] }) {
  return (
    <section className="section-panel">
      <div className="deck-list">
        {players.length === 0 ? <p className="empty-state">No one on deck.</p> : null}

        {players.map((player, index) => (
          <article className="deck-row" key={`${player.id}-${index}`}>
            <span>{index + 1}</span>
            <strong>{player.name}</strong>
            <em>{player.outLimit} outs</em>
          </article>
        ))}
      </div>
    </section>
  );
}

export default App;
