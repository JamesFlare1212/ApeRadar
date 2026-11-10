# State-machine contracts and regression coverage

Use this document when changing asynchronous workflows, cancellation, persistence,
or renderer state. The transition rules are spread across status fields, promises,
timers, object identities, and callbacks; a status union alone does not describe
the complete state machine.

The inventory groups application-owned behavior into 31 related families. Some
families contain subordinate machines and overlap at ownership boundaries. Simple
form values and protocols such as SQLite transactions, stream consumption, file
replacement, and subscription cleanup are included in their owning workflows.
Dependency internals are outside this inventory.

## Ownership and coverage map

| Families | Owner and state | Existing regression coverage and limits |
| --- | --- | --- |
| S01: lifetime; S02: active battle; S03: query execution | [RadarService](../apps/server/src/service.ts), [desktop host](../apps/desktop/src/main.ts): disposed flag, active battle, query controller, progress and timers. | [Service tests](../tests/service.test.ts) cover late results and shutdown persistence; [failure tests](../tests/service-failures.test.ts) reject writes with SQLite triggers, preserve active ownership on failure, publish cancellation after a failed save, and verify teardown despite shutdown save failure. |
| S04: player enrichment; S05: route invalidation | [API pipelines](../apps/server/src/api.ts), service routing revision, region/key fields and partial statistics. | [API tests](../tests/api.test.ts) cover public/hidden/unavailable/not-found distinctions and partial Vortex data; service tests cover AUTO resolution overtaken by settings changes and mixed-region removal. |
| S06: automatic monitor | Service timer, scan generation, in-progress generation, content digest and recoverable errors. | Service tests cover initial discovery, obsolete scans and incomplete JSON recovery. Failure tests replace an arena with equal-length contents and the same mtime; the changed content is imported. |
| S07: API health | Service pending promise/controller plus [health probe](../apps/server/src/health.ts) status/checks. | Health tests cover request sharing, timed refresh, timeout, routing replacement, cancellation, and shutdown. |
| S08: request admission; S09: retry/backoff; S10: worker pool | API admission and retry state; [HTTP lifecycle helpers](../apps/server/src/http-response.ts). | [HTTP lifecycle tests](../tests/http-lifecycle.test.ts) abort/timeout stalled bodies, reject without waiting for blocked cancellation, and cancel late responses from a fetch that ignored abort. API tests cover admission and retries. Admission remains per provider instance. |
| S11: ship enrichment; S12: statistics cache; S13: watch records | [MissingShipLookup](../apps/server/src/missing-ships.ts), [SQLite](../apps/server/src/database.ts), catalog membership, pending lookups, cooldowns, expiry and record presence. | Ship, database, and service tests cover shared lookups, negative cooldown, stale battle guards, eligible cache entries, expiry and persistence. |
| U01: updater; U02: installation receipt | [UpdateController](../apps/desktop/src/updates/controller.ts), [install record](../apps/desktop/src/updates/install-record.ts): mode, status, action, install revision and pending writes. | [Update tests](../tests/updates.test.ts) cover retry, query gates, disposal, stale installation continuations, and concurrent receipt writes. Real installer replacement remains separate from these simulated tests. |
| R01: workspace synchronization; R02: navigation; R07: update synchronization | [BridgeSnapshotStore](../apps/web/src/lib/bridgeSnapshot.ts), [App](../apps/web/src/App.tsx), hash route, settings section and deferred focus. | [Snapshot tests](../tests/bridge-snapshot.test.ts) control response/event ordering and reconnects. [Desktop state-machine smoke](../apps/desktop/src/smoke/state-machines.ts) checks a delayed invoke against a newer pushed battle. Navigation and focus also have existing desktop smoke coverage. |
| R03: settings writes; R04: appearance arbitration | [Shared settings queue](../apps/web/src/lib/settingsQueue.ts), [autosave](../apps/web/src/lib/settingsAutosave.ts), [appearance layers](../apps/web/src/lib/appearance.ts). | [Queue tests](../tests/settings-queue.test.ts), [autosave tests](../tests/settings-autosave.test.ts), and [appearance tests](../tests/appearance.test.ts) cover serialization, stale rendered settings, edits during saves, external changes, retries and preview ownership. |
| R05: client discovery; R06: path inspection | [GameClientSettings](../apps/web/src/components/settings/GameClientSettings.tsx): request revisions, current path, effect lifetime and debounce timer. | [Game-client tests](../tests/game-client.test.ts) cover detection/validation; desktop smoke covers normal UI discovery and inspection. Independently delayed discovery/inspection responses at component unmount are not exhaustively driven. |
| R08: update actions; R09: manual health action | [UpdateButton](../apps/web/src/components/updates/UpdateButton.tsx), [UpdatePanel](../apps/web/src/components/updates/UpdatePanel.tsx), [HealthPanel](../apps/web/src/components/settings/HealthPanel.tsx): local busy state combined with service state. | Controller tests and desktop presentation smoke cover normal phases and install blocking. Core snapshot ordering is tested independently of individual button renders. |
| R10: player editor; R11: watchlist editor; R12: watch menu; R13: confirmation; R14: modal focus | [PlayerDetail](../apps/web/src/components/battle/PlayerDetail.tsx), [WatchlistPage](../apps/web/src/routes/WatchlistPage.tsx), [WatchMenu](../apps/web/src/components/battle/WatchMenu.tsx), [shared wrappers](../apps/web/src/components/ui.tsx). | [UI smoke](../apps/desktop/src/smoke/ui.ts) covers keyboard, dirty-note discard, removal, persistence and focus. State-machine smoke holds a watch save pending, rejects it, and retries it while checking editor locking and draft retention. |
| R15: chart tooltip; R16: responsive sidebar | [DistributionChart](../apps/web/src/components/battle/DistributionChart.tsx), [sidebar preference](../apps/web/src/hooks/useSidebarPreference.ts), [SidebarProvider](../apps/web/src/components/ui/sidebar.tsx). | Existing desktop smoke covers chart interaction and narrow navigation. Pointer/focus crossings during tooltip dismissal and breakpoint changes while a drawer is open remain additional event combinations. |

