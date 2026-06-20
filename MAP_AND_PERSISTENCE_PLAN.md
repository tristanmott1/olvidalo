# Map And Persistence Implementation Plan

## Summary

Keep the existing Olvidalo game flow, active-game persistence, and kick mapping, then refine the map experience around a fixed swing reference. When location is enabled at game start, the user should set up the game map by choosing the swing location and orienting the map with normal Leaflet pan/zoom. Later kick pickers and kick viewers should reuse that saved center/zoom, show the swing for reference, and show the user's current location as a blue dot.

The implementation should stay simple. Do not create separate map systems for setup, picking, and viewing. Use one small map modal with clear modes and one map settings object stored in the active game. Remove or replace any older "last map center only" assumptions that no longer fit. The final code should look like the intended design from the start, not a stack of patches.

## Desired User Flow

1. The user presses Start on the Home page.
2. The app asks whether to use location for this game.
3. If the user declines, the game starts normally with no map picker and no map setup.
4. If the user accepts, the browser requests location permission.
5. If permission is denied or unavailable, location mode is disabled and the game starts normally.
6. If permission is granted, a map setup modal opens before the game starts.
7. The setup modal shows the user's current location as a blue dot.
8. The user pans/zooms the map and taps the swing location.
9. The user saves the setup.
10. The game starts with location mode enabled.
11. During Play, every Fair or Out press records the kick immediately.
12. If location mode is enabled, an empty kick picker opens after that Fair or Out.
13. The timer keeps running while the picker is open.
14. The picker uses the saved setup center/zoom, shows the swing marker, and shows the current location blue dot.
15. The user can dismiss the picker or select a point and save it.
16. The Play page map button opens the kick viewer.
17. The Results page map button opens the same kick viewer.
18. The viewer uses the saved setup center/zoom, shows the swing marker, and shows the current location blue dot.
19. Refreshing or closing the app restores the active game.
20. A running timer always restores as paused.
21. Exiting Play or Results clears the saved active game and all saved locations.

## Existing Implemented Base

The app already has:

- Leaflet installed.
- `src/MapModal.tsx`.
- `src/map.ts`.
- Active-game localStorage persistence.
- Event IDs on turn events.
- Saved kick locations on Fair/Out events.
- Results preserving completed event data.
- Play and Results map viewer buttons.
- Service worker cache `olvidalo-v9`.

The next pass should update these pieces rather than adding a second map layer.

## State Model

Keep one source of truth for map setup:

```ts
type MapView = {
  center: LocationPoint;
  zoom: number;
};

type MapSetup = {
  swing: LocationPoint;
  view: MapView;
};
```

Update the active game:

```ts
type ActiveGame = {
  page: "play" | "results";
  players: Player[];
  settings: GameSettings;
  currentPlayerIndex: number;
  currentRound: number;
  currentTurn: TurnState | null;
  completedTurns: TurnResult[];
  locationMode: LocationMode;
  mapSetup: MapSetup | null;
};
```

Replace older map state:

- Remove `lastMapCenter` from active game and component state.
- Do not use kick locations to choose the default map view.
- Do not store map filter state in localStorage.
- Do not store open modal state in localStorage.

Keep:

- `TurnEvent.location` as the only source of truth for saved kicks.
- `TurnResult.events` as the completed-turn source of truth.
- `TurnState` as the active-turn source of truth.

## Modal State

Use one modal component with three modes:

```ts
type SetupState = {
  center: LocationPoint;
  currentLocation: LocationPoint;
  selectedSwing: LocationPoint | null;
  zoom: number;
};

type PickerState = {
  eventId: string;
  currentLocation: LocationPoint | null;
  selected: LocationPoint | null;
};

type ViewerState = {
  source: "play" | "results";
  playerId: string | "all";
  round: number | "all";
  currentLocation: LocationPoint | null;
};
```

Do not persist these modal states. They are UI state only.

## Location Permission And Setup Flow

Update the start-game location branch:

1. Home Start validates players.
2. Show the existing location prompt.
3. If the user chooses No, start with `locationMode: "off"` and `mapSetup: null`.
4. If the user chooses Yes, call `navigator.geolocation.getCurrentPosition`.
5. If permission fails, start with `locationMode: "off"` and `mapSetup: null`.
6. If permission succeeds, open setup modal centered on the user's current location.
7. The game does not start until setup is saved or canceled.
8. If setup is canceled, start with `locationMode: "off"` and `mapSetup: null`.
9. If setup is saved, start with `locationMode: "on"` and the saved `mapSetup`.

This makes the swing reference required for any location-enabled game.

## Setup Map

The setup map should:

- Show no kick markers.
- Show the user's current location as a blue dot.
- Let the user tap the swing location.
- Show the selected swing marker immediately.
- Let the user pan and zoom before saving.
- Save the map center and zoom at the moment the user presses Save.
- Require a selected swing before Save is enabled.

