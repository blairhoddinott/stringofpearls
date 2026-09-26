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
                            directionDegrees: 210,
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

        const shiftStartDialog = page.locator('#shift-start');
        const shiftResultsDialog = page.locator('#shift-results');
        const sectorSelect = shiftStartDialog.locator('[data-shift-sector]');
        const airportSelect = shiftStartDialog.locator('[data-shift-airport]');
        const lengthSelect = shiftStartDialog.locator('[data-shift-length]');
        const startShiftButton = shiftStartDialog.locator('[data-shift-start-button]');

        await shiftStartDialog.waitFor({ state: 'visible', timeout: 30000 });
        assert.strictEqual(await shiftStartDialog.getAttribute('hidden'), null);
        assert.strictEqual(await page.locator('#canvases').evaluate((element) => element.inert), true);
        assert.deepStrictEqual(await sectorSelect.locator('option').allTextContents(), ['Approach', 'Departure', 'Both']);
        assert.deepStrictEqual(await lengthSelect.locator('option').allTextContents(), ['30 minutes', '60 minutes']);
        assert.strictEqual(await airportSelect.inputValue(), 'ksea');
        assert.strictEqual(await lengthSelect.inputValue(), '30');
        assert.strictEqual(await page.locator(':focus').getAttribute('data-shift-sector'), '');
        assert.notStrictEqual(await sectorSelect.evaluate((element) => getComputedStyle(element).outlineStyle), 'none');

        // The landing-page focus trap includes every control and wraps both ways.
        await page.keyboard.press('Tab');
        assert.strictEqual(await page.locator(':focus').getAttribute('data-shift-airport'), '');
        await page.keyboard.press('Tab');
        assert.strictEqual(await page.locator(':focus').getAttribute('data-shift-length'), '');
        await page.keyboard.press('Tab');
        assert.strictEqual(await page.locator(':focus').getAttribute('data-shift-start-button'), '');
        await page.keyboard.press('Tab');
        assert.strictEqual(await page.locator(':focus').getAttribute('data-shift-sector'), '');
        await page.keyboard.press('Shift+Tab');
        assert.strictEqual(await page.locator(':focus').getAttribute('data-shift-start-button'), '');

        // First shift: Approach at the already-loaded default airport.
        await sectorSelect.selectOption('approach');
        await startShiftButton.click();
        await shiftStartDialog.waitFor({ state: 'hidden', timeout: 30000 });
        await page.locator('.js-stripViewArrivals-section').waitFor({ state: 'visible' });
        await page.locator('.js-stripViewDepartures-section').waitFor({ state: 'hidden' });
        await page.locator('[data-shift-countdown]').waitFor({ state: 'visible' });
        assert.strictEqual(await page.locator('[data-shift-countdown]').getAttribute('aria-live'), 'polite');
        assert.match(await page.locator('[data-shift-countdown]').textContent(), /^29:\d{2}$/);

        // Manual end produces results with the chosen configuration and a restart path.
        await page.locator('[data-shift-end-button]').click();
        await shiftResultsDialog.waitFor({ state: 'visible', timeout: 30000 });
        assert.strictEqual(await shiftResultsDialog.getAttribute('hidden'), null);
        assert.strictEqual(await page.locator('#canvases').evaluate((element) => element.inert), true);
        assert.strictEqual(await shiftResultsDialog.locator('[data-shift-config="airport"] dd').textContent(), 'KSEA');
        assert.strictEqual(await shiftResultsDialog.locator('[data-shift-config="sector"] dd').textContent(), 'Approach');
        assert.strictEqual(
            await shiftResultsDialog.locator('[data-shift-config="scheduledDuration"] dd').textContent(),
            '30:00'
        );
        await shiftResultsDialog.locator('[data-shift-start-another]').click();
        await shiftStartDialog.waitFor({ state: 'visible', timeout: 30000 });

        // Second shift: Departure at an airport that must load through the real lifecycle.
        await sectorSelect.selectOption('departure');
        await airportSelect.selectOption(targetAirport);
        const selectedAirportResponse = page.waitForResponse((candidate) => {
            return new URL(candidate.url()).pathname.endsWith(`/assets/airports/${targetAirport}.json`) && candidate.status() === 200;
        });
        await startShiftButton.click();
        await selectedAirportResponse;
        await shiftStartDialog.waitFor({ state: 'hidden', timeout: 30000 });
        await page.locator('.js-stripViewArrivals-section').waitFor({ state: 'hidden' });
        await page.locator('.js-stripViewDepartures-section').waitFor({ state: 'visible' });
        assert.match(await page.locator('[data-shift-countdown]').textContent(), /^29:\d{2}$/);

        await page.locator('[data-shift-end-button]').click();
        await shiftResultsDialog.waitFor({ state: 'visible', timeout: 30000 });
        await shiftResultsDialog.locator('[data-shift-start-another]').click();
        await shiftStartDialog.waitFor({ state: 'visible', timeout: 30000 });

        // Third shift: Both, proving the reset path resumes simulation and both strip sections.
        await sectorSelect.selectOption('both');
        await airportSelect.selectOption('ksea');
        await startShiftButton.click();
        await shiftStartDialog.waitFor({ state: 'hidden', timeout: 30000 });
        await page.locator('.js-stripViewArrivals-section').waitFor({ state: 'visible' });
        await page.locator('.js-stripViewDepartures-section').waitFor({ state: 'visible' });
        await page.waitForTimeout(1100);
        assert.notStrictEqual(await page.locator('[data-shift-countdown]').textContent(), '30:00');

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

        // Airport changes are rejected while a shift is active; this protects
        // timing, score, ownership, and result configuration from corruption.
        await page.locator('.switch-airport').click();
        await page.locator(`.airport-list-item[data-icao="${targetAirport}"]`).waitFor({ state: 'visible' });
        await page.locator(`.airport-list-item[data-icao="${targetAirport}"]`).click();
        await page.waitForTimeout(500);
        assert.strictEqual(await page.evaluate(() => localStorage.getItem('atc-last-airport')), 'ksea');

        // End the protected shift, then select the already-loaded target through
        // the landing page, where airport changes are intentionally allowed.
        await page.locator('[data-shift-end-button]').click();
        await shiftResultsDialog.waitFor({ state: 'visible', timeout: 30000 });
        await shiftResultsDialog.locator('[data-shift-start-another]').click();
        await shiftStartDialog.waitFor({ state: 'visible', timeout: 30000 });
        await sectorSelect.selectOption('both');
        await airportSelect.selectOption(targetAirport);
        await startShiftButton.click();
        await shiftStartDialog.waitFor({ state: 'hidden', timeout: 30000 });
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
        console.log(`Browser smoke test passed: shift lifecycle, sectors, results, restart, weather, render frame, airport=${targetAirport}, uncaughtErrors=0`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
