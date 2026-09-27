# Historical flight schedule data

String of Pearls ships normalized representative-day flight schedules as independent assets under `assets/schedules/`. Raw source files are deliberately not committed.

## KSEA representative day

The initial schedule covers Seattle–Tacoma International Airport (`KSEA`) on Wednesday, 15 July 2026. It contains:

- 1,038 scheduled movements;
- 519 arrivals and 519 departures;
- nine U.S. reporting carriers;
- 80 remote U.S. airports.

The normalized asset is `assets/schedules/ksea.json`. Its SHA-256 is:

```text
1219e8a53efafb06f18396084bc7c47d8fac04975e3ffdcc6383deaaa3cf1933
```

CI verifies this hash and the category and carrier counts. An accidental edit therefore cannot quietly redefine the reviewed representative day.

## Flight source and redistribution basis

Flight identity, route endpoints, and scheduled local times came from the U.S. Department of Transportation Bureau of Transportation Statistics (BTS), Reporting Carrier On-Time Performance dataset:

- Dataset documentation: <https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EFD>
- Data.gov catalog: <https://catalog.data.gov/dataset/bts-flight-data>
- Retrieved archive: <https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_2026_7.zip>
- Retrieval date: 26 September 2026
- Archive SHA-256:
  `61d657eb17f5b6f800ed2f05262a2223c5edf66fe7d9cfb3598c6664a34ed0b6`

