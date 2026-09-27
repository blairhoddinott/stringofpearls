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

function validSchedule(icao) {
    const upper = icao.toUpperCase();

    return {
        schemaVersion: 1,
        airportIcao: upper,
        timezone: 'America/Los_Angeles',
        sampleDate: '2026-07-15',
        source: {
            name: 'US DOT BTS Reporting Carrier On-Time Performance',
            url: 'https://transtats.bts.gov/PREZIP/',
            retrievedAt: '2026-09-26',
            license: 'U.S. Government public domain',
            coverage: 'Domestic reporting carriers, representative day'
        },
        flights: [
            {
                id: 'arr-1',
                category: 'arrival',
                scheduledTime: '08:15',
                airlineIcao: 'asa',
                flightNumber: '123',
                originIcao: 'KPDX',
                destinationIcao: upper
            },
            {
                id: 'dep-1',
                category: 'departure',
                scheduledTime: '09:30',
                airlineIcao: 'asa',
                flightNumber: '456',
                originIcao: upper,
                destinationIcao: 'KPDX',
                aircraftTypeIcao: 'B738'
            }
        ]
    };
}

function scheduleLoadEntry(icao) {
    return { icao: icao.toLowerCase(), file: `${icao.toLowerCase()}.json` };
}

function createScheduleFixture() {
    const root = createFixture();
    const schedules = path.join(root, 'schedules');

    writeJson(path.join(root, 'airlines', 'asa.json'), { icao: 'asa' });
    writeJson(path.join(schedules, 'scheduleLoadList.json'), [scheduleLoadEntry('ktst')]);
    fs.copyFileSync(
        path.join(__dirname, '..', 'assets', 'schedules', 'schedule.schema.json'),
        path.join(schedules, 'schedule.schema.json')
    );
    writeJson(path.join(schedules, 'ktst.json'), validSchedule('ktst'));

    return root;
}

function withScheduleFixture(test) {
    const root = createScheduleFixture();
    try {
        test(root);
    } finally {
        removeTree(root);
    }
}

function readSchedule(root) {
    return readJson(path.join(root, 'schedules', 'ktst.json'));
}

function writeSchedule(root, schedule) {
    writeJson(path.join(root, 'schedules', 'ktst.json'), schedule);
}

function expectScheduleError(mutate, expectedMessage) {
    withScheduleFixture((root) => {
        mutate(root);
        const errors = validateAssets(root).errors;
        assert(
            errors.some((error) => error.includes(expectedMessage)),
            `expected error containing ${JSON.stringify(expectedMessage)}, received:\n${errors.join('\n')}`
        );
    });
}

function mutateScheduleList(root, mutate) {
    const loadListPath = path.join(root, 'schedules', 'scheduleLoadList.json');
    const loadList = readJson(loadListPath);
    mutate(loadList);
    writeJson(loadListPath, loadList);
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

// Schedules: a legacy fixture with no schedules directory stays valid.
withFixture((root) => {
    const result = validateAssets(root);
    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.scheduleCount, 0);
});

// Schedules: data cannot silently bypass validation when its load list is missing.
withScheduleFixture((root) => {
    fs.rmSync(path.join(root, 'schedules', 'scheduleLoadList.json'));
    const result = validateAssets(root);

    assert(
        result.errors.some((error) => error.includes('scheduleLoadList.json is required when schedule data exists')),
        `expected a missing schedule load-list error, received:\n${result.errors.join('\n')}`
    );
    assert.strictEqual(result.scheduleCount, 0);
});

// Schedules: only top-level JSON assets may enter the publication directory.
withScheduleFixture((root) => {
    fs.writeFileSync(path.join(root, 'schedules', 'raw.csv'), 'source data must not ship\n');
    writeJson(path.join(root, 'schedules', 'nested', 'hidden.json'), validSchedule('ktst'));
    const errors = validateAssets(root).errors;

    assert(errors.includes('schedules/nested: nested directories are not allowed'));
    assert(errors.includes('schedules/raw.csv: only .json files are allowed'));
});

// Schedules: the published schema is mandatory and pinned to the reviewed versioned contract.
expectScheduleError(
    (root) => fs.rmSync(path.join(root, 'schedules', 'schedule.schema.json')),
    'schedules/schedule.schema.json: required schedule contract is missing'
);

expectScheduleError(
    (root) => writeJson(path.join(root, 'schedules', 'schedule.schema.json'), {}),
    'schedules/schedule.schema.json: contents do not match the reviewed schedule contract'
);

// Schedules: a well-formed schedule fixture validates and is counted.
withScheduleFixture((root) => {
    const result = validateAssets(root);
    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.scheduleCount, 1);
});

// Schedules: top-level document field rules.
expectScheduleError(
    (root) => writeSchedule(root, { ...readSchedule(root), schemaVersion: 3 }),
    'schedules/ktst.json: schemaVersion must equal 1 or 2'
);

expectScheduleError(
    (root) => writeSchedule(root, { ...readSchedule(root), airportIcao: 'ktst' }),
    'schedules/ktst.json: airportIcao must contain exactly four uppercase letters'
);

