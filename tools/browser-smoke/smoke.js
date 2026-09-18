'use strict';

const assert = require('assert');
const { chromium } = require('playwright');

const baseUrl = process.env.BASE_URL || 'http://simulator:8080';
const targetAirport = process.env.TARGET_AIRPORT || 'kpdx';

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

        await page.addInitScript(() => {
            localStorage.clear();
            localStorage.setItem('atc-last-version', '6.29.0-BETA');
            localStorage.setItem('first-run-time', '0');
            localStorage.setItem('atc-speech-enabled', 'false');
        });

        const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        assert(response && response.ok(), `startup returned HTTP ${response ? response.status() : 'no response'}`);

        const trafficModeDialog = page.locator('#traffic-mode-selection');
        await trafficModeDialog.waitFor({ state: 'visible', timeout: 30000 });
        const trafficModeLabels = await trafficModeDialog.locator('[data-traffic-mode]').allTextContents();
        assert.deepStrictEqual(trafficModeLabels, ['Arrivals', 'Departures', 'Both']);
        assert.strictEqual(await page.locator(':focus').getAttribute('data-traffic-mode'), 'arrivals');
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

        await page.locator('.switch-airport').click();
        await page.locator(`.airport-list-item.mix-airport-list-item_isActive[data-icao="${targetAirport}"]`).waitFor({ state: 'visible' });

        assert.deepStrictEqual(errors, [], errors.join('\n'));
        console.log(`Browser smoke test passed: traffic mode, startup, render frame, airport=${targetAirport}, uncaughtErrors=0`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
