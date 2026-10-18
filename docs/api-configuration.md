# API configuration

Edit `config/api.json` to configure the WG Application ID, per-region WG and Vortex base URLs, request
timeouts, concurrency, request spacing, and the health-check interval. Restart the development server
or desktop application after editing the file.
Keep the complete set of sections in `config/api.json`; alternative configuration files can use
partial overrides as described below.

The development desktop app, browser development service, and `pnpm test:api:live` load this file.
Production desktop builds bundle these defaults and create an editable `api-config.json` in the
Electron user-data directory on first launch, alongside `aperadar.sqlite`. Existing configuration
files are preserved across restarts and application updates. New installations and restored defaults
use WG Public API. Existing saved source preferences are preserved. The WG Application ID is configured
outside the Settings interface.

## Overrides and precedence

1. `APERADAR_CONFIG_FILE` selects an alternative JSON file. Relative paths are resolved against the
   working directory. An explicitly selected file must exist.
2. `WG_APPLICATION_ID` overrides the `wgApplicationId` field for the current process.
3. A nonempty configured WG ID takes precedence over the ID saved in the application's Settings.
4. If the configured ID is empty and `WG_APPLICATION_ID` is unset, the previously saved ID remains a
   compatibility fallback. Changing other preferences while the ID is managed does not overwrite that
   saved ID. To change the active ID, edit the configuration file or environment variable and restart.

An alternative file can contain only the fields to override; remaining fields use the bundled
defaults. In the following example, replace `YOUR_APPLICATION_ID` with the ID registered for your
application:

```json
{
  "wgApplicationId": "YOUR_APPLICATION_ID",
  "endpoints": {
    "wg": {
      "EU": "https://api.worldofwarships.eu/wows/"
    }
  },
  "requests": {
    "timeoutMs": 15000,
    "concurrency": 4
  }
}
```

```powershell
$env:APERADAR_CONFIG_FILE = 'D:\ApeRadar\api-config.json'
pnpm dev
```

## Fields

- `wgApplicationId`: WG Public API application identifier; letters and digits, up to 64 characters.
- `endpoints.wg`: `ASIA`, `NA`, and `EU` base URLs, including the `/wows/` path.
- `endpoints.vortex`: `ASIA`, `NA`, `EU`, and `RU` account base URLs, including `/api/accounts/`.
- `requests.timeoutMs`: player-query request timeout, from 1 to 120000 milliseconds.
- `requests.spacingMs`: minimum spacing between player-query request starts, from 0 to 60000 milliseconds.
- `requests.concurrency`: maximum simultaneous player-query requests, from 1 to 32. Health probes
  also respect this value, with an additional cap of four simultaneous probes.
- `requests.healthTimeoutMs`: health-probe timeout, from 1 to 120000 milliseconds.
- `requests.healthIntervalMs`: periodic health-check interval, from 1000 to 3600000 milliseconds.

Base URLs must use HTTP or HTTPS and cannot contain credentials, query parameters, or fragments.
Trailing slashes are normalized; custom path prefixes are preserved. Invalid JSON, unknown fields,
and invalid values produce a configuration error with the file path rather than silently falling
back to a different endpoint. RU continues to use Vortex when WG Public API is selected.

Player queries, health checks, and the live probe use the same endpoint configuration. Player-cache
namespaces include the endpoint configuration and effective application ID, so changing either does
not reuse responses from another configuration.

## Live validation

```powershell
pnpm test:api:live
```

The probe reads the configured ID, checks the official and Vortex routes, and exercises the
production lookup pipeline with public samples. It does not read local game logs or write settings,
history, or player caches. Results are written to `artifacts/live-api-probe.json`; the report records
only the application ID suffix and omits player identifiers from request diagnostics.

WG application identifiers are described in the [official developer guide](https://developers.wargaming.net/documentation/guide/getting-started/).
