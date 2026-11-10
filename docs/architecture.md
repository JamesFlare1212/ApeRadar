# Architecture and behavior

## Workspace boundaries

The pnpm workspace follows [T3 Code's apps directory](https://github.com/pingdotgg/t3code/tree/main/apps).
The root owns shared commands, the lockfile, TypeScript base options, and cross-package tests.
Each package declares its own dependencies and type-checking configuration.

- `@aperadar/shared`: browser-compatible domain types, Zod validation, statistics, and text summaries.
- `@aperadar/server`: Node services, SQLite, game-file parsing and monitoring, and API scheduling.
  Its `resources/` directory contains the bundled ship catalog.
- `@aperadar/web`: React rendering and design tokens. Browser code depends on `shared`;
  only the Vite development configuration loads `server`.
- `@aperadar/desktop`: Electron main process, preload, native assets, and build and smoke scripts.
  It depends on `server` and `shared`.

Cross-package imports use the `@aperadar/server/*` and `@aperadar/shared/*` exports and `workspace:*`
dependencies. Shared packages export TypeScript source, which Vite and esbuild bundle.
`pnpm build` verifies package versions, checks application and test types, and builds the web renderer
and Electron entry points. The renderer goes to `apps/web/dist/`; main and preload go to
`apps/desktop/dist-electron/`. Server and shared code are bundled into the main process.

`apps/desktop/electron-builder.json` packages the renderer, ship catalog, icons, and license notices.
Windows outputs go to the root `release/` directory. Development resource paths are resolved relative
to the owning scripts or configuration files. Packaged resources are read from the application path;
the database uses Electron's user-data directory. See [Verification](verification.md) for isolated
test data and report locations.

## Runtime boundaries

The renderer owns serializable state and UI logic. It calls individual `RadarBridge` methods through
the isolated preload bridge, without arbitrary IPC, filesystem, SQL, or shell access. Production pages
are served from `aperadar://app/` using bundled local resources.

The main process owns `RadarService`, which manages the active battle, cancellation, player progress,
monitoring, and state events. `RadarDatabase` owns persistence. `WargamingApi` handles configured
endpoints, request scheduling, HTTP and API errors, retries, and response parsing. Zod validates
game files, settings, watch entries, and IPC arguments at runtime.

Browser development mode mounts the same Node service in Vite. The HTTP interface binds to loopback,
checks Host and Origin, requires a local-client header for writes, and publishes state through SSE.
Production desktop builds run the service inside Electron without an HTTP server.
The desktop host takes a single-instance lock for its user-data directory before opening storage.
A second launch exits and brings the existing production window forward.

The [state-machine contracts and regression coverage](state-machines.md) document asynchronous
ownership, snapshot ordering, shared settings writes, shutdown, and remaining test gaps.

## Game client discovery and region selection

`game-discovery.ts` reads current WGC path-pointer records and modern nested Steam
KeyValues libraries/manifests. It performs bounded reads, validates Steam app ID
552990, rejects manifest path traversal, resolves canonical installation paths,
and merges Windows paths without case sensitivity. Discovery never launches the
game or modifies its files.

`game-client.ts` verifies PE executable headers, the current 64-bit layout, and the
build recorded as installed by WGC. An incomplete installed build is rejected;
an older build is not silently substituted. Clients without WGC metadata use the
newest complete numeric build directory. Installation labels such as `WW` remain
separate from the API region.

AUTO is the default for new settings. Region detection compares the active server
in the game preferences with the latest realm in a bounded startup-log tail. The
preferences reader extracts only the relevant section because other game element
names need not be valid XML. Startup logs older than 24 hours are ignored. Missing,
unrecognized, unsupported, and conflicting evidence have explicit results; no
region is guessed. A manually selected region takes precedence.

Each query resolves its routing before consulting player caches. Settings changes
cancel pending resolution and requests, and disabling mixed regions restores the
primary region for both teams. Monitor generations prevent a paused or replaced
scan from importing a battle. API health checks report unresolved routing without
probing an arbitrary region.

The settings page discovers clients on entry, selects a sole candidate only when
the path is empty, and preserves an existing path or manual region selection. It
shows directory validation, evidence timestamps, conflicts, and waiting-for-arena
states separately. Browser development previews can use `APERADAR_DATA_DIR` for an
isolated database, matching the desktop test workflow.

## Battle lifecycle

1. Read bounded JSON or the first replay block and validate the roster schema.
2. Resolve the primary and secondary regions and enrich ships from the local catalog.
   Vehicle IDs are not account IDs.
3. Commit the previous query's accepted progress and the new roster/current pointer together.
   Then cancel the previous controller and replace the active battle.
4. Reuse unexpired player caches. Missing entries use the configured HTTP concurrency limit
   (default six) and request spacing from [API configuration](api-configuration.md#fields).
5. Apply each player result only when the controller, battle ID, and player key still match.
   Late requests cannot replace a newer battle even if the transport ignores cancellation.
6. Save the completed snapshot and history. Failed statistics remain unavailable instead of becoming
   hidden profiles or zero win rates, and failures are excluded from valid cache entries.

Partial ship-mode responses retain public account data and report missing details. Cancellation keeps
completed results, including before opening another snapshot or shutting down. Cache resolution and
provider work share query cleanup so a cache read failure cannot leave the query loading indefinitely.
Changing the win-rate display or theme does not cancel a query; changing routing
clears statistics from the previous route.

Replacement rosters and routing changes are staged before live state changes. Settings and their
cleared battle snapshot commit together. A failed write preserves the previous live owner and
permits retry. Monitoring deduplicates bounded file contents by path and SHA-256 digest, so an
equal-size rewrite with an unchanged timestamp still loads.

Imported and stored snapshots retain their player-array order. The UI sorts a separate display copy
according to [Team roster display order](roster-order.md); statistics updates and win-rate selection
do not change that ordering. Chart ranking is independent. Name privacy also applies to copied text
summaries.

Missing ships are resolved in the background and cached locally. The lookup lifecycle, regional
boundaries, and naming rules are documented in [Ship catalog maintenance](ship-catalog.md).

## SQLite

| Table | Purpose |
| --- | --- |
| `settings` | A single validated settings record. |
| `battles` | JSON snapshots keyed by deterministic battle ID; history returns the latest 100 by start time. |
| `metadata` | The current-battle pointer. |
| `watchlist` | Watch status and notes keyed by region and account ID. |
| `statistics_cache` | Expiring player statistics separated by source, region, identity, and API configuration. |
| `ship_catalog_cache` | Supplementary bilingual ship entries for reuse after restart and offline. |

The database uses WAL, a busy timeout, parameterized SQL, and transactions for snapshot and ship-cache
writes. Player results enter the statistics cache only when their status is `ready` or `hidden` and
no error is attached. Initialization currently sets `user_version=1`; future schema changes must
preserve user data through explicit migration.

## Renderer composition

Within `apps/web/src`, independently loaded pages live in `routes/`. The settings route renders six
sections. Application components are grouped into `components/layout`, `components/battle`,
`components/settings`, and `components/updates`. React hooks live in `hooks/`; bridge access,
appearance state, settings persistence, and chart transformations live in `lib/`.

`components/ui/` contains the local shadcn/ui primitives and is the only layer importing Radix.
`components/ui.tsx` composes them into shared controls. `styles.css` is the Tailwind and token entry
point; `styles/` groups application layout, battle tables, settings, help, and appearance artwork.

The [design system](../design-system/aperadar-next/MASTER.md) owns token, Lucide icon, typography,
component-state, and interaction rules. Desktop smoke checks live in `apps/desktop/src/smoke/`;
their scope and evidence handling are described in [Verification](verification.md).

Workspace and updater snapshots use one bridge synchronization implementation. A newer push,
newer request, or new subscription lifetime supersedes an older invoke response. Settings controls
across routes submit patches through one autosave queue, preserving drafts while a page unmounts.

## API and packaging dependencies

The supported player-statistics sources are WG Public API and Vortex. WG batches account search,
account details, and clan lookups by region, then requests ship statistics per public player.
Vortex stops requesting details for explicitly hidden profiles. RU uses Vortex even when WG Public
API is selected. Endpoint overrides and effective application-ID precedence are defined in
[API configuration](api-configuration.md).

SQLite uses `node:sqlite` from Electron's bundled Node.js runtime without a native addon rebuild.
Esbuild emits main and preload as CommonJS; Vite builds the renderer. Packaged resources live in asar,
while the database remains in the user-data directory.

Windows packaging uses the installed Electron distribution. Vite excludes caches, package outputs,
research, and data directories from watching to avoid Windows file locks during packaging.
Production builds do not require Vite or a development server.
