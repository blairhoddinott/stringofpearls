'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { authoredSpawnPatternKey } = require('../../src/assets/scripts/client/trafficGenerator/schedule/authoredSpawnPatternKey');

const assetsRoot = path.resolve(__dirname, '../../assets');
const schedulesRoot = path.join(assetsRoot, 'schedules');
const selectable = JSON.parse(fs.readFileSync(path.join(assetsRoot, 'airports/airportLoadList.json'), 'utf8'))
    .filter((entry) => entry.disabled !== true)
    .map((entry) => entry.icao)
    .sort();
const bts = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'bts-airports.json'), 'utf8')));
const timezones = JSON.parse(fs.readFileSync(path.join(__dirname, 'airport-timezones.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(schedulesRoot, 'scheduleLoadList.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'schedule-corpus-manifest.json'), 'utf8'));
const catalogIcaos = catalog.map((entry) => entry.icao);
assert.deepStrictEqual(catalogIcaos, [...selectable].sort(), 'schedule catalog must list every selectable airport exactly once in canonical order');
assert.strictEqual(new Set(catalogIcaos).size, catalogIcaos.length, 'schedule catalog must not contain duplicate airports');
const scheduleFiles = fs.readdirSync(schedulesRoot)
    .filter((filename) => filename.endsWith('.json') && !['schedule.schema.json', 'scheduleLoadList.json'].includes(filename))
    .sort();
assert.deepStrictEqual(scheduleFiles, catalog.map((entry) => entry.file).sort(), 'every normalized schedule file must be listed and every catalog entry must exist');
catalog.forEach(({ icao, file }) => {
    assert.strictEqual(file, `${icao}.json`, `${icao} must use its canonical schedule filename`);
    const schedule = JSON.parse(fs.readFileSync(path.join(schedulesRoot, file), 'utf8'));
    assert.strictEqual(schedule.airportIcao, icao.toUpperCase(), `${icao} schedule identity must match the catalog`);
    assert.strictEqual(schedule.timezone, timezones[icao]);
    if (bts.has(icao)) {
        assert.strictEqual(schedule.schemaVersion, 1, `${icao} must use the sourced schedule contract`);
        assert.match(schedule.source.name, /BTS/i, `${icao} must disclose BTS provenance`);
    } else {
        assert.strictEqual(schedule.schemaVersion, 2, `${icao} must use the authored schedule contract`);
        assert.strictEqual(schedule.profileType, 'authored', `${icao} must disclose authored provenance`);
        const airport = JSON.parse(fs.readFileSync(path.join(assetsRoot, 'airports', `${icao}.json`), 'utf8'));
        const patternsByKey = new Map();
        airport.spawnPatterns.forEach((pattern) => {
            const key = authoredSpawnPatternKey(pattern);
            patternsByKey.set(key, [...(patternsByKey.get(key) || []), pattern]);
        });
        schedule.flights.forEach((flight) => {
            const matches = patternsByKey.get(flight.spawnPatternKey) || [];
            assert.strictEqual(matches.length, 1, `${icao} authored key ${flight.spawnPatternKey} must resolve exactly once`);
            assert.strictEqual(matches[0].category, flight.category, `${icao} authored key ${flight.spawnPatternKey} must preserve category`);
        });
    }
});
const observedManifest = catalog.map(({ icao, file }) => {
    const contents = fs.readFileSync(path.join(schedulesRoot, file));
    const schedule = JSON.parse(contents);
    return {
        airport: schedule.airportIcao,
        profile: bts.has(icao) ? 'bts' : 'authored',
        flights: schedule.flights.length,
        sha256: crypto.createHash('sha256').update(contents).digest('hex')
    };
});
assert.deepStrictEqual(manifest.schedules, observedManifest, 'the reviewed corpus manifest must pin every published schedule byte-for-byte');
assert.strictEqual(manifest.airports, 64);
assert.strictEqual(manifest.flights, observedManifest.reduce((sum, entry) => sum + entry.flights, 0));
assert.deepStrictEqual(manifest.movementsByProfile, observedManifest.reduce((counts, entry) => {
    counts[entry.profile] += entry.flights;
    return counts;
}, { authored: 0, bts: 0 }));

console.log('schedule corpus tests passed');
