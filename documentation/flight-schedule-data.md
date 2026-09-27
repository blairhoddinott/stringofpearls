# Historical flight schedule data

String of Pearls ships normalized representative-day flight schedules as independent assets under `assets/schedules/`. Raw source files are deliberately not committed.

## KSEA representative profile

The schedule covers Seattle–Tacoma International Airport (`KSEA`) as a repeating, representative 24-hour profile. Its exact slots use Wednesday, 15 July 2026, while supplemental carrier and route volumes use May 2026 monthly aggregates. It contains:

- 1,208 scheduled movements;
- 605 arrivals and 603 departures;
- 1,038 exact On-Time movements and 170 synthesized T-100 representative movements;
- 40 usable airline identities, including international passenger and all-cargo operators;
- 120 remote airports;
- 146 synthesized passenger/cargo movements and 24 synthesized all-cargo movements.

The normalized asset is `assets/schedules/ksea.json`. Its SHA-256 is:

```text
d6f1bb5eab122ef69846847ecd9b5788085b11a6ae86249124c8855426fa6794
```

CI verifies this hash, both provenance populations, the category and carrier counts, and the remote-airport census. An accidental edit therefore cannot quietly redefine the reviewed profile.

## Flight sources and redistribution basis

The profile combines two BTS datasets with different semantics:

1. **Reporting Carrier On-Time Performance** supplies exact domestic scheduled movements, local scheduled times, routes, reporting-carrier identity, and flight numbers for 15 July 2026. BTS describes this table as individual non-stop domestic flights reported by qualifying U.S. carriers.[2]
2. **T-100 Segment (All Carriers)** supplies May 2026 monthly non-stop segment aggregates for U.S. and foreign carriers, including carrier, route, service class, aircraft type, and performed departures.[1][3] It does not supply individual timestamps or flight numbers, so those fields are synthesized rather than presented as observations.

### On-Time snapshot

- Dataset documentation: <https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EFD>
- Retrieved archive: <https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_2026_7.zip>
- Retrieval date: 26 September 2026
- Archive SHA-256:
  `61d657eb17f5b6f800ed2f05262a2223c5edf66fe7d9cfb3598c6664a34ed0b6`

### T-100 snapshot

- Database documentation: <https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EEE>
- Field documentation and download form: <https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FMG>
- Selected table: `T-100 Segment (All Carriers)`
- Selected period: May 2026, the latest period shown by BTS at retrieval time.[3]
- Downloaded archive filename: `T_T100_SEGMENT_ALL_CARRIER_20260927_060303.zip`
- Retrieval date: 27 September 2026
- Archive SHA-256:
  `5346fd621d19f5c22876a7bcda369b1055c5012ae4215c207e8432f00d279f17`
- Extracted `T_T100_SEGMENT_ALL_CARRIER.csv` SHA-256:
  `7cc7ff53beac5d66d4b5142859770b2ab2b8daf6e3dba90899059dd80721377b`

BTS is a U.S. federal agency. The normalized asset contains factual federal transportation records and is distributed on the basis that U.S. government works are not subject to domestic copyright under 17 U.S.C. § 105.[5] The repository does not redistribute either downloaded BTS archive, extracted CSV, or bundled documentation.

The exact baseline uses the reporting-carrier file rather than a marketing-carrier file to avoid multiplying marketing-code representations. T-100 uses `UNIQUE_CARRIER` and aggregates duplicate equipment rows before allocation. This models one operating-carrier population rather than manufacturing an aircraft for every codeshare—an apparently necessary sentence, because airline data enjoys aliases almost as much as JavaScript does.

## Airport-code source

BTS identifies airports with IATA codes. The offline importer converts those codes to ICAO identifiers using the OurAirports airport dataset:

- Dataset and public-domain statement: <https://ourairports.com/data/>
- Retrieved: 26 September 2026
- `airports.csv` SHA-256:
  `37b78b5514711a70fb50e0f4c60b809b30988a84e37b0d814e20ca5591177cc1`

OurAirports states that its downloadable data is dedicated to the public domain; attribution is requested rather than required.[4] This document provides it. The downloaded CSV is not redistributed.

Every airport code used by the KSEA sample resolved to exactly one four-letter ICAO identifier. The importer fails instead of guessing a `K` prefix when a code is missing, ambiguous, or malformed.

## Normalization and synthesis

Two dependency-free offline tools are used:

```text
tools/schedules/import-bts-schedule.js
tools/schedules/enrich-bts-schedule-with-t100.js
```

The first importer strictly normalizes the 15 July On-Time records. The enrichment tool then:

