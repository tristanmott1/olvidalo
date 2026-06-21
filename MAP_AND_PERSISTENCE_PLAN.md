# Map And Persistence Implementation Plan

## Summary

Add a third start-game map option: a hand-drawn course. The app should support three choices when starting a game:

- `No Map`: no kick picker or viewer.
- `Use Location`: real Leaflet/OpenStreetMap setup with GPS, swing marker, current-location blue dot, and saved kick locations.
- `Draw Course`: a blank white drawing space with the swing fixed at world coordinate `{ x: 0, y: 0 }`, pan/zoom gestures, brush controls, and saved kick locations.

The drawn course should behave like the real map during play: after Fair or Out, the picker opens; the user selects the kick location; the viewer can show saved kicks filtered by player and round; refresh restores the active game; Exit clears everything. The implementation should not fake drawn points as latitude/longitude. Keep real maps and drawn maps as sibling implementations with a small shared app-level model.

The code should stay simple, deliberate, and minimal. Remove outdated assumptions rather than layering around them. Someone reading the code should see one clean map model, one active-game persistence story, and two focused map surfaces.

## Desired User Flow

1. The user presses Start on the Home page.
2. The app shows three choices:
   - `No Map`
   - `Use Location`
   - `Draw Course`
3. If the user chooses `No Map`, the game starts normally with no map picker and no map viewer button.
4. If the user chooses `Use Location`, the app requests location permission.
5. If real-location permission fails, the game starts with no map and shows a small notice.
6. If real-location permission succeeds, the real map setup opens.
7. In real map setup, the user pans/zooms, selects the swing location, and saves.
8. The game starts with the real map setup.
9. If the user chooses `Draw Course`, the drawn course setup opens immediately.
10. In drawn setup, the swing is already fixed in the middle at world coordinate `{ x: 0, y: 0 }`.
11. The user draws the course around the swing using brush color and brush size controls.
12. The user can pan and pinch-zoom the drawing space while drawing.
13. The user saves the drawn course.
14. The game starts with the drawn map setup.
15. During Play, every Fair or Out records the kick immediately.
16. If the active game has a map setup, the kick picker opens after Fair or Out.
17. The timer keeps running while the picker is open.
18. Real picker shows the saved real map view, swing marker, and current-location blue dot when available.
19. Drawn picker shows the saved drawing, swing marker, and saved drawn view.
20. The user can dismiss the picker or select one kick location and save it.
21. The Play page map button opens the viewer when a map setup exists.
22. The Results page map button opens the same viewer.
23. Viewers use Player and Round dropdown filters with `All` options.
24. Refreshing or closing the app restores the active game.
25. A running timer always restores as paused.
26. Exiting Play or Results clears the active game, map setup, drawing, and saved kick locations.

## Existing Implemented Base

The app already has:

- Leaflet installed.
- `src/MapModal.tsx` for real maps.
- `src/map.ts` for real map types and icons.
- Active-game localStorage persistence.
- Real map setup with swing location and saved map view.
- Current-location blue dot for real maps.
- Event IDs on turn events.
- Saved kick locations on Fair/Out events.
- Results preserving completed event data.
- Play and Results map viewer buttons when a map exists.
- Service worker cache should be bumped to `olvidalo-v10` in this pass.

The next pass should preserve the real-map work while adding drawn maps as a parallel map kind.

## State Model

Use explicit map kinds instead of forcing all points into latitude/longitude.

```ts
type LocationPoint = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

type MapView = {
  center: LocationPoint;
  zoom: number;
};

type DrawPoint = {
  x: number;
  y: number;
};

type DrawView = {
  center: DrawPoint;
  zoom: number;
};

type DrawStroke = {
  id: string;
  color: string;
  size: number;
  points: DrawPoint[];
};

type RealMapSetup = {
  kind: "real";
  swing: LocationPoint;
  view: MapView;
};

type DrawnMapSetup = {
  kind: "drawn";
  swing: DrawPoint;
  view: DrawView;
  strokes: DrawStroke[];
};

type MapSetup = RealMapSetup | DrawnMapSetup;

type KickLocation =
  | {
      kind: "real";
      point: LocationPoint;
    }
  | {
      kind: "drawn";
      point: DrawPoint;
    };
```

Update Fair/Out events:

```ts
type KickEvent = {
  id: string;
  kind: HitKind;
  elapsedMs: number;
  location: KickLocation | null;
};
```

