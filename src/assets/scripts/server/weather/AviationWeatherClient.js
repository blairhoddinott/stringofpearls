'use strict';

const METAR_ENDPOINT = 'https://aviationweather.gov/api/data/metar';

function createAviationWeatherClient({
    createTimeoutSignal = (milliseconds) => AbortSignal.timeout(milliseconds),
    fetch,
    timeoutMs = 10000,
    userAgent
}) {
    return {
        async fetchMetar(station) {
            const url = new URL(METAR_ENDPOINT);
            url.searchParams.set('ids', station);
            url.searchParams.set('format', 'json');
            let response;

            try {
                response = await fetch(url.toString(), {
                    headers: {
                        Accept: 'application/json',
                        'User-Agent': userAgent
                    },
                    redirect: 'error',
                    signal: createTimeoutSignal(timeoutMs)
                });
            } catch (cause) {
                const error = new Error('weather provider request failed', { cause });
                error.code = 'upstream-unavailable';
                throw error;
            }

            if (response.status === 204) {
                return [];
            }

            if (!response.ok) {
                const error = new Error(`weather provider returned HTTP ${response.status}`);
                error.code = 'upstream-http-error';
                error.upstreamStatus = response.status;
                throw error;
            }

            let body;

            try {
                body = await response.json();
            } catch (cause) {
                const error = new Error('weather provider returned invalid JSON', { cause });
                error.code = 'invalid-upstream-response';
                throw error;
            }

            if (!Array.isArray(body)) {
                const error = new Error('weather provider response must be an array');
                error.code = 'invalid-upstream-response';
                throw error;
            }

            return body;
        }
    };
}

module.exports = { createAviationWeatherClient };
