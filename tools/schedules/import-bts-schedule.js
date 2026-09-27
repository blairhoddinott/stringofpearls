'use strict';

const fs = require('fs');
const path = require('path');

const AIRLINE_MAP_PATH = path.join(__dirname, 'reporting-airline-icao.json');
const DEFAULT_AIRLINES_DIR = path.join(__dirname, '..', '..', 'assets', 'airlines');

/**
 * Parse RFC 4180 CSV text into an array of rows, each an array of string
 * fields. Quoted fields may contain commas, doubled quotes (escaped `""`),
 * and newlines. A trailing newline does not produce an empty final row.
 *
 * @param {string} text raw CSV contents
 * @returns {string[][]} parsed rows
 */
function parseCsv(text) {
    const rows = [];
    let field = '';
    let row = [];
    let inQuotes = false;
    let closedQuote = false;
    let fieldStarted = false;
    let index = 0;

    const pushField = () => {
        row.push(field);
        field = '';
        closedQuote = false;
        fieldStarted = false;
    };
    const pushRow = () => {
        rows.push(row);
        row = [];
    };

    while (index < text.length) {
        const character = text[index];

        if (inQuotes) {
            if (character === '"') {
                if (text[index + 1] === '"') {
                    field += '"';
                    index += 2;
                    continue;
                }

                inQuotes = false;
                closedQuote = true;
                index += 1;
                continue;
            }

            field += character;
            index += 1;
            continue;
        }

        if (closedQuote && character !== ',' && character !== '\r' && character !== '\n') {
            throw new Error(`malformed CSV: unexpected ${JSON.stringify(character)} after closing quote`);
        }

        if (character === '"') {
            if (fieldStarted) {
                throw new Error('malformed CSV: quote inside an unquoted field');
            }

            inQuotes = true;
            fieldStarted = true;
            index += 1;
            continue;
        }

        if (character === ',') {
            pushField();
            index += 1;
            continue;
        }

        if (character === '\r' && text[index + 1] === '\n') {
            pushField();
            pushRow();
            index += 2;
            continue;
        }

        if (character === '\n' || character === '\r') {
            pushField();
            pushRow();
            index += 1;
            continue;
        }

        field += character;
        fieldStarted = true;
        index += 1;
    }

    if (inQuotes) {
        throw new Error('malformed CSV: unterminated quoted field');
    }

    if (fieldStarted || field !== '' || row.length > 0) {
        pushField();
        pushRow();
    }

    return rows;
}

function assertCsvRowWidths(rows, label) {
    const expected = rows[0].length;

    rows.slice(1).forEach((row, index) => {
        if (row.length !== expected) {
            throw new Error(`${label} CSV row ${index + 2} has ${row.length} fields; expected ${expected}`);
        }
    });
}

function assertRequiredColumnsUnique(header, requiredColumns, label) {
    requiredColumns.forEach((column) => {
        const count = header.filter((name) => name === column).length;

        if (count > 1) {
            throw new Error(`${label} CSV has duplicate required column: ${column}`);
        }
    });
}

/**
 * Normalize a BTS HHMM clock value (e.g. `815`, `0630`) to a zero-padded
 * `HH:mm` string. Values are minutes-of-day encoded as `hour * 100 + minute`.
 * Missing, non-numeric, or out-of-range values are rejected.
 *
 * @param {string} value raw BTS time field
 * @returns {string} `HH:mm`
 * @throws {Error} when the value is missing or not a valid 24-hour clock time
 */
function normalizeBtsTime(value) {
    const raw = typeof value === 'string' ? value.trim() : '';

    if (!/^\d{1,4}$/.test(raw)) {
        throw new Error(`invalid BTS time ${JSON.stringify(value)}`);
    }

    const padded = raw.padStart(4, '0');
    const hours = Number(padded.slice(0, 2));
    const minutes = Number(padded.slice(2));

    if (hours > 23 || minutes > 59) {
        throw new Error(`invalid BTS time ${JSON.stringify(value)}`);
    }

    return `${padded.slice(0, 2)}:${padded.slice(2)}`;
}