Keep adjustment events separate and location-free.

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
  mapSetup: MapSetup | null;
};
```

Remove or replace:

- `LocationMode`; map presence is now `mapSetup !== null`.
- Any branch that assumes maps are only real/GPS maps.
- Any saved kick marker logic that assumes every kick location has `lat/lng`.

Keep:

- `TurnEvent.location` as the only source of truth for saved kicks.
- `TurnResult.events` as the completed-turn source of truth.
- `TurnState` as the active-turn source of truth.
- `mapSetup` as the only source of truth for real/drawn map setup.

## Modal State

Use explicit setup/picker/viewer state:

```ts
type StartMapChoice = "none" | "real" | "drawn";

type RealSetupState = {
  center: LocationPoint;
  currentLocation: LocationPoint;
  selectedSwing: LocationPoint | null;
  zoom: number;
};

type DrawSetupState = {
  view: DrawView;
  strokes: DrawStroke[];
  color: string;
  size: number;
};

type PickerState = {
  eventId: string;
  selected: KickLocation | null;
  currentLocation: LocationPoint | null;
};

type ViewerState = {
  source: "play" | "results";
  playerId: string | "all";
  round: number | "all";
  currentLocation: LocationPoint | null;
};
```

Do not persist modal state. Persist only the active game snapshot.

## Start Flow

The Start button should:

1. Validate and trim players.
2. Clear any old active game.
3. Show a compact map-choice modal with three actions:
   - `No Map`
   - `Use Location`
   - `Draw Course`

### No Map

Start immediately with:

```ts
mapSetup: null
```

### Use Location

1. Request `navigator.geolocation.getCurrentPosition`.
2. If permission fails, start with `mapSetup: null` and a notice.
3. If permission succeeds, open `RealSetupState`.
4. Real setup Save creates a `RealMapSetup`.
5. Real setup Skip starts with `mapSetup: null`.

### Draw Course

1. Open `DrawSetupState` immediately.
2. The initial drawn view centers on `{ x: 0, y: 0 }`.
3. The swing is fixed at `{ x: 0, y: 0 }`.
4. Drawn setup Save creates a `DrawnMapSetup`.
5. Drawn setup Skip starts with `mapSetup: null`.

## Real Map Behavior

Keep the current Leaflet behavior:

- Real setup shows current location as a blue dot.
- Real setup lets the user select the swing.
- Real setup saves pan/zoom and swing.
- Real picker uses saved pan/zoom and swing.
- Real picker shows current location blue dot when available.
- Real viewer uses saved pan/zoom and swing.
- Real viewer shows current location blue dot when available.
- Real viewer shows real kick markers only.
- If current-location refresh fails after setup, the map still works without the blue dot.

## Drawn Course Behavior

The drawn course should behave like a map, not like a static image.

### Drawn Setup

The drawn setup modal should:

- Show a blank white canvas.
- Show the swing marker fixed at world coordinate `{ x: 0, y: 0 }`.
- Start with the swing visually centered.
- Let the user draw strokes around the swing.
- Let the user pan and zoom the drawing space.
- Persist strokes in world coordinates.
- Persist the final view center/zoom.
- Save without requiring any strokes.
- Include a `Clear` button.

Controls:

- Top row: circular color swatches.
- Include black as the default color.
- Include several simple colors that fit the app.
- Include an eraser option.
- Bottom row: continuous horizontal brush-size slider.
- Save/Skip buttons.

Gestures:

- One finger draws when drawing.
- Two-finger pinch zooms in and out.
- Two-finger drag pans.
- Mouse/pointer drag draws on desktop.
- Wheel zoom can be supported on desktop if simple.

The drawing surface does not need a separate Draw/Move toggle if two-finger gestures cover map movement. If panning with one finger becomes necessary later, add a mode toggle, but do not introduce it in this pass unless the implementation needs it for usability.

### Drawn Picker

The drawn picker should:

- Open after Fair or Out when `mapSetup.kind === "drawn"`.
- Use the saved drawn view.
- Show the saved strokes.
- Show the swing marker at `{ x: 0, y: 0 }`.
- Show saved drawing only, not previous kicks.
- Let the user pan and pinch-zoom.
- Let the user tap one kick location.
- Show the selected kick marker.
- Save that point as `{ kind: "drawn", point }`.
- Dismiss without saving.

### Drawn Viewer

The drawn viewer should:

- Use the saved drawn view.
- Show the saved strokes.
- Show the swing marker.
- Show filtered Fair/Out markers from saved drawn kick locations.
- Keep Player and Round dropdown filters.
- Let the user pan and pinch-zoom.

## Component Structure

Keep real maps and drawn maps separate:

- `src/MapModal.tsx`: real Leaflet setup/picker/viewer.
- `src/DrawMapModal.tsx`: drawn setup/picker/viewer.
- `src/map.ts`: shared map domain types plus real Leaflet helpers.
- `src/drawMap.ts`: small drawn-map helpers if needed.

Avoid making one giant component that knows both Leaflet and canvas drawing internals.

### `src/MapModal.tsx`

Continue to support real map modes only:

- `setup`
- `picker`
- `viewer`

It should accept only real-map setup and real kick markers.

### `src/DrawMapModal.tsx`

Support drawn map modes only:

- `setup`
- `picker`
- `viewer`

Responsibilities:

- Own the canvas refs.
- Render strokes, swing, selected marker, and saved markers.
- Convert screen points to world points.
- Convert world points to screen points.
- Track pointer gestures.
- Pause drawing while two-finger gestures are active.
- Keep code small with local helper functions.

## Drawing Coordinate System

Use a simple world coordinate system:

- Swing: `{ x: 0, y: 0 }`.
- Positive `x`: right.
- Positive `y`: down.
- `view.center`: the world point at the center of the canvas.
- `view.zoom`: pixels per world unit multiplier.

Recommended defaults:

```ts
const DRAW_SWING: DrawPoint = { x: 0, y: 0 };
const DEFAULT_DRAW_VIEW: DrawView = {
  center: DRAW_SWING,
  zoom: 1,
};
```

Use helper functions:

- `screenToWorld`
- `worldToScreen`
- `clampDrawZoom`
- `distance`
- `midpoint`

## Marker And Viewer Data

Update marker building to split real and drawn markers:

```ts
type RealKickMarker = {
  id: string;
  kind: HitKind;
  playerId: string;
  playerName: string;
  round: number;
  elapsedMs: number;
  location: LocationPoint;
};