1. strictly parses the extracted T-100 and OurAirports CSV inputs, including quoted fields, exact row widths, duplicate headers, and integer-valued decimal measures;
2. selects May 2026 rows where `SEA` is an endpoint, service class is `F` (scheduled passenger/cargo) or `G` (scheduled all-cargo), and `DEPARTURES_PERFORMED` is positive;
3. excludes the single source row whose origin and destination are both `SEA`, because it cannot represent a physical arrival or departure route;
4. aggregates equipment-level rows by unique carrier, service class, direction, and remote airport;
5. computes a 1,208-movement daily target by rounding 37,435 performed monthly movements over 31 days;
6. preserves all 1,038 exact On-Time records without altering their slots or identities;
7. synthesizes only carriers absent from the exact baseline, preserving every positive rounded carrier quota before reducing the largest missing-carrier quota to the 170-slot volume budget;
8. allocates carrier and route quotas by performed-departure weight, then rebalances them to the airport-wide arrival/departure target;
9. distributes synthesized times across the exact arrival or departure time distribution with deterministic hash-based ordering and a bounded minute offset;
10. creates stable `t100-...` IDs and collision-free deterministic flight numbers, resolves carrier and airport identifiers through explicit reviewed mappings, sorts canonically, and writes atomically.

The `t100-` ID prefix is the machine-readable provenance marker for synthesized records. Every other record in this profile is retained from the exact On-Time import. T-100 aircraft-type codes are used for source analysis but are not copied into schedule records; the mapped airline's reviewed simulator fleet supplies compatible equipment at runtime.

Raw inputs remain outside the repository. Reproduce the exact baseline first with `import-bts-schedule.js`, then enrich that baseline with:

```bash
node tools/schedules/enrich-bts-schedule-with-t100.js \
  --base /path/to/exact-ksea.json \
  --t100 /path/to/T_T100_SEGMENT_ALL_CARRIER.csv \
  --airports /path/to/ourairports-airports.csv \
  --airline-map tools/schedules/t100-airline-icao.json \
  --airlines-dir assets/airlines \
  --iata SEA \
  --icao KSEA \
  --year 2026 \
  --month 5 \
  --retrieved 2026-09-27 \
  --source-url 'https://transtats.bts.gov/DL_SelectFields.aspx?QO_fu146_anzr=Nv4+Pn44vr45&gnoyr_VQ=FMG' \
  --out assets/schedules/ksea.json
```

Run `npm run schedule:test`, `npm run validator:test`, `npm run validate:assets`, and `npm run build:test` afterward.

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

This is a realistic representative profile, not a claim that 15 July 2026 contained these exact 1,208 movements. The provenance boundary is deliberate:

- the 1,038 non-`t100-` records are exact On-Time slots from 15 July 2026;
- the 170 `t100-` records are representative additions derived from May 2026 monthly performed-departure frequencies;
- synthesized records have generated local times and flight numbers; only their carrier, route, service class, direction, and frequency weighting come from T-100 aggregates;
- 100% traffic volume means the complete normalized reference profile, not every real operation at KSEA on a historical date.

The profile excludes general aviation, military operations, unscheduled/charter service classes, cancellations, and rows with no performed departure. The May T-100 source included one nine-movement `SEA`-to-`SEA` aggregate; it is excluded because the runtime contract requires a distinct remote endpoint. Very infrequent services whose combined monthly frequency rounds below one representative movement may be absent. Existing exact-baseline carriers are not topped up from T-100 because the On-Time reporting identity can overlap regional operating-carrier identities; blindly adding both populations would inflate physical traffic.

Aircraft-type codes are not copied from T-100 into the runtime schedule. A mapped carrier's reviewed airline fleet supplies a compatible generated type, while the scheduled carrier and synthesized flight number remain deterministic. General aviation remains intentionally excluded.

Runtime fallback behavior remains explicit: a schedule-backed airport uses this reviewed profile as its complete traffic plan, an unusable scheduled identity is replaced atomically in the same slot, and unsupported airports retain legacy generated traffic. A second random scheduler does not run alongside a schedule-backed plan.

The profile intentionally remains fixed and repeats every 24 hours. It does not model day-to-day cancellations, delays, tail numbers, gates, runway assignments, seasonal changes, weekday/weekend differences, holidays, or a user-selected historical date. Selecting a date, traffic profile, or custom airport-local start time is future work and requires additional reviewed source assets and UI; the current runtime anchors the profile to the actual current time in the selected airport's IANA zone.

## Sources

[1] https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EEE — BTS T-100 Segment (All Carriers)
[2] https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EFD — BTS Reporting Carrier On-Time Performance
[3] https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FMG — BTS T-100 Segment field definitions
[4] https://ourairports.com/data — OurAirports open airport data
[5] https://www.law.cornell.edu/uscode/text/17/105 — 17 U.S.C. § 105
