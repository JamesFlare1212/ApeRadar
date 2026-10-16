# ApeRadar Next design system

The UI/UX skill's compact dashboard and Swiss typography guidance fits the app. Its two generated hero/enterprise marketing layouts did not match a desktop battle tool, so those unverified layouts were discarded. React stack searches returned no verified results; React implementation follows normal typed state and effect ownership practices. No unverified generated master was persisted.

## Tokens

`apps/web/assets/design-tokens.css` defines the base tokens. `apps/web/assets/palette-tokens.css` adds six paired light/dark palettes: graphite, cyan, orange, violet, forest and ocean. Each palette owns its accent, hover, subtle accent surface and foreground colors. Buttons, navigation, focus rings, switches, self-row highlights, appearance controls and the in-app mark inherit these semantic tokens. Primitive HSL channels, four-pixel spacing, numeric typography, radii and motion feed semantic aliases, then button/card/input/table tokens. Tailwind v4's `@theme inline` maps semantic values to utilities. Components do not embed raw hex values. Ship icon tiles share a neutral surface and border across all five classes. Team, rating and success/error colors retain their meaning independently of theme accents; light-mode body text uses slate 800 to soften its weight.

## Layout

A persistent sidebar that follows the selected surface palette and anchors settings at its bottom; a fluid main column with 24–28px gutters. Its top button toggles between the full sidebar and an icon rail, with a locally remembered preference; mobile keeps bottom navigation. The workspace begins with its heading and parallel player tables. Each team header contains its average win rate for the selected account or weighted mode. It has no separate title bar, battle banner or roster filter toolbar. Desktop windows retain compact controls at the upper right and use the breadcrumb region for dragging. Detail sheets retain context. At narrow widths, tables stack. Show ship average damage before total battles and emphasize its value. Hide total battles first when an individual roster card is 470px or narrower; retain average damage on mobile. Details remain reachable. Settings replace the workspace navigation with six focused sections and a persistent return action.

## Appearance and settings

The theme cards and paired palette controls follow the interaction model in [brokenarrow-log-maggot](https://github.com/JamesFlare1212/brokenarrow-log-maggot), especially `AppearanceSettings.tsx`, `useAppearance.ts`, `useSettingsAutosave.ts` and the settings/tokens styles. Theme mode is independent of the selected light and dark palettes. A pair card chooses both palettes; each orb changes only its own mode. System mode follows live OS changes. Settings apply immediately and save automatically with validation and sequential writes; errors retain the draft for retry. Old settings acquire palette defaults without discarding existing preferences. Cached appearance is applied before React renders to reduce theme flashes.

Settings and data surfaces use quiet borders and restrained elevation. The API panel reports actual per-source/region probes, elapsed time, failure reason and the current source; software updates expose check/download/install state, including an explicit reason when a build cannot update.

## Component states

| Component | Default | Hover | Active/focus | Disabled |
|---|---|---|---|---|
| Primary button | accent / on-accent | accent-hover | visible 3px focus ring | opacity .5, native disabled |
| Secondary button | surface / text / border | surface-muted | accent focus ring | native disabled |
| Input | input-bg / input-border | same | input-focus ring | native disabled |
| Player row | surface | table-row-hover | keyboard detail button | pending is a data state, not a disabled row |
| Tabs | muted text | surface-hover | accent text / aria-selected | native disabled when necessary |
| Detail dialog | surface, scrim | n/a | Radix focus trap, Esc close | n/a |

Interface icons use Font Awesome Free SVG definitions through the shared Icon component, with currentColor and explicit pixel dimensions. Navigation, actions, status and the unknown-ship fallback use solid icons; watch stars switch from regular outline to solid when selected. The five known ship classes use SVG redrawings of the game UI symbols through ShipGlyph, with solid paths and transparent internal markings. Keep the original silhouettes; avoid raster payloads, bevels or blur. Show white vectors in dark mode and invert them in light mode. Keep the 27px roster size, 46px desktop detail size and 35px mobile detail size. SVG filenames and the official Wiki PNG references, URLs and reference SHA-256 digests are recorded in `apps/web/src/assets/ship-types/sources.json`. The application mark uses the satellite-dish glyph. Icons and CSS are bundled locally. All icon buttons have accessible names, and decorative icons are aria-hidden. Status has text. Roster headers are static; team rows preserve imported game order while statistics update or the winrate metric changes. Numbers use tabular digits, rates use two decimals. Empty means em dash; an actual zero remains zero. Charts have labelled series, units and a text alternative. The winrate chart uses two smooth ascending lines with one circular marker per public player and a percentage Y axis. Each team spans its own relative rank range; graph sorting never changes roster order. The default 30–70% scale expands for actual outliers. Hover and keyboard focus reveal the selected player and value, respecting name privacy.

## Motion and accessibility

Loading, querying and saving icons use Font Awesome's native `spin` prop, including conditional `spin` for refresh and autosave states. Icon animation keyframes come from the bundled Font Awesome CSS; do not add a parallel `.spin` utility. Font Awesome's reduced-motion handling and the application-wide reduced-motion override remain active.

140ms state feedback, 200ms overlay transitions; `prefers-reduced-motion` disables nonessential motion. Buttons/inputs retain visible focus and at least 40px desktop controls; compact table buttons have adequate hit areas. Forms retain errors, and settings validation focuses the first invalid control. Minimum text contrast targets 4.5:1 in both themes. Mobile checks at 375px and landscape complement the desktop layout.
