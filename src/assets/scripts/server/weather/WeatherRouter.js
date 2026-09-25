'use strict';

const express = require('express');

const PROVIDER_ERROR_CODES = new Set([
    'invalid-upstream-response',
    'upstream-http-error',
    'upstream-unavailable'
]);

function createWeatherRouter({ weatherService }) {
    const router = express.Router();

    router.get('/api/weather/metar/:station', async (request, response, next) => {
        response.set('Cache-Control', 'no-store');

        try {
            const observation = await weatherService.getObservation(request.params.station);
            response.json({ observation });
        } catch (error) {
            if (error.code === 'invalid-station') {
                response.status(400).json({ error: 'invalid-station' });
                return;
            }

            if (error.code === 'request-rate-limited') {
                response.set('Retry-After', '60');
                response.status(503).json({ error: 'weather-unavailable' });
                return;
            }

            if (PROVIDER_ERROR_CODES.has(error.code)) {
                response.set('Retry-After', '300');
                response.status(502).json({ error: 'weather-unavailable' });
                return;
            }

            next(error);
        }
    });

    return router;
}

module.exports = { createWeatherRouter };
