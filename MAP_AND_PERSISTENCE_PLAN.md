# Map And Persistence Implementation Plan

## Summary

Add session persistence and location-aware kick mapping without changing the core Olvidalo game flow. The app should restore an active game after refresh or app close, reopen any running timer as paused, and delete the saved game only when the user explicitly exits. Location mode should be optional per game. If enabled, each Fair or Out kick opens an empty map picker, and saved kick locations can later be viewed in one reusable map viewer from Play or Results.

The implementation should keep the code simple and intentional. It should replace narrow old assumptions, not pile special cases on top of them. The main goal is a small, clear state model where timer state, kick events, saved locations, map filters, and persistence all have one obvious place to live.

## Desired User Flow

1. The user presses Start on the Home page.
2. The app asks whether to use location for this game.
3. If the user declines, the game starts normally with no map picker.
4. If the user accepts, the browser requests location permission.
5. If permission is granted, location mode is enabled for that game.
6. If permission is denied or unavailable, location mode is disabled for that game.
7. During Play, every Fair or Out press records the kick immediately.
8. If location mode is enabled, an empty map picker opens after that Fair or Out.
9. The timer keeps running while the picker is open.
10. The user can dismiss the picker or select a point and save it.
11. The Play page has a small map button that opens the kick map viewer.
12. The Results page has the same map viewer button.
13. Refreshing or closing the app restores the active game.
14. A running timer always restores as paused.
15. Exiting Play or Results clears the saved active game.

## Dependencies

- Add `leaflet` for the map.
- Add `@types/leaflet` for TypeScript.
- Import Leaflet CSS once in `src/main.tsx` or from the map component.
- Do not use Google Maps, API keys, billing, or external app secrets.
- Use OpenStreetMap tiles with proper attribution.

This will require an npm install during implementation. If the sandbox blocks the install, request approval for the install command.

## State Model

Keep the existing game model, but make kick events and active game persistence explicit.

### Types To Add Or Update

```ts
type LocationPoint = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

type KickEvent = {
  id: string;
  kind: HitKind;
  elapsedMs: number;
  location: LocationPoint | null;
};

type AdjustmentEvent = {
  id: string;
  kind: AdjustmentKind;
  elapsedMs: number;
  deltaMs: number;
};

type TurnEvent = KickEvent | AdjustmentEvent;

type LocationMode = "off" | "on";

type ActiveGame = {
  page: Exclude<Page, "home" | "rules">;
  players: Player[];
  settings: GameSettings;
  currentPlayerIndex: number;
  currentRound: number;
  currentTurn: TurnState | null;
  results: TurnResult[];
  locationMode: LocationMode;
  lastMapCenter: LocationPoint | null;
};
```

### Existing Types To Keep

- `Player`
- `Page`
- `HitKind`
- `AdjustmentKind`
- `ScoringType`
- `RoundScoring`
- `TimerStatus`
- `GameSettings`
- `TurnState`
- `TurnResult`
- leaderboard helper types

### Existing Types To Remove Or Simplify

- Remove any assumptions that Turn events do not have IDs.
- Remove any location state that is tied to one UI surface instead of the event model.
- Do not add separate stored leaderboard state.
- Do not add a history/archive model.

## Persistence

Add one new localStorage key:

```ts
const ACTIVE_GAME_KEY = "olvidalo.activeGame.v1";
```

Persist the active game whenever these values change:

- `page` when it is `play` or `results`
- `gamePlayers`
- `settings`
- `currentPlayerIndex`
- `currentRound`
- `currentTurn`
- `results`
- `locationMode`
- `lastMapCenter`

Do not persist:

- Home draft player name
- Home draft out limit
- leaderboard tab
- open modal state
- selected map filters
- selected picker point before save
- animation frame timing

### Restore Rules

On app load:

1. Read players and settings as usual.
2. Read `ACTIVE_GAME_KEY`.
3. Validate the active game shape defensively.
4. If invalid, ignore it and start on Home.
5. If valid, restore page, players, settings, turn, results, and location mode.
6. If the saved current turn is `running`, convert it to `paused`.
7. Set `startedAt` to `null` on restored paused or done turns.

### Clear Rules

Clear `ACTIVE_GAME_KEY` only when:

- The user exits from Play.
- The user exits from Results.
- The user starts a brand new game from Home.

