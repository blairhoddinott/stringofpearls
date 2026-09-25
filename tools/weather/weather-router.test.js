'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createWeatherRouter } = require('../../src/assets/scripts/server/weather/WeatherRouter');

function request(server, path) {
    return new Promise((resolve, reject) => {
        const address = server.address();
        const outgoing = http.get({
            hostname: '127.0.0.1',
            path,
            port: address.port
        }, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve({
                body: Buffer.concat(chunks).toString('utf8'),
                headers: response.headers,
                statusCode: response.statusCode
            }));
        });
        outgoing.once('error', reject);
    });
}

async function withServer(weatherService, callback) {
    const app = express();
    app.use(createWeatherRouter({ weatherService }));
    const server = await new Promise((resolve) => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });

    try {
        await callback(server);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
}

test('serves a normalized METAR observation as non-cacheable JSON', async () => {
    const observation = {
        station: 'KSFO',
        observedAt: '2026-09-25T09:56:00.000Z',
        raw: 'METAR KSFO ...',
        wind: { directionDegrees: 260, speedKnots: 13, gustKnots: 20, variable: false },
        altimeterHpa: 1014.6,
        usableForSimulation: true
    };
    const weatherService = {
        getObservation: async (station) => {
            assert.equal(station, 'KSFO');
            return observation;
        }
    };

    await withServer(weatherService, async (server) => {
        const response = await request(server, '/api/weather/metar/KSFO');

        assert.equal(response.statusCode, 200);
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(JSON.parse(response.body), { observation });
    });
});

test('maps invalid stations to a bounded JSON client error', async () => {
    const weatherService = {
        getObservation: async () => {
            const error = new Error('do not leak validation internals');
            error.code = 'invalid-station';
            throw error;
        }
    };

    await withServer(weatherService, async (server) => {
        const response = await request(server, '/api/weather/metar/ABC');

        assert.equal(response.statusCode, 400);
        assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(JSON.parse(response.body), { error: 'invalid-station' });
        assert.doesNotMatch(response.body, /validation internals/);
    });
});

test('maps the local provider limit to a retryable service response', async () => {
    const weatherService = {
        getObservation: async () => {
            const error = new Error('internal quota details');
            error.code = 'request-rate-limited';
            throw error;
        }
    };

    await withServer(weatherService, async (server) => {
        const response = await request(server, '/api/weather/metar/KSFO');

        assert.equal(response.statusCode, 503);
        assert.equal(response.headers['retry-after'], '60');
        assert.deepEqual(JSON.parse(response.body), { error: 'weather-unavailable' });
        assert.doesNotMatch(response.body, /quota details/);
    });
});

test('maps known provider failures to a bounded retryable gateway error', async () => {
    const weatherService = {
        getObservation: async () => {
            const error = new Error('getaddrinfo internal topology');
            error.code = 'upstream-unavailable';
            throw error;
        }
    };

    await withServer(weatherService, async (server) => {
        const response = await request(server, '/api/weather/metar/KSFO');

        assert.equal(response.statusCode, 502);
        assert.equal(response.headers['retry-after'], '300');
        assert.deepEqual(JSON.parse(response.body), { error: 'weather-unavailable' });
        assert.doesNotMatch(response.body, /internal topology/);
    });
});
