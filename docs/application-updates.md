# Application updates

The desktop update controller uses `electron-updater` and the stable `latest` channel. It checks once 15 seconds after startup and every four minutes afterward. Checks, downloads, and installation are serialized. An available update is downloaded only after a user action, and a verified download is installed only after a separate user action. Closing the application does not install an update. Active player queries delay installation until the user tries again after the query finishes.

The renderer receives the installed version, offered version, last check time, download progress, and operation-specific errors through the isolated preload bridge. A pending verified download is retained when another update check is requested. An installation record in the user data directory reports when the application restarts at the old version after attempting an installation; the record is removed after the running version changes.

## Current release configuration

`apps/desktop/electron-builder.json` deliberately has `publish: null`. There is no configured update feed, so current builds report that updates are unavailable instead of reporting that they are up to date. The Git repository's existing releases are not assumed to contain compatible update metadata. Development builds, browser previews, unsupported platforms, and builds with `APERADAR_DISABLE_AUTO_UPDATE=1` also report their specific disabled reason.

`pnpm dist:win` builds both an NSIS installer (`ApeRadar-Next-Setup-<version>-x64.exe`) and the existing portable application (`ApeRadar-Next-<version>-x64.exe`). Packaging does not publish either artifact. Installed Windows builds can download and run an NSIS update once a trusted feed is configured. Portable builds can check that feed but cannot replace themselves or run the installer through the application.

## Enabling a release feed

1. Add an electron-builder configuration that extends `apps/desktop/electron-builder.json` and supplies the real `publish` provider and release destination. Use a destination controlled by the application publisher and dedicated to compatible ApeRadar Next releases.
2. Build the NSIS and portable artifacts with that configuration. Verify that the installed application resources contain the generated `app-update.yml`; do not place hand-written feed URLs in renderer settings.
3. Publish the generated `latest.yml`, matching NSIS installer, and installer `.blockmap` together. The metadata version and installer version must agree. The portable executable alone is insufficient for application updates.
4. Configure Windows signing for distributed installers. The current local packaging configuration disables executable signing; no signature validation or publisher identity has been verified for these local artifacts.
5. Validate a real version-to-version update in an installed Windows copy, including network failure, interrupted download, installer cancellation, and restart. Unit tests and a development smoke test do not validate a live release feed or an actual installer replacement.

No feed was enabled or release published as part of this implementation.
