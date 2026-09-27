'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AIRPORT_REQUIRED_KEYS = [
    'arrivalRunway',
    'ctr_ceiling',
    'ctr_radius',
    'departureRunway',
    'fixes',
    'iata',
    'icao',
    'initial_alt',
    'magnetic_north',
    'position',
    'radio',
    'rangeRings',
    'runways',
    'sids',
    'wind'
];
const AIRPORT_LIST_KEYS = ['icao', 'level', 'name', 'premium', 'disabled', '_comment'];
const DIFFICULTY_LEVELS = ['beginner', 'easy', 'medium', 'hard'];
const SCHEDULE_KEYS = ['schemaVersion', 'profileType', 'airportIcao', 'timezone', 'sampleDate', 'source', 'flights'];
const SCHEDULE_SOURCE_KEYS = ['name', 'url', 'retrievedAt', 'license', 'coverage'];
const SCHEDULE_LIST_KEYS = ['icao', 'file'];
const SCHEDULE_SCHEMA_SHA256 = '615b3ee373b3ea573d7030126c31cde9830d1d56809230ed60318b06acf74d80';
const OBSERVED_SCHEDULE_FLIGHT_KEYS = [
    'id',
    'category',
    'scheduledTime',
    'airlineIcao',
    'flightNumber',
    'originIcao',
    'destinationIcao',
    'aircraftTypeIcao'
];
const AUTHORED_SCHEDULE_FLIGHT_KEYS = ['id', 'category', 'scheduledTime', 'spawnPatternKey'];

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function walkDataFiles(directory, files) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    entries.forEach((entry) => {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            walkDataFiles(fullPath, files);
            return;
        }

        if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.geojson'))) {
            files.push(fullPath);
        }
    });
}

function loadJsonFiles(assetsRoot, errors) {
    const files = [];
    const documents = new Map();

    walkDataFiles(assetsRoot, files);
    files.sort().forEach((filePath) => {
        try {
            documents.set(filePath, JSON.parse(fs.readFileSync(filePath, 'utf8')));
        } catch (error) {
            errors.push(`${path.relative(assetsRoot, filePath)}: invalid JSON: ${error.message}`);
        }
    });

    return { documents, fileCount: files.length };
}

function validateAirportList(assetsRoot, documents, errors) {
    const airportsRoot = path.join(assetsRoot, 'airports');
    const loadListPath = path.join(airportsRoot, 'airportLoadList.json');
    const loadList = documents.get(loadListPath);
    const listedIcaos = new Set();
    let previousIcao = null;

    if (!Array.isArray(loadList)) {
        errors.push('airports/airportLoadList.json: expected an array');
        return listedIcaos;
    }

    loadList.forEach((entry, index) => {
        const prefix = `airports/airportLoadList.json[${index}]`;

        if (!isObject(entry)) {
            errors.push(`${prefix}: expected an object`);
            return;
        }

        ['icao', 'level', 'name', 'premium'].forEach((key) => {
            if (!Object.prototype.hasOwnProperty.call(entry, key)) {
                errors.push(`${prefix}: missing ${key}`);
            }
        });

        Object.keys(entry).filter((key) => AIRPORT_LIST_KEYS.indexOf(key) === -1).forEach((key) => {
            errors.push(`${prefix}: unsupported property ${key}`);
        });
        if (Object.prototype.hasOwnProperty.call(entry, '_comment') && typeof entry._comment !== 'string') {
            errors.push(`${prefix}: _comment must be a string when present`);
        }

        if (typeof entry.icao !== 'string' || !/^[a-z]{4}$/.test(entry.icao)) {
            errors.push(`${prefix}: icao must contain exactly four lowercase letters`);
            return;
        }

        if (listedIcaos.has(entry.icao)) {
            errors.push(`${prefix}: duplicate ICAO ${entry.icao}`);
        }
        listedIcaos.add(entry.icao);

        if (previousIcao !== null && entry.icao < previousIcao) {
            errors.push(`${prefix}: ICAO entries must be in alphabetical order`);
        }
        previousIcao = entry.icao;

        if (DIFFICULTY_LEVELS.indexOf(entry.level) === -1) {
            errors.push(`${prefix}: unsupported difficulty level ${JSON.stringify(entry.level)}`);
        }
        if (typeof entry.name !== 'string' || entry.name.trim() === '') {
            errors.push(`${prefix}: name must be a non-empty string`);
        }
        if (typeof entry.premium !== 'boolean') {
            errors.push(`${prefix}: premium must be boolean`);
        }
        if (Object.prototype.hasOwnProperty.call(entry, 'disabled') && typeof entry.disabled !== 'boolean') {
            errors.push(`${prefix}: disabled must be boolean when present`);
        }

        const airportPath = path.join(airportsRoot, `${entry.icao}.json`);
        if (!documents.has(airportPath)) {
            errors.push(`${prefix}: missing airports/${entry.icao}.json`);
        }
    });

    return listedIcaos;
}

