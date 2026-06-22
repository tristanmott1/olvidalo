# Olvidalo Visual Redesign Implementation Plan

## Summary

Refine the app into a tasteful outdoors, old-fashioned activity scorekeeper. The app should feel like a clean modern field ledger for a strange beloved lawn game, not a playground/recess app and not a decorative fantasy interface.

The pass should focus on consistency, restraint, and hierarchy:

- Earthy greens, golds, browns, parchment, and ink.
- Matte surfaces instead of glossy gradients.
- Quiet borders instead of heavy shadows.
- Distinct but related game-action colors.
- No decorative background motifs, random circles, or ornamental visual noise.
- Keep the current Home, Play, Results, Rules, and map/drawing flows intact.

This is primarily a CSS and asset pass. Make JSX changes only when they make the styling simpler, clearer, or less fragile.

## Design Target

The desired mood is:

- Outdoors.
- Old-fashioned.
- Tasteful.
- Slightly ceremonial.
- Simple and sturdy.
- Subtle but satisfying.

Avoid:

- Playground primary colors.
- Neon red/green/yellow.
- Glossy sports-app gradients.
- Decorative backgrounds.
- Fake parchment texture.
- Medieval cosplay.
- Extra cards or clutter.

## Color System

Replace the current mixed palette with clear semantic variables.

Recommended palette:

```css
--ink: #1f211a;
--muted: #6d725f;
--line: #d8d2c1;
--surface: #fbf4e3;
--surface-strong: #fff9ec;
--soft: #ecebdc;
--page: #eef1e7;
--pine: #183f34;
--pine-soft: #dfe8dc;
--moss: #3f6f45;
--olive: #75874a;
--ochre: #c69a3d;
--leather: #8a5a35;
--clay: #9b4f35;
--water: #477e9b;
--shadow: 0 10px 26px rgba(31, 33, 26, 0.08);
```

Role mapping:

- Primary brand, selected controls, timer: `--pine`.
- Fair: `--moss`.
- Out: `--leather`.
- Bonus: `--ochre`.
- Penalty: `--clay`.
- Delete/destructive text: `--clay`.
- Current location dot: restrained blue/water.
- Panels/cards/modals: parchment surfaces.
- Borders: stone/tan.
- Text: dark ink.
- Secondary text: muted sage.

Important action distinction:

- Out and Penalty must be distinct colors.
- They should not be two slightly different reds.
- Out should read as leather brown.
- Penalty should read as clay umber.

## Global Presentation

Update `src/styles.css` so the entire app feels consistent:

- Body background should be flat `--page`.
- Panels should use parchment surfaces.
- Borders should be visible but soft.
- Shadows should be smaller and less app-card-like.
- Inputs should use warm light surfaces and the same border color.
- Focus rings should use pine or olive with low opacity.
- Remove remaining decorative background effects unless they are required for usability.

Do not add:

- Background images.
- Texture overlays.
- Decorative pseudo-elements.
- Extra page wrappers.
- New layout containers unless the current markup cannot support the style cleanly.

## Component Styling

### Header And Brand

- Keep the brand header compact.
- Recolor the app icon to the new palette.
- Brand text should use pine.
- Info button should be quiet: parchment or pale pine background, pine icon.
- Remove bright yellow button treatment from the info button.

### Panels

- Panels should feel like field ledger sheets, not floating cards.
- Use parchment background, subtle border, and modest shadow.
- Keep 8px radius.
- Avoid nested-card feeling.
- Rows inside panels should be flatter and denser.

### Inputs And Selects

- Use warm light parchment/cream.
- Keep borders consistent.
- Keep controls compact.
- Avoid pure white except where clarity needs it, such as map/drawing canvas.

### Segmented Controls

- Background: pale pine/sage.
- Selected: pine.
- Text: pine or parchment depending on selected state.
- Remove overly bright contrast.

### Primary And Secondary Buttons

Primary:

- Pine fill.
- Parchment text.
- Solid or extremely subtle inset shadow.
- No bright green gradient.

Secondary:

- Pale pine/sage or parchment fill.
- Pine text.
- Border if needed for definition.

Danger/delete:

- Clay text.
- Pale warm background.
- No bright red fill.

### Play Action Buttons

Keep the 2x2 layout and large touch targets.

Use four distinct earthy action colors:

- Fair: moss green.
- Out: leather brown.
- Bonus: ochre gold.
- Penalty: clay umber.

All should feel like sturdy game tokens:

- Solid fills.
- No glossy gradients.
- Subtle inset shadow only if it improves tactility.
- Consistent typography and height.
- Bonus may use ink text if parchment/ink has better contrast.

### Timer

The timer remains the visual center of Play.

- Deep pine background.
- Parchment text.
- Simple, matte, strong.
- No shine, ball highlight, decorative gradient, or background symbol.
- Done state should remain calm; use pine with a subtle ochre border or leave unchanged.

### Leaderboards

Make leaderboards feel ledger-like:

- Flatter rows.
- Softer borders.
- Less badge-like rank circles.
- Winner row should use a very soft ochre tint or a left border.
- Scores should stay clear and aligned.
- Use pine for score emphasis.

### On Deck

Keep On Deck below the play controls and above leaderboards.

- It should be quieter than the current-turn panel.
- Use compact rows.
- Avoid heavy card treatment.

### Rules Page

Keep the "Sacred Rules" personality, but restrain it.

