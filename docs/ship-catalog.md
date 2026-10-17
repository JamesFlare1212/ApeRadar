# Ship catalog maintenance

The bundled catalog is `apps/server/resources/ships.json`. Each numeric ship ID
maps to English and Simplified Chinese names, nation, tier, and ship type. Its
`version` and UTC `date` describe the WG encyclopedia snapshot used for a full
refresh. Legacy entries from the original ApeRadar catalog remain when the API
does not return them.

## Refresh the project catalog

```powershell
pnpm ships:update
pnpm ships:update --region EU --dry-run
pnpm ships:update --region ASIA --output .test-data/ships-preview.json
pnpm ships:update --names-only
```

The default region is NA. Supported regions are NA, EU, and ASIA. The output
directory must already exist. `--dry-run` fetches and validates the catalog and
prints a summary without writing it. `--output` writes the merged catalog to
another path, using the bundled catalog as its baseline.

Original Chinese ship names are restored by default. `--names-only` applies
the local naming rules to the current catalog without network access or API
configuration; combine it with `--dry-run` or `--output` as needed.

The command reads `config/api.json`, or `APERADAR_CONFIG_FILE` when set.
`WG_APPLICATION_ID` overrides the configured Application ID. The ID must be
nonempty. Configured regional endpoints, timeouts, request spacing, and retry
behavior are reused; the full refresh has a three-minute overall timeout.

The updater reads `encyclopedia/info/`, then downloads all pages of
`encyclopedia/ships/` for `en` and `zh-cn`, requesting only
`ship_id,name,nation,tier,type`. It joins the two languages by ship ID and
replaces existing entries with current API details, then applies the local
original-name rules. Other Chinese translations follow the API.

All pages, totals, IDs, fields, and language pairs must be valid. The encyclopedia
version and update timestamp must remain unchanged during the download. Only
after validation does the command write a temporary file next to the destination
and rename it over the destination. Failed downloads leave the existing file
unchanged. API-absent legacy entries are preserved, so the merged total can
exceed the API's reported total. Review the diff before committing the catalog.

## Original Chinese names

Name restoration covers all Japanese and Pan-Asian ship types, including
battleships and carriers. Examples include `Yamato` (`鲸` to `大和`), `Atago`
(`犬` to `爱宕`), `Xin Zhong Guo 14` (`先驱04` to `新中国14`), and `Xuan Wu`
(`毒龟` to `玄武`). The previously excluded battleships Yimeng, Taihang,
Louchuan, and Sun Yat-Sen now use `沂蒙`, `太行`, `楼船`, and `孙中山`.

Maintain the ID-to-Chinese dictionary in
`apps/server/resources/ship-name-overrides-by-id.json`. A known ID takes
precedence over English names, nation, and type, so a renamed API entry or an
old snapshot with incomplete metadata still receives the correct display name.
The initial table covers all 201 Japanese and Pan-Asian ships in the bundled
15.9.0 catalog. This includes the identifier names `I-56` and `I-56 '44`.

The English-to-Chinese dictionary in
`apps/server/resources/ship-name-overrides.json` remains the fallback for
unknown IDs. Its initial values come from
this repository's original MIT ship catalog, with aliases for renamed English
entries and locally maintained additions for newer ships. New Japanese names
were cross-checked against the WG encyclopedia's Japanese localization. The
implementation was informed by
[aperadar_shiplist_update](https://github.com/jxzhangaoran/aperadar_shiplist_update)
and its `fan_he_xie.py` workflow. No Python runtime or translation-service
credentials are required.

The 11 ARP collaboration names were checked against the WG API's Japanese
localization and converted to Simplified Chinese, such as `ARP 羽黒` to
`ARP 羽黑` and `ARP 霧島` to `ARP 雾岛`. Ragnarok, Ignis Purgatio, BA Arona's
Whale, and Ship Smasha keep their verified official Chinese names rather than
the English placeholders in the old catalog. Other additions are curated
display names based on the original catalog and ship identity.

Lookup ignores case, combining accents, and differences in whitespace, including
nonbreaking spaces. After ID lookup, exact English entries take precedence;
missing bracketed or ` B`
variants can reuse a known base name. Unknown names retain the API translation
until a mapping is added. Matching uses the complete English name and the
eligible nation/type, so it does not replace fragments in unrelated names. An
unknown ID on another nation's ship keeps its API name.

The update command prints coverage counts and lists IDs without mappings or
names still requiring Chinese translations. New unmapped ships do not prevent
an otherwise valid API catalog from being saved. The offline regression suite
requires every bundled Japanese and Pan-Asian ship to have an ID mapping and a
reviewed Chinese name (or a submarine identifier), so catalog maintainers see
new gaps before shipping. This checks coverage; it cannot prove every
translation is linguistically correct.

The same rules apply to full catalog updates, targeted API lookups, local
supplementary cache entries, and restored battle snapshots. Existing masked
names in history are corrected when the battle is restored or opened, while
player statistics and other snapshot fields are preserved. CSV exports and
copied summaries use the corrected active battle names. Runtime lookups persist
new entries with restored names, so later updates do not reintroduce the API's
masked translations. Edit the dictionaries and rebuild the desktop app to ship
new mappings; run `pnpm ships:update --names-only` to also refresh the source
catalog offline.

## Missing ships at runtime

The desktop app and browser development service automatically look up missing
ship IDs when importing a real lineup, opening a historical snapshot, restoring
the last real battle, or querying player statistics. Lookup runs in the
background, including when automatic player queries are disabled. Existing ship
entries and synthetic demo battles require no encyclopedia requests.

Lookups use the player's ASIA, NA, or EU region and the effective WG Application
ID, even when player statistics use Vortex. RU and CN are excluded: WG data is
not used as a fallback for these regions. A missing Application ID disables
remote lookup. Requests use both languages, deduplicate concurrent IDs, and
split batches at 100 IDs. Only complete, valid bilingual entries are saved.

Successful entries are stored in the `ship_catalog_cache` table in the existing
SQLite database. They are available after restart and offline. Bundled entries
take precedence over supplementary entries after an application update; the
bundled catalog version displayed in Settings is unchanged by targeted lookups.
Runtime lookups never write into the packaged application or source tree.

Failed requests keep the lineup usable with unknown-ship placeholders and an
activity warning. Transport/API failures can be retried after one minute; IDs
absent from the encyclopedia are retried after one hour. A later import or
player query triggers the retry. Shutdown aborts pending lookups, and late
results cannot replace a newer battle or restore stale ship details during a
player-statistics update.

## Validation

`pnpm check` includes offline regression coverage for pagination, bilingual
merging, validation failures, atomic writes, persistence, request deduplication,
retry cooldowns, and battle lifecycle behavior. `pnpm test:api:live` separately
checks a targeted bilingual encyclopedia request and original Chinese name
restoration using isolated in-memory data,
alongside the existing live player API checks. It does not change the bundled
catalog or the user's database.

API references:

- [Warships](https://developers.wargaming.net/reference/all/wows/encyclopedia/ships/?language=en)
- [Information about encyclopedia](https://developers.wargaming.net/reference/all/wows/encyclopedia/info/?language=en)

The initial catalog's attribution and the refreshed game-data provenance are
recorded in `THIRD_PARTY_NOTICES.txt`. WG game data and names retain their
owners' rights.
