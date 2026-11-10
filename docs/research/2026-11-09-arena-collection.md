# MTG Arena collection import: research findings (2026-11-09)

Scope: read-only web research plus curl verification. Nothing was installed and no repo was modified.
Markers: **VERIFIED** = I fetched the primary source (official page, tool source code, or the data file itself) today.
**VERIFIED-2nd** = confirmed only from a secondary source (third-party docs/README). **UNVERIFIED** = could not confirm.

Evidence downloaded today (all under `<research scratch>/arena/`):

| Evidence | Detail |
| --- | --- |
| Real Player.log corpus | `frankfaustino/manasight-corpus`, 38 sanitized logs dated 2026-02-22 to 2026-05-01 (Windows and macOS clients), https://github.com/frankfaustino/manasight-corpus |
| Official Arena card DB | `Raw_CardDatabase_75c4560260d0d2d9ed6fe3014d5d8410.mtga` from `assets.mtgarena.wizards.com`, client `0.1.14672.1335447` dated 10/22/26, data version `2026.65.0.236`, Last-Modified 2026-10-22 |
| Scryfall bulk | `default-cards-20261109220647.jsonl.gz`, 120,053 card objects |
| 17Lands | `cards.csv`, Last-Modified Fri 16 Oct 2026 12:23:32 GMT, 1,744,544 bytes, 26,907 data rows |
| Untapped public JSON | `https://mtgajson.untapped.gg/v1/latest/cards.json`, Last-Modified 2026-11-03, 27,720 rows |
| MTGJSON | `Meta.json` version `5.3.0+20261109`; set files FDN, SOS, FRA, YFRA |
| Tool source | shallow clones of 14 repos (listed in section 2) |

Analysis scripts are in `arena/scripts/` (`log_methods.py`, `log_scan2.py`, `log_inv.py`, `log_formats2.py`, `carddb_schema.py`, `carddb_rarity.py`, `coverage.py`, `coverage2.py`, `rarity_compare.py`, `scry_stats.py`, `scry_legal.py`).
The 267 MB uncompressed card DB was deleted after analysis; `arena/dl/wotc/Raw_CardDatabase.mtga.gz` remains (gunzip to re-run).

---

## 1. State of the Arena client log in 2026

### 1.1 Paths and switches

| Item | Value | Status |
| --- | --- | --- |
| Windows | `C:\Users\<user>\AppData\LocalLow\Wizards Of The Coast\MTGA\Player.log` (`%USERPROFILE%\AppData\LocalLow\...`) | VERIFIED: 17Lands client `mtga_follower.py` lines 54-75; MTGA_Draft_17Lands `src/constants.py`; manasight-parser `src/log/discovery.rs` |
| Previous session | `Player-prev.log` in the same folder. The client overwrites `Player.log` on each launch and keeps exactly one previous file | VERIFIED (same sources) |
| macOS | `~/Library/Logs/Wizards Of The Coast/MTGA/Player.log` | VERIFIED (same sources) |
| Steam/Proton (Linux) | `<steam root>/steamapps/compatdata/2141910/pfx/drive_c/users/steamuser/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log`; steam roots seen in source: `~/.steam/steam`, `~/.local/share/Steam`, `~/.steam/root`, `~/.var/app/com.valvesoftware.Steam/.local/share/Steam`, `~/snap/steam/common/.local/share/Steam` | VERIFIED (17Lands client; MTGA_Draft_17Lands constants). Steam app id 2141910 |
| Steam on Windows | same `LocalLow` path as the standalone client | UNVERIFIED (no source states it explicitly) |
| Enable | Options -> Account -> "Detailed Logs (Plugin Support)", then restart the client | VERIFIED-2nd: MTGA_Draft_17Lands README, MtgaCollectionAdvisor README, HearthSim help article 6075965. Wizards' own support article returned HTTP 403 to both fetchers |
| Marker in log | line `DETAILED LOGS: ENABLED` or `DETAILED LOGS: DISABLED` near the top. With it disabled there are no `==>` / `<==` lines at all | VERIFIED in corpus (`session_2026-03-15_1157_detailed_logs_disabled.log.gz`) |
| Client version line | `Version: 2026.58.20.12269 / 2026.58.20.12269.1265462 /` (May 2026). Launcher version today: `0.1.14672.1335447` dated `10/22/26` | VERIFIED: corpus; `https://mtgarena.downloads.wizards.com/Live/Windows64/version` |
| Engine | `Initialize engine version: 2022.3.62f2` (Unity 2022.3) | VERIFIED in a macOS corpus log (April 2026) |
| Log size | 2 MB to 46 MB uncompressed in the corpus; the StartHook payload alone is one ~400 KB line | VERIFIED |

Line format (VERIFIED, real log 2026-05-01):

```text
[UnityCrossThreadLogger]5/1/2026 4:57:16 PM
<== StartHook(131e62ff-f48b-49d2-a7eb-1adfbeacc58c)
{"InventoryInfo":{"SeqId":1,"Changes":[],"Gems":14100,"Gold":17150,"TotalVaultProgress":43,"wcTrackPosition":2,"WildCardCommons":557,"WildCardUnCommons":801,"WildCardRares":104,"WildCardMythics":84,"CustomTokens":{...},"Boosters":[{"CollationId":100060,"SetCode":"SOS","Count":4}],"Vouchers":{},"PrizeWallsUnlocked":["PrizeWall_MH3"],"Cosmetics":{...}},"DeckSummaries":[...],"Decks":{...}, ...}
[UnityCrossThreadLogger]==> RankGetCombinedRankInfo {"id":"bc6c54a4-...","request":"{}"}
```

Requests are `==> Method {"id":..,"request":"<json string>"}` on one line. Responses are `<== Method(<uuid>)` followed by the JSON payload on the next line.

### 1.2 API methods actually present (38 real logs, Feb to May 2026)

VERIFIED by `log_methods.py`. Response counts across the corpus:

```text
597 GraphGetGraphState        188 EventGetCoursesV2        160 PeriodicRewardsGetStatus
141 QuestGetQuests            136 RankGetCombinedRankInfo  136 RankGetSeasonAndRankDetails
135 StartHook                 100 EventGetActiveMatches     69 DeckUpsertDeckV2
 60 EventPlayerDraftMakePick   58 EventEnterPairing         48 EventJoin
 42 EventSetDeckV2             39 EventAiBotMatch           39 BotDraftDraftPick
 38 DeckUpsertDeckV3           37 GetFormats                12 DeckGetAllPreconDecksV3
 11 EventSetDeckV3              9 DeckGetDeckSummariesV2     7 DeckGetDeckSummariesV3
  4 DeckDeleteDeck              2 EventClaimPrize            2 DraftCompleteDraft
  1 BotDraftDraftStatus
```

Absent from every log: `PlayerInventory.GetPlayerCardsV3`, `PlayerInventory.GetPlayerInventory`, `Deck.GetDeckListsV3`, `Inventory.Updated`.

### 1.3 (a) Owned card counts: NOT in the log

**VERIFIED.** Evidence:

- Corpus scan (`log_scan2.py`): no JSON payload in any of the 38 logs contains a large numeric-key to integer map (the shape of a collection). Zero hits.
- 17Lands client, `mtga_follower.py` line 603-607: `" PlayerInventory.GetPlayerCardsV3 " in full_log ... ):  # Doesn't exist any more`. https://github.com/rconroy293/mtga-log-client
- manasight-parser `CHANGELOG.md`, 0.2.0 (2026-04-25): "**Breaking:** Dead `StartHook` `PlayerCards` collection-event path; inventory is the only supported `StartHook` snapshot". https://github.com/manasight/manasight-parser
- MTGGoldfish, "September 1, 2021 Update: Unfortunately, Magic Arena updated last week disabling a key function that enabled collection trackers to work. This affected all collection trackers (including ours)." Download is still marked "Temporarily disabled". https://www.mtggoldfish.com/articles/mtggoldfish-arena-companion-app
- MtgaCollectionAdvisor README (released today): "The collection itself doesn't need it [Detailed Logs]; wildcards and saved decks do."

Partial data that is in the log: `InventoryInfo.Changes[]` entries carry granted-card deltas, e.g.