- Parchment surface.
- Serif title is okay.
- Roman numerals are okay.
- Use ochre sparingly.
- No decorative lines, fake scroll marks, circles, or ornate background effects.
- Keep the rules as one ordered rule card, not multiple separate cards.

### Modals

Modals should match the same parchment system:

- Parchment surface.
- Soft border.
- Smaller shadow.
- Compact header.
- Buttons follow the global primary/secondary rules.

### Maps And Drawing

Real map:

- Fair marker: moss.
- Out marker: leather.
- Swing marker: pine.
- Current location: restrained water blue.

Drawn map:

- Swing marker: pine.
- Fair marker: moss.
- Out marker: leather.
- Selected kick marker should already match Fair/Out.
- Canvas can stay pure white if drawing clarity is better.
- If changed to parchment, verify all drawing colors remain visible.

Drawing color palette:

- Keep black first.
- Include multiple greens and browns.
- Include ochre, clay, water blue, and eraser.
- Make swatches slightly more orderly if needed.

## App Icon

Recolor the app icon and generated PNGs to match the new visual system:

- Pine rounded square background.
- Parchment swing frame and swing.
- Ochre ball and arc.
- Keep the icon minimal:
  - open trapezoid swingset
  - two rope lines
  - one seat line
  - ball
  - ball arc
- Do not add feet, player body, extra lines, extra swing motion, or background decoration.

Files to update:

- `public/icon.svg`
- `public/icon-180.png`
- `public/icon-192.png`
- `public/icon-512.png`

Use local generation from the SVG so all icon sizes match.

## Layout Guidance

Do not restructure the app flow.

Keep:

- Home page: Players above Game.
- Play page: current turn panel, On Deck, leaderboard.
- Results page: Overall first, then round leaderboards.
- Rules page: one rule-card style page.
- Map/drawing views as modals.

Refine layout by styling, spacing, and hierarchy:

- Reduce card-heavy feeling.
- Make panels feel like sections on a field ledger.
- Let the Play current-turn panel be the strongest section.
- Keep On Deck quieter.
- Keep leaderboard rows flatter and easier to scan.
- Keep Results as a final ledger, with Overall dominant.

Do not:

- Move leaderboard above On Deck.
- Split Rules into multiple cards.
- Add a landing page.
- Add explanatory text.
- Add decorative sections.

## Code Cleanup Rules

Keep the implementation simple:

- Prefer CSS variable changes and class reuse.
- Avoid creating a theme abstraction.
- Avoid new components unless existing markup cannot support the visual changes.
- Remove obsolete CSS instead of overriding it.
- Remove color variables that no longer have a useful role.
- Keep comments rare; CSS should be readable through names and grouping.
- Maintain current 8px radius convention.

If JSX changes are needed:

- Keep them minimal.
- Use class names only when they make CSS clearer.
- Do not change gameplay logic.
- Do not change persistence, scoring, timer, map, drawing, or rules content.

## Implementation Steps

1. Audit current CSS variables and hard-coded colors in `src/styles.css`.
2. Replace root variables with the new earthy visual system.
3. Update global body, panel, input, button, and modal styling.
4. Update Play button colors:
   - Fair moss.
   - Out leather.
   - Bonus ochre.
   - Penalty clay.
5. Update timer styling to matte pine.
6. Update leaderboards and On Deck rows to a flatter ledger style.
7. Update Home player rows and Game controls to match the field-ledger style.
8. Update Rules page styling to restrained parchment with serif title and Roman numerals.
9. Update map marker colors in `src/map.ts` and drawn marker colors in `src/DrawMapModal.tsx`.
10. Update drawing swatch palette if needed to better match the new color system.
11. Recolor `public/icon.svg` to pine/parchment/ochre.
12. Regenerate PNG icons from the updated SVG.
13. Bump service worker cache if icon or asset caching requires it.
14. Run `npm run build`.
15. Run `git diff --check`.
16. Inspect source for removed/stale colors:
    - bright red action colors
    - neon greens
    - bright playground yellow for UI
    - decorative pseudo-elements
    - old icon colors
17. Manually inspect:
    - Home
    - Play
    - Results
    - Rules
    - real map picker/viewer
    - drawn setup/picker/viewer
    - app icon at small size

## Manual Visual Checklist

Home:

- Players and Game feel like two quiet ledger sections.
- Add/remove/randomize controls are clear but not loud.
- Inputs and selectors match the earthy palette.

Play:

- Timer is the visual center.
- Four action buttons are distinct and tasteful.
- Out and Penalty are visibly different.
- No decorative background marks remain.
- On Deck is readable but quiet.

Results:

- Overall leaderboard is dominant.
- Round leaderboards are readable and not too card-heavy.

Rules:

- Still feels old-fashioned.
- No goofy ornamentation.
- Roman numerals and title feel restrained.

Maps:

- Fair and Out markers match the app colors.
- Selected kick markers match Fair/Out.
- Swing marker is pine.
- Current location remains understandable.

Icon:

- Recognizable at small size.
- Uses only the simple swingset, swing, ball, and arc.
- Matches app palette.

## Out Of Scope

Do not change:

- Game rules.
- Page flow.
- Scoring.
- Timer behavior.
- Bonus/penalty logic.
- Persistence.
- Location or drawing functionality.
- Map filtering.
- Player ordering.

## Suggested Commit Message

```text
Refine visual system
```
