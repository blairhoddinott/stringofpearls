# Representative flight schedule data

String of Pearls ships a deterministic representative 24-hour traffic profile for every currently selectable airport. Schedule assets are independent files under `assets/schedules/`; raw source files remain outside the repository.

## Coverage

The reviewed corpus contains:

- 64 selectable airports and 64 catalogued schedules;
- 47,089 representative movements;
- 35 U.S. profiles containing 23,976 movements derived from BTS On-Time and T-100 evidence;
- 29 profiles containing 23,113 movements compiled from the airport's authored spawn patterns; and
- one IANA timezone policy entry for every selectable airport.

`tools/schedules/schedule-corpus-manifest.json` records every airport, profile tier, movement count, and normalized file SHA-256. `tools/schedules/schedule-corpus.test.js` recalculates those facts from the published files. The manifest SHA-256 is:

```text
b4ee27d858070eae314cb438f80911392e2ab6e33601034d77b5695ea3369be8
```

KSEA remains byte-identical to the reviewed reference profile:

```text
84bcc5e2b00e9bd3a06923044e7cecc5997fed8ac7f218f2b940d5022624faaa
```

It contains 1,208 movements: 604 arrivals, 604 departures, 1,038 exact On-Time records, and 170 T-100-derived additions.

Disabled airport assets are not silently assigned schedules. Adding or enabling an airport requires an explicit reviewed source tier, timezone, schedule, and catalog entry.

## Source tiers

### BTS-backed U.S. profiles

The 35 airports listed in `tools/schedules/bts-airports.json` combine two U.S. Bureau of Transportation Statistics datasets:

1. **Reporting Carrier On-Time Performance** supplies exact domestic scheduled movements, local scheduled times, routes, reporting-carrier identity, and flight numbers for Wednesday, 15 July 2026.[2]
2. **T-100 Segment (All Carriers)** supplies May 2026 monthly non-stop segment aggregates, including carrier, route, service class, aircraft type, and performed departures.[1][3]

T-100 does not provide individual timestamps or flight numbers. T-100 additions are therefore aggregate-derived representative traffic, never purported historical flights. The importer uses reporting-carrier rather than marketing-carrier records and aggregates T-100 equipment rows by operating identity to avoid codeshare and physical-movement inflation.

BTS is a U.S. federal agency. These normalized assets contain factual federal transportation records and are distributed on the basis that U.S. government works are not subject to domestic copyright under 17 U.S.C. § 105.[5] The downloaded archives and extracted CSV files are not redistributed.

### Airport-authored profiles

The other 29 selectable airports use `schemaVersion: 2` and `profileType: "authored"`. Their traffic is compiled from the airport asset's reviewed spawn-pattern rates and operating details under the repository's MIT licence.

These schedules are realistic deterministic profiles, not historical records. Each slot stores local time, category, and a stable `spawnPatternKey`. Runtime resolution binds that key back to the exact authored spawn pattern, preserving its route, position, geometry, altitude, commands, airlines, and generated identity behavior. No airline, flight number, aircraft, or remote endpoint is fabricated merely to imitate a sourced record.

Fractional rates are converted to daily movement counts at category level using largest-remainder allocation. This preserves the category's rounded 24-hour volume and allows small positive patterns to participate when the available integer budget permits it.

## Source snapshots

### On-Time snapshot

- Dataset documentation: <https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EFD>
- Archive: <https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_2026_7.zip>
- Retrieval date: 26 September 2026
- Archive SHA-256: `61d657eb17f5b6f800ed2f05262a2223c5edf66fe7d9cfb3598c6664a34ed0b6`
- Extracted CSV SHA-256: `8bfb524f10ae2c30048e91f4cf1e4910dadca217eb68b9b12b5ac16ab3bf4c34`

### T-100 snapshot

- Database documentation: <https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EEE>
- Field documentation and download form: <https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FMG>
- Selected table and period: `T-100 Segment (All Carriers)`, May 2026
- Archive filename: `T_T100_SEGMENT_ALL_CARRIER_20260927_060303.zip`
- Retrieval date: 27 September 2026
- Archive SHA-256: `5346fd621d19f5c22876a7bcda369b1055c5012ae4215c207e8432f00d279f17`
- Extracted CSV SHA-256: `7cc7ff53beac5d66d4b5142859770b2ab2b8daf6e3dba90899059dd80721377b`

### Airport-code snapshot

BTS airport codes are resolved through the OurAirports airport dataset.[4]

- Retrieved: 26 September 2026
- Extracted `airports.csv` SHA-256: `37b78b5514711a70fb50e0f4c60b809b30988a84e37b0d814e20ca5591177cc1`
- Redistribution basis: OurAirports dedicates its downloadable data to the public domain and requests attribution.

`tools/schedules/airport-code-aliases.json` contains reviewed historical aliases. In this snapshot Palm Beach's record retains ICAO `KPBI` while its current IATA field is `DJT`; the explicit `PBI -> KPBI` alias preserves BTS's historical endpoint rather than inventing a prefix rule.

The importer fails on missing, malformed, or ambiguous positive source codes. One explicit exception is recorded in `tools/schedules/t100-excluded-airport-codes.json`: the selected May corpus contains two performed FedEx departures from FAA-local identifier `T82` to AUS. OurAirports resolves that location to `KT82`, which is not a four-letter ICAO location indicator accepted by the schedule contract. Those two aggregate movements are excluded before allocation rather than assigned a fabricated endpoint.

Carrier identifiers follow the same fail-closed rule. `tools/schedules/t100-excluded-carrier-codes.json` records one reviewed exception: the selected corpus contains seven aggregate PDX movements for Air Excursions under BTS code `X4`, but current FAA data assigns the previously proposed ICAO `AEX` to unrelated operator Aerohelix and provides no current three-letter ICAO designator for Air Excursions. Those rows are excluded before allocation rather than attributed to the wrong airline.