```json
{"Source":"EventGrantCardPool","SourceId":"Sealed_SOS_20260421","InventoryGems":20,
 "GrantedCards":[{"GrpId":102708,"CardAdded":true,"SetCode":"SOS"},{"GrpId":102471,"CardAdded":true,"SetCode":"SOS"}], ...}
```

Other `Source` values seen: `EventReward`, `EventPayEntry`. These are deltas only, never the full collection. Whether pack openings and wildcard crafts log the same structure is UNVERIFIED (the corpus has no such session).

Caveat: the corpus ends 2026-05-01. For the November client I have only indirect evidence (manasight-parser 0.7.3 of 2026-09-26, last commit 2026-11-01, still parses the same StartHook fields; MtgaCollectionAdvisor v0.11.0 of 2026-11-10 still reads wildcards and decks from the log and the collection from memory). **Log structure after 2026-05-01: UNVERIFIED directly.**

### 1.4 (b) Wildcards, gems, gold, vault: `StartHook.InventoryInfo`

**VERIFIED.** Present in all 135 StartHook responses. Keys and occurrence counts:

```text
SeqId 135, Changes 135, Gems 135, Gold 135, TotalVaultProgress 135,
WildCardCommons 135, WildCardUnCommons 135, WildCardMythics 135, WildCardRares 126, wcTrackPosition 114,
CustomTokens 135, Boosters 135, Vouchers 135, PrizeWallsUnlocked 135, Cosmetics 135
```

- `WildCardRares` and `wcTrackPosition` are missing in some snapshots, so zero-valued fields are omitted. Parse missing as 0.
- Note the spelling `WildCardUnCommons` (capital C).
- `TotalVaultProgress` is in tenths of a percent: mtgatool-desktop renders `(inv.TotalVaultProgress || 0) / 10` with a `%` sign (`src/components/views/home/ViewHome.tsx` line 364). VERIFIED from that source.
- `CustomTokens` holds `DraftToken`, `SealedToken`, `PlayInToken`, mastery orbs. `Boosters` is `[{CollationId, SetCode, Count}]`.
- The same object also appears as `.InventoryInfo` in `EventJoin` (48) and `EventClaimPrize` (2) responses, and as `.DTO_InventoryInfo` in `BotDraftDraftPick` (39). The 17Lands client keys on `DTO_InventoryInfo`.
- StartHook is emitted at login. A wildcard snapshot is therefore as old as the last client start unless a later `InventoryInfo` appears. Use the last one in the file.

### 1.5 (c) Decks

**VERIFIED.**

- StartHook top-level keys: `InventoryInfo, Decks, SystemMessages, PreferredCosmetics, HomePageAchievements, DeckLimit, TimewalkInfo, TokenDefinitions, KillSwitchNotification, CardMetadataInfo, ClientPeriodicRewards, UpdatedGraphs, ServerTime` plus `DeckSummariesV2` (all logs through 2026-04-12) or `DeckSummaries` (all logs from 2026-04-14). Accept both names.
- From the same date `DeckUpsertDeckV3`, `EventSetDeckV3`, `DeckGetDeckSummariesV3` replace the V2 names.
- Shapes:

```json
"DeckSummaries":[{"DeckId":"64db7e61-...","Name":"Black Red Brawl",
  "Attributes":[{"name":"Version","value":"11"},{"name":"LastPlayed","value":"\"2024-01-28T22:08:04.5401525-08:00\""},
                {"name":"LastUpdated","value":"..."},{"name":"IsFavorite","value":"false"},{"name":"Format","value":"Brawl"}],
  "DeckTileId":82701,"DeckArtId":430165}]
"Decks":{"64db7e61-...":{"MainDeck":[{"cardId":82647,"quantity":1}, ...],"Sideboard":[],"CommandZone":[{"cardId":..,"quantity":1}],"Companions":[],"CardSkins":[]}}
```

- `Format` attribute values seen: `Standard, Alchemy, TraditionalStandard, TraditionalExplorer, Historic, Gladiator, HistoricBrawl, DirectGameLimited, DirectGame, Brawl, TraditionalHistoric`.
- manasight-parser notes some summaries carry `"IsNetDeck": true` (precon or event-assigned decks).
- `EventGetCoursesV2` returns `Courses[]` with `InternalEventName`, `CourseDeckSummary`, `CourseDeck`, `CardPool` (grpIds, for Limited), `CurrentWins`, `CurrentLosses`.
- A deck containing a card is not proof of ownership: Arena allows saving decks with unowned cards. UNVERIFIED from a primary source, but the official FAQ describes importing decks with cards you do not own.

### 1.6 Other useful payloads

- `StartHook.CardMetadataInfo`: `{"NonCraftableCardList":[43 grpIds],"NonCollectibleCardList":[161 grpIds],"UnreleasedSets":[]}`. VERIFIED. Looking the non-craftable ids up in the card DB gives promo or cube-only printings (e.g. 69449 Ral, Izzet Viceroy; 71341 Zilortha, Strength Incarnate; 59877 Animate Dead from the cube).
- `GetFormats` (once per session): 133 format definitions, each with `name, legalSets, filterSets, bannedTitleIds, suspendedTitleIds, allowedTitleIds, supressedTitleIds, individualCardQuotas, mainDeckQuota, sideBoardQuota, commandZoneQuota, useRebalancedCards, CardCountRestrictionInternal, RarityPerCardQuotasInternal, AllowedCommanderTitleIds`. VERIFIED. This is the client's own legality data keyed by titleId. Example (2026-05-01): `Standard.legalSets = [WOE, LCI, MKM, OTJ, BIG, BLB, DSK, FDN, DFT, TDM, FIN, EOE, OM1, TLA, ECL, TMT, SOS]`; `Timeless.individualCardQuotas = {"21415":{"max":1}, ...}` (the restricted list).
- Player.log contains account id, persona id, display name and, per the corpus project, tokens (its `scrub` tool removes "account IDs, display names, tokens"). Treat a raw Player.log as sensitive.

---

## 2. How current tools get the collection

Three techniques exist. All full-collection tools use memory.