const ICAO_PATTERN = /^[A-Z]{4}$/;
const FLIGHT_NUMBER_PATTERN = /^[0-9A-Za-z]+$/;

const REQUIRED_BTS_COLUMNS = [
    'FlightDate',
    'Reporting_Airline',
    'Flight_Number_Reporting_Airline',
    'Origin',
    'Dest',
    'CRSDepTime',
    'CRSArrTime'
];

const SOURCE_NAME = 'US DOT BTS Reporting Carrier On-Time Performance';
const SOURCE_LICENSE =
    'U.S. Government work in the public domain (17 U.S.C. §105); OurAirports code data is public domain.';
const SOURCE_COVERAGE =
    'Domestic scheduled passenger service reported by U.S. certificated carriers with at least 0.5% ' +
    'of domestic scheduled passenger revenue; excludes international, cargo, general aviation, and ' +
    'below-threshold carriers, so it is a representative reporting-carrier baseline rather than the ' +
    'airport’s entire traffic. Airport IATA-to-ICAO mappings come from the public-domain OurAirports ' +
    'dataset at https://ourairports.com/data/.';

/**
 * Build a map from OurAirports IATA code to the set of ICAO-shaped `ident`
 * values that claim it. Rows without an IATA code are ignored. Keeping the full
 * set (rather than the first match) lets callers fail closed on ambiguity.
 *
 * @param {string} text raw OurAirports airports.csv contents
 * @returns {Map<string, Set<string>>} IATA code -> candidate ICAO idents
 */
function buildAirportIcaoMap(text) {
    const rows = parseCsv(text);

    if (rows.length === 0) {
        throw new Error('OurAirports CSV has no header row');
    }

    assertCsvRowWidths(rows, 'OurAirports');

    const header = rows[0];
    assertRequiredColumnsUnique(header, ['ident', 'iata_code'], 'OurAirports');
    const identIndex = header.indexOf('ident');
    const iataIndex = header.indexOf('iata_code');

    if (identIndex === -1 || iataIndex === -1) {
        throw new Error('OurAirports CSV is missing ident or iata_code columns');
    }

    const map = new Map();

    rows.slice(1).forEach((row) => {
        const iata = (row[iataIndex] || '').trim();
        const ident = (row[identIndex] || '').trim();

        if (iata === '') {
            return;
        }

        if (!map.has(iata)) {
            map.set(iata, new Set());
        }

        map.get(iata).add(ident);
    });

    return map;
}

/**
 * Resolve an IATA airport code to a single ICAO identifier using an OurAirports
 * map. Returns `null` (never a guessed K-prefix) when the code is unknown,
 * ambiguous, or maps to a non-ICAO-shaped identifier.
 *
 * @param {Map<string, Set<string>>} map result of {@link buildAirportIcaoMap}
 * @param {string} iata IATA airport code
 * @returns {string|null} the resolved ICAO identifier, or null
 */
function resolveAirportIcao(map, iata) {
    const idents = map.get(iata);

    if (idents === undefined || idents.size !== 1) {
        return null;
    }

    const [ident] = idents;

    return ICAO_PATTERN.test(ident) ? ident : null;
}

function tallyBump(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
}

function describeTally(label, tally) {
    const parts = [...tally.entries()]
        .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
        .map(([code, count]) => `${code} (${count})`);

    return `${label}: ${parts.join(', ')}`;
}

/**
 * Build the ordered list of `HH:mm`-then-id comparison keys used both to sort
 * flights deterministically and to match the asset validator's ordering rule.
 */
function orderKey(flight) {
    return `${flight.scheduledTime} ${flight.id}`;
}

