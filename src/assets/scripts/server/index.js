const express = require('express');
const http = require('http');
const path = require('path');
const colors = require('ansi-colors');
const packageMetadata = require('../../../../package.json');
const { createAviationWeatherClient } = require('./weather/AviationWeatherClient');
const { createMetarService } = require('./weather/MetarService');
const { createWeatherRouter } = require('./weather/WeatherRouter');

const app = express();
const server = http.Server(app);

app.disable('x-powered-by');
app.use((_request, response, next) => {
    response.set({
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN'
    });
    next();
});

const PORT = Number(process.env.PORT || 3003);
const USER_AGENT = `StringOfPearls/${packageMetadata.version} (+${packageMetadata.homepage})`;
const aviationWeatherClient = createAviationWeatherClient({
    fetch: global.fetch,
    userAgent: USER_AGENT
});
const weatherService = createMetarService({
    fetchMetar: aviationWeatherClient.fetchMetar
});

app.use(createWeatherRouter({ weatherService }));
app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'not-found' });
});

app.use('/assets', express.static(path.join(__dirname, '/../../../assets'), {
    maxAge: 512000 * 1000,
    setHeaders: (response, filename) => {
        if (path.extname(filename).toLowerCase() === '.geojson') {
            response.type('application/json');
        }
    }
}));
app.use('/assets', (_request, response) => {
    response.sendStatus(404);
});

app.get('/healthz', (_request, response) => {
    response.type('text/plain').send('ok\n');
});

app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache');
    res.sendFile(path.join(__dirname, '/../../../index.html'));
});

app.get('*', (_request, response) => {
    response.set('Cache-Control', 'no-store, no-cache');
    response.sendFile(path.join(__dirname, '/../../../index.html'));
});

server.listen(PORT, () => {
    const address = server.address();

    console.log(colors.green.bold(`\nListening on PORT ${address.port}`));
});
