'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const airportList = readJson('assets/airports/airportLoadList.json');
const airportEntry = airportList.find((entry) => entry.icao === 'cyyz');
assert.deepStrictEqual(airportEntry, {
    icao: 'cyyz',
    level: 'medium',
    name: 'Toronto Pearson International Airport',
    premium: false
});

const airport = readJson('assets/airports/cyyz.json');
assert.strictEqual(airport.airac, 2609);
assert.strictEqual(airport.icao, 'CYYZ');
assert.strictEqual(airport.iata, 'YYZ');
assert.strictEqual(airport.arrivalRunway, '24L');
assert.strictEqual(airport.departureRunway, '24R');
assert.strictEqual(airport.has_terrain, true);
assert.deepStrictEqual(airport.runways.map((runway) => runway.name), [
    ['05', '23'],
    ['06L', '24R'],
    ['06R', '24L'],
    ['15L', '33R'],
    ['15R', '33L']
]);

const expectedSids = [
    'ANCOL5', 'ARROW4', 'AVSEP7', 'BETES3', 'BOMET8', 'DEDKI5', 'DUSOM3',
    'EBKIN4', 'GOPUP4', 'IKLEN3', 'KEPTA3', 'KISEP4', 'LAKES4', 'MATES6',
    'MAVAN3', 'MIXUT7', 'NOSIK4', 'NUGOP6', 'OAKVL3', 'PEMBA6', 'PERLO5',
    'RIGUS5', 'SEDOG6', 'TEVAD3', 'TRNTO4', 'TULEK4', 'URSAL4', 'VERDO7'
];
const expectedStars = [
    'BOXUM7', 'DUVOS4', 'IMEBA9', 'LINNG3', 'NAKBO6',
    'NUBER6', 'RAGID6', 'UDNOX5', 'VERKO1', 'VIBLI6'
];
assert.deepStrictEqual(Object.keys(airport.sids).sort(), expectedSids);
assert.deepStrictEqual(Object.keys(airport.stars).sort(), expectedStars);
assert.deepStrictEqual(airport.sids.ARROW4.rwy.CYYZ05, ['#055']);
assert.deepStrictEqual(airport.sids.ARROW4.rwy.CYYZ23, ['#240']);
assert.deepStrictEqual(airport.sids.TRNTO4.rwy.CYYZ05, ['#057']);
assert.notDeepStrictEqual(airport.sids.ARROW4.rwy, airport.sids.TRNTO4.rwy);
assert.deepStrictEqual(Object.keys(airport.stars.DUVOS4.entryPoints).sort(), ['IRKIM', 'OTNIK', 'SSM']);
assert.strictEqual(airport.stars.NAKBO6.entryPoints.FINGL[0][1], 'A190-');
assert.strictEqual(airport.stars.NUBER6.entryPoints.FINGL[0][1], 'A190-');
assert.deepStrictEqual(airport.stars.NUBER6.rwy.CYYZ23[2], ['MANUP', 'A80+|S220-']);
assert.deepStrictEqual(airport.stars.RAGID6.entryPoints.UDNOX, ['UDNOX']);
assert.deepStrictEqual(airport.stars.UDNOX5.entryPoints.UDNOX, ['UDNOX']);
const arrivalSpawnPatterns = airport.spawnPatterns.filter((pattern) => pattern.category === 'arrival');
const expectedHandoffFixes = {
    BOXUM7: 'DUVOS',
    DUVOS4: 'DUVOS',
    IMEBA9: 'LEPUX',
    LINNG3: 'MYPAL',
    NAKBO6: 'NUBER',
    NUBER6: 'NUBER',
    RAGID6: 'DENKA',
    UDNOX5: 'DENKA',
    VERKO1: 'MYPAL',
    VIBLI6: 'LEPUX'
};
arrivalSpawnPatterns.forEach((pattern) => {
    const procedure = pattern.route.split('.')[1];
    assert.strictEqual(pattern.altitude, '33000');
    assert.strictEqual(pattern.speed, '290');
    assert.strictEqual(pattern.centerHandoffFix, expectedHandoffFixes[procedure]);
});
const arrivalSpawnRoutes = arrivalSpawnPatterns
    .map((pattern) => pattern.route)
    .sort();