BTS is a U.S. federal agency. The normalized asset contains factual federal transportation records and is distributed on the basis that U.S. government works are not subject to domestic copyright under [17 U.S.C. § 105](https://www.law.cornell.edu/uscode/text/17/105). The repository does not redistribute the downloaded BTS archive or its bundled documentation.

The importer uses the reporting-carrier file rather than a marketing-carrier file to avoid creating duplicate marketing-code representations of one operated flight.

## Airport-code source

BTS identifies airports with IATA codes. The offline importer converts those codes to ICAO identifiers using the OurAirports airport dataset:

- Dataset and public-domain statement: <https://ourairports.com/data/>
- Retrieved: 26 September 2026
- `airports.csv` SHA-256:
  `37b78b5514711a70fb50e0f4c60b809b30988a84e37b0d814e20ca5591177cc1`

OurAirports states that its downloadable data is dedicated to the public domain. Attribution is requested rather than required; this document provides it. The downloaded CSV is not redistributed.

Every airport code used by the KSEA sample resolved to exactly one four-letter ICAO identifier. The importer fails instead of guessing a `K` prefix when a code is missing, ambiguous, or malformed.

## Normalization

The dependency-free offline importer is:

```text
tools/schedules/import-bts-schedule.js
```

It:

1. strictly parses the extracted BTS and OurAirports CSV inputs;
2. selects records matching `2026-07-15` where `SEA` is the origin or destination;
3. uses scheduled departure time for departures and scheduled arrival time for arrivals;
4. maps reporting-airline and airport identifiers through explicit reviewed mappings;
5. rejects unresolved codes, malformed records, duplicate source identities, invalid metadata, and empty results;
6. sorts the normalized records by local scheduled time and stable ID;
7. writes the completed JSON atomically.

The raw inputs can be regenerated locally and passed to the importer, but they must remain outside the repository. A representative invocation is:

```bash
node tools/schedules/import-bts-schedule.js \
  --bts /path/to/extracted-bts.csv \
  --airports /path/to/ourairports-airports.csv \
  --iata SEA \
  --icao KSEA \
  --timezone America/Los_Angeles \
  --date 2026-07-15 \
  --retrieved 2026-09-26 \
  --source-url https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_2026_7.zip \
  --out assets/schedules/ksea.json
```

Run `npm run validator:test`, `npm run validate:assets`, and `npm run build:test` afterward.

## Runtime behavior

Schedule assets are loaded independently from airport manifests. When a shift begins, the selected airport's schedule is matched by ICAO code and composed with that airport's authored spawn patterns:

- The schedule's `timezone` is an IANA zone. The current instant is converted in that zone, not in the browser or server's local zone.
- The representative day begins at that airport-local time and repeats every 24 simulation hours. A later shift recomputes the wall-time anchor without assuming the process-wide simulation clock returned to zero.
- The start-screen volume is one of 25%, 50%, 75%, or 100%, with 100% restored as the default for every new shift. Stable ranking produces nested subsets: `25% ⊂ 50% ⊂ 75% ⊂ 100%`.
- The schedule controls the slot, arrival/departure category, route endpoints, and usable scheduled identity. Airport-authored spawn patterns control local geometry, route, altitude, speed, and movement commands.
- Scheduled identity is all-or-nothing. If the airline or an explicitly supplied aircraft type cannot be resolved, a fully generated compatible identity replaces it in the same scheduled slot; the runtime never mixes a scheduled callsign with generated identity fields.
- Mapping is deterministic for a schedule ID and candidate corpus and does not depend on candidate input order or transient runtime object IDs.
- A missing category- and selected-sector-compatible local spawn pattern rejects the plan before timers are armed.
- The normal `SpawnScheduler` remains authoritative for pre-spawn, pause, timewarp, reset, callback re-arming, teardown, and the shift's T−5 cutoff.
- A schedule-backed airport does not run the legacy random scheduler in parallel. An airport absent from the schedule catalog uses its unchanged generated traffic plan.

## Authoring another schedule

Do not add an asset until provenance and redistribution rights have been established. Keep downloaded archives, CSV files, API responses, credentials, and vendor material outside the repository unless their redistribution terms explicitly permit inclusion. Document the source URL, retrieval date, input hashes, license basis, selection rule, transformation, and known omissions in this file or an equivalent reviewed document.

Each schedule must be a top-level JSON file in `assets/schedules/` and conform to `assets/schedules/schedule.schema.json`. Nested files, non-JSON files, uncatalogued assets, malformed metadata, broken airport/airline references, duplicate IDs, empty schedules, and schema drift fail publication. Do not edit generated files under `public/`; the build publishes validated source assets.

The required top-level fields are:

- `schemaVersion`: currently `1`;
- `airportIcao`: four uppercase letters matching an enabled airport asset;
- `timezone`: a valid IANA zone for the schedule's local times;
- `sampleDate`: a real `YYYY-MM-DD` representative date;
- `source`: source name, absolute HTTP(S) URL, retrieval date, license basis, and honest coverage statement;
- `flights`: a non-empty array ordered by `scheduledTime` and stable `id`.

Each flight requires a unique stable `id`, `arrival` or `departure` category, local `HH:mm` time, lowercase three-letter airline ICAO, alphanumeric flight number, and uppercase origin/destination ICAOs. `aircraftTypeIcao` is optional; when present it must be a usable uppercase alphanumeric type or runtime mapping falls back to a wholly generated identity. The schedule airport must be the arrival destination or departure origin, and same-airport routes are invalid.

Add the normalized filename to `assets/schedules/scheduleLoadList.json` using a lowercase ICAO lookup key, for example:

```json
{
  "icao": "ksea",
  "file": "ksea.json"
}
```

Before publication:

1. confirm the airport has category- and sector-compatible local spawn patterns;
2. run the importer tests or equivalent reproducibility audit for the new source;
3. run `npm run schedule:test`, `npm run validator:test`, `npm run validate:assets`, and `npm run build:test`;
4. verify the production build contains only the catalogued normalized JSON assets, never raw source material;
5. add a corpus audit that pins expected counts and a normalized hash so accidental data changes are visible in review.

## Coverage limitations

This is a representative domestic reporting-carrier baseline, not every KSEA operation. BTS describes this reporting population as U.S. certificated carriers accounting for at least 0.5% of domestic scheduled passenger revenue. The asset therefore omits at least:

- international service not represented in this domestic dataset;
- cargo-only operations;
- general aviation;
- carriers below the BTS reporting threshold;
- equipment type, which the selected source does not provide.

For context only, the Port of Seattle reports 435,896 total airport operations for 2025—about 1,194 per day—while this representative schedule contains 1,038 movements. The comparison is not a completeness calculation because it compares one summer weekday with a prior annual average and the airport total includes categories outside the BTS dataset. See <https://www.portseattle.org/page/sea-airport-basics>.

Runtime fallback behavior and user-facing limitations are explicit: a schedule-backed airport uses this reviewed schedule as its complete reference plan, unmappable records become generated flights in the same scheduled slots, and unsupported airports retain legacy generated traffic. A second random scheduler does not run alongside a schedule-backed plan.

The MVP intentionally provides one fixed representative day per supported airport. It does not model day-to-day cancellations, delays, tail numbers, gates, runway assignments, seasonal changes, weekday/weekend differences, holidays, or a user-selected historical date. Selecting a date, traffic profile, or custom airport-local start time is future work and requires additional reviewed source assets and UI; the current runtime always starts from the actual current time in the selected airport's IANA zone.
