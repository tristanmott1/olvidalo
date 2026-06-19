import {
  ArrowDown,
  ArrowUp,
  GripVertical,
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
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type Player = {
  id: string;
  name: string;
  outLimit: number;
};

type Page = "home" | "play" | "results";
type HitKind = "fair" | "out";
type ScoringType = "longest" | "hits";
type RoundScoring = "cumulative" | "best";
type TimerStatus = "idle" | "running" | "paused" | "done";
type LeaderboardTab = "overall" | "current";

type GameSettings = {
  rounds: number;
  scoringType: ScoringType;
  roundScoring: RoundScoring;
};

type Hit = {
  kind: HitKind;
  elapsedMs: number;
};

type TurnState = {
  playerId: string;
  round: number;
  status: TimerStatus;
  startedAt: number | null;
  elapsedMs: number;
  hits: Hit[];
};

type TurnResult = {
  playerId: string;
  round: number;
  elapsedMs: number;
  fairHits: number;
  outHits: number;
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
const DEFAULT_OUT_LIMIT = 2;
const OUT_LIMIT_OPTIONS = [1, 2, 3, 4, 5] as const;
const ROUND_OPTIONS = [1, 2, 3, 4, 5] as const;
const DEFAULT_SETTINGS: GameSettings = {
  rounds: 1,
  scoringType: "longest",
  roundScoring: "cumulative",
};
const SCORING_LABELS: Record<ScoringType, string> = {
  longest: "Longest",
  hits: "Hits",
};
const ROUND_SCORING_LABELS: Record<RoundScoring, string> = {
  cumulative: "Cumulative",
  best: "Best",
};

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampChoice(value: number, allowed: readonly number[], fallback: number) {
  return allowed.includes(value) ? value : fallback;
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
    const roundScoring = parsed.roundScoring === "best" ? "best" : "cumulative";

    return {
      rounds: clampChoice(Number(parsed.rounds), ROUND_OPTIONS, DEFAULT_SETTINGS.rounds),
      scoringType,
      roundScoring,
    };
  } catch {
    return DEFAULT_SETTINGS;
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

function countHits(hits: Hit[]) {
  return hits.reduce(
    (counts, hit) => ({
      fair: counts.fair + (hit.kind === "fair" ? 1 : 0),
      out: counts.out + (hit.kind === "out" ? 1 : 0),
    }),
    { fair: 0, out: 0 },
  );
}

function getTurnElapsedMs(turn: TurnState, now: number) {
  if (turn.status !== "running" || !turn.startedAt) {
    return turn.elapsedMs;
  }

  return turn.elapsedMs + Math.max(0, now - turn.startedAt);
}

function createTurn(playerId: string, round: number): TurnState {
  return {
    playerId,
    round,
    status: "idle",
    startedAt: null,
    elapsedMs: 0,
    hits: [],
  };
}

function toTurnResult(turn: TurnState, now: number): TurnResult {
  const counts = countHits(turn.hits);

  return {
    playerId: turn.playerId,
    round: turn.round,
    elapsedMs: getTurnElapsedMs(turn, now),
    fairHits: counts.fair,
    outHits: counts.out,
  };
}

function formatTime(ms: number) {
  const totalTenths = Math.floor(ms / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
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

      return {
        player,
        score: primaryScore,
        elapsedMs: scoreResults(playerResults, {
          roundScoring: scoreKeys[0].roundScoring,
          scoringType: "longest",
        }),
        fairHits: scoreResults(playerResults, {
          roundScoring: scoreKeys[0].roundScoring,
          scoringType: "hits",
        }),
        outHits: playerResults.reduce((total, result) => total + result.outHits, 0),
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

function App() {
  const [page, setPage] = useState<Page>("home");
  const [players, setPlayers] = useState<Player[]>(readStoredPlayers);
  const [settings, setSettings] = useState<GameSettings>(readStoredSettings);
  const [draftName, setDraftName] = useState("");
  const [draftOutLimit, setDraftOutLimit] = useState(DEFAULT_OUT_LIMIT);
  const [gamePlayers, setGamePlayers] = useState<Player[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [currentTurn, setCurrentTurn] = useState<TurnState | null>(null);
  const [completedTurns, setCompletedTurns] = useState<TurnResult[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>("overall");
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

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
  const currentCounts = countHits(currentTurn?.hits ?? []);
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
  const onDeckPlayers = getOnDeckPlayers(gamePlayers, currentRound, currentPlayerIndex, settings.rounds);
  const canStart = players.length > 0 && players.every((player) => player.name.trim().length > 0);
  const roundScoring = effectiveRoundScoring(settings);

  function updateSettings(updates: Partial<GameSettings>) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      ...updates,
    }));
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

  function movePlayer(playerId: string, direction: -1 | 1) {
    setPlayers((currentPlayers) => {
      const fromIndex = currentPlayers.findIndex((player) => player.id === playerId);
      const toIndex = fromIndex + direction;

      if (fromIndex < 0 || toIndex < 0 || toIndex >= currentPlayers.length) {
        return currentPlayers;
      }

      return moveItem(currentPlayers, fromIndex, toIndex);
    });
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, playerId: string) {
    event.preventDefault();
    setDraggingPlayerId(playerId);
  }

  function startGame(order: Player[]) {
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
    setPage("play");
    setNow(Date.now());
  }

  function exitToHome() {
    setPage("home");
    setGamePlayers([]);
    setCompletedTurns([]);
    setCurrentRound(1);
    setCurrentPlayerIndex(0);
    setCurrentTurn(null);
    setLeaderboardTab("overall");
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
            elapsedMs: getTurnElapsedMs(turn, timestamp),
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

  function recordHit(kind: HitKind) {
    const timestamp = Date.now();

    setCurrentTurn((turn) => {
      if (!turn || turn.status !== "running" || !currentPlayer) {
        return turn;
      }

      const elapsedMs = getTurnElapsedMs(turn, timestamp);
      const hits = [...turn.hits, { kind, elapsedMs }];
      const outs = countHits(hits).out;

      if (outs >= currentPlayer.outLimit) {
        return { ...turn, elapsedMs, hits, startedAt: null, status: "done" };
      }

      return { ...turn, hits };
    });
    setNow(timestamp);
  }

  function undoLastHit() {
    setCurrentTurn((turn) => {
      if (!turn || turn.hits.length === 0) {
        return turn;
      }

      const hits = turn.hits.slice(0, -1);

      // Undoing the final out reopens the turn in a paused state.
      if (turn.status === "done") {
        return { ...turn, hits, status: "paused" };
      }

      return { ...turn, hits };
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
      </header>

      {page === "home" ? (
        <div className="page-stack">
          <section className="section-panel">
            <div className="section-heading">
              <h1>Players</h1>
              <button className="secondary" type="button" onClick={() => setPlayers(shufflePlayers(players))}>
                <Shuffle size={18} />
                Randomize
              </button>
            </div>

            <form className="add-player" onSubmit={addPlayer}>
              <input
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
              {players.map((player, index) => (
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
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => movePlayer(player.id, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${player.name} up`}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => movePlayer(player.id, 1)}
                      disabled={index === players.length - 1}
                      aria-label={`Move ${player.name} down`}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      onClick={() => removePlayer(player.id)}
                      aria-label={`Remove ${player.name || "player"}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
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
            </div>

            <button className="primary wide-button" type="button" onClick={() => startGame(players)} disabled={!canStart}>
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
            </div>

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
                disabled={currentTurn.status !== "running"}
              >
                Fair {currentCounts.fair}
              </button>
              <button
                className="hit-button out-hit"
                type="button"
                onClick={() => recordHit("out")}
                disabled={currentTurn.status !== "running"}
              >
                Out {currentCounts.out}/{currentPlayer.outLimit}
              </button>
            </div>

            <button
              className="secondary wide-button"
              type="button"
              onClick={undoLastHit}
              disabled={currentTurn.hits.length === 0}
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
              <button className="primary" type="button" onClick={() => startGame(gamePlayers)}>
                <RotateCcw size={18} />
                Play Again
              </button>
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