type DrawKickMarker = {
  id: string;
  kind: HitKind;
  playerId: string;
  playerName: string;
  round: number;
  elapsedMs: number;
  point: DrawPoint;
};
```

Build markers from:

- `completedTurns`
- `currentTurn`

Filter by:

- Player dropdown.
- Round dropdown.
- Map kind.

Do not show real markers on drawn maps or drawn markers on real maps.

## Persistence Rules

Persist:

- `mapSetup`, including real setup or drawn setup.
- Drawn strokes.
- Saved kick locations, real or drawn.
- Active game state.

Do not persist:

- Open start-choice modal state.
- Open setup/picker/viewer modal state.
- Current-location blue dot.
- Viewer filters.
- Unsaved selected kick point.
- Unsaved in-progress stroke.

Restore:

- Active page.
- Active turn and completed turns.
- Real or drawn map setup.
- Saved real/drawn kick locations.
- Running timers as paused.

Clear:

- Everything active-game related on explicit Exit.
- Everything active-game related when starting a brand-new game.

Play Again:

- Starts a fresh game with same players/order/settings.
- Clears old scores and kick locations.
- Reuses the same real or drawn map setup without asking again.
- For drawn setup, reuse the course drawing and view.

## Styling

Keep the current visual identity:

- Deep green app shell.
- Off-white modal surfaces.
- Gold ball accents.
- Fair green.
- Out clay/red.
- Compact controls.
- 8px radius convention.

Drawn map styling:

- White canvas.
- Dark green swing marker.
- Fair/Out markers matching real-map marker colors.
- Selected marker gold.
- Color swatches as small circles.
- Eraser swatch clearly marked.
- Brush-size slider at the bottom.
- Minimal buttons: `Clear`, `Skip`, `Save`.

Avoid:

- Long explanatory text.
- Decorative canvas chrome.
- Extra drawing tools beyond color, eraser, size, clear.
- Separate pages.
- Fake lat/lng for drawn data.

## App Logic Changes

### Start Game

Replace the two-choice location prompt with a three-choice map prompt.

### Fair And Out

After recording a kick:

- If `mapSetup` is null, do nothing else.
- If `mapSetup.kind === "real"`, open the real picker.
- If `mapSetup.kind === "drawn"`, open the drawn picker.

The timer keeps running in every case.

### Undo

Keep current undo behavior:

- Remove the most recent event.
- If removed event is the pending picker event, close picker.
- If removed event is the final out, restore the turn to paused.
- Saved kick location disappears because the event disappears.

### Viewer

Open viewer only when `mapSetup` exists.

- Real setup opens real viewer.
- Drawn setup opens drawn viewer.

Defaults:

- Play: current player, all rounds.
- Results: all players, all rounds.

## Code Cleanup Rules

Actively remove or simplify:

- `LocationMode`.
- Any branch that treats map support as only GPS/location based.
- Any marker builder that assumes every point is `lat/lng`.
- Any drawn-map logic inside `MapModal.tsx`.
- Any real-map Leaflet logic inside `DrawMapModal.tsx`.
- Any unused current-location state in drawn mode.

Keep:

- One source of truth for scoring: `TurnResult[]`.
- One source of truth for saved kick locations: `TurnEvent.location`.
- One source of truth for setup: `mapSetup`.
- Separate focused components for real and drawn maps.

## Commenting Style

Match the current code style:

- Types at the top.
- Constants after types.
- Small named helper functions before `App`.
- Two-space indentation.
- Direct JSX spacing.
- Short comments before non-obvious branches.

Add comments specifically around:

- Distinguishing real and drawn map setup.
- Saving drawn strokes in world coordinates.
- Pointer gesture handling.
- Pinch zoom and two-finger pan.
- Opening the picker after recording the kick.
- Keeping timer running while the picker is open.
- Restoring a running timer as paused.

Do not add comments that merely describe obvious JSX or CSS declarations.

## Service Worker

Bump the service worker cache to:

```ts
olvidalo-v10
```

## Test Plan

Run:

```bash
npm run build
git diff --check
```

Manual checks:

1. Start a game and choose `No Map`.
2. Confirm the map button is hidden.
3. Confirm Fair/Out do not open a picker.
4. Start a game and choose `Use Location`.
5. Confirm permission denial starts without a map.
6. Confirm permission success opens real setup before Play.
7. Confirm real setup saves swing and map view.
8. Press Fair and confirm real picker opens with saved view and swing.
9. Confirm real picker can save a real kick location.
10. Open real viewer and confirm filters work.
11. Start a game and choose `Draw Course`.
12. Confirm drawn setup opens with white canvas and swing centered.
13. Draw with the default black brush.
14. Change brush color and size.
15. Use eraser.
16. Pinch zoom and two-finger pan while drawing.
17. Clear the drawing.
18. Draw again and save.
19. Confirm Play starts with drawn map setup.
20. Press Fair and confirm drawn picker opens with the saved drawing and swing.
21. Pan/zoom drawn picker and save a kick point.
22. Open drawn viewer and confirm drawing, swing, and markers appear.
23. Confirm drawn viewer filters by player and round.
24. Undo a located drawn kick and confirm its marker disappears.
25. Finish a game and open Results viewer for real and drawn setups.
26. Refresh during Play with a running timer.
27. Confirm the game restores paused with real or drawn setup intact.
28. Refresh on Results.
29. Confirm scores, map setup, drawing, and saved kick locations restore.
30. Exit from Play and confirm active game data is cleared.
31. Exit from Results and confirm active game data is cleared.
32. Play Again after real setup and confirm it reuses the real setup.
33. Play Again after drawn setup and confirm it reuses the drawn course.
34. Confirm Longest and Hits leaderboards still match existing scoring rules.
35. Confirm bonus and penalty events do not create map markers.

## Implementation Order

1. Update map/domain types for real and drawn setup.
2. Update active-game read/write validation for real and drawn setup.
3. Replace the start prompt with `No Map`, `Use Location`, and `Draw Course`.
4. Split marker building into real and drawn marker lists.
5. Keep `MapModal` focused on real maps.
6. Add `src/drawMap.ts` helpers.
7. Add `src/DrawMapModal.tsx`.
8. Wire drawn setup save/skip into start flow.
9. Wire drawn picker into Fair/Out flow.
10. Wire drawn viewer into Play/Results map buttons.
11. Add CSS for drawn canvas controls and markers.
12. Remove `LocationMode` and old location-only branches.
13. Bump service worker cache to `olvidalo-v10`.
14. Run build and diff checks.

## Suggested Commit Message

```text
Add drawn course maps
```