expectScheduleError(
    (root) => writeSchedule(root, { ...readSchedule(root), timezone: 'Mars/Phobos' }),
    'schedules/ktst.json: timezone must be a valid IANA time zone'
);

expectScheduleError(
    (root) => writeSchedule(root, { ...readSchedule(root), sampleDate: '2026-02-30' }),
    'schedules/ktst.json: sampleDate must be a real YYYY-MM-DD calendar date'
);

expectScheduleError(
    (root) => writeSchedule(root, { ...readSchedule(root), sampleDate: '2026-7-15' }),
    'schedules/ktst.json: sampleDate must be a real YYYY-MM-DD calendar date'
);

expectScheduleError(
    (root) => {
        const schedule = readSchedule(root);
        schedule.source.name = '';
        writeSchedule(root, schedule);
    },
    'schedules/ktst.json: source.name must be a non-empty string'
);

expectScheduleError(
    (root) => {
        const schedule = readSchedule(root);
        schedule.source.retrievedAt = '2026-02-30';
        writeSchedule(root, schedule);
    },
    'schedules/ktst.json: source.retrievedAt must be a real YYYY-MM-DD calendar date'
);

expectScheduleError(
    (root) => {
        const schedule = readSchedule(root);
        schedule.source.url = 'not a URL';
        writeSchedule(root, schedule);
    },
    'schedules/ktst.json: source.url must be an absolute HTTP URL'
);

expectScheduleError(
    (root) => {
        const schedule = readSchedule(root);
        delete schedule.source.coverage;
        writeSchedule(root, schedule);
    },
    'schedules/ktst.json: source.coverage must be a non-empty string'
);

expectScheduleError(
    (root) => {
        const schedule = readSchedule(root);
        delete schedule.source;
        writeSchedule(root, schedule);
    },
    'schedules/ktst.json: source must be an object'
);

expectScheduleError(
    (root) => writeSchedule(root, { ...readSchedule(root), extra: true }),
    'schedules/ktst.json: unsupported property extra'
);

expectScheduleError(
    (root) => writeSchedule(root, { ...readSchedule(root), flights: {} }),
    'schedules/ktst.json: flights must be an array'
);

expectScheduleError(
    (root) => writeSchedule(root, { ...readSchedule(root), flights: [] }),
    'schedules/ktst.json: flights must contain at least one flight'
);

// Schedules: individual flight record rules.
function mutateFlight(root, index, mutate) {
    const schedule = readSchedule(root);
    mutate(schedule.flights[index]);
    writeSchedule(root, schedule);
}

expectScheduleError(
    (root) => mutateFlight(root, 0, (flight) => { flight.id = ''; }),
    'schedules/ktst.json flights[0]: id must be a non-empty string'
);

expectScheduleError(
    (root) => mutateFlight(root, 0, (flight) => { flight.category = 'overflight'; }),
    'schedules/ktst.json flights[0]: category must be "arrival" or "departure"'
);

expectScheduleError(
    (root) => mutateFlight(root, 0, (flight) => { flight.scheduledTime = '8:15'; }),
    'schedules/ktst.json flights[0]: scheduledTime must be a HH:mm local time'
);

expectScheduleError(
    (root) => mutateFlight(root, 0, (flight) => { flight.scheduledTime = '24:00'; }),
    'schedules/ktst.json flights[0]: scheduledTime must be a HH:mm local time'
);

expectScheduleError(
    (root) => mutateFlight(root, 0, (flight) => { flight.airlineIcao = 'AS'; }),
    'schedules/ktst.json flights[0]: airlineIcao must contain exactly three lowercase letters'
);

expectScheduleError(
    (root) => mutateFlight(root, 0, (flight) => { flight.airlineIcao = 'zzz'; }),
    'schedules/ktst.json flights[0]: airlineIcao zzz has no assets/airlines/zzz.json'
);

expectScheduleError(
    (root) => writeJson(path.join(root, 'airlines', 'asa.json'), { icao: 'not-asa' }),
    'airlines/asa.json: icao must match filename asa'
);

expectScheduleError(
    (root) => mutateFlight(root, 0, (flight) => { flight.flightNumber = '12-3'; }),
    'schedules/ktst.json flights[0]: flightNumber must be non-empty alphanumeric'
);

expectScheduleError(
    (root) => mutateFlight(root, 0, (flight) => { flight.originIcao = 'kpdx'; }),
    'schedules/ktst.json flights[0]: originIcao must contain exactly four uppercase letters'
);

expectScheduleError(
    (root) => mutateFlight(root, 1, (flight) => { flight.destinationIcao = 'KP'; }),
    'schedules/ktst.json flights[1]: destinationIcao must contain exactly four uppercase letters'
);

expectScheduleError(
    (root) => mutateFlight(root, 1, (flight) => { flight.aircraftTypeIcao = 'b738'; }),
    'schedules/ktst.json flights[1]: aircraftTypeIcao must be uppercase alphanumeric'
);