## Defects exposed by transition-focused checks

The following paths were absent from the previous regression coverage. Keep the
tests attached to their behavioral contracts, rather than treating a previously
passing suite as evidence that every transition was exercised.

| ID | Trigger and user-visible risk | Required behavior and regression evidence |
| --- | --- | --- |
| SM01 | An initial read or action response arrives after a newer state push, reverting player progress, routing, or preferences in the renderer. | The shared snapshot store accepts responses only for the current subscription lifetime, event revision, and latest request. Tests cover reversed completion, late failure, reconnect, and an actual Electron invoke/push interleaving. |
| SM02 | Leaving Settings and changing the overview win-rate preference submits another full settings snapshot while autosave is pending, or from stale rendered settings after it completes. The second writer can erase the earlier edit. | All application UI settings writers use `getSettingsQueue`/`saveSettingsPatch`. Queue tests cover pending, completed, and acknowledged earlier writes while the overview still holds the original snapshot. |
| SM03 | A cache read throws before the provider's try/finally block. The request rejects but the query remains `loading`, disabling refresh and update installation. | Cache resolution is inside the query completion/cleanup boundary. Service tests inject one cache-read failure and verify a terminal state and a successful later query. |
| SM04 | A new arena, demo, or history selection aborts a partially completed query without saving accepted results. Reopening history loses progress that the user already saw. | Persist accepted progress before replacing an active query/battle. Reloading the same history ID must use the current partial snapshot, not overwrite it with the pre-query database copy. Service tests exercise all three replacements. |
| SM05 | Shutdown closes SQLite while a provider ignoring cancellation can still resolve. The continuation reads the closed database; accepted progress is also lost on restart. | Disposal aborts ownership, attempts to save partial progress, and closes storage. Snapshot/mutation entry points reject a disposed service before reading SQLite. A file-backed shutdown test resolves the old provider afterward and reopens the database to check saved progress. |
| SM06 | Installation preparation is pending, an updater error permits retry, and the old preparation later resolves or rejects. Checking only `action === 'install'` allows the old task to launch the installer or fail the new attempt. | Every installation attempt has a distinct revision. Both success and failure continuations must still own that revision. Update tests drive both obsolete completion outcomes while the replacement attempt is pending. |
| SM07 | Retried preparations write the same installation receipt concurrently. A shared `.tmp` file causes missing-file renames; unique temp files alone still permit conflicting destination renames on Windows. | Serialize writes per normalized destination and give each write its own temporary file with cleanup. A concurrent file-backed update test checks all writes complete and no temporary files remain. This queue is local to one process. |
| SM08 | A player was previously `ready` but a refresh no longer finds the account. Spreading the old object retains statistics/account/clan fields, and the details dialog can display obsolete data. | `not-found` clears account ID, clan and statistics. API regressions exercise this transition through both WG and Vortex. |
| SM09 | One Vortex ship mode is explicitly hidden or contains malformed counts. The former was cached as a complete error-free player; the latter discarded valid public account statistics. | Keep valid account data, set `shipAvailable: false`, and attach a retryable-detail message. Such results are excluded from successful cache entries and selected by failed-only retry. API tests cover both responses. |
| SM10 | A cancelled request is waiting behind a slow active request. Its promise stays pending until it acquires a slot, making cancellation depend on unrelated network progress. | Remove and reject an aborted waiter immediately without consuming a permit. API tests hold the active request open, abort the waiter, and verify that the next live waiter still executes. |
| SM11 | An HTTP failure or oversized Content-Length is rejected before consuming/cancelling its body. The permit is released while the response stream may still occupy resources. | Cancel unread bodies before rejecting these responses. Stream fixtures check cancellation for both rejection paths; retry classification remains unchanged if cancellation itself fails. |
| SM12 | The watch note remains editable during a slow save; success closes the dialog with the originally submitted note, silently discarding text entered afterward. | Lock the textarea while saving, keep the draft after failure, and unlock for retry. The Electron regression holds and fails the first IPC request, then completes a retry and verifies persistence. |
| SM13 | A rejected settings/import/history write changes live settings, the selected battle or query ownership before SQLite accepts it. Cancelling with a failed progress save also leaves the renderer showing loading. | Stage replacements and commit settings with its reset snapshot, or old/new battle snapshots, in one transaction before replacing live ownership. Rejected replacements leave the original query running. Explicit cancellation publishes idle with a save error even if persistence fails. SQLite-trigger and deferred-provider tests cover failure and retry. |
| SM14 | A file rewrite retains the same name, byte count and timestamp, so metadata-only deduplication misses the new lineup. | Compare the path and SHA-256 digest of bounded arena contents. Commit the digest only after import. A same-size/same-mtime rewrite regression loads the changed roster. |
| SM15 | A fetch/stream ignores abort, or body cancellation never settles, leaving queries and health checks stuck beyond their deadline. | Race fetch and each read against the request signal, clean up listeners/reader locks, and cancel late responses without applying them. Rejection does not await cancellation. Public API tests cover stalled player/health bodies, blocked cleanup and late fetch delivery. |
| SM16 | Two desktop processes share user data and race settings, current-battle and installation state despite process-local queues. | Take Electron's single-instance lock before creating a service, updater or window. A second launch exits and restores/focuses the existing production window. [Single-instance smoke](../apps/desktop/src/smoke/single-instance.ts) launches a real second process against the same isolated directory and checks it exits before startup. |

