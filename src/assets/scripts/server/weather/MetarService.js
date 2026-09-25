'use strict';

const FRESH_CACHE_TTL_MS = 30 * 60 * 1000;
const RETRY_CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_OBSERVATION_AGE_MS = 90 * 60 * 1000;
const UPSTREAM_RATE_LIMIT = 90;
const UPSTREAM_RATE_WINDOW_MS = 60 * 1000;

function normalizeObservation(station, record) {
    const variable = record.wdir === 'VRB';
    const directionDegrees = Number.isFinite(record.wdir) && record.wdir >= 0 && record.wdir <= 360
        ? record.wdir
        : null;
    const speedKnots = Number.isFinite(record.wspd) && record.wspd >= 0 ? record.wspd : null;
    const gustKnots = Number.isFinite(record.wgst) && record.wgst >= 0 ? record.wgst : null;
    const altimeterHpa = Number.isFinite(record.altim) && record.altim > 0 ? record.altim : null;

    return {
        station,
        observedAt: new Date(record.obsTime * 1000).toISOString(),
        raw: record.rawOb,
        wind: {
            directionDegrees,
            speedKnots,
            gustKnots,
            variable
        },
        altimeterHpa,
        usableForSimulation: !variable && directionDegrees !== null && speedKnots !== null && altimeterHpa !== null
    };
}

function createMetarService({ fetchMetar, now = Date.now }) {
    const cache = new Map();
    const failures = new Map();
    const inFlight = new Map();
    let upstreamRequestTimes = [];

    async function loadObservation(station, currentTime) {
        upstreamRequestTimes = upstreamRequestTimes.filter(
            (requestTime) => currentTime - requestTime < UPSTREAM_RATE_WINDOW_MS
        );

        if (upstreamRequestTimes.length >= UPSTREAM_RATE_LIMIT) {
            const error = new Error('weather provider request limit reached');
            error.code = 'request-rate-limited';
            throw error;
        }

        upstreamRequestTimes.push(currentTime);
        const records = await fetchMetar(station);
        const exactRecords = records.filter((record) => (
            record
            && record.icaoId === station
            && Number.isFinite(record.obsTime)
            && typeof record.rawOb === 'string'
            && record.rawOb.trim().length > 0
        ));
        const newestRecord = exactRecords.reduce((newest, record) => (
            !newest || record.obsTime > newest.obsTime ? record : newest
        ), null);

        if (!newestRecord) {
            cache.set(station, {
                expiresAt: currentTime + RETRY_CACHE_TTL_MS,
                observation: null
            });

            return null;
        }

        const observation = normalizeObservation(station, newestRecord);
        const observationAge = currentTime - Date.parse(observation.observedAt);
        const cacheTtl = !observation.usableForSimulation || observationAge > STALE_OBSERVATION_AGE_MS
            ? RETRY_CACHE_TTL_MS
            : FRESH_CACHE_TTL_MS;
        cache.set(station, {
            expiresAt: currentTime + cacheTtl,
            observation
        });

        return observation;
    }

    return {
        async getObservation(requestedStation) {
            if (typeof requestedStation !== 'string' || !/^[a-z0-9]{4}$/i.test(requestedStation)) {
                const error = new Error('station must be exactly four alphanumeric characters');
                error.code = 'invalid-station';
                throw error;
            }

            const station = requestedStation.toUpperCase();
            const currentTime = now();
            const cached = cache.get(station);

            if (cached && cached.expiresAt > currentTime) {
                return cached.observation;
            }

            const cachedFailure = failures.get(station);

            if (cachedFailure && cachedFailure.expiresAt > currentTime) {
                throw cachedFailure.error;
            }

            if (inFlight.has(station)) {
                return inFlight.get(station);
            }

            const request = loadObservation(station, currentTime);
            inFlight.set(station, request);

            try {
                const observation = await request;
                failures.delete(station);
                return observation;
            } catch (error) {
                if (error.code !== 'request-rate-limited') {
                    failures.set(station, {
                        error,
                        expiresAt: currentTime + RETRY_CACHE_TTL_MS
                    });
                }
                throw error;
            } finally {
                inFlight.delete(station);
            }
        }
    };
}

module.exports = { createMetarService, normalizeObservation };