Play Again should start a fresh active game with the same players, same order, and same settings, then replace the saved active game.

## Location Permission Flow

Add a simple start-game branch:

1. Home Start validates there are players.
2. Show a compact location prompt modal.
3. If the user chooses No, start with `locationMode: "off"`.
4. If the user chooses Yes, call `navigator.geolocation.getCurrentPosition`.
5. If permission succeeds, start with `locationMode: "on"` and store that location as `lastMapCenter`.
6. If permission fails, start with `locationMode: "off"` and show a small non-blocking message.

Do not keep asking during the same game after permission fails.

## Kick Location Picker

Create one focused picker modal for saving the location of the kick that was just recorded.

### Picker State

```ts
type PickerState = {
  eventId: string;
  center: LocationPoint;
  selected: LocationPoint | null;
};
```

### Picker Behavior

- Opens only after Fair or Out.
- Opens only if location mode is on.
- Shows an empty map.
- Does not show previous kicks.
- Centers on current phone location every time.
- Timer keeps running while open.
- Dismiss saves no location.
- Submit saves the selected location onto that event.
- Submit also updates `lastMapCenter`.
- Undoing the event removes its saved location because the whole event is removed.
- If Undo removes the event currently being picked, close the picker.

### Current Location Lookup

When opening the picker:

1. Record the Fair or Out immediately.
2. Request current location.
3. If it succeeds, open picker centered there.
4. If it fails, disable location mode and do not open picker.

This keeps the game usable even when location stops working mid-game.

## Kick Map Viewer

Create one reusable viewer modal that can be opened from Play or Results.

### Viewer State

```ts
type ViewerState = {
  source: "play" | "results";
  playerId: string | "all";
  round: number | "all";
};
```

### Viewer Defaults

When opened from Play:

- `playerId` defaults to the current player.
- `round` defaults to `all`.

When opened from Results:

- `playerId` defaults to `all`.
- `round` defaults to `all`.

### Viewer Filters

Use two simple dropdowns:

- Player: `All` plus every player.
- Round: `All` plus every round in the game.

### Viewer Data

The viewer should build map markers from saved locations on Fair and Out events.

Data sources:

- Completed turns from `results`.
- The current in-progress turn, if present.

This requires `TurnResult` to include the original kick events or a derived location summary. Prefer storing enough event detail in `TurnResult` so completed turn locations do not need a parallel data structure.

Recommended update:

```ts
type TurnResult = {
  playerId: string;
  round: number;
  elapsedMs: number;
  fairHits: number;
  outHits: number;
  events: TurnEvent[];
};
```

Leaderboard helpers should continue to use `elapsedMs`, `fairHits`, and `outHits`. Map helpers should use `events`.

## Map Component Structure

Keep map code isolated so `App.tsx` does not become crowded.

Recommended files:

- `src/map.ts`
- `src/MapModal.tsx`
- `src/map.css` only if the map styles become too bulky for `styles.css`

### `src/map.ts`

Small helpers only:

- Load/normalize map marker data.
- Create marker labels.
- Fit bounds safely.
- Define Leaflet marker icons.

### `src/MapModal.tsx`

One component with two modes:

```ts
type MapModalProps =
  | {
      mode: "picker";
      center: LocationPoint;
      selected: LocationPoint | null;
      onSelect: (point: LocationPoint) => void;
      onCancel: () => void;
      onSave: () => void;
    }
  | {
      mode: "viewer";
      markers: KickMarker[];
      players: Player[];
      rounds: number;
      selectedPlayerId: string | "all";
      selectedRound: number | "all";
      onPlayerChange: (playerId: string | "all") => void;
      onRoundChange: (round: number | "all") => void;
      onClose: () => void;
    };
```

Use Leaflet imperatively inside the component with `useEffect` and refs. Keep React state as the source of truth. Destroy the Leaflet map on unmount.

## Styling

Keep the current visual identity:

- Deep green app shell.
- Off-white surfaces.
- Gold ball accent.
- Fair green.
- Out clay/red.
- Compact controls.
- 8px radius convention.

Add only what the map feature needs:

- A small map icon button on Play.
- A small map icon button on Results.
- A clean modal shell for map picker/viewer.
- Compact dropdown row in the viewer.
- Marker colors that match the app:
  - Fair: gold or fair green.
  - Out: clay/red.