## Invariants to preserve

### Asynchronous ownership

An asynchronous continuation must prove that it still owns its result before
mutating or publishing state. Check a lifetime/attempt identity as well as the
current phase. A phase can leave and reenter the same string while an older task
is still running, as the installation retry defect demonstrates.

For battle queries, preserve controller identity, abort, battle identity/ID,
routing revision, and per-run player-key checks. For monitoring, preserve the
generation check after every asynchronous boundary and only commit a file stamp
based on the bytes read after a successful import. For ship enrichment, check the current battle and
routing revision before applying/persisting its display results.

### Snapshot ordering

Use `useBridgeSnapshot` for bridge-backed renderer snapshots. Subscribe before
the initial read. A push supersedes every response started before that push;
among responses without an intervening push, the latest started request owns the
result. Disconnecting invalidates old responses even if the same store is later
connected again. A rejected action still rejects to its caller for notification;
it does not replace a valid displayed snapshot with an unrelated load error.

The bridge currently supplies complete snapshots without server revision numbers.
This local rule assumes ordered push delivery on one subscription. It does not
provide cross-process conflict resolution or infer a lost remote commit.

### Settings writers

Application controls submit patches into the same queue; they must not construct
independent full-settings writes from component props. The queue retains the
authoritative base, local field edits and their revisions, own acknowledgments,
and external changes received during a write. Leaving a page flushes its edits
without creating a competing writer when another page mounts.

Feed accepted workspace snapshots through `receiveSettingsSnapshot`. Do not rebase
an existing queue from the props captured by a control's event handler: the queue
may already have saved and acknowledged a newer version before that render updates.

An invalid or failed save retains the draft for retry. Pending/saving is not
proof of persistence. Appearance preview is a separate higher-priority layer and
must be removed when its owner unmounts so the saved layer becomes visible again.

### Query termination and persistence

Once a query enters `loading`, cache access and provider work must share an error
and cleanup boundary. Normal errors must leave a terminal state and release the
owning controller. An obsolete query must not clear the replacement's controller.

Persist accepted results before replacement and explicit cancellation. Shutdown
also attempts this save; a shutdown save failure is logged without skipping timer,
listener and database teardown. A disposed service is terminal. Delayed work must
not read SQLite to construct a final snapshot after the database closes.

Stage replacement settings/rosters without mutating live objects. Routing settings
and the cleared battle snapshot commit together. Replacing an active battle saves
old accepted progress and the new current pointer in one transaction. Only then
abort the old query and replace its in-memory owner. A rejected replacement does
not cancel its predecessor. Explicit cancellation instead aborts immediately and
publishes idle even when saving its results fails.