function runwayNames(airport, prefix, errors) {
    const names = new Set();

    if (!Array.isArray(airport.runways) || airport.runways.length === 0) {
        errors.push(`${prefix}: runways must be a non-empty array`);
        return names;
    }

    airport.runways.forEach((runway, index) => {
        const runwayPrefix = `${prefix}.runways[${index}]`;

        if (!isObject(runway)) {
            errors.push(`${runwayPrefix}: expected an object`);
            return;
        }
        if (!Array.isArray(runway.name) || runway.name.length !== 2 || runway.name.some((name) => typeof name !== 'string')) {
            errors.push(`${runwayPrefix}: name must contain two runway identifiers`);
        } else {
            runway.name.forEach((name) => names.add(name));
        }
        if (!Array.isArray(runway.end) || runway.end.length !== 2) {
            errors.push(`${runwayPrefix}: end must contain two runway endpoints`);
        }
        if (!Array.isArray(runway.ils) || runway.ils.length !== 2 || runway.ils.some((value) => typeof value !== 'boolean')) {
            errors.push(`${runwayPrefix}: ils must contain two booleans`);
        }
    });

    return names;
}

function validateAirport(assetsRoot, airportPath, airport, errors) {
    const relativePath = path.relative(assetsRoot, airportPath);
    const prefix = relativePath;
    const expectedIcao = path.basename(airportPath, '.json').toUpperCase();

    if (!isObject(airport)) {
        errors.push(`${prefix}: expected an object`);
        return;
    }

    AIRPORT_REQUIRED_KEYS.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(airport, key)) {
            errors.push(`${prefix}: missing ${key}`);
        }
    });

    if (airport.icao !== expectedIcao) {
        errors.push(`${prefix}: icao ${JSON.stringify(airport.icao)} does not match filename ${expectedIcao}`);
    }
    if (!Array.isArray(airport.position) || airport.position.length < 2) {
        errors.push(`${prefix}: position must contain latitude and longitude`);
    }
    if (!isObject(airport.wind) || typeof airport.wind.angle !== 'number' || typeof airport.wind.speed !== 'number') {
        errors.push(`${prefix}: wind must contain numeric angle and speed`);
    }
    if (!isObject(airport.rangeRings) || typeof airport.rangeRings.enabled !== 'boolean' ||
        !Array.isArray(airport.rangeRings.center) || airport.rangeRings.center.length !== 2 ||
        typeof airport.rangeRings.radius_nm !== 'number') {
        errors.push(`${prefix}: rangeRings must contain enabled, center, and radius_nm`);
    }

    const names = runwayNames(airport, prefix, errors);
    ['arrivalRunway', 'departureRunway'].forEach((key) => {
        if (typeof airport[key] !== 'string' || !names.has(airport[key])) {
            errors.push(`${prefix}: ${key} ${JSON.stringify(airport[key])} is not defined by runways`);
        }
    });

    if (airport.has_terrain === true) {
        const terrainPath = path.join(assetsRoot, 'airports', 'terrain', `${path.basename(airportPath, '.json')}.geojson`);
        if (!fs.existsSync(terrainPath)) {
            errors.push(`${prefix}: has_terrain is true but terrain/${path.basename(terrainPath)} is missing`);
        }
    }
}

