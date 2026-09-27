'use strict';

const assert = require('assert');
const {
    buildAuthoredScheduleCorpus,
    parseCliArguments
} = require('./generate-authored-schedule-corpus');

const source = {
    name: 'stringofpearls airport-authored spawn patterns',
    url: 'https://github.com/blairhoddinott/stringofpearls/tree/master/assets/airports',
    retrievedAt: '2026-09-27',
    license: 'MIT',
    coverage: 'Representative slots compiled from reviewed airport-authored rates and routes; not observed flights.'
};
const pattern = (icao, category, suffix) => ({
    origin: category === 'departure' ? icao.toUpperCase() : '',
    destination: category === 'arrival' ? icao.toUpperCase() : '',
    category,
    route: `${suffix}.ROUTE`,
    altitude: '',
    speed: '',
    method: 'random',
    rate: 0.125,
    airlines: [['tst', 1]]
});
const airports = {
    aaaa: { icao: 'aaaa', spawnPatterns: [pattern('aaaa', 'arrival', 'A'), pattern('aaaa', 'departure', 'B')] },
    bbbb: { icao: 'bbbb', spawnPatterns: [pattern('bbbb', 'arrival', 'C'), pattern('bbbb', 'departure', 'D')] }
};

(function partitionsEnabledAirportsByExplicitSourceTier() {
    const corpus = buildAuthoredScheduleCorpus({
        airportLoadList: [
            { icao: 'aaaa', disabled: false },
            { icao: 'bbbb', disabled: false },
            { icao: 'cccc', disabled: true }
        ],
        airportJsonByIcao: airports,
        timezones: { aaaa: 'UTC', bbbb: 'Europe/London' },
        btsAirports: ['bbbb'],
        sampleDate: '2026-07-15',
        source
    });

    assert.deepStrictEqual(Object.keys(corpus), ['aaaa']);
    assert.strictEqual(corpus.aaaa.airportIcao, 'AAAA');
    assert.strictEqual(corpus.aaaa.profileType, 'authored');
})();

(function rejectsIncompleteOrExtraneousPolicyData() {
    const base = {
        airportLoadList: [{ icao: 'aaaa', disabled: false }],
        airportJsonByIcao: { aaaa: airports.aaaa },
        timezones: { aaaa: 'UTC' },
        btsAirports: [],
        sampleDate: '2026-07-15',
        source
    };

    assert.throws(() => buildAuthoredScheduleCorpus({ ...base, timezones: {} }), /timezone policy/i);
    assert.throws(() => buildAuthoredScheduleCorpus({ ...base, btsAirports: ['zzzz'] }), /BTS airport.*not selectable/i);
    assert.throws(() => buildAuthoredScheduleCorpus({ ...base, airportJsonByIcao: {} }), /missing airport asset/i);
})();

(function rejectsDuplicateCliFlags() {
    assert.throws(() => parseCliArguments([
        '--assets-root', 'assets', '--assets-root', 'other', '--output-dir', 'out',
        '--sample-date', '2026-07-15', '--retrieved-at', '2026-09-27'
    ]), /duplicate argument: --assets-root/);
})();

console.log('generate-authored-schedule-corpus tests passed');