### Data availability and caching

Treat the full data shape as state, not only its label:

- Query `complete` means the run ended; it can carry a failure message or partial
  count. It does not imply every player's statistics succeeded.
- Player `ready` can contain incomplete details. Inspect `error` and
  `stats.shipAvailable`; failed-only retries include players with errors.
- `not-found` must not retain the previous account's statistics or identity.
- Cache only eligible `ready`/`hidden` results without an error. Force bypasses
  reads; it does not mean every old cache row was deleted.
- Monitor `enabled` can mean waiting for a path/file or recovering from an error.
- Update `downloaded` can carry a recoverable installation error. Keep the verified
  download available for retry rather than starting another download implicitly.

### Request and file resource ownership

Every request waiter has one outcome: aborted and removed, or admitted and later
releasing exactly one permit. Remove its abort listener on admission. If abort
happens after permit handoff but before work starts, the normal finally path must
transfer/release that permit.

Cancel unread rejected HTTP bodies. Reader locks, file handles, temporary files,
timers, and subscription listeners must have cleanup on success, failure, and
owner disposal. Concurrent receipt writes serialize per destination; a failed
write must not permanently poison the next write's queue.

Do not await cancellation of an abandoned body: its source can indefinitely delay
cleanup. Guard fetch and reader promises independently with the request signal,
remove listeners on settlement, and cancel late fetch responses after their caller
stops waiting. The deadline covers headers and the entire body read.

Desktop ownership is per Electron user-data directory. Take the single-instance
lock before constructing storage or updater objects. A secondary-launch handler
must not create another service. Separate isolated test-data directories remain
independent.

## Remaining risk and test work

These limits remain after the regressions above. They are not claims that the
listed scenarios have been reproduced as additional product defects.

| Boundary | Current limit | Useful next regression |
| --- | --- | --- |
| Native persistence failures | Transaction rejection, memory preservation and failed shutdown saves are covered by triggers and injected errors. Real disk exhaustion and power loss are separate conditions. | Use a disposable constrained filesystem and crash/reopen around commit; verify WAL recovery without changing production data. |
| Non-desktop writers | Electron prevents another desktop process using the same data directory, while queues remain process-local. SQLite tools and separately configured development servers do not participate in that lock. | Isolate development data; define a shared ownership policy before introducing multi-process servers. |
| Transport integration | Controlled streams cover stalled reads, ignored signals and blocked cleanup; live endpoints do not exercise every Electron transport ordering. | Extend desktop tests with a controllable local HTTP responder and abort around headers, body chunks, backoff and permit transfer. |
| Updater integration | Controller tests simulate the engine and protect owned preparation continuations. Native updater error events have no attempt ID, and real version-to-version installation has not been established by a smoke pass. | Exercise a real installer with an old installed version, delayed engine errors and a verified post-restart target version. Preserve executable/installer identities with that evidence. |
| Browser development reconnect | EventSource owns automatic reconnect; the snapshot store has no server sequence number or explicit disconnected/stale banner. | Disconnect SSE after an accepted snapshot, mutate isolated server state, reconnect and check the initial replacement snapshot, subscription cleanup and pending actions. |
| Discovery and responsive interaction | Parser/service tests and normal UI smoke do not enumerate every component-level obsolete discovery reply, path edit, unmount, tooltip timer and breakpoint crossing. | Drive independently deferred bridge replies and pointer/focus events while changing route/path/breakpoint; assert no stale selection, reopened tooltip, or focus loss. |
| Monitor filesystem races | Content digests handle equal size/mtime; replacing or truncating a file during a bounded read still relies on a subsequent successful scan. | Gate replay replacement between header/block reads and verify incomplete reads retry without committing a digest. |

## Writing new regressions

Write the event schedule explicitly: start A, hold its completion, replace or
cancel it, start B, complete A, then complete B. Test both resolve and reject for
an obsolete continuation. Include the state after restart when the effect is
persistent. Assert externally meaningful outcomes such as the displayed battle,
saved note, exact installer invocation count, and the ability to retry.

Prefer deferred promises, injected failures, isolated SQLite files, stream
fixtures, and fake timers for service/controller tests. Browser smoke can poll for
a rendered condition while the main process deliberately holds the relevant IPC
reply. Do not substitute a longer real-network sleep for control over the event
ordering that caused the defect.

Run the checks in [Verification](verification.md). Offline regression results,
desktop smoke, live API checks, and real installer verification establish
different things and must be reported separately. Rolling `artifacts/` reports
describe their latest invocation, not an immutable release result.