function validateTerrain(assetsRoot, filePath, terrain, errors) {
    if (path.extname(filePath) !== '.geojson') {
        return;
    }

    if (!isObject(terrain) || terrain.type !== 'FeatureCollection' || !Array.isArray(terrain.features)) {
        errors.push(`${path.relative(assetsRoot, filePath)}: expected a GeoJSON FeatureCollection`);
    }
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isRealCalendarDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value : '');

    if (match === null) {
        return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (month < 1 || month > 12) {
        return false;
    }

    const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    return day >= 1 && day <= daysInMonth[month - 1];
}

function isValidTimeZone(value) {
    if (!isNonEmptyString(value)) {
        return false;
    }

    try {
        Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

function isAbsoluteHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function validateScheduleSource(prefix, source, errors) {
    if (!isObject(source)) {
        errors.push(`${prefix}: source must be an object`);
        return;
    }

    Object.keys(source).filter((key) => SCHEDULE_SOURCE_KEYS.indexOf(key) === -1).forEach((key) => {
        errors.push(`${prefix}: source has unsupported property ${key}`);
    });

    SCHEDULE_SOURCE_KEYS.forEach((key) => {
        if (!isNonEmptyString(source[key])) {
            errors.push(`${prefix}: source.${key} must be a non-empty string`);
        }
    });

    if (isNonEmptyString(source.retrievedAt) && !isRealCalendarDate(source.retrievedAt)) {
        errors.push(`${prefix}: source.retrievedAt must be a real YYYY-MM-DD calendar date`);
    }
    if (isNonEmptyString(source.url) && !isAbsoluteHttpUrl(source.url)) {
        errors.push(`${prefix}: source.url must be an absolute HTTP URL`);
    }
}

function validateScheduleDocument(assetsRoot, filePath, doc, airlineIcaos, errors) {
    const prefix = path.relative(assetsRoot, filePath);

    if (!isObject(doc)) {
        errors.push(`${prefix}: expected an object`);
        return;
    }

    Object.keys(doc).filter((key) => SCHEDULE_KEYS.indexOf(key) === -1).forEach((key) => {
        errors.push(`${prefix}: unsupported property ${key}`);
    });

    if (doc.schemaVersion !== 1 && doc.schemaVersion !== 2) {
        errors.push(`${prefix}: schemaVersion must equal 1 or 2`);
    }
    if (doc.schemaVersion === 1 && Object.prototype.hasOwnProperty.call(doc, 'profileType')) {
        errors.push(`${prefix}: schemaVersion 1 must not define profileType`);
    }
    if (doc.schemaVersion === 2 && doc.profileType !== 'authored') {
        errors.push(`${prefix}: schemaVersion 2 profileType must equal authored`);
    }
    if (typeof doc.airportIcao !== 'string' || !/^[A-Z]{4}$/.test(doc.airportIcao)) {
        errors.push(`${prefix}: airportIcao must contain exactly four uppercase letters`);
    }
    if (!isValidTimeZone(doc.timezone)) {
        errors.push(`${prefix}: timezone must be a valid IANA time zone`);
    }
    if (!isRealCalendarDate(doc.sampleDate)) {
        errors.push(`${prefix}: sampleDate must be a real YYYY-MM-DD calendar date`);
    }

    validateScheduleSource(prefix, doc.source, errors);
    validateScheduleFlights(prefix, doc, airlineIcaos, errors);
}

function isValidClockTime(value) {
    const match = /^([0-9]{2}):([0-9]{2})$/.exec(typeof value === 'string' ? value : '');

    if (match === null) {
        return false;
    }

    return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function validateScheduleFlight(prefix, flight, doc, airlineIcaos, errors) {
    if (!isObject(flight)) {
        errors.push(`${prefix}: expected an object`);
        return;
    }

    const isAuthored = doc.schemaVersion === 2 && doc.profileType === 'authored';
    const allowedKeys = isAuthored ? AUTHORED_SCHEDULE_FLIGHT_KEYS : OBSERVED_SCHEDULE_FLIGHT_KEYS;

    Object.keys(flight).filter((key) => allowedKeys.indexOf(key) === -1).forEach((key) => {
        errors.push(`${prefix}: unsupported property ${key}`);
    });

    if (!isNonEmptyString(flight.id)) {
        errors.push(`${prefix}: id must be a non-empty string`);
    }
    if (flight.category !== 'arrival' && flight.category !== 'departure') {
        errors.push(`${prefix}: category must be "arrival" or "departure"`);
    }
    if (!isValidClockTime(flight.scheduledTime)) {
        errors.push(`${prefix}: scheduledTime must be a HH:mm local time`);
    }

    if (isAuthored) {
        if (typeof flight.spawnPatternKey !== 'string' || !/^[0-9a-f]{8}$/.test(flight.spawnPatternKey)) {
            errors.push(`${prefix}: spawnPatternKey must contain exactly eight lowercase hexadecimal characters`);
        }
        return;
    }

    if (typeof flight.airlineIcao !== 'string' || !/^[a-z]{3}$/.test(flight.airlineIcao)) {
        errors.push(`${prefix}: airlineIcao must contain exactly three lowercase letters`);
    } else if (!airlineIcaos.has(flight.airlineIcao)) {
        errors.push(`${prefix}: airlineIcao ${flight.airlineIcao} has no assets/airlines/${flight.airlineIcao}.json`);
    }
    if (typeof flight.flightNumber !== 'string' || !/^[0-9A-Za-z]+$/.test(flight.flightNumber)) {
        errors.push(`${prefix}: flightNumber must be non-empty alphanumeric`);
    }
    ['originIcao', 'destinationIcao'].forEach((key) => {
        if (typeof flight[key] !== 'string' || !/^[A-Z]{4}$/.test(flight[key])) {
            errors.push(`${prefix}: ${key} must contain exactly four uppercase letters`);
        }
    });
    if (Object.prototype.hasOwnProperty.call(flight, 'aircraftTypeIcao') &&
        (typeof flight.aircraftTypeIcao !== 'string' || !/^[0-9A-Z]+$/.test(flight.aircraftTypeIcao))) {
        errors.push(`${prefix}: aircraftTypeIcao must be uppercase alphanumeric`);
    }

    if (flight.category === 'arrival') {
        if (flight.destinationIcao !== doc.airportIcao) {
            errors.push(`${prefix}: arrival destinationIcao must equal ${doc.airportIcao}`);
        }
        if (flight.originIcao === doc.airportIcao) {
            errors.push(`${prefix}: arrival originIcao must differ from ${doc.airportIcao}`);
        }
    } else if (flight.category === 'departure') {
        if (flight.originIcao !== doc.airportIcao) {
            errors.push(`${prefix}: departure originIcao must equal ${doc.airportIcao}`);
        }
        if (flight.destinationIcao === doc.airportIcao) {
            errors.push(`${prefix}: departure destinationIcao must differ from ${doc.airportIcao}`);
        }
    }
}

function validateScheduleFlights(prefix, doc, airlineIcaos, errors) {
    if (!Array.isArray(doc.flights)) {
        errors.push(`${prefix}: flights must be an array`);
        return;
    }
    if (doc.flights.length === 0) {
        errors.push(`${prefix}: flights must contain at least one flight`);
        return;
    }

    const seenIds = new Set();
    let previousKey = null;

    doc.flights.forEach((flight, index) => {
        validateScheduleFlight(`${prefix} flights[${index}]`, flight, doc, airlineIcaos, errors);

        if (!isObject(flight)) {
            return;
        }

        if (isNonEmptyString(flight.id)) {
            if (seenIds.has(flight.id)) {
                errors.push(`${prefix}: duplicate flight id ${JSON.stringify(flight.id)}`);
            }
            seenIds.add(flight.id);
        }

        const currentKey = `${flight.scheduledTime} ${flight.id}`;
        if (previousKey !== null && currentKey < previousKey) {
            errors.push(`${prefix}: flights must be ordered by scheduledTime then id`);
        }
        previousKey = currentKey;
    });
}

function validateScheduleDirectory(schedulesRoot, errors) {
    if (!fs.existsSync(schedulesRoot)) {
        return;
    }

    fs.readdirSync(schedulesRoot, { withFileTypes: true }).forEach((entry) => {
        const prefix = `schedules/${entry.name}`;

        if (entry.isDirectory()) {
            errors.push(`${prefix}: nested directories are not allowed`);
        } else if (!entry.isFile() || path.extname(entry.name) !== '.json') {
            errors.push(`${prefix}: only .json files are allowed`);
        }
    });
}

function validateScheduleSchema(schedulesRoot, documents, errors) {
    if (!fs.existsSync(schedulesRoot)) {
        return;
    }

    const schemaPath = path.join(schedulesRoot, 'schedule.schema.json');
    if (!fs.existsSync(schemaPath)) {
        errors.push('schedules/schedule.schema.json: required schedule contract is missing');
        return;
    }

    // Invalid JSON is already reported by loadJsonFiles(). Do not obscure that
    // diagnostic with a second, less useful checksum error.
    if (!documents.has(schemaPath)) {
        return;
    }

    const digest = crypto.createHash('sha256').update(fs.readFileSync(schemaPath)).digest('hex');
    if (digest !== SCHEDULE_SCHEMA_SHA256) {
        errors.push('schedules/schedule.schema.json: contents do not match the reviewed schedule contract');
    }
}

function validateSchedules(assetsRoot, documents, listedIcaos, airlineIcaos, errors) {
    const schedulesRoot = path.join(assetsRoot, 'schedules');
    const loadListPath = path.join(schedulesRoot, 'scheduleLoadList.json');
    const loadList = documents.get(loadListPath);
    const scheduleDocuments = [];

    validateScheduleDirectory(schedulesRoot, errors);
    validateScheduleSchema(schedulesRoot, documents, errors);

    documents.forEach((document, filePath) => {
        if (path.dirname(filePath) !== schedulesRoot) {
            return;
        }

        const name = path.basename(filePath);
        if (name === 'scheduleLoadList.json' || name === 'schedule.schema.json') {
            return;
        }

        scheduleDocuments.push(filePath);
        validateScheduleDocument(assetsRoot, filePath, document, airlineIcaos, errors);
    });

    if (loadList === undefined) {
        if (scheduleDocuments.length > 0) {
            errors.push('schedules/scheduleLoadList.json is required when schedule data exists');
        }
        return 0;
    }

    if (!Array.isArray(loadList)) {
        errors.push('schedules/scheduleLoadList.json: expected an array');
        return 0;
    }

    const listedScheduleIcaos = new Set();
    const listedFiles = new Set();
    let previousIcao = null;

    loadList.forEach((entry, index) => {
        const prefix = `schedules/scheduleLoadList.json[${index}]`;

        if (!isObject(entry)) {
            errors.push(`${prefix}: expected an object`);
            return;
        }

        SCHEDULE_LIST_KEYS.forEach((key) => {
            if (!Object.prototype.hasOwnProperty.call(entry, key)) {
                errors.push(`${prefix}: missing ${key}`);
            }
        });

        Object.keys(entry).filter((key) => SCHEDULE_LIST_KEYS.indexOf(key) === -1).forEach((key) => {
            errors.push(`${prefix}: unsupported property ${key}`);
        });

        const hasValidIcao = typeof entry.icao === 'string' && /^[a-z]{4}$/.test(entry.icao);
        if (!hasValidIcao) {
            errors.push(`${prefix}: icao must contain exactly four lowercase letters`);
        }
        if (typeof entry.file !== 'string' || !/^[a-z0-9_-]+\.json$/.test(entry.file)) {
            errors.push(`${prefix}: file must be a schedule .json filename`);
        }

        if (hasValidIcao) {
            if (listedScheduleIcaos.has(entry.icao)) {
                errors.push(`${prefix}: duplicate ICAO ${entry.icao}`);
            }
            listedScheduleIcaos.add(entry.icao);

            if (previousIcao !== null && entry.icao < previousIcao) {
                errors.push(`${prefix}: ICAO entries must be in alphabetical order`);
            }
            previousIcao = entry.icao;
        }

        if (typeof entry.file === 'string') {
            if (listedFiles.has(entry.file)) {
                errors.push(`${prefix}: duplicate schedule file ${entry.file}`);
            }
            listedFiles.add(entry.file);
        }

        if (hasValidIcao && !listedIcaos.has(entry.icao)) {
            errors.push(`${prefix}: airport ${entry.icao} is not listed in airportLoadList.json`);
        }

        if (typeof entry.file === 'string' && /^[a-z0-9_-]+\.json$/.test(entry.file)) {
            const documentPath = path.join(schedulesRoot, entry.file);
            const document = documents.get(documentPath);

            if (document === undefined) {
                errors.push(`${prefix}: missing schedules/${entry.file}`);
            } else if (hasValidIcao && isObject(document) && typeof document.airportIcao === 'string' &&
                document.airportIcao !== entry.icao.toUpperCase()) {
                errors.push(`${prefix}: ${entry.file} airportIcao must be ${entry.icao.toUpperCase()}`);
            }
        }
    });

    scheduleDocuments.forEach((filePath) => {
        const name = path.basename(filePath);
        if (!listedFiles.has(name)) {
            errors.push(`schedules/${name}: schedule is not listed in scheduleLoadList.json`);
        }
    });

    return loadList.length;
}

function validateAssets(assetsRoot) {
    const resolvedRoot = path.resolve(assetsRoot);
    const errors = [];
    const loaded = loadJsonFiles(resolvedRoot, errors);
    const listedIcaos = validateAirportList(resolvedRoot, loaded.documents, errors);
    const airportsRoot = path.join(resolvedRoot, 'airports');
    const airlinesRoot = path.join(resolvedRoot, 'airlines');
    const airlineIcaos = new Set();

    loaded.documents.forEach((document, filePath) => {
        const parent = path.dirname(filePath);
        const name = path.basename(filePath);

        if (parent === airlinesRoot && path.extname(name) === '.json') {
            const filenameIcao = path.basename(name, '.json');

            if (!isObject(document) || document.icao !== filenameIcao) {
                errors.push(`airlines/${name}: icao must match filename ${filenameIcao}`);
            } else {
                airlineIcaos.add(filenameIcao);
            }
        }

        if (parent === airportsRoot && name !== 'airportLoadList.json' && name !== 'airportLoadList.schema.json') {
            const icao = path.basename(filePath, '.json');
            if (!listedIcaos.has(icao)) {
                errors.push(`airports/${name}: airport is not listed in airportLoadList.json`);
            }
            validateAirport(resolvedRoot, filePath, document, errors);
        }
        validateTerrain(resolvedRoot, filePath, document, errors);
    });

    const scheduleCount = validateSchedules(resolvedRoot, loaded.documents, listedIcaos, airlineIcaos, errors);

    errors.sort();
    return {
        errors,
        fileCount: loaded.fileCount,
        airportCount: listedIcaos.size,
        scheduleCount
    };
}

function main() {
    const assetsRoot = process.argv[2] || path.join(process.cwd(), 'assets');
    const result = validateAssets(assetsRoot);

    if (result.errors.length > 0) {
        console.error(`Asset validation failed with ${result.errors.length} error(s):`);
        result.errors.forEach((error) => console.error(`- ${error}`));
        process.exitCode = 1;
        return;
    }

    console.log(`Asset validation passed: ${result.fileCount} JSON/GeoJSON files, ${result.airportCount} airports`);
}

if (require.main === module) {
    main();
}

module.exports = { validateAssets, validateScheduleDocument };