Avoid:

- New page-level decoration.
- Duplicate labels.
- Long explanatory copy.
- Busy map chrome.
- Separate map pages unless the modal becomes unusable on mobile.

## App Logic Changes

### Start Game

Replace direct start behavior with:

1. Validate players.
2. Clear any old active game.
3. Ask about location mode.
4. Start the game with the current visible order.
5. Persist the new active game.

### Fair And Out

Update the existing kick handler:

1. Calculate adjusted elapsed time.
2. Create a `KickEvent` with a stable ID and `location: null`.
3. Add it to `currentTurn.events`.
4. Apply existing final-out behavior.
5. If location mode is on, request current location and open the empty picker.

### Bonus And Penalty

Keep existing behavior, but add stable event IDs.

### Undo

Update undo to remove the most recent event by array order.

Add two small rules:

- If the removed event is the open picker event, close the picker.
- If the removed event is the final out, restore the turn to paused, preserving current elapsed base time.

### Complete Turn

When building a `TurnResult`, copy `events` into the result.

This keeps completed kick locations available for Results without a second data store.

### Results

Results should behave the same, with one added map button.

## Code Cleanup Rules

While implementing, actively delete or simplify:

- Any duplicate active-game state.
- Any helper that exists only to compensate for missing event IDs.
- Any separate map location store that mirrors `TurnEvent`.
- Any branch that tries to persist modal UI state.
- Any old no-location assumptions in `TurnResult`.

Keep:

- One source of truth for scoring: `TurnResult[]`.
- One source of truth for kick locations: `TurnEvent.location`.
- One source of truth for the current timer: `TurnState`.
- One reusable map modal.

## Commenting Style

Match the current app style:

- Types at the top.
- Constants after types.
- Small named helper functions before `App`.
- Two-space indentation.
- Direct JSX spacing.
- Short comments before non-obvious branches.

Add comments specifically around:

- Restoring a running timer as paused.
- Persisting only active game state, not modal state.
- Opening the picker after recording the kick.
- Keeping the timer running while the picker is open.
- Closing the picker when Undo removes the pending event.
- Building viewer markers from both results and the current turn.

Do not add comments that restate obvious JSX or CSS declarations.

## Service Worker

Bump the service worker cache to:

```ts
olvidalo-v8
```

This ensures the new JS/CSS and Leaflet assets are refreshed for installed PWA users.

## Test Plan

Run:

```bash
npm run build
git diff --check
```

Manual checks:

1. Start a game and decline location.
2. Confirm Fair/Out do not open maps when location is off.
3. Start a game and accept location.
4. Confirm permission success enables location mode.
5. Confirm permission denial disables location mode.
6. Press Fair and confirm the timer keeps running while the picker is open.
7. Dismiss picker and confirm no location is saved.
8. Press Out, select a map point, and save it.
9. Undo that Out and confirm the marker disappears.
10. Record a final Out, save or dismiss location, and confirm the turn ends normally.
11. Undo final Out and confirm the turn returns to paused.
12. Open viewer from Play and confirm defaults are current player plus all rounds.
13. Change Player dropdown to All and confirm visible markers update.
14. Change Round dropdown and confirm visible markers update.
15. Complete a game and open viewer from Results.
16. Confirm Results viewer defaults are all players plus all rounds.
17. Refresh during a game with the timer running.
18. Confirm the game restores and the timer is paused.
19. Refresh on Results.
20. Confirm Results restores with all scores and saved locations.
21. Exit from Play and confirm the active game is cleared.
22. Exit from Results and confirm the active game is cleared.
23. Play Again and confirm scores and locations reset without reshuffling.
24. Confirm Longest and Hits leaderboards still match existing scoring rules.
25. Confirm bonus and penalty events do not create map markers.

## Implementation Order

1. Install Leaflet dependencies.
2. Add event IDs and `events` to `TurnResult`.
3. Add active game persistence helpers.
4. Restore active game on app load.
5. Update Exit and Play Again to clear or replace saved state.
6. Add location prompt to Start.
7. Add kick picker modal.
8. Add viewer modal and filters.
9. Add compact map buttons to Play and Results.
10. Add CSS for map modals and marker controls.
11. Bump service worker cache.
12. Run build and diff checks.

## Suggested Commit Message

```text
Add persisted games and kick maps
```
