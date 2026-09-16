'use strict';

const assert = require('node:assert/strict');

require('../test/testHelpers/registerBabel');

// @babel/register loads some preset plugins lazily on the first transformed
// source file. Warm that toolchain before installing hostile browser globals so
// this gate reports application leaks rather than Babel's environment probing.
require('@babel/core').transformSync('export default 1;', {
    babelrc: false,
    configFile: false,
    presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
});

global.prop = { speech: {} };

for (const name of ['window', 'document', 'navigator', 'localStorage']) {
    Reflect.deleteProperty(globalThis, name);
    assert.equal(name in globalThis, false, `${name} must be absent for the browser-free proof`);
}

const loadDefault = (path) => require(path).default;

async function main() {
    const AssetLoader = loadDefault('../src/assets/scripts/client/platform/AssetLoader');
    const StartupAssetLoader = loadDefault('../src/assets/scripts/client/platform/StartupAssetLoader');
    const StorageAdapter = loadDefault('../src/assets/scripts/client/platform/StorageAdapter');
    const StartupStorage = loadDefault('../src/assets/scripts/client/platform/StartupStorage');
    const ClockAdapter = loadDefault('../src/assets/scripts/client/platform/ClockAdapter');
    const FrameScheduler = loadDefault('../src/assets/scripts/client/platform/FrameScheduler');
    const DelayScheduler = loadDefault('../src/assets/scripts/client/platform/DelayScheduler');
    const RandomSource = loadDefault('../src/assets/scripts/client/platform/RandomSource');
    const AnalyticsAdapter = loadDefault('../src/assets/scripts/client/platform/AnalyticsAdapter');
    const SpeechSynthesisAdapter = loadDefault('../src/assets/scripts/client/platform/SpeechSynthesisAdapter');
    const ClipboardAdapter = loadDefault('../src/assets/scripts/client/platform/ClipboardAdapter');
    const PageVisibilityAdapter = loadDefault('../src/assets/scripts/client/platform/PageVisibilityAdapter');
    const ClearStorageAndReload = loadDefault('../src/assets/scripts/client/platform/ClearStorageAndReload');
    const createAsyncErrorReporter = loadDefault('../src/assets/scripts/client/platform/reportAsyncError');
    const EventTracker = loadDefault('../src/assets/scripts/client/EventTracker');
    const TimeKeeper = loadDefault('../src/assets/scripts/client/engine/TimeKeeper');
    const generalUtilities = require('../src/assets/scripts/client/utilities/generalUtilities');
    const math = require('../src/assets/scripts/client/math/core');
    const speech = require('../src/assets/scripts/client/speech');
    const { STORAGE_KEY } = require('../src/assets/scripts/client/constants/storageKeys');
    const ContentQueue = loadDefault('../src/assets/scripts/client/contentQueue/ContentQueue');
    const SimulationContext = loadDefault('../src/assets/scripts/client/simulation/SimulationContext');

    const assetLoader = new AssetLoader((url) => ({ url }));
    assert.deepEqual(await assetLoader.loadJson('asset.json'), { url: 'asset.json' });
    const startupAssetLoader = new StartupAssetLoader(assetLoader);
    assert.deepEqual(await startupAssetLoader.loadAirport('KPDX'), { url: 'assets/airports/kpdx.json' });

    const values = new Map([[STORAGE_KEY.ATC_LAST_AIRPORT, 'kpdx']]);
    const storageAdapter = new StorageAdapter({
        getItem: (key) => values.get(key),
        setItem: (key, value) => values.set(key, value),
        clear: () => values.clear()
    });
    storageAdapter.set('proof', 'ok');
    assert.equal(storageAdapter.get('proof'), 'ok');
    assert.equal(new StartupStorage(storageAdapter).getInitialAirport([{ icao: 'kpdx' }]), 'kpdx');

    assert.equal(new ClockAdapter(() => 123).now(), 123);
    assert.equal(new FrameScheduler((callback) => callback()).requestFrame(() => 'frame'), 'frame');
    assert.equal(new DelayScheduler((callback, delay) => [callback(), delay]).schedule(() => 'delay', 5)[0], 'delay');

    const randomSource = new RandomSource(() => 0.25, (lower) => lower, (lower) => lower);
    assert.equal(randomSource.fraction(), 0.25);
    assert.equal(randomSource.integer(2, 4), 2);
    assert.equal(randomSource.real(1.5, 3.5), 1.5);

    assert.equal(new AnalyticsAdapter().record('proof', {}), undefined);
    assert.equal(new SpeechSynthesisAdapter().speak('proof', {}), undefined);
    assert.equal(new SpeechSynthesisAdapter().cancel(), undefined);
    assert.equal(new ClipboardAdapter().writeText('proof'), undefined);
    assert.equal(new PageVisibilityAdapter().subscribe(() => {}, () => {}), undefined);
    assert.equal(new ClearStorageAndReload().execute(), undefined);
    assert.equal(createAsyncErrorReporter(null)(new Error('unused')), undefined);

    EventTracker.initAnalytics(null);
    generalUtilities.initRandomSource(null);
    math.initRandomSource(null);
    TimeKeeper.initClock(null);
    speech.randomizePilotVoice_init(null);
    speech.speech_init(null, null);

    assert.equal(generalUtilities.choose(['first', 'second']), 'first');
    assert.equal(math.randint(7, 9), 7);
    assert.equal(TimeKeeper.gameTimeMilliseconds, 0);
    assert.equal(speech.randomizePilotVoice().voice != null, true);
    assert.equal(speech.speech_say([], {}), undefined);

    const queue = new ContentQueue({});
    await assert.rejects(
        queue.addPromise({ url: 'assets/missing-loader.json' }),
        { message: 'ContentQueue requires an asset loader' }
    );
    assert.deepEqual(queue.queuedContent, {});

    const firstContext = new SimulationContext();
    const secondContext = new SimulationContext();
    let firstEventCount = 0;
    let secondEventCount = 0;
    firstContext.eventBus.on('proof', () => { firstEventCount++; });
    secondContext.eventBus.on('proof', () => { secondEventCount++; });
    firstContext.eventBus.trigger('proof');
    assert.equal(firstEventCount, 1);
    assert.equal(secondEventCount, 0);
    firstContext.navigationLibrary.init({
        position: ['N36.080056', 'W115.15225', '2181ft'],
        magnetic_north: 11.9,
        fixes: {
            ALPHA: ['N36.07582', 'W114.95309'],
            BRAVO: ['N36.01000', 'W114.90000']
        },
        airways: { V1: ['ALPHA', 'BRAVO'] },
        holds: {},
        sids: {},
        stars: {}
    });
    const [alphaWaypoint] = firstContext.navigationLibrary
        .getAirway('V1')
        .getWaypointModelsForEntryAndExit('ALPHA', 'BRAVO');
    assert.equal(
        alphaWaypoint.positionModel,
        firstContext.navigationLibrary.findFixByName('ALPHA').positionModel
    );
    assert.equal(secondContext.navigationLibrary.findFixByName('ALPHA'), null);
    firstContext.airportController.airport_load({
        icao: 'KAAA',
        level: 'easy',
        name: 'First Context Airport'
    });
    const firstAirport = firstContext.airportController.airport_get('kaaa');
    assert.equal(firstAirport.eventBus, firstContext.eventBus);
    assert.equal(firstAirport._airportController, firstContext.airportController);
    firstContext.airportController.airport_set('kaaa');
    assert.equal(firstContext.airportController.current, firstAirport);
    assert.equal(secondContext.airportController.current, null);
    const aircraft = { id: 'first-context-aircraft' };
    firstContext.aircraftCollection.addItem(aircraft);
    firstContext.aircraftCollection.auto.enabled = true;
    assert.notEqual(firstContext.aircraftCollection, secondContext.aircraftCollection);
    assert.deepEqual(firstContext.aircraftCollection.items, [aircraft]);
    assert.deepEqual(secondContext.aircraftCollection.items, []);
    let firstTimerCount = 0;
    firstContext.timerQueue.scheduleTimeout(() => { firstTimerCount++; }, 1);
    firstContext.tick(0.5);
    firstContext.tick(1.25);
    assert.equal(firstTimerCount, 1);
    assert.equal(firstContext.timerQueue.timers.length, 0);
    assert.equal(secondContext.timerQueue.timers.length, 0);
    assert.equal(firstContext.clock.elapsedTime, 1.75);
    assert.equal(secondContext.clock.elapsedTime, 0);
    let firstSpawnCount = 0;
    let secondSpawnCount = 0;
    const trafficPattern = { getNextDelayValue: () => 1, scheduleId: null };
    firstContext.spawnScheduler._aircraftController = {
        createAircraftWithSpawnPatternModel: () => { firstSpawnCount++; }
    };
    secondContext.spawnScheduler._aircraftController = {
        createAircraftWithSpawnPatternModel: () => { secondSpawnCount++; }
    };
    trafficPattern.scheduleId = firstContext.spawnScheduler.createNextSchedule(trafficPattern);
    firstContext.tick(2);
    assert.equal(firstSpawnCount, 1);
    assert.equal(secondSpawnCount, 0);
    firstContext.destroy();
    assert.equal(firstContext.navigationLibrary.findFixByName('ALPHA'), null);
    assert.equal(firstContext.airportController.current, null);
    assert.equal(firstContext.airportController.hasAirport('kaaa'), false);
    assert.deepEqual(firstContext.aircraftCollection.items, []);
    assert.equal(firstContext.aircraftCollection.auto.enabled, false);
    secondContext.destroy();

    process.stdout.write('core services browser-free proof passed\n');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
