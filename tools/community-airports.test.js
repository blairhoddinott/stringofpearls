'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const expected = {
    cyyc: {
        name: 'YYC Calgary International Airport',
        level: 'medium',
        timezone: 'America/Edmonton',
        sourcePr: 2056,
        sourceSha: '47c1a0753f6d7fcbc3e1894397d953a5a5adbac6'
    },
    kcle: {
        name: 'Cleveland-Hopkins International Airport',
        level: 'medium',
        timezone: 'America/New_York',
        sourcePr: 2013,
        sourceSha: '3dd2d19392a6cfd4aec498f126c472d6243742fb'
    },
    kden: {
        name: 'Denver International Airport',
        level: 'hard',
        timezone: 'America/Denver',
        sourcePr: 1942,
        sourceSha: '11d4e59567b9683846314605c9a307fcacdd8f2f'
    },
    kfll: {
        name: 'Fort Lauderdale-Hollywood International Airport',
        level: 'hard',
        timezone: 'America/New_York',
        sourcePr: 2089,
        sourceSha: 'e64128baeed4fa025f8739a6a0a5ec768a58c12f'
    },
    kiah: {
        name: 'George Bush Houston Intercontinental Airport',
        level: 'hard',
        timezone: 'America/Chicago',
        sourcePr: 2102,
        sourceSha: '6bd83b033a158812f0484b1fb3052a4d5dec9692'
    },
    kind: {
        name: 'Indianapolis International Airport',
        level: 'medium',
        timezone: 'America/Indiana/Indianapolis',
        sourcePr: 2015,
        sourceSha: '25394e804233f46a860ebf38c39e09f26e3dccce'
    },
    klga: {
        name: 'LaGuardia Airport',
        level: 'hard',
        timezone: 'America/New_York',
        sourcePr: 1867,
        sourceSha: '667dc94d13145c168e2220cbc2111dcd47153489'
    },
    mkjp: {
        name: 'Norman Manley International Airport',
        level: 'easy',
        timezone: 'America/Jamaica',
        sourcePr: 2082,
        sourceSha: '0c31df84e4a45765d0e00b6b3d10779c23f357a9'
    }
};

const airportList = readJson('assets/airports/airportLoadList.json');
const scheduleList = readJson('assets/schedules/scheduleLoadList.json');
const timezones = readJson('tools/schedules/airport-timezones.json');
const guideDirectory = fs.readFileSync(path.join(root, 'documentation/airport-guides/airport-guide-directory.md'), 'utf8');

const tokenFix = (token) => Array.isArray(token) ? token[0] : token;
const collectRouteFix = (set, token) => {
    const fix = tokenFix(token);
    if (typeof fix === 'string' && !fix.startsWith('#') && !fix.startsWith('^')) {
        set.add(fix.replace(/\*$/, ''));
    }
};

for (const [icao, config] of Object.entries(expected)) {
    const upper = icao.toUpperCase();
    assert.deepStrictEqual(airportList.find((entry) => entry.icao === icao), {
        icao,
        level: config.level,
        name: config.name,
        premium: false
    });

    const airportPath = `assets/airports/${icao}.json`;
    const terrainPath = `assets/airports/terrain/${icao}.geojson`;
    assert.ok(exists(airportPath), `${upper} airport asset must exist`);
    assert.ok(exists(terrainPath), `${upper} terrain asset must exist`);
    const airport = readJson(airportPath);
    const terrain = readJson(terrainPath);

    assert.strictEqual(airport.icao, upper);
    assert.strictEqual(airport.has_terrain, true);
    assert.ok(airport.runways.length > 0, `${upper} must publish runways`);
    assert.ok(Object.keys(airport.sids).length > 0, `${upper} must publish SIDs`);
    assert.ok(Object.keys(airport.stars).length > 0, `${upper} must publish STARs`);
    assert.ok(Array.isArray(airport.maps) && airport.maps.length > 0, `${upper} must publish at least one map`);
    assert.ok(airport.spawnPatterns.some((pattern) => pattern.category === 'arrival'), `${upper} needs arrival traffic`);
    assert.ok(airport.spawnPatterns.some((pattern) => pattern.category === 'departure'), `${upper} needs departure traffic`);

    const runwayNames = new Set();
    airport.runways.forEach((pair) => pair.name.forEach((name) => {
        assert.match(name, /^\d{2}[LRC]?$/, `${upper} runway ${name} must preserve canonical zero padding`);
        runwayNames.add(`${upper}${name}`);
    }));

    const referencedFixes = new Set();
    for (const procedures of [airport.sids, airport.stars]) {
        for (const [name, procedure] of Object.entries(procedures)) {
            assert.strictEqual(procedure.icao, name);
            assert.ok(Object.keys(procedure.rwy).length > 0, `${upper} ${name} needs runway routes`);
            Object.entries(procedure.rwy).forEach(([runway, route]) => {
                assert.ok(runwayNames.has(runway), `${upper} ${name} references unknown runway ${runway}`);
                route.forEach((token) => collectRouteFix(referencedFixes, token));
            });
            Object.values(procedure.entryPoints || {}).forEach((route) => route.forEach((token) => collectRouteFix(referencedFixes, token)));
            Object.values(procedure.exitPoints || {}).forEach((route) => route.forEach((token) => collectRouteFix(referencedFixes, token)));
            (procedure.body || []).forEach((token) => collectRouteFix(referencedFixes, token));
        }
    }
    const missingFixes = [...referencedFixes]
        .filter((fix) => !Object.prototype.hasOwnProperty.call(airport.fixes, fix))
        .sort();
    assert.deepStrictEqual(missingFixes, [], `${upper} procedure fixes must resolve`);

    airport.spawnPatterns.filter((pattern) => pattern.category === 'arrival').forEach((pattern) => {
        assert.match(pattern.altitude, /^\d+$/, `${upper} arrivals need numeric initial altitude`);
        assert.match(pattern.speed, /^\d+$/, `${upper} arrivals need numeric initial speed`);
        assert.ok(pattern.centerHandoffFix, `${upper} arrivals need a center handoff boundary`);
        assert.ok(Object.prototype.hasOwnProperty.call(airport.fixes, pattern.centerHandoffFix), `${upper} handoff fix must resolve`);
    });

    assert.strictEqual(terrain.type, 'FeatureCollection');
    assert.ok(Array.isArray(terrain.features) && terrain.features.length > 0, `${upper} terrain must contain features`);

    assert.deepStrictEqual(scheduleList.find((entry) => entry.icao === icao), {
        icao,
        file: `${icao}.json`
    });
    assert.strictEqual(timezones[icao], config.timezone);
    const schedule = readJson(`assets/schedules/${icao}.json`);
    assert.strictEqual(schedule.airportIcao, upper);
    assert.strictEqual(schedule.timezone, config.timezone);
    assert.ok(schedule.flights.some((flight) => flight.category === 'arrival'));
    assert.ok(schedule.flights.some((flight) => flight.category === 'departure'));

    const guidePath = `documentation/airport-guides/${icao}.md`;
    const sourcePath = `documentation/sources/${icao}.md`;
    assert.ok(exists(guidePath), `${upper} guide must exist`);
    assert.ok(exists(sourcePath), `${upper} source dossier must exist`);
    assert.match(guideDirectory, new RegExp(`\\b${upper}\\b`));
    const sourceText = fs.readFileSync(path.join(root, sourcePath), 'utf8');
    assert.match(sourceText, new RegExp(`openscope/openscope/pull/${config.sourcePr}`));
    assert.match(sourceText, new RegExp(config.sourceSha));
}

console.log('Community airport publication contract passed');
