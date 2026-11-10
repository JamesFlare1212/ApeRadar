# Verification

This document describes how to select checks and interpret their evidence. Version-specific outcomes
belong in the [release records](#historical-release-results). Historical results do not establish that
a newer checkout or a different executable has passed.

## Selecting checks

Run commands from the repository root after installing dependencies as described in the
[README](../README.md).

After switching branches or changing package manifests or the lockfile, run
`pnpm install --frozen-lockfile` before validation. Use Node.js 24 LTS and the repository's pinned
pnpm version, matching CI. A successful check with previously installed dependency versions does
not validate the current lockfile; inspect `node --version` and `pnpm exec vitest --version` when
investigating differences between local results and CI.

| Change or task | Checks |
| --- | --- |
| Documentation only | Check Markdown formatting and local links, then run `git diff --check`. |
| Application code | `pnpm check` and `pnpm build`. |
| Desktop behavior | After building, also run `pnpm smoke:desktop`. |
| Live API behavior | Run `pnpm test:api:live` with an effective configured WG Application ID; record a skip if none is available. |
| Windows release | Follow [Publishing a version](application-updates.md#publishing-a-version), including artifact and packaged-executable validation. |

`pnpm check` runs workspace and test type checks, offline regression tests, and design-token
validation. Report the actual test count from that run. `pnpm build` verifies version consistency,
type-checks the project, and builds the renderer and Electron entry points; it does not run
regression tests.

## Validation scope

Offline tests use controlled HTTP responses and isolated databases. They cover parsing, statistics,
persistence, API scheduling and errors, settings migration, ship catalogs, and lifecycle behavior.

See [State-machine contracts and regression coverage](state-machines.md) for the transition coverage
map, previously missing interleavings, required invariants, and remaining fault-injection work.
Snapshot-ordering and settings-writer regressions control deferred promises without a browser.
Desktop state-machine smoke also delays an IPC response behind a newer pushed battle and holds,
fails, and retries a watch-note save to check editor locking and draft retention.
It also launches a second real Electron process against the same isolated user-data directory,
checking that single-instance ownership blocks it before service/window initialization.
Offline failure tests use SQLite triggers and controlled streams to exercise rejected writes,
content rewrites with unchanged metadata, stalled body reads and ignored cancellation.

Desktop smoke checks load production resources in a hidden Electron window with isolated preload
and application data under a unique `.test-data/` directory. Packaged checks run the generated
portable executable with similarly isolated data. Coverage includes navigation, keyboard controls,
settings, roster and watch workflows, and simulated update states.

Appearance checks exercise routes and dialogs across both themes and all six palettes at desktop
and narrow widths, plus typography settings. Chromium resolves rendered text colors, alpha blending,
and SVG fills for the measured contrast checks. This measures the covered states and token pairs;
it is not a full accessibility certification.

For manual development checks, use `APERADAR_DATA_DIR` to select an isolated database and use
synthetic rosters. Live API checks run separately with public samples and the configured application
ID. See [API configuration](api-configuration.md#live-validation) for routing and privacy details.
The probe can report partial Vortex results even when official WG checks pass; preserve that
distinction in the reported outcome.

Metadata verification checks generated update artifacts, installer checksums and size, and companion
files. Simulated updater tests and successful executable startup do not establish a live download
or a version-to-version Windows installation. Record actual installation checks separately.

## Reports and evidence

| Output | Contents |
| --- | --- |
| `artifacts/unit-tests.json` | The latest offline regression results. |
| `artifacts/desktop-validation.json` | The latest development-build Electron smoke report. |
| `artifacts/packaged-validation.json` | The tested portable executable path, size, SHA-256, and nested smoke report. |
| `artifacts/live-api-probe.json` | The latest separately run live API diagnostics and per-route outcomes. |

Successful desktop smoke runs also refresh the `artifacts/desktop-*.png` screenshots.
These files are rolling outputs: later runs overwrite earlier results, and reports from different
commands may describe different revisions. A failed run may also leave a previous successful report
in place. Use the command's exit status and newly produced report together.

When recording validation, include the application version or commit, run date, actual test count,
failures and skipped checks, and the identity of any tested executable. Preserve historical evidence
with a link to the corresponding committed report or retained CI artifact. Check the executable
version and digest inside a packaged report before associating it with a release.

A report saved in a release tag can be read without changing the working tree:

```powershell
# Replace vX.Y.Z with the release tag being inspected.
git show vX.Y.Z:artifacts/packaged-validation.json
```

## Historical release results

Release notes contain the recorded changes, downloads, validation counts, and limitations for each
version. The packaged reports below are pinned to the corresponding release commits, so rerunning
local checks does not change these references. They describe previously recorded checks; publishing
a new build requires new validation.

| Version | Recorded results | Evidence at the release commit |
| --- | --- | --- |
| v2.0.2 | [Release notes](releases/v2.0.2.md) | [Packaged report](https://github.com/JamesFlare1212/ApeRadar/blob/06e9c777718c4209435e338c331d9eb35d85ee50/artifacts/packaged-validation.json) |
| v2.0.1 | [Release notes](releases/v2.0.1.md) | [Packaged report](https://github.com/JamesFlare1212/ApeRadar/blob/1902a7bdb8f5c742488bb355a64f7fcdaff2fa77/artifacts/packaged-validation.json) |
| v2.0.0 | [Release notes](releases/v2.0.0.md) | [Packaged report](https://github.com/JamesFlare1212/ApeRadar/blob/f0ca33279776577fd42c70938b9112c7b33820ae/artifacts/packaged-validation.json) |
| v1.1.0 | [Release notes](releases/v1.1.0.md) | [Packaged report](https://github.com/JamesFlare1212/ApeRadar/blob/ee982028f34f72d89c2167369a89ee8c8101195b/artifacts/packaged-validation.json) |
| v1.0.6 | [Release notes](releases/v1.0.6.md) | [Packaged report](https://github.com/JamesFlare1212/ApeRadar/blob/979f6ec65336026e36d4b5ee89cf6e2fb4e60f05/artifacts/packaged-validation.json) |
| v1.0.5 | [Release notes](releases/v1.0.5.md) | [Packaged report](https://github.com/JamesFlare1212/ApeRadar/blob/f0bc19ea95b5356f074d876542b7a6ac451c6a06/artifacts/packaged-validation.json) |
| v1.0.4 | [Release notes](releases/v1.0.4.md) | [Packaged report](https://github.com/JamesFlare1212/ApeRadar/blob/429f6b21b6fa545fae7435f9280709f7a2d6aa54/artifacts/packaged-validation.json) |
| v1.0.3 | [Release notes](releases/v1.0.3.md) | [Packaged report](https://github.com/JamesFlare1212/ApeRadar/blob/a0416355b978ad89c2cc51443b44d85d0d7bdc3a/artifacts/packaged-validation.json) |
| v1.0.2 | [Release notes](releases/v1.0.2.md) | [Packaged report](https://github.com/JamesFlare1212/ApeRadar/blob/da2d254a92038bd0985083b4d29b3e2138c53886/artifacts/packaged-validation.json) |
| v1.0.1 | [Release notes](releases/v1.0.1.md) | [Packaged report](https://github.com/JamesFlare1212/ApeRadar/blob/919a47130160f11b823c6732bbea6372eda5fe86/artifacts/packaged-validation.json) |
| v1.0.0 | [Historical log](https://github.com/JamesFlare1212/ApeRadar/blob/06e9c777718c4209435e338c331d9eb35d85ee50/docs/verification.md) | [Packaged report](https://github.com/JamesFlare1212/ApeRadar/blob/5f4960d82765fab6129afe4abf1e7b0f00ac7051/artifacts/packaged-validation.json) |

## Earlier development records

The [verification log through v2.0.2](https://github.com/JamesFlare1212/ApeRadar/blob/06e9c777718c4209435e338c331d9eb35d85ee50/docs/verification.md)
preserves the earlier API investigations, UI checks, release summaries, and original baseline
test results. Its feature descriptions and counts apply to those historical runs. It includes
superseded behavior such as Font Awesome icons, manual roster import, CSV export, and the original
roster ordering.

Reports referenced by that old log were rolling outputs too; a report present in its final snapshot
does not necessarily belong to every earlier entry. Use the matching release evidence above or
inspect the relevant historical commit when tracing a particular run.
