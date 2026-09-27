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

## Coverage limitations

This is a representative domestic reporting-carrier baseline, not every KSEA operation. BTS describes this reporting population as U.S. certificated carriers accounting for at least 0.5% of domestic scheduled passenger revenue. The asset therefore omits at least:

- international service not represented in this domestic dataset;
- cargo-only operations;
- general aviation;
- carriers below the BTS reporting threshold;
- equipment type, which the selected source does not provide.

For context only, the Port of Seattle reports 435,896 total airport operations for 2025—about 1,194 per day—while this representative schedule contains 1,038 movements. The comparison is not a completeness calculation because it compares one summer weekday with a prior annual average and the airport total includes categories outside the BTS dataset. See <https://www.portseattle.org/page/sea-airport-basics>.

Runtime fallback behavior and user-facing limitations will remain explicit: a schedule-backed airport uses this reviewed schedule as its complete reference plan, unmappable records become generated flights in the same scheduled slots, and unsupported airports retain legacy generated traffic. A second random scheduler must not run alongside a schedule-backed plan.
