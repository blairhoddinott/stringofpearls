'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createMetarService } = require('../../src/assets/scripts/server/weather/MetarService');

const RAW_METAR = 'METAR KSFO 250956Z 26013G20KT 10SM FEW004 BKN009 16/14 A2996';

function metarRecord(overrides = {}) {
    return {
        icaoId: 'KSFO',
        obsTime: 1790330160,
        wdir: 260,
        wspd: 13,
        wgst: 20,
        altim: 1014.6,
        rawOb: RAW_METAR,
        ...overrides
    };
}

test('normalizes one exact-station METAR and reuses its fresh cache entry', async () => {
    const calls = [];
    const fetchMetar = async (station) => {
        calls.push(station);
        return [metarRecord()];
    };
    const service = createMetarService({
        fetchMetar,
        now: () => Date.parse('2026-09-25T10:05:00.000Z')
    });

    const first = await service.getObservation('ksfo');
    const second = await service.getObservation('KSFO');

    assert.deepEqual(first, {
        station: 'KSFO',
        observedAt: '2026-09-25T09:56:00.000Z',
        raw: RAW_METAR,
        wind: {
            directionDegrees: 260,
            speedKnots: 13,
            gustKnots: 20,
            variable: false
        },
        altimeterHpa: 1014.6,
        usableForSimulation: true
    });
    assert.deepEqual(second, first);
    assert.deepEqual(calls, ['KSFO']);
});

test('rejects malformed station identifiers before calling upstream weather', async () => {
    let calls = 0;
    const service = createMetarService({
        fetchMetar: async () => { calls += 1; return []; }
    });

    await assert.rejects(
        () => service.getObservation('../secrets'),
        (error) => error.code === 'invalid-station'
    );
    assert.equal(calls, 0);
});

test('negative-caches no-report results for five minutes before retrying', async () => {
    let currentTime = Date.parse('2026-09-25T10:05:00.000Z');
    let calls = 0;
    const service = createMetarService({
        fetchMetar: async () => {
            calls += 1;
            return calls === 1 ? [] : [metarRecord()];
        },
        now: () => currentTime
    });

    assert.equal(await service.getObservation('KSFO'), null);
    currentTime += 4 * 60 * 1000;
    assert.equal(await service.getObservation('KSFO'), null);
    assert.equal(calls, 1);

    currentTime += 60 * 1000;
    assert.equal((await service.getObservation('KSFO')).station, 'KSFO');
    assert.equal(calls, 2);
});

test('collapses concurrent requests for the same uncached station', async () => {
    let calls = 0;
    let releaseFetch;
    const pendingFetch = new Promise((resolve) => { releaseFetch = resolve; });
    const service = createMetarService({
        fetchMetar: async () => {
            calls += 1;
            return pendingFetch;
        },
        now: () => Date.parse('2026-09-25T10:05:00.000Z')
    });

    const first = service.getObservation('KSFO');
    const second = service.getObservation('ksfo');
    assert.equal(calls, 1);

    releaseFetch([metarRecord()]);
    assert.deepEqual(await second, await first);
    assert.equal(calls, 1);
});

test('rechecks an old observation after five minutes', async () => {
    let currentTime = Date.parse('2026-09-25T12:00:00.000Z');
    let calls = 0;
    const service = createMetarService({
        fetchMetar: async () => {
            calls += 1;
            return [metarRecord({ obsTime: Date.parse('2026-09-25T10:00:00.000Z') / 1000 })];
        },
        now: () => currentTime
    });

    assert.equal((await service.getObservation('KSFO')).observedAt, '2026-09-25T10:00:00.000Z');
    currentTime += 4 * 60 * 1000;
    await service.getObservation('KSFO');
    assert.equal(calls, 1);

    currentTime += 60 * 1000;
    await service.getObservation('KSFO');
    assert.equal(calls, 2);
});

