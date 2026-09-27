'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    compileAuthoredSchedule,
    publishAuthoredSchedule
} = require('./compile-authored-schedule');
const { validateScheduleDocument } = require('../validate-assets');

const source = {
    name: 'stringofpearls airport-authored spawn patterns',
    url: 'https://github.com/blairhoddinott/stringofpearls',
    retrievedAt: '2026-09-27',
    license: 'MIT',
    coverage: 'Deterministic representative profile compiled from reviewed airport-authored rates and routes.'
};

const departure = {
    origin: 'EDDF',
    destination: '',
    category: 'departure',
    route: 'EDDF18.ANEK9L.ANEKI',
    altitude: '',
    speed: '',
    method: 'random',
    rate: 0.125,
    airlines: [['dlh/short', 2], ['baw/short', 1]]
};
const arrival = {
    origin: '',
    destination: 'EDDF',
    category: 'arrival',
    route: 'ANEKI.ANEK1A.EDDF25L',
    centerHandoffFix: 'ANEKI',
    altitude: 24000,
    speed: 280,
    method: 'random',
    rate: 0.125,
    airlines: [['dlh/short', 1]]
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function validate(document) {
    const errors = [];
    validateScheduleDocument('/assets', '/assets/schedules/eddf.json', document, new Set(), errors);
    return errors;
}

(function compilesCanonicalAuthoredSlots() {
    const document = compileAuthoredSchedule({
        airportJson: { icao: 'eddf', spawnPatterns: [departure, arrival] },
        airportIcao: 'EDDF',
        timezone: 'Europe/Berlin',
        sampleDate: '2026-07-15',
        source
    });

    assert.strictEqual(document.schemaVersion, 2);
    assert.strictEqual(document.profileType, 'authored');
    assert.strictEqual(document.airportIcao, 'EDDF');
    assert.strictEqual(document.flights.length, 6);
    assert.deepStrictEqual(validate(document), []);
    document.flights.forEach((flight) => {
        assert.deepStrictEqual(Object.keys(flight).sort(), ['category', 'id', 'scheduledTime', 'spawnPatternKey']);
        assert.match(flight.spawnPatternKey, /^[0-9a-f]{8}$/);
    });
    assert(document.flights.some((flight) => flight.category === 'arrival'));
    assert(document.flights.some((flight) => flight.category === 'departure'));
})();

(function isIndependentOfObjectKeyAndPatternOrder() {
    const reorderedDeparture = {
        airlines: clone(departure.airlines),
        rate: departure.rate,
        method: departure.method,
        speed: departure.speed,
        altitude: departure.altitude,
        route: departure.route,
        category: departure.category,
        destination: departure.destination,
        origin: departure.origin
    };
    const first = compileAuthoredSchedule({
        airportJson: { icao: 'eddf', spawnPatterns: [departure, arrival] },
        airportIcao: 'EDDF', timezone: 'Europe/Berlin', sampleDate: '2026-07-15', source
    });
    const second = compileAuthoredSchedule({
        airportJson: { spawnPatterns: [clone(arrival), reorderedDeparture], icao: 'eddf' },
        airportIcao: 'EDDF', timezone: 'Europe/Berlin', sampleDate: '2026-07-15', source: clone(source)
    });

    assert.deepStrictEqual(second, first);
})();

(function allocatesFractionalPatternRatesAtCategoryLevel() {
    const tinyDepartureA = { ...departure, route: 'EDDF18.TINY1A.TINY', rate: 0.02 };
    const tinyDepartureB = { ...departure, route: 'EDDF18.TINY1B.TINY', rate: 0.02 };
    const document = compileAuthoredSchedule({
        airportJson: { icao: 'eddf', spawnPatterns: [departure, tinyDepartureA, tinyDepartureB, arrival] },
        airportIcao: 'EDDF', timezone: 'Europe/Berlin', sampleDate: '2026-07-15', source
    });
    const departureFlights = document.flights.filter((flight) => flight.category === 'departure');

    assert.strictEqual(
        departureFlights.length,
        Math.round((departure.rate + tinyDepartureA.rate + tinyDepartureB.rate) * 24)
    );
    assert.strictEqual(new Set(departureFlights.map((flight) => flight.spawnPatternKey)).size, 2);
})();

(function rejectsDuplicatePatterns() {
    assert.throws(() => compileAuthoredSchedule({
        airportJson: { icao: 'eddf', spawnPatterns: [departure, { ...departure, rate: 0.25 }, arrival] },
        airportIcao: 'EDDF', timezone: 'Europe/Berlin', sampleDate: '2026-07-15', source
    }), /duplicate spawn pattern key/i);
})();

(function preservesExistingDestinationOnFailure() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'authored-schedule-'));
    const destination = path.join(directory, 'eddf.json');
    fs.writeFileSync(destination, 'keep me\n');

    assert.throws(() => publishAuthoredSchedule({
        airportJson: { icao: 'eddf', spawnPatterns: [departure, arrival] },
        airportIcao: 'EDDF', timezone: 'Not/A_Timezone', sampleDate: '2026-07-15', source,
        destination
    }), /timezone/i);
    assert.strictEqual(fs.readFileSync(destination, 'utf8'), 'keep me\n');
})();

console.log('compile-authored-schedule tests passed');