1. **Log reading** (`Player.log`): wildcards, decks, matches, drafts. No collection since August 2021.
2. **Structured memory reading** (walk Mono/IL2CPP objects): `WrapperController.<Instance>.<InventoryManager>.InventoryServiceWrapper.<Cards>._entries`. Used by mtga-tracker-daemon (UnitySpy, C#) and mtga-reader (Rust). VERIFIED in both sources.
3. **Heuristic memory scan** for tables of `(grpId, quantity)` int pairs, located with "anchor" cards the user owns. Started by NthPhantom10's exporter and ported by several others. VERIFIED in READMEs and `THIRD-PARTY-NOTICES.md` of MtgaCollectionAdvisor.

A fourth, historical: **code injection**. MTGA Pro Tracker shipped `SharpMonoInjector.dll` and made the client write `[MTGA.Pro Logger] **Collection**{...}` lines into Player.log (VERIFIED: `Razviar/mtgap` `src/app/do-path-ops.ts`, `getusercredentials.ts`; `sboulema/ManaBoxImporter` `MtgaProRepository.cs`). The repo is archived.

### 2.1 Tool table

| Tool | Method | Maintained (as of 2026-11-09) | Licence | Collection export for the user | Status |
| --- | --- | --- | --- | --- | --- |
| **frcaton/mtga-tracker-daemon** | structured memory read, local HTTP server | Yes: v1.0.12.0 on 2026-09-09; releases for Windows zip and Linux tar.gz only | GPL-3.0 | raw JSON over `http://localhost:6842` | VERIFIED (source) |
| **mtgatool/mtga-reader** (npm `mtga-reader` 0.1.13) | structured memory read; Windows/Mono and macOS/IL2CPP | Yes: 2026-09-16 | GPL-3.0-only | library only | VERIFIED (README, `index.d.ts`) |
| **MTG Arena Tool** (`mtgatool/mtgatool-desktop` v7.2.4) | log + memory via mtga-reader | Yes: 2026-09-16 | GPL-3.0 | "Export" button -> `collection.csv`, semicolon-separated | VERIFIED (source) |
| **MTGA Deck Advisor** (`Dasayeve/MtgaCollectionAdvisor` v0.11.0) | heuristic memory scan for collection; log for wildcards and saved decks; Windows only | Yes: 2026-11-10 | MIT | Export menu: Arena-style list and JSON with wildcards | VERIFIED (README, source) |
| **MTGA Collection Reader** (`zetsumei8/mtga-collection-reader` v5.2.5) | downloads and runs mtga-tracker-daemon | 2026-08-02 | MIT | `mtga_collection.txt`, `.json`, `.csv` | VERIFIED (source) |
| **MTGA-collection-exporter** (`NthPhantom10`, 38 stars, V3.4.1) | heuristic memory scan; Windows exe, also macOS/Linux from source | 2026-09-30 | MIT | txt, json, Moxfield/Deckbox/MTGGoldfish/Cardsphere csv | VERIFIED (source) |
| `MartoEporedia/mtga-collection-exporter` | heuristic scan, macOS tested, Windows untested | 2026-08-10 | MIT | `collection.csv`, `collection.json`, `collection_arena.txt` | VERIFIED (source) |
| `egrm/mtgacollect` | heuristic scan, macOS + Windows | 2026-06-03 | MIT | Arena text, Archidekt CSV, Moxfield CSV | VERIFIED (source) |
| `PBernaerts/mtga-export` | bundles the daemon, Linux/Proton | 2026-07-14 | MIT | `collection.json`, `collection-moxfield.csv` | VERIFIED (source) |
| `sboulema/ManaBoxImporter` | calls the daemon | 2025-11-16 | MIT | ManaBox CSV | VERIFIED (README) |
| **17Lands client** (`rconroy293/mtga-log-client`) | log only | Yes: last commit 2025-10-29, repo pushed 2026-04-14 | GPL-3.0 | none for collection. Uploads inventory (wildcards) and drafts. Its collection handler is dead code | VERIFIED (source). Whether 17lands.com still shows a collection page: UNVERIFIED (site is a JS app) |
| **MTGA_Draft_17Lands** (`unrealities`) | log + local card DB; draft overlay only | Yes: 2026-11-07 | MIT | none (not a collection tool) | VERIFIED (source) |
| **manasight-parser** | log only; Rust crate with WASM build | Yes: 2026-11-01 | MIT OR Apache-2.0 | none (parser library) | VERIFIED (source) |
| **Untapped.gg Companion** | Official help says it "watches this log file in real time". Its site shows a synced collection, which the log cannot supply, so it must also read memory | Yes (site copyright 2026, help article dated 2026-08-03) | closed | No export documented. A third-party script reads `https://api.mtga.untapped.gg/api/v1/account/collections/<player_id>?user_id=<user_id>` from a public profile and gets `{"cards":[{"grpid":..,"quantity":..}]}` | Log method VERIFIED (help.hearthsim.net article 5020719). Memory reading and absence of export: **UNVERIFIED**. API shape VERIFIED-2nd (`aldeobacchus/MTGA-Collection-Exporter` source); I did not call it |
| **MTGA Assistant** (AetherHub) | Overwolf app; syncs collection to AetherHub | UNVERIFIED | closed | UNVERIFIED | aetherhub.com returned HTTP 403 to both fetchers. Everything about it is **UNVERIFIED** |
| **Arena Tutor** (Draftsim) | Overwolf; "reads your MTGA log files" | page live | closed | UNVERIFIED (a Draftsim article reportedly offers set-by-set export) | Method VERIFIED (draftsim.com/arenatutor) |
| **MTGGoldfish Arena Companion** | log (`output_log.txt` era) | **Dead**: download "Temporarily disabled" since 2021-09-01 | closed | n/a | VERIFIED |
| **MTGA Pro Tracker** (`Razviar/mtgap`) | log + DLL injection | **Dead**: archived, last push 2024-10-28 | MIT in `package.json`, no LICENSE file | n/a | VERIFIED |
| **MTGATracker** (`mtgatracker/mtgatracker`) | log | **Dead**: archived, description says "no longer maintained" | n/a | n/a | VERIFIED |
| **gathering.gg** (`gathering-gg/parser`) | log | **Dead**: last push 2019-06-01 | MIT | n/a | VERIFIED |
| **MTGAHelper** (`ibiza240/*`) | log | **Dead**: last push 2023-03-22 | MIT | n/a | VERIFIED |
| **Lotus Tracker** | n/a | No repo found under `lotustracker/lotustracker` | n/a | n/a | UNVERIFIED |
| `kelesi/mtga-utils` | old log format | **Dead**: 2021-03-01 | MIT | n/a | VERIFIED |

### 2.2 mtga-tracker-daemon details (the question asked for exact endpoints)

Source: https://github.com/frcaton/mtga-tracker-daemon (`README.md`, `src/mtga-tracker-daemon/HttpServer.cs`, `Program.cs`, `Models/*.cs`). All VERIFIED from source at commit `d5bc784` (2026-09-08).

- Start: `mtga-tracker-daemon.exe -p 9000`. Default port **6842**. Binds `http://localhost:<port>/` only and additionally drops any request where `request.IsLocal` is false.
- Every response carries `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: *`, `Access-Control-Allow-Headers: *`, `Content-Type: Application/json`.
- On failure every memory endpoint returns `{"error":"<exception text>"}`.

| Endpoint | Response |
| --- | --- |
| `GET /status` | `{"isRunning":true,"daemonVersion":"1.0.12.0","updating":false,"processId":1234}` |
| `GET /cards` | `{"cards":[{"grpId":96269,"owned":4}, ...],"elapsedTime":123}`. Only entries with `owned > 0` |
| `GET /playerId` | `{"playerId":"...","displayName":"...","personaId":"...","elapsedTime":12}` |
| `GET /inventory` | `{"gems":14100,"gold":17150,"elapsedTime":12}`. **Gems and gold only. No wildcards, no vault.** |
| `GET /events` | `{"events":["Ladder","Play", ...],"elapsedTime":12}` |
| `GET /matchState` | `{"matchId":"...","playerRank":{"mythicPercentile":0,"mythicPlacement":0,"class":0,"tier":0},"opponentRank":{...},"elapsedTime":12}` |
| `GET /allCardsConnectionString` | `{"connectionString":"Data Source=...Raw_CardDatabase_*.mtga;...","elapsedTime":12}` |
| `GET /allCards` | `{"cards":[{"grpId":6873,"title":"...","expansionCode":"MIR"}, ...],"elapsedTime":900}`. SQL in source: `SELECT c.GrpId, l.Loc as Title, c.ExpansionCode FROM Cards c JOIN Localizations_enUS l ON c.TitleId = l.LocId ORDER BY c.GrpId` |
| `POST /shutdown` | `{"result":"shutdown request accepted"}` |
| `POST /checkForUpdates` | `{"updatesAvailable":false}` |

(Numeric values above are illustrative; field names and types are from the model classes.)

Limits:

- No deck endpoint (issue #13 open since 2023) and no wildcards.
- Offsets table covers Unity up to 2022.3.42 with a nearest-version fallback; the client logged Unity 2022.3.62f2 in April 2026. PR #19 "Add support for Unity 2022.3.62" was closed unmerged on 2026-06-24, so the daemon relies on the fallback.
- **Works on the November 2026 client: UNVERIFIED.** I have no Windows machine with Arena. Supporting evidence only: four releases between June and September 2026; issue #20 (2026-05-26) says "It's been solid"; MTGA Collection Reader and PBernaerts/mtga-export depend on it.
- Issue #21 (2026-10-26, third-party report, unanswered): Windows Defender quarantines `mtga-tracker-daemon-Windows.zip` 1.0.12.0 as `Trojan:Win32/Suschil!rfn`. UNVERIFIED by me. Expect antivirus friction with any memory reader.
- Admin rights: ManaBoxImporter README says "Start MTGA Tracker Daemon as administrator"; mtga-reader README says "Reading game memory requires administrator/root privileges." VERIFIED-2nd.
- The daemon self-updates: on start it queries `https://api.github.com/repos/frcaton/mtga-tracker-daemon/releases/latest`, downloads the release asset and extracts it (`CheckForUpdates()`, `ExtractTGZ` in `HttpServer.cs`). A user who runs it is trusting future releases too.
- mtga-reader's `ReaderAccount` type includes `accessToken` and `email`. A memory reader can see the session token. This is why a public site should never ship or host its own memory reader.

### 2.3 Every way a normal player can get a file or text of the full collection today

Literal formats, from the tools' source code. All VERIFIED unless noted.

**(F1) mtga-tracker-daemon `/cards`** (open `http://localhost:6842/cards` in a browser, copy all):

```json
{"cards":[{"grpId":73208,"owned":4},{"grpId":96269,"owned":2},{"grpId":102646,"owned":3}],"elapsedTime":187}
```

**(F2) mtga-reader `readCollection`** (`index.d.ts`): `{"count":3512,"cards":[{"grpId":73208,"qty":4}]}`

**(F3) MTGA Collection Reader** (`exports.py`, plus the "manual snapshot" formats it accepts in its README):

```text
# mtga_collection.txt          one line per printing:  <qty> <name> (<SET>) <collector>
4 Luminarch Aspirant (ZNR) 24
2 Lightning Bolt (FCA) 40
```
```csv
Count,Name,Edition,Collector Number,Condition,Language,Foil,Tag
4,Luminarch Aspirant,ZNR,24,Near Mint,English,,
```
```json
{"schemaVersion":1,"source":"manual-import","cards":[{"arenaId":102646,"quantity":3}]}
[{"grpId":102646,"owned":3}]
{"102646":3}
```
`mtga_collection.json` is a JSON array of row objects with keys including `name`, `quantity` (or `count`), `set_code` (or `set`), `collector_number` (or `cn`).

**(F4) NthPhantom10 MTGA-collection-exporter** (`mtg.py` `write_all`):

```text
MTGA Collection Export
Exported: 2026-11-09 21:00:00
Unique cards: 3512
Total cards:   9120
============================================================
4x Luminarch Aspirant (ZNR) #24 [rare]

2x Lightning Bolt (FCA) #40 [uncommon]

```
(each card line is followed by a blank line; optional indented type/text lines when descriptions are enabled)

```json
{"export_date":"2026-11-09T21:00:00","total_unique":3512,"total_cards":9120,"database_size":98000,
 "cards":[{"count":4,"name":"Luminarch Aspirant","set":"ZNR","collector_number":"24","rarity":"rare",
           "mana_cost":"{1}{W}","type_line":"...","oracle_text":"...","arena_ids":[73208]}]}
```
```csv
Count,Name,Edition,Condition,Language,Foil,Tag                      <- "Moxfield" file
4,Luminarch Aspirant,ZNR,Near Mint,English,,
Count,Tradelist Count,Name,Edition,Card Number,Condition,Language,Foil,Signed,Artist Proof,Altered Art,Misprint,Promo,Textless,My Price   <- Deckbox
Card,Set,Quantity                                                   <- MTGGoldfish
Quantity,Card Name,Set,Foil                                         <- Cardsphere
```
Names come from Scryfall via `arena_id`, so cards Scryfall cannot map are dropped (`if not info: continue`).

**(F5) MTG Arena Tool** (`ViewCollection.tsx` `generateCollectionCSV`), file `collection.csv`, semicolon separator, unquoted:

```text
Count;Name;Edition;Collector Number;Rarity
4;Luminarch Aspirant;znr;24;rare
```
Basic lands are always skipped. Digital-only cards are skipped unless "export digital" is ticked. `Edition` is a Scryfall code when the tool has a mapping.

**(F6) MTGA Deck Advisor** (`CollectionExportWriter.cs`): text is `<count> <front-face name>` per line, summed across printings by name, round-trips through its own parser:

```text
4 Lightning Bolt
2 Bonecrusher Giant
```
```json
{"exported_at":"2026-11-09T21:00:00+00:00","wildcards":{"common":120,"uncommon":64,"rare":6,"mythic":11},
 "cards":[{"count":4,"name":"Lightning Bolt","arena_ids":[100,101]}]}
```
`wildcards` is `null` when unknown. This is the only community export I found that carries wildcards.

**(F7) MartoEporedia** (`mtga_export.py`):

```csv
Name,Set,CollectorNumber,Rarity,Quantity
"Nicol Bolas, God-Pharaoh",AKR,247,Mythic,1
Half-Elf Monk,AFR,19,Common,4
```
plus `collection_arena.txt` lines `<quantity> <name> (<SET>) <number>`.

**(F8) Moxfield collection CSV**, as written by egrm/mtgacollect and PBernaerts/mtga-export (two independent implementations emit the same 13 columns):

```csv
Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price
4,0,"Momo, Friendly Flier",tla,NM,English,,,,29,False,False,
```
egrm's comment: "Moxfield matches on header names (order-independent); Edition is the lowercased set code". Moxfield's own help page is a JS app and was not fetched: header is VERIFIED-2nd. Whether Moxfield's own *export* uses exactly this header: UNVERIFIED.

**(F9) Archidekt collection CSV** (egrm/mtgacollect):

```csv
Quantity,Name,Edition Code,Collector Number,Condition,Language,Foil
4,"Momo, Friendly Flier",TLA,29,Near Mint,English,
```
VERIFIED-2nd (tool source, not Archidekt docs).

**(F10) Arena text** (the format the app accepts today; also emitted by egrm, MartoEporedia, zetsumei8):

```text
4 Momo, Friendly Flier (TLA) 29
1 Abrade (FDN) 188
```

**(F11) Untapped profile** via the third-party script: `collection_cards.txt` (names only) and `cards_with_quantity.txt` (`1 Accorder's Shield`), quantities summed by titleId.

Not available: any export from Wizards, Untapped (documented), 17Lands, or MTGGoldfish. Moxfield/Archidekt/AetherHub have no Arena sync of their own; users get there by importing one of the files above. (AetherHub sync through MTGA Assistant: UNVERIFIED.)

---

## 3. Card identity mapping (grpId to name to Scryfall oracle id)

### 3.1 Ground truth: the client card database

**VERIFIED** by downloading it from Wizards' public CDN and opening it with Python `sqlite3`.

Download chain (same one mtgatool-metadata uses, `src/manifest-parser.ts`, `requestManifestData.ts`):

```text
GET https://mtgarena.downloads.wizards.com/Live/Windows64/version           -> {"Versions":{"0.1.14672.1335447":"10/22/26"}, ...}
GET https://assets.mtgarena.wizards.com/External_14672_1335447.mtga         -> 905ae7634f1b78b211bf95df06fced88   (manifest id, text)
GET https://assets.mtgarena.wizards.com/Manifest_905ae7....mtga             -> gzip JSON, {"Assets":[28,604 entries]}
    entry: {"Name":"Raw_CardDatabase_75c4560260d0d2d9ed6fe3014d5d8410.mtga","AssetType":"Raw","Length":266756096,"CompressedLength":73089319,"wrapper":"gz", ...}
GET https://assets.mtgarena.wizards.com/Raw_CardDatabase_75c4....mtga.gz    -> 73 MB gzip -> 267 MB SQLite 3
```

On a player's PC the same file is `<install>\MTGA_Data\Downloads\Raw\Raw_CardDatabase_<hash>.mtga` (default install `C:\Program Files\Wizards of the Coast\MTGA\`; Steam `...\steamapps\common\MTGA\MTGA_Data\Downloads\Raw\`). VERIFIED-2nd from MTGA_Draft_17Lands constants and exporter READMEs.

Schema (table, rows, columns), data version `2026.65.0.236`:

```text
Cards (27,724): GrpId, ArtId, ArtPath, TitleId, AltTitleId, InterchangeableTitleId, FlavorTextId, ReminderTextId, TypeTextId, SubtypeTextId,
   ArtistCredit, ArtSize, Rarity, ExpansionCode, DigitalReleaseSet, IsToken, IsPrimaryCard, IsDigitalOnly, IsRebalanced, RebalancedCardGrpId,
   DefunctRebalancedCardGrpId, AlternateDeckLimit, CollectorNumber, CollectorMax, CollectorSuffix, DraftContent, UsesSideboard, OldSchoolManaText,
   LinkedFaceType, RawFrameDetail, Watermark, TextChangeData, Power, Toughness, Colors, ColorIdentity, FrameColors, IndicatorColors, Types, Subtypes,
   Supertypes, AbilityIds, HiddenAbilityIds, LinkedFaceGrpIds, LinkedAbilityTemplateCardGrpIds, AbilityIdToLinkedTokenGrpId,
   AbilityIdToLinkedConjurations, KnownSupportedStyles, AdditionalFrameDetails, ExtraFrameDetails, Tags, PromoLabel, Order_* (8 columns)
Localizations_enUS (113,321): LocId, Formatted, Loc      (also _deDE _esES _frFR _itIT _jaJP _koKR _ptBR _phyrexian)
Localizations (69,079): LocId                             (now only an id list; text moved to the per-language tables)
Enums (823): Type, Value, LocId                           (types: CardColor, CardType, Color, CounterType, MatchState, Phase, Step, SubType, SuperType)
Abilities (22,120), AltPrintings (4,132: AltGrpId, IsAltArt, SkinCode), AltToBasePrintings (5,587: BaseGrpId, AltGrpId), Prompts (3,558), Versions (2)
```

Name lookup: `SELECT c.GrpId, l.Loc FROM Cards c JOIN Localizations_enUS l ON l.LocId = c.TitleId` and take the row with the lowest `Formatted` (0, 1 and 2 exist; several rows per LocId).

Facts measured from this file:

- 26,382 non-token rows. 20,614 have `IsPrimaryCard = 1`; these have 16,521 distinct titles. 5,768 are non-primary: 4,125 are alternate printings/styles listed in the Alt tables, 359 are rebalanced copies, the rest are back faces and split halves (e.g. `Dawn`, `Commit`).
- `Rarity` integers: 0 token, 1 "land" rarity (basic lands plus some common dual lands such as Bloodfell Caves), 2 common, 3 uncommon, 4 rare, 5 mythic. There is no Rarity enum table; the mapping is inferred from known cards and from 17Lands: over the 26,902 shared ids, 24,303 pair common/uncommon/rare/mythic with 2/3/4/5, 1,285 pair "token" with 0, 1,135 pair "basic" with 1, 176 pair "common" with 1, and 3 disagree.
- Split and aftermath titles use three slashes: `Consign /// Oblivion`. Normalise to ` // `.
- `Max(GrpId) = 109,591`.
- Whether a memory dump of the collection contains only primary grpIds, or also style and rebalanced ids: **UNVERIFIED**. NthPhantom10's changelog mentions merging duplicate rows and normalising `A-` names, which suggests non-primary ids do occur.

### 3.2 Coverage of each mapping source against the 20,614 primary grpIds

| Source | Covered | Status |
| --- | --- | --- |
| Scryfall `arena_id` (bulk `default_cards`) | 18,814 = **91.3%** (75.1% of all 26,382 non-token ids) | VERIFIED |
| MTGJSON `identifiers.mtgArenaId` | Same gaps as Scryfall in the 4 set files sampled: FDN 532 of 574 Arena-available cards (Scryfall: also 532 of 574), SOS 317 of 318, **FRA 0 of 327, YFRA 0 of 33**. It is not an independent source for new sets | VERIFIED for those 4 sets; full-file coverage UNVERIFIED |
| 17Lands `cards.csv` | 20,154 = **97.8%** | VERIFIED |
| Untapped `cards.json` | 20,614 = **100%** | VERIFIED |
| Client card DB | 100% by definition | VERIFIED |

Scryfall specifics (VERIFIED from the bulk file):

- 21,887 printings have `games` containing `arena`; 19,830 of them have an `arena_id` (90.6%); 2,057 do not. 19,808 distinct ids (22 ids appear on two card objects). No card has an `arena_id` without `arena` in `games`. Highest id 108,028.
- By oracle id: 16,552 oracle ids are on Arena; 15,440 (93.3%) have at least one printing with an `arena_id`.
- Gaps are concentrated in: the newest sets (**Reality Fracture `fra`, released 2026-10-02: 306 of 306 missing five weeks after release**; Star Trek `trk`, releasing 2026-11-13: 581 of 581), **Alchemy sets** (`yfra` 31/31, `ysos` 32/32, `yecl` 33/33, `yeoe` 41/41, `ytdm` 30/30, `ydft` 31/31, `yotj` 30/30, `ylci` 31/31, `yone` 31/31, `ybro` 30/31), bonus sheets and anthologies (`spg` 75/135, `dmu` 103/389, `snc` 72/433, `aa1`-`aa4` all, `fic`, `tle` 40/277, `fdn` 42/574).
- `GET https://api.scryfall.com/cards/arena/73208` returns Luminarch Aspirant (ZNR 24). `/cards/arena/81079` (A-Luminarch Aspirant), `/cards/arena/109591` (newest Alchemy card) and `/cards/arena/106803` (Star Trek) return 404.
- **Rebalanced cards are gone from Scryfall**: zero Arena card objects with an `A-` name remain in `default_cards` (the only `A-` name is the paper card "A-Town"). This follows Wizards reverting all rebalanced tabletop cards on 2026-09-22 (section 4).
- `POST /cards/collection` does not accept `arena_id`. Accepted keys: `id, mtgo_id, multiverse_id, oracle_id, illustration_id, name, set, collector_number`; max 75 identifiers per request; rate limit 2/second. https://scryfall.com/docs/api/cards/collection
- Scryfall docs on the field: "This card's Arena ID, if any. A large percentage of cards are not available on Arena and do not have this ID." https://scryfall.com/docs/api/cards
- Bulk files are now gzipped JSONL only. The `/bulk-data` response carries `jsonl_download_uri` and `compressed_size`; there is no `download_uri`. "Each bulk file is a gzipped JSONL (JSON Lines) archive". https://scryfall.com/docs/api/bulk-data (The app has no reference to `download_uri`, `bulk-data` or `arena_id` today, so nothing breaks.)

17Lands `cards.csv` (VERIFIED by curl):

```text
HTTP/1.1 200 OK   Last-Modified: Fri, 16 Oct 2026 12:23:32 GMT   Content-Length: 1744544   Content-Type: text/csv
id,expansion,name,rarity,color_identity,mana_value,types,is_booster
65591,HOU,Ammit Eternal,rare,B,3,Creature - Zombie Crocodile Demon,True
65633,HOU,Torment of Scarabs,uncommon,B,4,Enchantment - Aura Curse,True
32925,M10,Merfolk Looter,common,U,2,Creature - Merfolk Rogue,True
77521,STA,Lightning Bolt,rare,R,1,Instant,True
107829,Y26,Tropical Island,rare,GU,0,Land - Forest Island,False
```
26,907 data rows (26,908 lines). `rarity` values: common, uncommon, rare, mythic, basic, token. It includes Reality Fracture (432 rows) and Alchemy `Y26` (265 rows). Its only gaps among primary ids are sets not yet released on its file date: TRK 326, TRC 52, SDS 30, plus about 50 scattered old cards. Names match the client DB except for the `///` spelling (29 rows). Licence/terms of this file: UNVERIFIED.

Untapped `cards.json` (VERIFIED by curl; licence/terms UNVERIFIED, it is an undocumented endpoint):

```json
{"grpid":6873,"titleId":2929,"artId":1837,"set":"MIR","collectorNumber":"210","collectorMax":"350","DigitalReleaseSet":"AA4",
 "castingcost":"o6oGoG","rarity":2,"types":[2],"subtypes":[55],"colors":[5],"colorIdentity":[5],"cmc":8, ...}
```
Names are in `loc_en.json` as `{"id":<titleId>,"text":"..."}`. `rarity` uses the client integers.

### 3.3 Resolution cascade and its measured yield

Measured on all 20,614 primary grpIds (`coverage2.py`; Scryfall index excludes tokens, emblems, art series and memorabilia):

| Step | Resolved | Share |
| --- | --- | --- |
| 1. grpId equals a Scryfall `arena_id` | 18,795 | 91.18% |
| 2. Arena title (strip `A-`, `///` to `//`, accent-fold, lowercase) equals the name, front-face name, `flavor_name` or `printed_name` of exactly one oracle id among Arena-available printings | 1,680 | 8.15% |
| 3. Same, among all Scryfall printings | 134 | 0.65% |
| 4. Scryfall set code + collector number | 3 | 0.01% |
| Unresolved | 2 | 0.01% (Blinding Radiance, Treetop Recluse: new-player-experience cards Scryfall does not carry) |

No title was ambiguous between two oracle ids. So **grpId to oracle id is 99.99% resolvable** when a grpId to name table is available, versus 91% with Scryfall ids alone.

Other mapping notes:

- 37 id matches have different names on the two sides. 29 are the `///` spelling; the rest are New Player Experience cards that reuse a grpId. Trust the Scryfall object when the id matches.
- Arena `ExpansionCode` equals a Scryfall `code` or `arena_code` for 218 of 224 codes (20,020 of 20,614 cards). Exceptions: `Y22`-`Y26` (Alchemy by year; Scryfall uses `ymid`, `yfra`, ...) and `CONF`. Known alias: Arena `DAR` is Scryfall `dom`. So set + collector number is a weak key for Alchemy cards; prefer the name.

---

## 4. Wildcards and rarity

| Claim | Status and source |
| --- | --- |
| A wildcard is "redeemed for another card of the same rarity"; rarities common, uncommon, rare, mythic rare | VERIFIED: https://magic.wizards.com/en/mtgarena/faq |
| Vault: "As you acquire commons and uncommons of which you already own 4 copies, you earn progress to fill your Vault. Once you fill your Vault, you also get wildcards - 3 uncommon, 2 rare, and 1 mythic." | VERIFIED: same FAQ |
| **Craft cost uses the lowest Arena rarity of the name.** "All cards with the same name will now require the same wildcard to craft: the wildcard of the lowest rarity that the card has ever released at on MTG Arena." Example given: Goreclaw, Terror of Qal Sisma (rare in M19, uncommon in Pioneer Masters) costs an uncommon wildcard for any printing. "If a card is ever released at a lower rarity in a future MTG Arena release, each of its printings will then require a lower rarity wildcard to craft." | VERIFIED: "MTG Arena Reprint and Card Style Improvements", Max Manco, 2025-05-05, effective 2025-05-10. https://magic.wizards.com/en/news/mtg-arena/upcoming-improvements-to-reprints |
| **Ownership is by name across printings.** "the number of copies of a card a player can use in their deck is equal to the number of copies of that card that player has collected across all printings." | VERIFIED: same article |
| "once a player has collected four copies of a card, they'll only need to collect a single copy of any new printing to be able to use four copies of that printing" | VERIFIED: same article. Consequence: per-printing counts can sum to more than 4 for one name, so clamp |
| Deck limit data | VERIFIED from the card DB column `AlternateDeckLimit`: 0 for 25,137 non-token rows (default 4); **250** for basics (Plains, Island, Swamp, Mountain, Forest, Wastes and the Snow-Covered versions) and for Rat Colony, Relentless Rats, Persistent Petitioners, Shadowborn Apostle, Dragon's Approach, Sphinx's Approach, Slime Against Humanity, Hare Apparent, Tempest Hawk, Cid, Timeless Artificer; **9** for Nazgul; **7** for Seven Dwarves |
| Basic lands are free and unlimited | UNVERIFIED from an official page. Consistent with: the client DB gives them deck limit 250, and mtgatool, MtgaCollectionAdvisor and the Untapped script all skip basics in exports |
| Singleton and restricted rules are per format | VERIFIED in the log's `GetFormats`: Brawl formats have `RarityPerCardQuotasInternal {..: {"max":1}}` and `commandZoneQuota {"min":1,"max":1}`; Timeless has `individualCardQuotas` with `{"max":1}` for 4 titles |
| Non-craftable printings | VERIFIED that `StartHook.CardMetadataInfo.NonCraftableCardList` exists (43 grpIds). Whether every printing of a name being non-craftable ever blocks crafting: UNVERIFIED |
| **Rebalanced cards**: "On September 22, over 200 rebalanced versions of tabletop Magic cards will be reverted to their original printings across all formats." Digital-only Alchemy cards stay and "We may choose to ban or rebalance digital-only Alchemy cards in the future" | VERIFIED: State of the Formats 2026, Dave Finseth, 2026-09-11. https://magic.wizards.com/en/news/mtg-arena/state-of-the-formats-2026 |
| Rebalanced rows in the client DB | VERIFIED: 359 rows with `IsRebalanced = 1`, all titled `A-<name>`, none primary; `RebalancedCardGrpId` is 0 on every row and `DefunctRebalancedCardGrpId` is set on 718 rows. Treat `A-X` as `X` |
| Whether owning `X` and `A-X` were ever separate collection entries | UNVERIFIED |

Which source gives the Arena rarity per card:

1. Best: client card DB `Cards.Rarity`, minimum over all non-token, non-rebalanced rows sharing the title. 374 of 16,521 primary titles have more than one rarity (141 rare/mythic, 112 common/uncommon, 39 uncommon/rare, 26 uncommon/mythic, 12 common/mythic, 12 common/rare, 32 involving land rarity). Example: Lightning Bolt is uncommon (FCA, MSC), rare (STA) and mythic (TLE).
2. Same integers: Untapped `cards.json` `rarity`. Same information as strings: 17Lands `cards.csv` `rarity` per grpId.
3. Scryfall only: minimum `rarity` over printings with `arena` in `games`. Per printing, Scryfall and Arena rarities agree on 18,680 of 18,696 id-matched non-land printings (16 differ, e.g. Arid Mesa SPG is mythic on Scryfall and rare on Arena). Per name, the Scryfall minimum equals the Arena primary minimum for **16,341 of 16,386 names (99.73%)**; 45 differ (39 where Arena is cheaper, 6 where Scryfall is cheaper, e.g. Lightning Bolt: Scryfall has a common Arena printing, the Arena primary printings bottom out at uncommon). 135 primary Arena titles have no Arena-flagged Scryfall printing at all.
4. Treat land rarity (1) on a non-basic as common. 17Lands labels 176 such rows "common". UNVERIFIED against the client's craft screen.

---

## 5. Legal / terms of service

- **Wizards Terms**, "Last Updated: December 10, 2025", section 2.2 Restrictions. VERIFIED: https://company.wizards.com/en/legal/terms
  - "(i) Data mining: Use any unauthorized means, process, or software that accesses, collects, reads, intercepts, monitors, data scrapes, including without limitation, agents, robots, scripts, or spiders; or mines information ..."
  - "(iii) Unauthorized Connections: ... (d) using third-party programs or tools not expressly authorized by Wizards in any way, for any purpose ..."
  - "(v) Cheating: Creating, offering, using, promoting, distributing, or making available any cheats, bots, hacks, or device, software, code, or program not expressly authorized by Wizards that grants any user an advantage over other players not using such methods;"
- **No published Wizards policy distinguishing log readers from memory readers was found.** The official FAQ has no mention of trackers or third-party tools (VERIFIED: zero hits). The support site blocks automated fetching (HTTP 403). **A written Wizards policy on memory reading: UNVERIFIED, and I believe none is public.**
- What exists on the log side: the client option is literally named "Detailed Logs (Plugin Support)" (VERIFIED-2nd), i.e. Wizards ships a switch intended for third-party tools.
- Often-quoted line, attributed to Wizards community manager Nicholas Wolfram: trackers are fine "as long as it doesn't interfere in-game and doesn't scrape any information you wouldn't be able to get yourself." Found only on mtg.wiki without a link to the original. **UNVERIFIED** as a primary quote. https://mtg.wiki/page/Magic:_The_Gathering_Arena/Tracker_Apps
- Third-party claims, not Wizards statements: Arena Tutor ("Third-party apps are allowed by Wizards of the Coast as long as they don't break the MTGA terms of service"); Untapped ("the log file is generated freely by the game, and will never contain data that your game does not know about").
- Fan Content Policy is what 17Lands cites for its client: https://company.wizards.com/fancontentpolicy (not fetched today).

Honest wording for the app: "Arena has no collection export. Wildcards and decks come from Arena's own log file, which the game writes when you enable Detailed Logs (Plugin Support). The card collection is not in that file. Community tools obtain it by reading the running game's memory, which Wizards has not expressly authorised and which the Terms' wording on third-party programs could cover. We do not run such a tool for you or handle your credentials; you choose a tool, run it yourself, and paste its output."

Downloading the card DB from `assets.mtgarena.wizards.com` is also undocumented access to a Wizards service. GPL tools do it daily (mtgatool-metadata), but it is not expressly authorised either.

---

## 6. Constructed formats on Arena, late 2026

Sources: official FAQ (VERIFIED), State of the Formats 2026 of 2026-09-11 (VERIFIED), client `GetFormats` of 2026-05-01 (VERIFIED), Scryfall bulk of 2026-11-09 (VERIFIED), Untapped site navigation (VERIFIED-2nd).

| Arena UI name | Internal name in log (May 2026) | Scryfall `legalities` key | Notes |
| --- | --- | --- | --- |
| Standard (Bo1 ranked/play) | `Standard`; events `Ladder`, `Play` | `standard` | "nearly 50% of all Constructed queue play" |
| Traditional Standard (Bo3) | `TraditionalStandard`; `Traditional_Ladder`, `Constructed_BestOf3` | `standard` | separate ban list id in client (one fewer ban in May) |
| Alchemy | `Alchemy`, `TraditionalAlchemy`; `Alchemy_Ladder`, `Alchemy_Play` | `alchemy` | **Being retired.** "With the next Standard rotation in early 2027, we're retiring the Alchemy format." "February 2, 2027: The Alchemy format will be removed from MTG Arena". Alchemy: Reality Fracture (2026-10-13) is the last release. Digital-only cards "will remain on MTG Arena and legal in Historic, Timeless, Brawl, and Competitive Brawl" |
| Historic | `Historic`, `TraditionalHistoric` | `historic` | Sept 2026 bans: Galvanic Discharge, Guide of Souls, Nadu, Sorin Imperious Bloodlord, The One Ring |
| Timeless | `Timeless`, `TraditionalTimeless` | `timeless` (uses `restricted`: 65 printings) | restricted list in client as `individualCardQuotas` |
| Pioneer | **`Explorer`, `TraditionalExplorer`; `Explorer_Ladder`, `Explorer_Play`** | `pioneer` (Scryfall no longer has an `explorer` key) | "'Explorer' was renamed Pioneer when we achieved parity with competitive tabletop Pioneer"; rename announced May 2025. The log still said Explorer in May 2026. Whether the internal name has since changed: UNVERIFIED |
| Brawl (100-card, 1v1) | `HistoricBrawl` (99 + 1 commander); `Play_Brawl` | `brawl` (16,347 Arena oracle ids legal) | FAQ: "play 1v1 games on MTG Arena" |
| Standard Brawl (60-card) | `Brawl` (59 + 1 commander, Standard `legalSets`) | `standardbrawl` (5,475) | named in the 2026 article's play-rate paragraph |
| Competitive Brawl | not in the May 2026 format list | `competitivebrawl` | "We now have a third distinct Brawl format with its own banned card list and metagame." Launch date UNVERIFIED |
| Gladiator (community, direct challenge) | `Gladiator` (100+ singleton) | `gladiator` | |
| Pauper / Historic Pauper | `Pauper`, `HistoricPauper` (event formats) | none Arena-specific (`pauper` is the paper format) | event-only per the 2026 article summary |
| Commander (4-player) | absent | `commander` is paper Commander | **Not on Arena.** The FAQ describes Brawl as the Commander-like 1v1 mode and the 2026 formats article does not mention Commander. No announcement found; absence of a later announcement is UNVERIFIED |

Full Scryfall key list today: `alchemy, brawl, commander, competitivebrawl, duel, future, gladiator, historic, legacy, modern, oathbreaker, oldschool, pauper, paupercommander, penny, pioneer, predh, premodern, standard, standardbrawl, timeless, tlr, vintage`. No `explorer`, no `historicbrawl`. What `tlr` denotes: UNVERIFIED.

Arena-available oracle ids legal per key: standard 5,460; alchemy 4,223; pioneer 13,096; historic 16,300; timeless 16,384; brawl 16,347; standardbrawl 5,475; gladiator 16,377.

Standard-legal sets per the client on 2026-05-01: WOE, LCI, MKM, OTJ, BIG, BLB, DSK, FDN, DFT, TDM, FIN, EOE, OM1, TLA, ECL, TMT, SOS. Later sets (Marvel Super Heroes, The Hobbit, Reality Fracture, Star Trek) are not in that snapshot; use Scryfall `legalities.standard` for the current list.

---

## 7. Recommended import design for the public web app

### 7.1 Principles

- One internal model: `{ cards: Map<oracle_id, count>, wildcards?: {common, uncommon, rare, mythic}, source, capturedAt }`. Every input format is an adapter into it.
- Aggregate by oracle id (name), sum across printings, clamp to the deck limit (4, or the `AlternateDeckLimit` cases; treat basics as unlimited). This matches Arena's own rule since 2025-05-10.
- Never accept credentials, never fetch from another site on the user's behalf, never run or bundle a memory reader. The user runs a tool they chose and gives us its output.
- Parse Player.log in the browser and send only the extracted fields. The raw file contains account identifiers.

### 7.2 Inputs to accept, ranked

**1. grpId JSON (paste or upload).** Highest fidelity, lowest parsing risk. Detect by first non-space character `{` or `[`.

Accept all of these shapes (they are the real outputs of the maintained tools):

```text
{"cards":[{"grpId":N,"owned":N}], "elapsedTime":N}                    mtga-tracker-daemon /cards
{"count":N,"cards":[{"grpId":N,"qty":N}]}                             mtga-reader
{"cards":[{"grpid":N,"quantity":N}]}                                  Untapped API shape
{"schemaVersion":1,"cards":[{"arenaId":N,"quantity":N}]}              MTGA Collection Reader manual snapshot
[{"grpId":N,"owned":N}]   and   {"<grpId>":N, ...}                    bare variants
{"wildcards":{...}|null,"cards":[{"count":N,"name":"..","arena_ids":[N]}]}        MTGA Deck Advisor
{"cards":[{"count":N,"name":"..","set":"..","collector_number":"..","arena_ids":[N]}]}   NthPhantom10
```
Parsing: for each entry take id from `grpId | grpid | arenaId | arena_id | id`, count from `owned | qty | quantity | count`. If the entry has `arena_ids` and `name`, the count belongs to the name: resolve by name and do not multiply by the number of ids. Ignore counts <= 0. Reject ids outside 1..200,000 and counts outside 1..400 (basics can be large; egrm uses 1..400 as its plausible range).

**2. Arena-style text list (paste).** Already supported; extend it. One regex covers Arena export, zetsumei8, egrm, MartoEporedia, Deck Advisor, the Untapped script and NthPhantom10's txt:

```text
^\s*(\d+)(?:x(?=\s))?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+#?([\w\-★]+))?)?(?:\s+\[[a-z ]+\])?\s*$
```
Groups: count, name, set, collector number. Tested today against 19 sample lines (Arena export, `4x Name (SET) #24 [rare]`, names with commas, `//` and `///`, `99b` numbers, names beginning with x, header lines rejected).

Skip section headers (`Deck`, `Sideboard`, `Commander`, `Companion`, `About`, `Name ...`), blank lines, and NthPhantom10's five header lines (`MTGA Collection Export`, `Exported:`, `Unique cards:`, `Total cards:`, `====`) and indented description lines. Resolve by name first; use set + number only to disambiguate.

**3. CSV (upload).** Sniff the delimiter (`;` for MTG Arena Tool, otherwise `,`), read the header case-insensitively, and map columns:

```text
count  <- Count | Quantity
name   <- Name | Card | Card Name
set    <- Edition | Edition Code | Set
number <- Collector Number | Card Number | CollectorNumber
```
That covers Moxfield (7, 8 and 13 column variants), Archidekt, Deckbox, MTGGoldfish, Cardsphere, MartoEporedia and MTG Arena Tool. Use a real CSV parser: names contain commas (`"Momo, Friendly Flier"`). Ignore `Foil`, `Condition`, `Language`. Warn that MTG Arena Tool's file omits basics and, by default, digital-only cards.

**4. Player.log (drag and drop, parsed client-side).** Gives wildcards, gems, gold, vault and saved decks. Does not give the collection. Algorithm:

```text
stream the file line by line (it can be 2 to 46 MB)
if no line "DETAILED LOGS: ENABLED" was seen -> tell the user to enable Options > Account > Detailed Logs (Plugin Support) and restart Arena
remember the JSON line that follows the LAST line matching /^<== StartHook\(/
also remember the last InventoryInfo found after any "<== EventJoin(" / "<== EventClaimPrize(" and the last DTO_InventoryInfo
inv = latest of those
wildcards = { common: inv.WildCardCommons ?? 0, uncommon: inv.WildCardUnCommons ?? 0, rare: inv.WildCardRares ?? 0, mythic: inv.WildCardMythics ?? 0 }
vaultPercent = (inv.TotalVaultProgress ?? 0) / 10 ; gems = inv.Gems ; gold = inv.Gold
decks = join (startHook.DeckSummaries ?? startHook.DeckSummariesV2) with startHook.Decks[DeckId]; cards are {cardId: grpId, quantity}
```
Also offer four manual wildcard number inputs; that is the zero-tool fallback and matches what the game shows on hover.

Not recommended as inputs: an Untapped profile URL (undocumented API, server-side scraping of a third party) and raw Player.log upload to the server.

### 7.3 Resolving to cards (server side)

Build one lookup table on a schedule (daily, and on demand after a set release):

```text
arena_card: grpId -> { title, titleId, expansionCode, collectorNumber, rarityInt, isPrimary, isToken, isRebalanced, alternateDeckLimit }
```
Source options, in order of preference:

1. **17Lands `cards.csv`**: one small public file, `id, expansion, name, rarity`; 97.8% of primary ids and current with the newest released set. Lacks deck limits and the primary flag. Terms UNVERIFIED.
2. **The client card DB from the Wizards CDN** (section 3.1): 100% and has every column, 73 MB download, needs SQLite on the server, undocumented access.
3. **Untapped `cards.json` + `loc_en.json`**: 100%, 3 MB, undocumented third-party endpoint.

Then per collection entry:

```text
1. grpId -> Scryfall card by arena_id                                  (91.2%)
2. else grpId -> title from arena_card -> normalise -> Scryfall name   (to 99.99%)
     normalise: strip leading "A-", replace " /// " with " // ", NFKD accent-fold, lowercase
     index Scryfall by name, front-face name, flavor_name, printed_name; skip layouts token/emblem/art_series and set_type memorabilia;
     prefer printings whose games include "arena"
3. else Scryfall set + collector_number (try Arena code as Scryfall code, then as arena_code; DAR -> dom)
4. else keep as "unrecognised (grpId N)" and show the count of such rows
skip rows where arena_card.isToken; map rebalanced rows to their base name
sum per oracle_id, then clamp to the deck limit
```
If the input already carries names (formats 2 and 3, Deck Advisor JSON, the helper output below), step 2 needs no grpId table at all.

Craft cost per missing card: lowest rarity over all Arena printings of the name. Take it from the `arena_card` table (min `rarityInt` among non-token, non-rebalanced rows with the same title; treat 1 on a non-basic as common). Fallback: min Scryfall `rarity` over printings with `arena` in `games` (agrees for 99.73% of names). Basics cost nothing.

Legality: Scryfall `legalities` keys from section 6. Hide or label Alchemy as ending 2027-02-02.

### 7.4 Optional local helper (Windows, the owner's PC)

A single PowerShell script (no install, readable in one screen, no admin needed for the log part) that writes one file, e.g. `arena-collection.json`:

```json
{"schema":"mtg-deck-builder/arena-import@1","capturedAt":"2026-11-09T21:00:00Z","client":"2026.65...",
 "detailedLogs":true,
 "inventory":{"wildcards":{"common":557,"uncommon":801,"rare":104,"mythic":84},"gems":14100,"gold":17150,"vaultPercent":4.3},
 "decks":[{"id":"...","name":"...","format":"Standard","main":[{"grpId":1,"n":4}],"sideboard":[],"commandZone":[],"companions":[]}],
 "collection":{"source":"mtga-tracker-daemon 1.0.12.0","cards":[{"grpId":96269,"n":4,"title":"Lightning Bolt","set":"FCA"}]}}
```
What it does:

1. Reads `%USERPROFILE%\AppData\LocalLow\Wizards Of The Coast\MTGA\Player.log`, falling back to `Player-prev.log`, and extracts the last StartHook as in 7.2 item 4. Checks the `DETAILED LOGS:` line.
2. If something answers `GET http://localhost:6842/status` with `isRunning: true`, calls `/cards`, and `/allCards` to attach `title` and `expansionCode` to each owned grpId. With titles attached the server can resolve brand-new sets by name on day one.
3. If no daemon is running, writes the file without `collection` and says so. It does not download or start the daemon itself.
4. Never sends anything anywhere. The user uploads the file.

Realistic limits:

- Collection needs a memory reader the user installed, Arena running and logged in at the Home screen, usually an elevated prompt, and a tool version that matches the current client. Client updates break readers until they are patched (daemon history: fixes in 2024-03, 2024-09, 2025-09, 2026-06). Antivirus may quarantine it (issue #21, unverified report).
- The daemon has no macOS release. macOS users need MTG Arena Tool, mtga-reader or a heuristic scanner.
- Wildcards are a snapshot from the last login (or last event join) in that log file. The log is replaced at every client start; only one previous file is kept.
- Mobile-only players have no path at all: no log access, no memory access. They get the manual list and manual wildcard inputs.
- The daemon's `/inventory` has no wildcards, so the log step is required for them.
- Skipping the helper entirely is fine: "open `http://localhost:6842/cards`, select all, copy, paste" is input format 1, and Player.log drag-and-drop is input format 4.

Calling `http://localhost:6842` directly from the public HTTPS page is technically invited by the daemon's `Access-Control-Allow-Origin: *`, but browser handling of public-site-to-loopback requests (mixed content, local network permission prompts) is **UNVERIFIED**. Treat it as a possible later enhancement, not the main path.

### 7.5 What strangers will actually do

| User | Path |
| --- | --- |
| Uses MTG Arena Tool, MTGA Deck Advisor or MTGA Collection Reader already | Export, upload the file (formats 1 to 3) |
| Uses Untapped only | No documented export. Suggest one of the open-source exporters |
| Willing to run one tool | NthPhantom10 exporter (single exe, 38 stars, MIT) or the daemon, then paste |
| Not willing to run anything | Paste decklists they own plus type four wildcard numbers; the app then answers "what can I build from these lists" rather than "from my whole collection" |

---

## 8. Could not verify

1. That mtga-tracker-daemon 1.0.12.0 reads the collection on the client released 2026-10-22. No Windows machine with Arena was available.
2. Player.log structure after 2026-05-01 (corpus end). Only indirect evidence from tools maintained through November.
3. How Untapped.gg Companion obtains the collection, and that it has no export. Closed source; its help centre only describes log reading.
4. Everything about MTGA Assistant (aetherhub.com returns 403), Lotus Tracker, and whether 17lands.com still has a collection page.
5. Any written Wizards policy on memory-reading tools, and the primary source of the Nicholas Wolfram quote. The Wizards support site returns 403 to automated fetches, so the official "Detailed Logs" article was not read either.
6. Whether memory dumps include non-primary grpIds (styles, `A-` rebalanced copies) and whether those ever counted separately.
7. That basic lands are formally free, and that land-rarity non-basics craft as commons.
8. Whether pack openings and wildcard crafts write `GrantedCards` deltas to the log.
9. Moxfield's and Archidekt's own documentation of their CSV formats (JS sites); the headers come from two independent exporter implementations.
10. Licence or terms for 17Lands `cards.csv` and Untapped `cards.json`.
11. MTGJSON full-file `mtgArenaId` coverage (four set files sampled; same gaps as Scryfall).
12. Meaning of Scryfall's `tlr` legality key; launch date of Competitive Brawl; whether the client's internal `Explorer` name has changed since May 2026.
13. Browser behaviour for a public HTTPS page calling the daemon on localhost.
14. Steam-on-Windows log path (assumed identical to the standalone client).
