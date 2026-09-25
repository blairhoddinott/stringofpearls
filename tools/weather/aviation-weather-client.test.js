'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createAviationWeatherClient } = require('../../src/assets/scripts/server/weather/AviationWeatherClient');

test('requests JSON METAR data from the fixed AviationWeather endpoint', async () => {
    const calls = [];
    const expected = [{ icaoId: 'KSFO', rawOb: 'METAR KSFO ...' }];
    const fetch = async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify(expected), {
            headers: { 'content-type': 'application/json' },
            status: 200
        });
    };
    const client = createAviationWeatherClient({
        fetch,
        userAgent: 'StringOfPearls/1.0 (+https://github.com/blairhoddinott/stringofpearls)'
    });

    assert.deepEqual(await client.fetchMetar('KSFO'), expected);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://aviationweather.gov/api/data/metar?ids=KSFO&format=json');
    assert.equal(calls[0].options.headers.Accept, 'application/json');
    assert.equal(
        calls[0].options.headers['User-Agent'],
        'StringOfPearls/1.0 (+https://github.com/blairhoddinott/stringofpearls)'
    );
    assert.equal(calls[0].options.redirect, 'error');
});

test('maps an upstream 204 response to no observations', async () => {
    const client = createAviationWeatherClient({
        fetch: async () => new Response(null, { status: 204 }),
        userAgent: 'StringOfPearls/1.0'
    });

    assert.deepEqual(await client.fetchMetar('KSFO'), []);
});

test('rejects non-success upstream responses without consuming their body', async () => {
    let bodyRead = false;
    const client = createAviationWeatherClient({
        fetch: async () => ({
            ok: false,
            status: 429,
            json: async () => { bodyRead = true; return { detail: 'provider internals' }; }
        }),
        userAgent: 'StringOfPearls/1.0'
    });

    await assert.rejects(
        () => client.fetchMetar('KSFO'),
        (error) => error.code === 'upstream-http-error' && error.upstreamStatus === 429
    );
    assert.equal(bodyRead, false);
});

test('bounds each upstream request with a ten-second timeout signal', async () => {
    const timeoutCalls = [];
    const expectedSignal = { name: 'test-timeout-signal' };
    let receivedSignal;
    const client = createAviationWeatherClient({
        createTimeoutSignal: (milliseconds) => {
            timeoutCalls.push(milliseconds);
            return expectedSignal;
        },
        fetch: async (_url, options) => {
            receivedSignal = options.signal;
            return new Response('[]', {
                headers: { 'content-type': 'application/json' },
                status: 200
            });
        },
        userAgent: 'StringOfPearls/1.0'
    });

    await client.fetchMetar('KSFO');

    assert.deepEqual(timeoutCalls, [10000]);
    assert.equal(receivedSignal, expectedSignal);
});

test('rejects a successful response whose JSON body is not an array', async () => {
    const client = createAviationWeatherClient({
        fetch: async () => new Response('{"message":"maintenance"}', {
            headers: { 'content-type': 'application/json' },
            status: 200
        }),
        userAgent: 'StringOfPearls/1.0'
    });

    await assert.rejects(
        () => client.fetchMetar('KSFO'),
        (error) => error.code === 'invalid-upstream-response'
    );
});

test('normalizes network failures without exposing transport details', async () => {
    const client = createAviationWeatherClient({
        fetch: async () => { throw new TypeError('getaddrinfo ENOTFOUND internal-host'); },
        userAgent: 'StringOfPearls/1.0'
    });

    await assert.rejects(
        () => client.fetchMetar('KSFO'),
        (error) => error.code === 'upstream-unavailable'
            && error.message === 'weather provider request failed'
    );
});

test('normalizes malformed provider JSON as an invalid upstream response', async () => {
    const client = createAviationWeatherClient({
        fetch: async () => new Response('{broken', {
            headers: { 'content-type': 'application/json' },
            status: 200
        }),
        userAgent: 'StringOfPearls/1.0'
    });

    await assert.rejects(
        () => client.fetchMetar('KSFO'),
        (error) => error.code === 'invalid-upstream-response'
            && error.message === 'weather provider returned invalid JSON'
    );
});
