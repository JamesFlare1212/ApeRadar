# Application updates

The packaging, installer, release workflow and sidebar update button follow [brokenarrow-log-maggot at b3b51a4](https://github.com/JamesFlare1212/brokenarrow-log-maggot/tree/b3b51a4). This application publishes to its own repository, `JamesFlare1212/ApeRadar`.

The desktop update controller uses `electron-updater` and the stable `latest` channel. It checks once 15 seconds after startup and every four minutes afterward. Checks, downloads, and installation are serialized. An available update is downloaded only after a user action, and a verified download is installed only after a separate user action. Installation runs silently and restarts the app, using `quitAndInstall(true, true)`. Closing the application does not install an update. Active player queries delay installation until the user tries again after the query finishes.

The renderer receives the installed version, offered version, last check time, download progress, and operation-specific errors through the isolated preload bridge. A pending verified download is retained when another update check is requested. An installation record in the user data directory reports when the application restarts at the old version after attempting an installation; the record is removed after the running version changes.

## Current release configuration

`apps/desktop/electron-builder.json` configures the GitHub provider with `owner: JamesFlare1212`, `repo: ApeRadar` and `releaseType: release`. Electron-builder generates `resources/app-update.yml` and `release/latest.yml`. Updates become available after a compatible release has been published with its metadata and installer. Missing release metadata or network errors are reported as failed checks, never as “up to date”. Development builds, browser previews, unsupported platforms, and builds with `APERADAR_DISABLE_AUTO_UPDATE=1` report their specific disabled reason.

`pnpm dist:win` (also `pnpm dist`) builds both an NSIS installer (`ApeRadar-Next-Setup-<version>-x64.exe`) and the portable application (`ApeRadar-Next-<version>-x64.exe`). The installer allows choosing an installation directory and creates an “ApeRadar Next” desktop shortcut. Local packaging uses `--publish never`. Installed Windows builds download and apply the NSIS update; portable builds check the same feed and open the [latest release page](https://github.com/JamesFlare1212/ApeRadar/releases/latest) for manual replacement.

## Sidebar button

The bottom-left control stays beside Settings or Back to workspace, including when the sidebar is collapsed. It checks for updates, switches to a download arrow and notification dot when an update is available, displays circular download progress, and switches to “Restart and install” after verification. Checking and installing spin the icon; busy actions are disabled. Its tooltip includes the current version and state, and a live region announces changes. The About and updates page uses the same action component and offers a manual download link after failures. The release URL is fixed in shared code; the renderer cannot supply arbitrary download or installer paths.

## Publishing a version

1. Set the same stable `major.minor.patch` version in the root package and every `apps/*/package.json` and `packages/*/package.json`. `scripts/verify-release-version.mjs` checks consistency during builds and verifies release tags.
2. Run `pnpm check`, `pnpm dist:win`, `pnpm verify:updates` and `pnpm verify:package`. Update verification checks the NSIS filename, version, SHA-512 and size, and requires the installer blockmap and portable executable. It rejects a manifest pointing at the portable executable.
3. Commit the version and changes, create its matching `v<version>` tag, and push that tag. `.github/workflows/build.yml` checks the version, runs validation, builds both executables, verifies artifacts and runs the packaged smoke test before publishing the executables, `latest.yml` and `.blockmap` to GitHub Releases. Manual workflow runs provide downloadable artifacts without creating a release.
4. Validate a real version-to-version update in an installed Windows copy, including network failure, interrupted download, installer cancellation, and restart. Unit tests and a smoke test do not validate a live release feed or installer replacement.

The existing configuration disables executable signing. Local packaging does not publish a release or install or replace an application. The tag-triggered workflow publishes verified release artifacts to GitHub Releases.
