'use strict';

const assert = require('assert');
const { chromium } = require('playwright');

const baseUrl = process.env.BASE_URL || 'http://simulator:8080';
const targetAirport = process.env.TARGET_AIRPORT || 'kpdx';
// The application version is interpolated in Node-side (from package.json via
// the launcher) rather than hard-coded, so the "what's new" dialog is suppressed
// deterministically for whatever version is under test. Fail closed if missing.
const appVersion = process.env.APP_VERSION;
assert(appVersion, 'APP_VERSION must be provided (the launcher reads it from package.json)');

async function main() {
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ]
    });
    const errors = [];

    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        const baseOrigin = new URL(baseUrl).origin;

        page.on('pageerror', (error) => errors.push(`page error: ${error.stack || error.message}`));
        page.on('console', (message) => {
            if (message.type() === 'error') {
                errors.push(`console error: ${message.text()}`);
            }
        });
        page.on('requestfailed', (request) => {
            if (new URL(request.url()).origin === baseOrigin) {
                errors.push(`request failed: ${request.method()} ${request.url()}: ${request.failure().errorText}`);
            }
        });

        await page.route('**/api/weather/metar/*', async (route) => {
            const station = new URL(route.request().url()).pathname.split('/').pop().toUpperCase();
            const raw = `${station} 251656Z 21012G19KT 10SM FEW120 32/08 A3003 RMK AO2 SLP169`;

            await route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({
                    observation: {
                        station,
                        observedAt: new Date().toISOString(),
                        raw,
                        wind: {
                            directionDegreesTrue: 210,
                            speedKnots: 12,
                            gustKnots: 19,
                            variable: false
                        },
                        altimeterHpa: 1017,
                        usableForSimulation: true
                    }
                }),
                status: 200
            });
        });

        await page.addInitScript((version) => {
            localStorage.clear();
            localStorage.setItem('atc-last-version', version);
            localStorage.setItem('first-run-time', '0');
            localStorage.setItem('atc-speech-enabled', 'false');
        }, appVersion);

        const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        assert(response && response.ok(), `startup returned HTTP ${response ? response.status() : 'no response'}`);

        const trafficModeDialog = page.locator('#traffic-mode-selection');
        await trafficModeDialog.waitFor({ state: 'visible', timeout: 30000 });
        const trafficModeLabels = await trafficModeDialog.locator('[data-traffic-mode]').allTextContents();
        assert.deepStrictEqual(trafficModeLabels, ['Arrivals', 'Departures', 'Both']);
        assert.strictEqual(await page.locator(':focus').getAttribute('data-traffic-mode'), 'arrivals');
        await page.keyboard.press('Enter');
        await trafficModeDialog.waitFor({ state: 'hidden', timeout: 30000 });
        await page.locator('.js-stripViewArrivals-section').waitFor({ state: 'visible' });
        await page.locator('.js-stripViewDepartures-section').waitFor({ state: 'hidden' });

        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await trafficModeDialog.waitFor({ state: 'visible', timeout: 30000 });
        await trafficModeDialog.locator('[data-traffic-mode="departures"]').click();
        await trafficModeDialog.waitFor({ state: 'hidden', timeout: 30000 });
        await page.locator('.js-stripViewArrivals-section').waitFor({ state: 'hidden' });
        await page.locator('.js-stripViewDepartures-section').waitFor({ state: 'visible' });

        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await trafficModeDialog.waitFor({ state: 'visible', timeout: 30000 });
        await page.keyboard.press('Tab');
        assert.strictEqual(await page.locator(':focus').getAttribute('data-traffic-mode'), 'departures');
        await page.keyboard.press('Tab');
        assert.strictEqual(await page.locator(':focus').getAttribute('data-traffic-mode'), 'both');
        await page.keyboard.press('Tab');
        assert.strictEqual(await page.locator(':focus').getAttribute('data-traffic-mode'), 'arrivals');
        await page.keyboard.press('Shift+Tab');
        assert.strictEqual(await page.locator(':focus').getAttribute('data-traffic-mode'), 'both');
        await page.keyboard.press('Enter');
        await trafficModeDialog.waitFor({ state: 'hidden', timeout: 30000 });
        await page.locator('.js-stripViewArrivals-section').waitFor({ state: 'visible' });
        await page.locator('.js-stripViewDepartures-section').waitFor({ state: 'visible' });

        await page.waitForFunction(() => window.prop && window.prop.complete === true, null, { timeout: 30000 });
        await page.locator('.js-loadingView').waitFor({ state: 'hidden', timeout: 30000 });

        const canvasState = await page.locator('canvas').evaluateAll((canvases) => canvases.map((canvas) => ({
            height: canvas.height,
            width: canvas.width
        })));
        assert.strictEqual(canvasState.length, 2, `expected two canvases, found ${canvasState.length}`);
        canvasState.forEach((canvas, index) => {
            assert(canvas.width > 0 && canvas.height > 0, `canvas ${index} has invalid dimensions`);
        });

        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
        await page.locator('.switch-airport').click();
        await page.locator(`.airport-list-item[data-icao="${targetAirport}"]`).waitFor({ state: 'visible' });

        const airportResponse = page.waitForResponse((candidate) => {
            return new URL(candidate.url()).pathname.endsWith(`/assets/airports/${targetAirport}.json`) && candidate.status() === 200;
        });
        await page.locator(`.airport-list-item[data-icao="${targetAirport}"]`).click();
        await airportResponse;
        await page.waitForFunction((icao) => localStorage.getItem('atc-last-airport') === icao, targetAirport);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));

        const targetStation = targetAirport.toUpperCase();
        const expectedMetar = `${targetStation} 251656Z 21012G19KT 10SM FEW120 32/08 A3003 RMK AO2 SLP169`;
        await page.waitForFunction((raw) => {
            return document.querySelector('.js-airportInfo-metar-value')?.textContent === raw;
        }, expectedMetar);
        assert.strictEqual(await page.locator('.js-airportInfo-metar-value').textContent(), expectedMetar);
        assert.match(await page.locator('.js-airportInfo-runways-value').textContent(), /^ARR \S+ \/ DEP \S+$/);
        assert.strictEqual(await page.locator('.js-airportInfo-wind-value').textContent(), `${targetStation} 210 12 G19`);
        assert.strictEqual(await page.locator('.js-airportInfo-altimeter-value').textContent(), `${targetStation} 30.03`);
        assert(await page.locator('input[name="wind direction"]').isDisabled());
        assert(await page.locator('input[name="wind speed"]').isDisabled());

        const airportInfoLayout = await page.evaluate(() => {
            const metar = document.querySelector('.js-airportInfo-metar-value').getBoundingClientRect();
            const runways = document.querySelector('.js-airportInfo-runways-value').getBoundingClientRect();

            return {
                metarBottom: metar.bottom,
                metarRight: metar.right,
                runwaysTop: runways.top,
                viewportWidth: window.innerWidth
            };
        });
        assert(
            airportInfoLayout.metarRight <= airportInfoLayout.viewportWidth,
            `METAR overflows viewport: right=${airportInfoLayout.metarRight}, viewport=${airportInfoLayout.viewportWidth}`
        );
        assert(
            airportInfoLayout.metarBottom <= airportInfoLayout.runwaysTop,
            `METAR overlaps RWYS: metarBottom=${airportInfoLayout.metarBottom}, runwaysTop=${airportInfoLayout.runwaysTop}`
        );

        await page.locator('.switch-airport').click();
        await page.locator(`.airport-list-item.mix-airport-list-item_isActive[data-icao="${targetAirport}"]`).waitFor({ state: 'visible' });

        assert.deepStrictEqual(errors, [], errors.join('\n'));
        console.log(`Browser smoke test passed: traffic mode, startup, weather, render frame, airport=${targetAirport}, uncaughtErrors=0`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