assert.deepStrictEqual(arrivalSpawnRoutes, [
    'LETAK.IMEBA9.CYYZ24L',
    'LETAK.VIBLI6.CYYZ24L',
    'MONEE.NAKBO6.CYYZ24L',
    'MONEE.NUBER6.CYYZ24L',
    'OTNIK.BOXUM7.CYYZ24L',
    'OXMAN.LINNG3.CYYZ24L',
    'OXMAN.VERKO1.CYYZ24L',
    'SSM.DUVOS4.CYYZ24L',
    'TUKIR.RAGID6.CYYZ24L',
    'TUKIR.UDNOX5.CYYZ24L'
]);

const runwayNames = new Set(airport.runways.flatMap((runway) => runway.name.map((name) => `CYYZ${name}`)));
const routeFixes = new Set();
const collectFix = (token) => {
    const value = Array.isArray(token) ? token[0] : token;
    if (typeof value !== 'string' || value.startsWith('#') || value.startsWith('^')) {
        return;
    }
    routeFixes.add(value.replace(/\*$/, ''));
};
for (const procedures of [airport.sids, airport.stars]) {
    Object.entries(procedures).forEach(([name, procedure]) => {
        assert.strictEqual(procedure.icao, name, `${name} must preserve its canonical identifier`);
        assert.ok(Object.keys(procedure.rwy).length > 0, `${name} must define at least one runway route`);
        Object.entries(procedure.rwy).forEach(([runway, route]) => {
            assert.ok(runwayNames.has(runway), `${name} references unknown runway ${runway}`);
            route.forEach(collectFix);
        });
        Object.values(procedure.entryPoints || {}).flat().forEach(collectFix);
        Object.values(procedure.exitPoints || {}).flat().forEach(collectFix);
        (procedure.body || []).forEach(collectFix);
        if (Object.prototype.hasOwnProperty.call(procedure, 'draw')) {
            assert.ok(Array.isArray(procedure.draw) && procedure.draw.length > 0, `${name} draw must contain route segments when supplied`);
            assert.ok(procedure.draw.every((segment) => Array.isArray(segment) && segment.length > 0), `${name} draw segments must be non-empty routes`);
        }
    });
}
const missingFixes = [...routeFixes].filter((fix) => !Object.prototype.hasOwnProperty.call(airport.fixes, fix)).sort();
assert.deepStrictEqual(missingFixes, [], `all procedure fixes must resolve: ${missingFixes.join(', ')}`);

const terrain = readJson('assets/airports/terrain/cyyz.geojson');
assert.strictEqual(terrain.type, 'FeatureCollection');
assert.ok(Array.isArray(terrain.features) && terrain.features.length > 0);
terrain.features.forEach((feature) => {
    assert.strictEqual(feature.type, 'Feature');
    assert.strictEqual(feature.geometry.type, 'Polygon');
    assert.ok(Number.isFinite(feature.properties.elevation));
    assert.ok(feature.geometry.coordinates[0].length >= 4);
});

const scheduleList = readJson('assets/schedules/scheduleLoadList.json');
assert.deepStrictEqual(scheduleList.find((entry) => entry.icao === 'cyyz'), {
    icao: 'cyyz',
    file: 'cyyz.json'
});
const schedule = readJson('assets/schedules/cyyz.json');
assert.strictEqual(schedule.airportIcao, 'CYYZ');
assert.strictEqual(schedule.timezone, 'America/Toronto');
assert.strictEqual(schedule.schemaVersion, 2);
assert.strictEqual(schedule.profileType, 'authored');
assert.strictEqual(schedule.flights.length, 1076);
assert.ok(schedule.flights.some((flight) => flight.category === 'arrival'));
assert.ok(schedule.flights.some((flight) => flight.category === 'departure'));

assert.ok(exists('documentation/airport-guides/cyyz.md'));
assert.ok(exists('documentation/sources/cyyz.md'));

const smokeSource = fs.readFileSync(path.join(root, 'tools/browser-smoke/smoke.js'), 'utf8');
assert.match(smokeSource, /TARGET_AIRPORT \|\| 'cyyz'/, 'browser smoke script must default to CYYZ');
const smokeCompose = fs.readFileSync(path.join(root, 'compose.browser-smoke.yaml'), 'utf8');
assert.match(smokeCompose, /TARGET_AIRPORT: cyyz/, 'browser-smoke composition must not override the CYYZ target');

console.log('CYYZ airport publication contract passed');