expectScheduleError(
    (root) => mutateFlight(root, 0, (flight) => { flight.surprise = true; }),
    'schedules/ktst.json flights[0]: unsupported property surprise'
);

// Arrival must terminate at the schedule airport and originate elsewhere.
expectScheduleError(
    (root) => mutateFlight(root, 0, (flight) => { flight.destinationIcao = 'KPDX'; }),
    'schedules/ktst.json flights[0]: arrival destinationIcao must equal KTST'
);

expectScheduleError(
    (root) => mutateFlight(root, 0, (flight) => { flight.originIcao = 'KTST'; }),
    'schedules/ktst.json flights[0]: arrival originIcao must differ from KTST'
);

// Departure must originate at the schedule airport and terminate elsewhere.
expectScheduleError(
    (root) => mutateFlight(root, 1, (flight) => { flight.originIcao = 'KPDX'; }),
    'schedules/ktst.json flights[1]: departure originIcao must equal KTST'
);

expectScheduleError(
    (root) => mutateFlight(root, 1, (flight) => { flight.destinationIcao = 'KTST'; }),
    'schedules/ktst.json flights[1]: departure destinationIcao must differ from KTST'
);

// Flight identifiers must be unique within a schedule.
expectScheduleError(
    (root) => {
        const schedule = readSchedule(root);
        schedule.flights[1].id = schedule.flights[0].id;
        writeSchedule(root, schedule);
    },
    'schedules/ktst.json: duplicate flight id "arr-1"'
);

// Flights must be ordered by scheduledTime then id.
expectScheduleError(
    (root) => {
        const schedule = readSchedule(root);
        schedule.flights.reverse();
        writeSchedule(root, schedule);
    },
    'schedules/ktst.json: flights must be ordered by scheduledTime then id'
);

// Schedule load list: strict entry structure and format.
expectScheduleError(
    (root) => mutateScheduleList(root, (list) => { list[0] = ['not', 'an', 'object']; }),
    'schedules/scheduleLoadList.json[0]: expected an object'
);

expectScheduleError(
    (root) => mutateScheduleList(root, (list) => { delete list[0].file; }),
    'schedules/scheduleLoadList.json[0]: missing file'
);

expectScheduleError(
    (root) => mutateScheduleList(root, (list) => { list[0].note = 'nope'; }),
    'schedules/scheduleLoadList.json[0]: unsupported property note'
);

expectScheduleError(
    (root) => mutateScheduleList(root, (list) => { list[0].icao = 'KTST'; }),
    'schedules/scheduleLoadList.json[0]: icao must contain exactly four lowercase letters'
);

expectScheduleError(
    (root) => mutateScheduleList(root, (list) => { list[0].file = 'ktst.txt'; }),
    'schedules/scheduleLoadList.json[0]: file must be a schedule .json filename'
);

expectScheduleError(
    (root) => mutateScheduleList(root, (list) => { list[0].file = '../ktst.json'; }),
    'schedules/scheduleLoadList.json[0]: file must be a schedule .json filename'
);

// Schedule load list: ordering and uniqueness.
expectScheduleError(
    (root) => mutateScheduleList(root, (list) => { list.push(scheduleLoadEntry('kaaa')); }),
    'schedules/scheduleLoadList.json[1]: ICAO entries must be in alphabetical order'
);

expectScheduleError(
    (root) => mutateScheduleList(root, (list) => { list.push(scheduleLoadEntry('ktst')); }),
    'schedules/scheduleLoadList.json[1]: duplicate ICAO ktst'
);

expectScheduleError(
    (root) => mutateScheduleList(root, (list) => { list.push({ icao: 'kuuu', file: 'ktst.json' }); }),
    'schedules/scheduleLoadList.json[1]: duplicate schedule file ktst.json'
);

// Schedule load list: referenced airport must exist in airportLoadList.
expectScheduleError(
    (root) => {
        mutateScheduleList(root, (list) => { list.push(scheduleLoadEntry('kzzz')); });
        writeJson(path.join(root, 'schedules', 'kzzz.json'), validSchedule('kzzz'));
    },
    'schedules/scheduleLoadList.json[1]: airport kzzz is not listed in airportLoadList.json'
);

// Schedule load list: referenced file must exist.
expectScheduleError(
    (root) => mutateScheduleList(root, (list) => { list.push({ icao: 'kuuu', file: 'kuuu.json' }); }),
    'schedules/scheduleLoadList.json[1]: missing schedules/kuuu.json'
);

// Schedule load list: schedule airportIcao must match the entry ICAO.
expectScheduleError(
    (root) => writeSchedule(root, validSchedule('kzzz')),
    'schedules/scheduleLoadList.json[0]: ktst.json airportIcao must be KTST'
);

// Schedule directory: every schedule data document must be listed.
expectScheduleError(
    (root) => writeJson(path.join(root, 'schedules', 'kfoo.json'), validSchedule('kfoo')),
    'schedules/kfoo.json: schedule is not listed in scheduleLoadList.json'
);

console.log('Asset validator tests passed');