No rotation is needed. “Orientation” means center plus zoom.

## Kick Location Picker

The picker should:

- Open after Fair or Out only when `locationMode === "on"` and `mapSetup` exists.
- Record the kick before opening the picker.
- Keep the timer running.
- Show no previous kicks.
- Use `mapSetup.view.center` and `mapSetup.view.zoom`.
- Show the swing marker from `mapSetup.swing`.
- Show the user's current location as a blue dot.
- Let the user tap one kick location.
- Save the selected point onto that event.
- Dismiss without saving a location.
- Close if Undo removes the pending event.

When opening the picker:

1. Open immediately using `mapSetup` and `currentLocation: null`.
2. Request current location.
3. If it succeeds, update the picker blue dot.
4. If it fails, keep the picker open without a blue dot.

Do not disable location mode if a later current-location refresh fails. The saved swing setup is still valid, and manual map selection still works.

## Kick Map Viewer

The viewer should:

- Reuse the same map modal component.
- Use `mapSetup.view.center` and `mapSetup.view.zoom`.
- Show the swing marker from `mapSetup.swing`.
- Show the user's current location as a blue dot when available.
- Show saved Fair and Out markers after filters are applied.
- Keep Player and Round dropdown filters.

Viewer defaults:

- Opened from Play: `playerId` is the current player, `round` is `all`.
- Opened from Results: `playerId` is `all`, `round` is `all`.

When opening the viewer:

1. Open immediately using `mapSetup` and `currentLocation: null`.
2. Request current location.
3. If it succeeds, update the viewer blue dot.
4. If it fails, leave the viewer open without a blue dot.

If location mode is off or `mapSetup` is missing, the map button should either be hidden or disabled. Prefer hiding it to keep the UI minimal.

## Map Component Structure

Keep the map code isolated:

- `src/map.ts` for map types and Leaflet icon helpers.
- `src/MapModal.tsx` for setup, picker, and viewer modes.
- Keep styles in `src/styles.css` unless the map CSS becomes too large.

### `src/map.ts`

Add or update helpers:

- `MapView`
- `MapSetup`
- `LocationPoint`
- `KickMarker`
- `createKickIcon`
- `createSelectedIcon`
- `createSwingIcon`
- `createCurrentLocationIcon`
- `toLeafletPoint`

Keep helpers tiny and direct. Avoid a general map abstraction.

### `src/MapModal.tsx`

Use Leaflet imperatively with refs:

- Create the map once.
- Update the center/zoom when mode opens.
- Track map movement in setup mode so Save can capture the current view.
- Rebuild the marker layer from React props.
- Destroy the map on unmount.

The prop shape should remain explicit:

```ts
type MapModalProps =
  | {
      mode: "setup";
      center: LocationPoint;
      currentLocation: LocationPoint;
      selectedSwing: LocationPoint | null;
      onCancel: () => void;
      onSave: (setup: MapSetup) => void;
      onSelectSwing: (point: LocationPoint) => void;
    }
  | {
      mode: "picker";
      setup: MapSetup;
      currentLocation: LocationPoint | null;
      selected: LocationPoint | null;
      onCancel: () => void;
      onSave: () => void;
      onSelect: (point: LocationPoint) => void;
    }
  | {
      mode: "viewer";
      setup: MapSetup;
      currentLocation: LocationPoint | null;
      markers: KickMarker[];
      players: Player[];
      rounds: number;
      selectedPlayerId: string | "all";
      selectedRound: number | "all";
      onClose: () => void;
      onPlayerChange: (playerId: string | "all") => void;
      onRoundChange: (round: number | "all") => void;
    };
```

## Styling

Keep the current visual identity:

- Deep green app shell.
- Off-white modal surfaces.
- Gold ball accents.
- Fair green.
- Out clay/red.
- Compact controls.
- 8px radius convention.

Add marker styling:

- Swing marker: small dark-green/off-white swing or simple swing glyph.
- Current location: blue dot with a soft ring.
- Selected swing/kick: gold dot.
- Fair: green/gold marker.
- Out: clay/red marker.

Avoid:

- Large explanatory copy.
- Separate map pages.
- Duplicate map labels.
- Busy marker legends.
- Rotation plugins.

## Persistence Rules

Persist `mapSetup` inside the active game.

Do not persist:

- Setup modal open state.
- Picker modal open state.
- Viewer modal open state.
- Viewer filters.
- Current blue-dot location.
- Unsaved selected swing/kick point.

Restore:

- `mapSetup`.
- `locationMode`.
- saved kick locations.
- active game state.

Clear:

- Everything active-game related on explicit Exit.
- Everything active-game related when starting a brand-new game.

