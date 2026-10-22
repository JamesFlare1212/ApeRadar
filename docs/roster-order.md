# Team roster display order

Each team displays a sorted copy of its players using these keys:

1. Ship class: aircraft carrier, battleship, cruiser, destroyer, submarine, unknown.
2. Ship tier, descending, with tier XI superships first within their class.
3. Internal nation order: USA, UK, France, Germany, Netherlands, Italy, Japan, USSR,
   Spain, Commonwealth, Pan-America, Europe, Pan-Asia. Unrecognized nations follow.
4. Numeric ship ID, descending, preserving precision for large IDs.
5. Case-insensitive captain name, ascending. Exact ties retain imported order.

The class, tier, nation, and ship-ID keys follow the game-style ordering documented
in the [WoWS Stats Plus implementation](https://github.com/anmonite/wows-stats-plus/blob/master/static/js/app.js).
This reconstructs the display order from available ship metadata; the arena file
does not provide the client's visible row index. Client mods and future changes
to the game's comparator can differ.

The comparator uses captain names without clan tags because clan tags arrive with
account statistics. Query completion, hidden statistics, self flags, and changes to
the win-rate metric therefore cannot move a row. Imported snapshots retain their
original player arrays, and the win-rate chart keeps its independent ranking.

The shared implementation is `packages/shared/src/roster.ts`. Regression coverage
is in `tests/roster.test.ts`, and the desktop smoke test checks the displayed order
and its stability when switching win-rate metrics.
