'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateAssets } = require('./validate-assets');

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validAirport(icao) {
    return {
        arrivalRunway: '16L',
        ctr_ceiling: 15000,
        ctr_radius: 50,
        departureRunway: '34R',
        fixes: {},
        has_terrain: true,
        iata: icao.slice(1),
        icao,
        initial_alt: 5000,
        magnetic_north: 0,
        position: [1, 2],
        radio: { app: 'Test Approach', dep: 'Test Departure', twr: 'Test Tower' },
        rangeRings: { enabled: true, center: [1, 2], radius_nm: 5 },
        runways: [{ name: ['16L', '34R'], end: [[1, 2], [3, 4]], ils: [true, true] }],
        sids: {},
        wind: { angle: 180, speed: 5 }
    };
}

function validLoadListEntry(icao) {
    return {
        icao: icao.toLowerCase(),
        level: 'beginner',
        name: 'Test Airport',
        premium: false
    };
}

function createFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stringofpearls-assets-'));
    const airports = path.join(root, 'airports');

    writeJson(path.join(airports, 'airportLoadList.json'), [validLoadListEntry('ktst')]);
    writeJson(path.join(airports, 'ktst.json'), validAirport('KTST'));
    writeJson(path.join(airports, 'terrain', 'ktst.geojson'), {
        type: 'FeatureCollection',
        features: []
    });

    return root;
}

function removeTree(target) {
    if (!fs.existsSync(target)) {
        return;
    }

    fs.readdirSync(target).forEach((name) => {
        const child = path.join(target, name);
        if (fs.statSync(child).isDirectory()) {
            removeTree(child);
        } else {
            fs.unlinkSync(child);
        }
    });
    fs.rmdirSync(target);
}

function withFixture(test) {
    const root = createFixture();
    try {
        test(root);
    } finally {
        removeTree(root);
    }
}

function expectValidationError(mutate, expectedMessage) {
    withFixture((root) => {
        mutate(root);
        const errors = validateAssets(root).errors;
        assert(
            errors.some((error) => error.includes(expectedMessage)),
            `expected error containing ${JSON.stringify(expectedMessage)}, received:\n${errors.join('\n')}`
        );
    });
}

function mutateLoadList(root, mutate) {
    const loadListPath = path.join(root, 'airports', 'airportLoadList.json');
    const loadList = readJson(loadListPath);
    mutate(loadList);
    writeJson(loadListPath, loadList);
}

withFixture((root) => {
    assert.deepStrictEqual(validateAssets(root).errors, []);
});

withFixture((root) => {
    mutateLoadList(root, (loadList) => {
        loadList[0]._comment = 'A schema-supported comment';
        loadList[0].disabled = false;
    });
    assert.deepStrictEqual(validateAssets(root).errors, []);
});

expectValidationError(
    (root) => fs.writeFileSync(path.join(root, 'broken.json'), '{ nope'),
    'broken.json: invalid JSON'
);

expectValidationError(
    (root) => mutateLoadList(root, (loadList) => { loadList[0].icao = 'tst'; }),
    'icao must contain exactly four lowercase letters'
);

expectValidationError(
    (root) => mutateLoadList(root, (loadList) => { loadList[0].icao = 'k1st'; }),
    'icao must contain exactly four lowercase letters'
);

expectValidationError(
    (root) => mutateLoadList(root, (loadList) => { loadList[0].level = 'expert'; }),
    'unsupported difficulty level "expert"'
);

expectValidationError(
    (root) => mutateLoadList(root, (loadList) => { loadList[0].notes = 'not in the schema'; }),
    'unsupported property notes'
);

expectValidationError(
    (root) => mutateLoadList(root, (loadList) => { loadList[0]._comment = true; }),
    '_comment must be a string when present'
);

expectValidationError(
    (root) => mutateLoadList(root, (loadList) => { loadList.push(validLoadListEntry('ktst')); }),
    'duplicate ICAO ktst'
);

expectValidationError(
    (root) => {
        mutateLoadList(root, (loadList) => { loadList.push(validLoadListEntry('kaaa')); });
        const airport = validAirport('KAAA');
        airport.has_terrain = false;
        writeJson(path.join(root, 'airports', 'kaaa.json'), airport);
    },
    'ICAO entries must be in alphabetical order'
);

expectValidationError(
    (root) => fs.unlinkSync(path.join(root, 'airports', 'ktst.json')),
    'missing airports/ktst.json'
);

expectValidationError(
    (root) => {
        const airport = validAirport('KFOO');
        airport.has_terrain = false;
        writeJson(path.join(root, 'airports', 'kfoo.json'), airport);
    },
    'airport is not listed in airportLoadList.json'
);

expectValidationError(
    (root) => fs.unlinkSync(path.join(root, 'airports', 'airportLoadList.json')),
    'airportLoadList.json: expected an array'
);

expectValidationError(
    (root) => {
        const airportPath = path.join(root, 'airports', 'ktst.json');
        const airport = validAirport('KTST');
        delete airport.wind;
        writeJson(airportPath, airport);
    },
    'missing wind'
);

expectValidationError(
    (root) => {
        const airportPath = path.join(root, 'airports', 'ktst.json');
        const airport = validAirport('KTST');
        airport.arrivalRunway = '99';
        writeJson(airportPath, airport);
    },
    'arrivalRunway "99" is not defined by runways'
);

expectValidationError(
    (root) => {
        const airportPath = path.join(root, 'airports', 'ktst.json');
        const airport = validAirport('KTST');
        airport.runways[0].name = ['16L'];
        writeJson(airportPath, airport);
    },
    'name must contain two runway identifiers'
);

expectValidationError(
    (root) => fs.unlinkSync(path.join(root, 'airports', 'terrain', 'ktst.geojson')),
    'has_terrain is true'
);

expectValidationError(
    (root) => writeJson(path.join(root, 'airports', 'terrain', 'ktst.geojson'), {
        type: 'Feature',
        geometry: null
    }),
    'expected a GeoJSON FeatureCollection'
);

console.log('Asset validator tests passed');