Play Again:

- Starts a fresh game with same players/order/settings.
- Clears old scores and kick locations.
- If previous game had location mode and setup, reuse the same setup without asking again.

## App Logic Changes

### Start Game

Update start to:

1. Validate and trim players.
2. Clear any old active game.
3. Ask whether to use location.
4. If no, start immediately with no map setup.
5. If yes and permission succeeds, open setup.
6. If setup saves, start with map setup.
7. If setup cancels or permission fails, start without location.

### Fair And Out

Update the existing kick handler:

1. Calculate adjusted elapsed time.
2. Create a `KickEvent` with stable ID and `location: null`.
3. Add it to `currentTurn.events`.
4. Apply existing final-out behavior.
5. If `locationMode === "on"` and `mapSetup` exists, open picker using setup view.

### Undo

Keep current undo behavior:

- Remove the most recent event.
- If removed event is the pending picker event, close picker.
- If removed event is the final out, restore the turn to paused.
- Saved kick location disappears because the entire event disappears.

### Viewer

Build viewer markers from:

- `completedTurns`.
- `currentTurn`.

Apply filters after building the full marker list.

## Code Cleanup Rules

Actively remove or simplify:

- `lastMapCenter` state.
- Any fallback that uses the first kick marker as the default viewer center.
- Any branch that disables location mode because a later blue-dot refresh failed.
- Any separate swing or marker storage outside `mapSetup` and `TurnEvent.location`.
- Any map view state that persists independently from active game state.

Keep:

- One source of truth for scoring: `TurnResult[]`.
- One source of truth for saved kick locations: `TurnEvent.location`.
- One source of truth for swing/view setup: `mapSetup`.
- One reusable map modal.

## Commenting Style

Match the current code style:

- Types at the top.
- Constants after types.
- Small named helper functions before `App`.
- Two-space indentation.
- Direct JSX spacing.
- Short comments before non-obvious branches.

Add comments specifically around:

- Capturing map center/zoom in setup mode.
- Showing current location as transient UI state only.
- Opening the picker after recording the kick.
- Keeping timer running while the picker is open.
- Reusing `mapSetup` for picker and viewer.
- Restoring a running timer as paused.

Do not add comments that merely describe obvious JSX or CSS declarations.

## Service Worker

Bump the service worker cache to:

```ts
olvidalo-v9
```

## Test Plan

Run:

```bash
npm run build
git diff --check
```

Manual checks:

1. Start a game and decline location.
2. Confirm the map button is hidden or disabled.
3. Confirm Fair/Out do not open maps when location is off.
4. Start a game and accept location.
5. Confirm permission denial starts without location.
6. Confirm permission success opens setup before Play.
7. Confirm setup shows current location as a blue dot.
8. Confirm setup Save is disabled until a swing is selected.
9. Pan/zoom setup, select swing, save, and confirm Play starts.
10. Press Fair and confirm the picker opens with saved setup view.
11. Confirm picker shows the swing marker.
12. Confirm picker shows current location when available.
13. Confirm timer keeps running while picker is open.
14. Dismiss picker and confirm no kick location is saved.
15. Press Out, select a kick point, and save.
16. Open Play viewer and confirm default filters are current player and all rounds.
17. Confirm viewer shows swing marker, current location, and saved kick markers.
18. Change Player and Round filters and confirm markers update.
19. Undo a located kick and confirm the marker disappears.
20. Finish a game and open Results viewer.
21. Confirm Results viewer defaults are all players and all rounds.
22. Refresh during Play with a running timer.
23. Confirm the game restores paused and keeps map setup and saved kick locations.
24. Refresh on Results.
25. Confirm Results restores scores, map setup, and saved kick locations.
26. Exit from Play and confirm active game data is cleared.
27. Exit from Results and confirm active game data is cleared.
28. Play Again and confirm scores/kicks reset without reshuffling.
29. If previous game had map setup, confirm Play Again reuses that setup.
30. Confirm Longest and Hits leaderboards still match existing scoring rules.
31. Confirm bonus and penalty events do not create map markers.

## Implementation Order

1. Update map types in `src/map.ts`.
2. Add swing and current-location icons.
3. Update `MapModal` to support setup, picker, and viewer modes.
4. Replace `lastMapCenter` state with `mapSetup`.
5. Update active-game read/write validation for `mapSetup`.
6. Update start flow to open setup before Play.
7. Update picker to use `mapSetup` view and transient current location.
8. Update viewer to use `mapSetup` view and transient current location.
9. Hide or disable map buttons when no `mapSetup` exists.
10. Update CSS for swing and blue-dot markers.
11. Bump service worker cache to `olvidalo-v9`.
12. Run build and diff checks.

## Suggested Commit Message

```text
Add swing map setup
```