/**
 * Normalize an extracted BTS reporting-carrier table plus an OurAirports code
 * map into the schemaVersion 1 schedule contract for a single airport. The
 * function is pure: it performs no I/O and either returns a complete, sorted
 * schedule or throws with actionable, code-mapping failure counts.
 *
 * @param {object} options normalization inputs
 * @param {string[][]} options.bts parsed BTS CSV (header row first)
 * @param {Map<string, Set<string>>} options.airportMap OurAirports IATA->ICAO map
 * @param {object} options.airlineMap IATA airline code -> lowercase ICAO id
 * @param {string} options.airportIata schedule airport IATA code
 * @param {string} options.airportIcao schedule airport ICAO identifier
 * @param {string} options.timezone IANA time zone for the airport
 * @param {string} options.sampleDate representative day (YYYY-MM-DD)
 * @param {string} options.retrievedAt retrieval date to record in provenance
 * @param {string} options.sourceUrl source URL to record in provenance
 * @param {(icao: string) => boolean} [options.airlineIcaoExists] predicate that
 *        reports whether a mapped airline has a backing asset
 * @returns {object} the normalized schedule document
 * @throws {Error} when any code is unresolved, an airline asset is missing, a
 *         time is invalid, or two rows collide on a stable id
 */
function isValidTimeZone(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return false;
    }

    try {
        Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

function isRealCalendarDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value : '');

    if (match === null) {
        return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const daysInMonth = [
        31,
        (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28,
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31
    ];

    return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function isAbsoluteHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function normalizeSchedule(options) {
    const {
        bts,
        airportMap,
        airlineMap,
        airportIata,
        airportIcao,
        timezone,
        sampleDate,
        retrievedAt,
        sourceUrl,
        airlineIcaoExists = () => true
    } = options;

    if (!isValidTimeZone(timezone)) {
        throw new Error('timezone must be a valid IANA time zone');
    }
    if (!isRealCalendarDate(sampleDate)) {
        throw new Error('sampleDate must be a real YYYY-MM-DD calendar date');
    }
    if (!isRealCalendarDate(retrievedAt)) {
        throw new Error('retrievedAt must be a real YYYY-MM-DD calendar date');
    }
    if (!isAbsoluteHttpUrl(sourceUrl)) {
        throw new Error('sourceUrl must be an absolute HTTP URL');
    }

    if (!Array.isArray(bts) || bts.length === 0) {
        throw new Error('BTS CSV has no header row');
    }

    const header = bts[0];
    assertCsvRowWidths(bts, 'BTS');
    assertRequiredColumnsUnique(header, REQUIRED_BTS_COLUMNS, 'BTS');

    const columnIndex = {};
    const missingColumns = REQUIRED_BTS_COLUMNS.filter((name) => {
        const index = header.indexOf(name);
        columnIndex[name] = index;

        return index === -1;
    });

    if (missingColumns.length > 0) {
        throw new Error(`BTS CSV is missing required columns: ${missingColumns.join(', ')}`);
    }

    const resolvedAirportIcao = resolveAirportIcao(airportMap, airportIata);
    if (resolvedAirportIcao !== airportIcao) {
        throw new Error(
            `schedule airport IATA ${airportIata} does not resolve to the supplied ICAO ${airportIcao} ` +
            `through OurAirports (resolved: ${resolvedAirportIcao === null ? 'none' : resolvedAirportIcao})`
        );
    }

    const unresolvedAirlines = new Map();
    const missingAirlineAssets = new Map();
    const unresolvedAirports = new Map();
    const sameAirportRoutes = new Map();
    const invalidTimes = new Map();
    const seenIds = new Map();
    const duplicateIds = new Set();
    const flights = [];

    bts.slice(1).forEach((row) => {
        const flightDate = (row[columnIndex.FlightDate] || '').trim();
        const origin = (row[columnIndex.Origin] || '').trim();
        const dest = (row[columnIndex.Dest] || '').trim();

        if (flightDate !== sampleDate) {
            return;
        }

        if (origin === airportIata && dest === airportIata) {
            tallyBump(sameAirportRoutes, `${origin}->${dest}`);
            return;
        }

        let category;
        let remoteIata;
        let rawTime;

        if (origin === airportIata) {
            category = 'departure';
            remoteIata = dest;
            rawTime = row[columnIndex.CRSDepTime];
        } else if (dest === airportIata) {
            category = 'arrival';
            remoteIata = origin;
            rawTime = row[columnIndex.CRSArrTime];
        } else {
            return;
        }

        const airlineIata = (row[columnIndex.Reporting_Airline] || '').trim();
        const flightNumber = (row[columnIndex.Flight_Number_Reporting_Airline] || '').trim();
        const airlineIcao = Object.prototype.hasOwnProperty.call(airlineMap, airlineIata)
            ? airlineMap[airlineIata]
            : null;
        const remoteIcao = resolveAirportIcao(airportMap, remoteIata);

        if (airlineIcao === null) {
            tallyBump(unresolvedAirlines, airlineIata || '(blank)');
        } else if (!airlineIcaoExists(airlineIcao)) {
            tallyBump(missingAirlineAssets, `${airlineIata}->${airlineIcao}`);
        }

        if (remoteIcao === null) {
            tallyBump(unresolvedAirports, remoteIata || '(blank)');
        }

        let scheduledTime = null;
        try {
            scheduledTime = normalizeBtsTime(rawTime);
        } catch {
            tallyBump(invalidTimes, JSON.stringify(rawTime));
        }

        if (!FLIGHT_NUMBER_PATTERN.test(flightNumber)) {
            tallyBump(invalidTimes, `flightNumber ${JSON.stringify(flightNumber)}`);
        }

        // Skip building the record when any component failed; the tallies above
        // already record why, and the run will fail closed after the sweep.
        if (airlineIcao === null || remoteIcao === null || scheduledTime === null ||
            !FLIGHT_NUMBER_PATTERN.test(flightNumber)) {
            return;
        }

        const id = `${category}-${airlineIata}${flightNumber}-${origin}-${dest}`.toLowerCase();

        if (seenIds.has(id)) {
            duplicateIds.add(id);
        }
        tallyBump(seenIds, id);

        flights.push({
            id,
            category,
            scheduledTime,
            airlineIcao,
            flightNumber,
            originIcao: category === 'departure' ? airportIcao : remoteIcao,
            destinationIcao: category === 'departure' ? remoteIcao : airportIcao
        });
    });

    const problems = [];
    if (unresolvedAirlines.size > 0) {
        problems.push(describeTally('unresolved reporting airlines', unresolvedAirlines));
    }
    if (missingAirlineAssets.size > 0) {
        problems.push(describeTally('mapped airlines with no asset in assets/airlines', missingAirlineAssets));
    }
    if (unresolvedAirports.size > 0) {
        problems.push(describeTally('unresolved airport codes', unresolvedAirports));
    }
    if (sameAirportRoutes.size > 0) {
        problems.push(describeTally('same-airport routes', sameAirportRoutes));
    }
    if (invalidTimes.size > 0) {
        problems.push(describeTally('invalid times/flight numbers', invalidTimes));
    }
    if (duplicateIds.size > 0) {
        problems.push(`duplicate stable ids: ${[...duplicateIds].sort().join(', ')}`);
    }

    if (problems.length > 0) {
        throw new Error(`schedule import failed:\n- ${problems.join('\n- ')}`);
    }

    if (flights.length === 0) {
        throw new Error(`schedule import failed: no flights matched ${airportIata} on ${sampleDate}`);
    }

    flights.sort((left, right) => {
        const leftKey = orderKey(left);
        const rightKey = orderKey(right);

        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });

    return {
        schemaVersion: 1,
        airportIcao,
        timezone,
        sampleDate,
        source: {
            name: SOURCE_NAME,
            url: sourceUrl,
            retrievedAt,
            license: SOURCE_LICENSE,
            coverage: SOURCE_COVERAGE
        },
        flights
    };
}

/**
 * Load the explicit, reviewable reporting-airline IATA->ICAO map.
 *
 * @param {string} [mapPath] override for the JSON map location
 * @returns {object} IATA airline code -> lowercase ICAO id
 */
function loadAirlineMap(mapPath = AIRLINE_MAP_PATH) {
    return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
}

/**
 * Read the extracted BTS and OurAirports CSVs, normalize them into the schedule
 * contract, verify every mapped airline has a backing asset, and write the
 * result atomically. Nothing is written unless normalization fully succeeds.
 *
 * @param {object} options importer inputs
 * @param {string} options.btsPath extracted BTS On-Time Performance CSV path
 * @param {string} options.airportsPath OurAirports airports.csv path
 * @param {string} options.iata schedule airport IATA code
 * @param {string} options.icao schedule airport ICAO identifier
 * @param {string} options.timezone IANA time zone for the airport
 * @param {string} options.sampleDate representative day (YYYY-MM-DD)
 * @param {string} options.retrievedAt retrieval date recorded in provenance
 * @param {string} options.sourceUrl source URL recorded in provenance
 * @param {string} options.outPath destination schedule JSON path
 * @param {string} [options.airlinesDir] airline asset directory to check against
 * @param {string} [options.airlineMapPath] override for the airline map JSON
 * @returns {object} the normalized schedule document
 */
function importSchedule(options) {
    const {
        btsPath,
        airportsPath,
        iata,
        icao,
        timezone,
        sampleDate,
        retrievedAt,
        sourceUrl,
        outPath,
        airlinesDir = DEFAULT_AIRLINES_DIR,
        airlineMapPath = AIRLINE_MAP_PATH
    } = options;

    const airlineMap = loadAirlineMap(airlineMapPath);
    const airportMap = buildAirportIcaoMap(fs.readFileSync(airportsPath, 'utf8'));
    const bts = parseCsv(fs.readFileSync(btsPath, 'utf8'));

    const schedule = normalizeSchedule({
        bts,
        airportMap,
        airlineMap,
        airportIata: iata,
        airportIcao: icao,
        timezone,
        sampleDate,
        retrievedAt,
        sourceUrl,
        airlineIcaoExists: (airlineIcao) => fs.existsSync(path.join(airlinesDir, `${airlineIcao}.json`))
    });

    const contents = `${JSON.stringify(schedule, null, 2)}\n`;
    const temporaryPath = `${outPath}.tmp-${process.pid}`;

    try {
        fs.writeFileSync(temporaryPath, contents);
        fs.renameSync(temporaryPath, outPath);
    } catch (error) {
        try {
            fs.rmSync(temporaryPath, { force: true });
        } catch {
            // The primary write error below is the actionable failure.
        }

        throw error;
    }

    return schedule;
}

const USAGE = [
    'Usage: node tools/schedules/import-bts-schedule.js \\',
    '  --bts <bts.csv> --airports <ourairports.csv> \\',
    '  --iata <SEA> --icao <KSEA> --timezone <America/Los_Angeles> \\',
    '  --date <YYYY-MM-DD> --retrieved <YYYY-MM-DD> \\',
    '  --source-url <url> --out <schedule.json>'
].join('\n');

const CLI_FLAGS = {
    '--bts': 'btsPath',
    '--airports': 'airportsPath',
    '--iata': 'iata',
    '--icao': 'icao',
    '--timezone': 'timezone',
    '--date': 'sampleDate',
    '--retrieved': 'retrievedAt',
    '--source-url': 'sourceUrl',
    '--out': 'outPath'
};

function parseCliArguments(argv) {
    const options = {};

    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        const key = CLI_FLAGS[flag];

        if (key === undefined) {
            throw new Error(`unknown argument: ${flag}\n${USAGE}`);
        }

        const value = argv[index + 1];
        if (value === undefined) {
            throw new Error(`missing value for ${flag}\n${USAGE}`);
        }

        options[key] = value;
        index += 1;
    }

    const missing = Object.values(CLI_FLAGS).filter((key) => options[key] === undefined);
    if (missing.length > 0) {
        const flags = Object.entries(CLI_FLAGS)
            .filter(([, key]) => missing.includes(key))
            .map(([flag]) => flag);

        throw new Error(`missing required arguments: ${flags.join(', ')}\n${USAGE}`);
    }

    return options;
}

function main(argv) {
    const options = parseCliArguments(argv);
    const schedule = importSchedule(options);

    console.log(`wrote ${options.outPath} with ${schedule.flights.length} flights`);
}

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    parseCsv,
    normalizeBtsTime,
    buildAirportIcaoMap,
    resolveAirportIcao,
    normalizeSchedule,
    loadAirlineMap,
    importSchedule,
    parseCliArguments,
    main
};