test('marks variable wind unusable and rechecks it after five minutes', async () => {
    let currentTime = Date.parse('2026-09-25T10:05:00.000Z');
    let calls = 0;
    const service = createMetarService({
        fetchMetar: async () => {
            calls += 1;
            return [metarRecord({ wdir: 'VRB' })];
        },
        now: () => currentTime
    });

    const observation = await service.getObservation('KSFO');
    assert.deepEqual(observation.wind, {
        directionDegrees: null,
        speedKnots: 13,
        gustKnots: 20,
        variable: true
    });
    assert.equal(observation.usableForSimulation, false);

    currentTime += 5 * 60 * 1000;
    await service.getObservation('KSFO');
    assert.equal(calls, 2);
});

test('selects the newest exact-station observation regardless of response order', async () => {
    const service = createMetarService({
        fetchMetar: async () => [
            metarRecord({ obsTime: 1790326800, rawOb: 'METAR KSFO OLD' }),
            metarRecord({ icaoId: 'KOAK', obsTime: 1790331000, rawOb: 'METAR KOAK NEWER' }),
            metarRecord({ obsTime: 1790330160, rawOb: RAW_METAR })
        ],
        now: () => Date.parse('2026-09-25T10:05:00.000Z')
    });

    const observation = await service.getObservation('KSFO');

    assert.equal(observation.raw, RAW_METAR);
    assert.equal(observation.observedAt, '2026-09-25T09:56:00.000Z');
});

test('limits uncached upstream requests to ninety per rolling minute', async () => {
    let currentTime = Date.parse('2026-09-25T10:05:00.000Z');
    let calls = 0;
    const service = createMetarService({
        fetchMetar: async () => { calls += 1; return []; },
        now: () => currentTime
    });

    for (let index = 0; index < 90; index += 1) {
        await service.getObservation(`K${String(index).padStart(3, '0')}`);
    }

    await assert.rejects(
        () => service.getObservation('K090'),
        (error) => error.code === 'request-rate-limited'
    );
    assert.equal(calls, 90);

    currentTime += 60 * 1000;
    assert.equal(await service.getObservation('K090'), null);
    assert.equal(calls, 91);
});

test('keeps an incomplete raw report displayable but unusable for simulation', async () => {
    let currentTime = Date.parse('2026-09-25T10:05:00.000Z');
    let calls = 0;
    const service = createMetarService({
        fetchMetar: async () => {
            calls += 1;
            return [metarRecord({ altim: null })];
        },
        now: () => currentTime
    });

    const observation = await service.getObservation('KSFO');
    assert.equal(observation.raw, RAW_METAR);
    assert.equal(observation.altimeterHpa, null);
    assert.equal(observation.usableForSimulation, false);

    currentTime += 5 * 60 * 1000;
    await service.getObservation('KSFO');
    assert.equal(calls, 2);
});

test('ignores malformed records when selecting the newest displayable report', async () => {
    const older = metarRecord({
        obsTime: 1790326800,
        rawOb: 'METAR KSFO 250900Z 25010KT 10SM CLR 15/12 A2992'
    });
    const service = createMetarService({
        fetchMetar: async () => [
            metarRecord({ obsTime: Number.NaN, rawOb: 'METAR KSFO BAD TIME' }),
            metarRecord({ obsTime: 1790331000, rawOb: '   ' }),
            older
        ],
        now: () => Date.parse('2026-09-25T10:05:00.000Z')
    });

    const observation = await service.getObservation('KSFO');

    assert.equal(observation.raw, older.rawOb);
    assert.equal(observation.observedAt, '2026-09-25T09:00:00.000Z');
});

test('suppresses repeated upstream failures for five minutes', async () => {
    let currentTime = Date.parse('2026-09-25T10:05:00.000Z');
    let calls = 0;
    const service = createMetarService({
        fetchMetar: async () => {
            calls += 1;
            const error = new Error('provider unavailable');
            error.code = 'upstream-http-error';
            throw error;
        },
        now: () => currentTime
    });

    await assert.rejects(() => service.getObservation('KSFO'), /provider unavailable/);
    currentTime += 4 * 60 * 1000;
    await assert.rejects(() => service.getObservation('KSFO'), /provider unavailable/);
    assert.equal(calls, 1);

    currentTime += 60 * 1000;
    await assert.rejects(() => service.getObservation('KSFO'), /provider unavailable/);
    assert.equal(calls, 2);
});