## Normalization and reproducibility

The offline pipeline is dependency-free and provider-neutral after normalization:

```text
tools/schedules/import-bts-schedule.js
tools/schedules/enrich-bts-schedule-with-t100.js
tools/schedules/generate-bts-schedule-corpus.js
tools/schedules/compile-authored-schedule.js
tools/schedules/generate-authored-schedule-corpus.js
```

The BTS batch generator parses each large On-Time snapshot once, selects records touching any configured BTS airport on the representative day, and then normalizes each airport. It strictly parses CSV quoting, row widths, duplicate headers, discriminator values, and integer-valued decimal measures. Every positive in-scope carrier and endpoint must resolve before allocation, including records whose daily quota would round to zero.

The enrichment algorithm:

1. preserves every exact On-Time record and its identity;
2. uses service classes `F` and `G` with positive performed departures;
3. ignores nonphysical same-airport aggregates;
4. identifies carrier/category coverage absent from the exact baseline;
5. treats the rounded T-100 total as a cap rather than manufacturing volume to fill it;
6. allocates carrier and route quotas by performed-departure weight;
7. chooses a feasible direction split considering both the baseline and carriers that can actually supply each direction;
8. distributes additions over the baseline time distribution with deterministic hash ordering and bounded offsets;
9. creates stable IDs and deterministic flight numbers through reviewed carrier and airport mappings; and
10. validates the baseline and completed document through the real schedule contract before atomic publication.

Run the BTS corpus generator with the raw snapshots in scratch storage:

```bash
node tools/schedules/generate-bts-schedule-corpus.js \
  --bts /path/to/bts-ontime-2026-07.csv \
  --t100 /path/to/t100-all-carriers-2026-05.csv \
  --ourairports /path/to/ourairports-airports.csv \
  --output-dir /path/to/bts-output \
  --sample-date 2026-07-15 \
  --retrieved-at 2026-09-27 \
  --ontime-source-url 'https://transtats.bts.gov/DL_SelectFields.aspx?QO_fu146_anzr=Nv4+Pn44vr45&gnoyr_VQ=FMG' \
  --t100-source-url 'https://transtats.bts.gov/DL_SelectFields.aspx?QO_fu146_anzr=Nv4+Pn44vr45&gnoyr_VQ=FMG' \
  --t100-year 2026 \
  --t100-month 5
```

Compile the authored tier with:

```bash
node tools/schedules/generate-authored-schedule-corpus.js \
  --assets-root assets \
  --output-dir /path/to/authored-output \
  --sample-date 2026-07-15 \
  --retrieved-at 2026-09-27
```

Publication output is atomic. Raw inputs, OpenFlights analysis data, and intermediate files stay outside Git. Only reviewed mappings, tools, normalized assets, tests, and provenance are committed. Run `npm run schedule:test`, `npm run validator:test`, `npm run validate:assets`, and `npm run build:test` after regeneration.

## Runtime behavior

Schedule assets are loaded separately from airport manifests and composed with each selected airport's authored spawn patterns:

- local `HH:mm` slots use the schedule's IANA timezone, not the player's computer timezone;
- the representative profile repeats every 24 simulation hours;
- 25%, 50%, 75%, and 100% select deterministic nested subsets, and every new shift defaults to 100%;
- sourced slots preserve complete usable identity or fall back atomically to a generated compatible identity in the same slot;
- authored slots resolve only their exact stable spawn-pattern key;
- category and selected-sector compatibility are required before timers are armed;
- candidate selection is independent of transient runtime IDs and input ordering;
- `SpawnScheduler` remains authoritative for pre-spawn, pause, timewarp, reset, callback re-arming, teardown, and T−5 cutoff behavior; and
- legacy random and schedule-backed generators never run in parallel.

## Schedule contracts

Every schedule must conform to `assets/schedules/schedule.schema.json` and be listed exactly once in `assets/schedules/scheduleLoadList.json`.

Both versions require `airportIcao`, `timezone`, `sampleDate`, complete source provenance, canonical flight ordering, non-empty flights, unique stable IDs, strict types, and no unknown properties.

- **Version 1, sourced:** each movement includes category, local time, airline ICAO, flight number, origin, destination, and optional aircraft type. The schedule airport must be the correct endpoint and routes cannot be self-referential.
- **Version 2, authored:** the document declares `profileType: "authored"`; each movement includes category, local time, and `spawnPatternKey`. That key must resolve uniquely to a category-compatible pattern in the corresponding airport asset.

Nested files, uncatalogued assets, malformed metadata, unresolved airports or airlines, duplicate IDs, hash drift, missing authored keys, and schema drift fail validation.

## Limitations

These are fixed representative profiles, not literal replays of every operation on one calendar date.

- BTS On-Time omits general aviation and operators outside its reporting scope.
- T-100 additions use aggregate carrier, route, category, and frequency evidence, but synthesized local times and flight numbers.
- Existing exact-baseline carriers are not independently topped up where reporting and operating identities may overlap.
- Authored-tier movements reflect simulator authors' reviewed rates and patterns rather than historical observations.
- 100% means the complete normalized reference profile, not all real-world airport operations.
- Military, general aviation, cancellations, delays, gates, tail numbers, runway assignments, seasonality, weekday/weekend variation, holidays, and user-selected historical dates are not modeled.

## Sources

[1] https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EEE — BTS T-100 Segment (All Carriers)

[2] https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EFD — BTS Reporting Carrier On-Time Performance

[3] https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FMG — BTS T-100 field definitions

[4] https://ourairports.com/data — OurAirports open airport data

[5] https://www.law.cornell.edu/uscode/text/17/105 — 17 U.S.C. § 105
