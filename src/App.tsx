import {
  Clock3,
  Plus,
  RotateCcw,
  Shuffle,
  TimerReset,
  Trash2,
  Trophy,
  Undo2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Player = {
  id: string;
  name: string;
  outLimit: number;
};

type HitKind = "fair" | "out";

type Hit = {
  kind: HitKind;
  elapsedMs: number;
};

type TurnState = {
  player: Player;
  startedAt: number | null;
  endedAt: number | null;
  hits: Hit[];
};

type TurnResult = {
  player: Player;
  elapsedMs: number;
  fairHits: number;
  outHits: number;
};

type Phase = "setup" | "playing" | "complete";

const PLAYERS_KEY = "olvidalo.players.v1";
const DEFAULT_OUT_LIMIT = 2;
const OUT_LIMIT_OPTIONS = [1, 2, 3, 4, 5] as const;
const MAX_OUT_LIMIT = 5;

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampOutLimit(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_OUT_LIMIT;
  }

  return Math.min(MAX_OUT_LIMIT, Math.max(1, Math.round(value)));
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
        outLimit: clampOutLimit(Number(player.outLimit)),
      }))
      .filter((player) => player.name.trim().length > 0);
  } catch {
    return [];
  }
}

function shufflePlayers(players: Player[]) {
  const shuffled = [...players];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
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

function getElapsedMs(turn: TurnState, now: number) {
  if (!turn.startedAt) {
    return 0;
  }

  return Math.max(0, (turn.endedAt ?? now) - turn.startedAt);
}

function toTurnResult(turn: TurnState, now: number): TurnResult {
  const counts = countHits(turn.hits);

  return {
    player: turn.player,
    elapsedMs: getElapsedMs(turn, now),
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

function App() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [players, setPlayers] = useState<Player[]>(readStoredPlayers);
  const [draftName, setDraftName] = useState("");
  const [draftOutLimit, setDraftOutLimit] = useState(DEFAULT_OUT_LIMIT);
  const [turnOrder, setTurnOrder] = useState<Player[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTurn, setCurrentTurn] = useState<TurnState | null>(null);
  const [completedTurns, setCompletedTurns] = useState<TurnResult[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    if (!currentTurn?.startedAt || currentTurn.endedAt) {
      return undefined;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(interval);
  }, [currentTurn?.startedAt, currentTurn?.endedAt]);

  const currentCounts = useMemo(() => countHits(currentTurn?.hits ?? []), [currentTurn?.hits]);
  const currentElapsedMs = currentTurn ? getElapsedMs(currentTurn, now) : 0;
  const currentResult = currentTurn?.endedAt ? toTurnResult(currentTurn, now) : null;
  const leaderboard = useMemo(
    () =>
      [...completedTurns, ...(currentResult ? [currentResult] : [])].sort(
        (left, right) => right.elapsedMs - left.elapsedMs,
      ),
    [completedTurns, currentResult],
  );
  const onDeckPlayers = turnOrder.slice(currentIndex + 1, currentIndex + 4);
  const canStartGame = players.length > 0 && players.every((player) => player.name.trim());
  const isLastTurn = currentIndex === turnOrder.length - 1;

  function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = draftName.trim();
    if (!name) {
      return;
    }

    setPlayers((currentPlayers) => [
      ...currentPlayers,
      { id: createId(), name, outLimit: clampOutLimit(draftOutLimit) },
    ]);
    setDraftName("");
    setDraftOutLimit(DEFAULT_OUT_LIMIT);
  }

  function updatePlayer(playerId: string, updates: Partial<Player>) {
    setPlayers((currentPlayers) =>
      currentPlayers.map((player) =>
        player.id === playerId
          ? {
              ...player,
              ...updates,
              outLimit:
                updates.outLimit === undefined
                  ? player.outLimit
                  : clampOutLimit(Number(updates.outLimit)),
            }
          : player,
      ),
    );
  }

  function removePlayer(playerId: string) {
    setPlayers((currentPlayers) => currentPlayers.filter((player) => player.id !== playerId));
  }

  function startGame() {
    const readyPlayers = players.map((player) => ({
      ...player,
      name: player.name.trim(),
      outLimit: clampOutLimit(player.outLimit),
    }));
    const shuffled = shufflePlayers(readyPlayers);

    setPlayers(readyPlayers);
    setTurnOrder(shuffled);
    setCompletedTurns([]);
    setCurrentIndex(0);
    setCurrentTurn({ player: shuffled[0], startedAt: null, endedAt: null, hits: [] });
    setPhase("playing");
    setNow(Date.now());
  }

  function resetToSetup() {
    setPhase("setup");
    setTurnOrder([]);
    setCompletedTurns([]);
    setCurrentIndex(0);
    setCurrentTurn(null);
  }

  function startTurnTimer() {
    setCurrentTurn((turn) =>
      turn && !turn.startedAt ? { ...turn, startedAt: Date.now(), endedAt: null } : turn,
    );
    setNow(Date.now());
  }

  function recordHit(kind: HitKind) {
    const timestamp = Date.now();

    setCurrentTurn((turn) => {
      if (!turn?.startedAt || turn.endedAt) {
        return turn;
      }

      const hit: Hit = { kind, elapsedMs: timestamp - turn.startedAt };
      const hits = [...turn.hits, hit];
      const outs = hits.filter((entry) => entry.kind === "out").length;

      return {
        ...turn,
        hits,
        endedAt: outs >= turn.player.outLimit ? timestamp : null,
      };
    });
    setNow(timestamp);
  }

  function undoLastHit() {
    setCurrentTurn((turn) => {
      if (!turn?.startedAt || turn.hits.length === 0) {
        return turn;
      }

      return {
        ...turn,
        hits: turn.hits.slice(0, -1),
        endedAt: null,
      };
    });
    setNow(Date.now());
  }

  function advanceTurn() {
    if (!currentTurn?.endedAt) {
      return;
    }

    const result = toTurnResult(currentTurn, now);
    const nextCompletedTurns = [...completedTurns, result];

    setCompletedTurns(nextCompletedTurns);

    if (isLastTurn) {
      setCurrentTurn(null);
      setPhase("complete");
      return;
    }

    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    setCurrentTurn({ player: turnOrder[nextIndex], startedAt: null, endedAt: null, hits: [] });
    setNow(Date.now());
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src="./icon.svg" alt="" className="brand-mark" />
          <div>
            <p>Olvídalo</p>
            <span>{phase === "setup" ? "Roster" : phase === "playing" ? "Live Game" : "Results"}</span>
          </div>
        </div>

        {phase !== "setup" ? (
          <button className="icon-button" type="button" onClick={resetToSetup} aria-label="Reset game">
            <RotateCcw size={20} />
          </button>
        ) : null}
      </header>

      {phase === "setup" ? (
        <section className="setup-layout">
          <section className="panel roster-panel">
            <div className="section-heading">
              <h1>Players</h1>
              <span>{players.length}</span>
            </div>

            <form className="add-player" onSubmit={addPlayer}>
              <label className="field name-field">
                <span>Name</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="Player name"
                  autoComplete="off"
                />
              </label>

              <label className="field limit-field">
                <span>Outs</span>
                <select
                  value={draftOutLimit}
                  onChange={(event) => setDraftOutLimit(clampOutLimit(Number(event.target.value)))}
                >
                  {OUT_LIMIT_OPTIONS.map((outLimit) => (
                    <option key={outLimit} value={outLimit}>
                      {outLimit}
                    </option>
                  ))}
                </select>
              </label>

              <button className="secondary add-button" type="submit" disabled={!draftName.trim()}>
                <Plus size={18} />
                Add
              </button>
            </form>

            <div className="player-list">
              {players.length === 0 ? <p className="empty-state">No players yet.</p> : null}

              {players.map((player, index) => (
                <article className="player-row" key={player.id}>
                  <span className="player-number">{index + 1}</span>

                  <label className="field inline-field">
                    <span>Name</span>
                    <input
                      value={player.name}
                      onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
                      autoComplete="off"
                    />
                  </label>

                  <label className="field inline-limit">
                    <span>Outs</span>
                    <select
                      value={player.outLimit}
                      onChange={(event) =>
                        updatePlayer(player.id, { outLimit: clampOutLimit(Number(event.target.value)) })
                      }
                    >
                      {OUT_LIMIT_OPTIONS.map((outLimit) => (
                        <option key={outLimit} value={outLimit}>
                          {outLimit}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    className="icon-button danger"
                    type="button"
                    onClick={() => removePlayer(player.id)}
                    aria-label={`Remove ${player.name || "player"}`}
                  >
                    <Trash2 size={18} />
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="panel start-panel">
            <div>
              <h2>Game</h2>
              <div className="stat-grid">
                <div>
                  <span>Round</span>
                  <strong>1</strong>
                </div>
                <div>
                  <span>Scoring</span>
                  <strong>Longest</strong>
                </div>
              </div>
            </div>

            <button className="primary wide-button" type="button" onClick={startGame} disabled={!canStartGame}>
              <Shuffle size={20} />
              Randomize Order
            </button>
          </section>
        </section>
      ) : null}

      {phase === "playing" && currentTurn ? (
        <section className="game-layout">
          <section className="panel turn-panel">
            <div className="turn-meta">
              <span>
                Turn {currentIndex + 1} / {turnOrder.length}
              </span>
              <span>{currentTurn.player.outLimit} outs</span>
            </div>

            <div className="current-player">
              <h1>{currentTurn.player.name}</h1>
              {currentTurn.endedAt ? <span className="done-pill">Done</span> : null}
            </div>

            <div className={currentTurn.endedAt ? "timer ended" : "timer"}>
              <Clock3 size={28} />
              <span>{formatTime(currentElapsedMs)}</span>
            </div>

            <div className="hit-totals">
              <div>
                <span>Fair</span>
                <strong>{currentCounts.fair}</strong>
              </div>
              <div>
                <span>Out</span>
                <strong>
                  {currentCounts.out} / {currentTurn.player.outLimit}
                </strong>
              </div>
            </div>

            {!currentTurn.startedAt ? (
              <button className="primary wide-button" type="button" onClick={startTurnTimer}>
                <TimerReset size={22} />
                Start Timer
              </button>
            ) : (
              <div className="hit-buttons">
                <button
                  className="hit-button fair-hit"
                  type="button"
                  onClick={() => recordHit("fair")}
                  disabled={Boolean(currentTurn.endedAt)}
                >
                  FAIR
                </button>
                <button
                  className="hit-button out-hit"
                  type="button"
                  onClick={() => recordHit("out")}
                  disabled={Boolean(currentTurn.endedAt)}
                >
                  OUT
                </button>
              </div>
            )}

            <div className="turn-actions">
              <button
                className="secondary"
                type="button"
                onClick={undoLastHit}
                disabled={!currentTurn.startedAt || currentTurn.hits.length === 0}
              >
                <Undo2 size={18} />
                Undo
              </button>

              {currentTurn.endedAt ? (
                <button className="primary" type="button" onClick={advanceTurn}>
                  {isLastTurn ? "Show Results" : "Next Player"}
                </button>
              ) : null}
            </div>
          </section>

          <aside className="side-stack">
            <Leaderboard results={leaderboard} />
            <OnDeck players={onDeckPlayers} />
          </aside>
        </section>
      ) : null}

      {phase === "complete" ? (
        <section className="results-layout">
          <section className="panel results-panel">
            <div className="results-title">
              <Trophy size={34} />
              <h1>Final Leaderboard</h1>
            </div>

            <Leaderboard results={leaderboard} />

            <div className="results-actions">
              <button className="primary" type="button" onClick={startGame}>
                <Shuffle size={18} />
                Randomize Again
              </button>
              <button className="secondary" type="button" onClick={resetToSetup}>
                Edit Players
              </button>
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}

function Leaderboard({ results }: { results: TurnResult[] }) {
  return (
    <section className="panel leaderboard-panel">
      <div className="section-heading small">
        <h2>Leaderboard</h2>
        <span>{results.length}</span>
      </div>

      {results.length === 0 ? <p className="empty-state">No scores yet.</p> : null}

      <ol className="leaderboard-list">
        {results.map((result, index) => (
          <li key={`${result.player.id}-${result.elapsedMs}`} className={index === 0 ? "leader leader-row" : "leader-row"}>
            <span className="rank">{index + 1}</span>
            <div>
              <strong>{result.player.name}</strong>
              <span>
                {result.fairHits} fair · {result.outHits} out
              </span>
            </div>
            <time>{formatTime(result.elapsedMs)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}

function OnDeck({ players }: { players: Player[] }) {
  return (
    <section className="panel deck-panel">
      <div className="section-heading small">
        <h2>On Deck</h2>
        <span>{players.length}</span>
      </div>

      {players.length === 0 ? <p className="empty-state">No one on deck.</p> : null}

      <div className="deck-list">
        {players.map((player, index) => (
          <article className="deck-row" key={player.id}>
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
