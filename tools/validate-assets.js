'use strict';

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

function validateAssets(assetsRoot) {
    const resolvedRoot = path.resolve(assetsRoot);
    const errors = [];
    const loaded = loadJsonFiles(resolvedRoot, errors);
    const listedIcaos = validateAirportList(resolvedRoot, loaded.documents, errors);
    const airportsRoot = path.join(resolvedRoot, 'airports');

    loaded.documents.forEach((document, filePath) => {
        const parent = path.dirname(filePath);
        const name = path.basename(filePath);

        if (parent === airportsRoot && name !== 'airportLoadList.json' && name !== 'airportLoadList.schema.json') {
            const icao = path.basename(filePath, '.json');
            if (!listedIcaos.has(icao)) {
                errors.push(`airports/${name}: airport is not listed in airportLoadList.json`);
            }
            validateAirport(resolvedRoot, filePath, document, errors);
        }
        validateTerrain(resolvedRoot, filePath, document, errors);
    });

    errors.sort();
    return {
        errors,
        fileCount: loaded.fileCount,
        airportCount: listedIcaos.size
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

module.exports = { validateAssets };
