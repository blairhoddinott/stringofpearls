import ava from 'ava';
import sinon from 'sinon';
import StartupAssetLoader from '../../src/assets/scripts/client/platform/StartupAssetLoader';

ava('.loadAirportList() loads the airport manifest', async (t) => {
    const expectedPayload = [{ icao: 'KPDX' }];
    const assetLoader = { loadJson: sinon.stub().resolves(expectedPayload) };
    const startupAssetLoader = new StartupAssetLoader(assetLoader);

    const payload = await startupAssetLoader.loadAirportList();

    t.true(assetLoader.loadJson.calledOnceWithExactly('assets/airports/airportLoadList.json'));
    t.is(payload, expectedPayload);
});

ava('.loadAirport() normalizes the ICAO and loads its definition', async (t) => {
    const expectedPayload = { icao: 'KPDX' };
    const assetLoader = { loadJson: sinon.stub().resolves(expectedPayload) };
    const startupAssetLoader = new StartupAssetLoader(assetLoader);

    const payload = await startupAssetLoader.loadAirport('KPDX');

    t.true(assetLoader.loadJson.calledOnceWithExactly('assets/airports/kpdx.json'));
    t.is(payload, expectedPayload);
});

ava('.loadDefinitions() resolves named startup datasets', async (t) => {
    const airlinePayload = { airlines: [{ icao: 'AAL' }] };
    const aircraftPayload = { aircraft: [{ icao: 'B738' }] };
    const guidePayload = { KPDX: { title: 'Portland' } };
    const assetLoader = { loadJson: sinon.stub() };
    const startupAssetLoader = new StartupAssetLoader(assetLoader);

    assetLoader.loadJson.onCall(0).resolves(airlinePayload);
    assetLoader.loadJson.onCall(1).resolves(aircraftPayload);
    assetLoader.loadJson.onCall(2).resolves(guidePayload);

    const payload = await startupAssetLoader.loadDefinitions();

    t.deepEqual(assetLoader.loadJson.args, [
        ['assets/airlines/airlines.json'],
        ['assets/aircraft/aircraft.json'],
        ['assets/guides/guides.json']
    ]);
    t.deepEqual(payload, {
        aircraft: aircraftPayload.aircraft,
        airlines: airlinePayload.airlines,
        guides: guidePayload
    });
});

ava('.loadSchedules() loads every catalogued schedule into an ICAO-keyed map', async (t) => {
    const kseaSchedule = { airportIcao: 'KSEA', flights: [{}] };
    const assetLoader = { loadJson: sinon.stub() };
    const startupAssetLoader = new StartupAssetLoader(assetLoader);

    assetLoader.loadJson.onCall(0).resolves([{ icao: 'ksea', file: 'ksea.json' }]);
    assetLoader.loadJson.onCall(1).resolves(kseaSchedule);

    const schedulesByAirport = await startupAssetLoader.loadSchedules();

    t.deepEqual(assetLoader.loadJson.args, [
        ['assets/schedules/scheduleLoadList.json'],
        ['assets/schedules/ksea.json']
    ]);
    t.deepEqual(schedulesByAirport, { ksea: kseaSchedule });
});

ava('.loadAirportWithFallback() loads the default only when the selected airport fails', async (t) => {
    const defaultAirport = { icao: 'KSEA' };
    const assetLoader = { loadJson: sinon.stub() };
    const startupAssetLoader = new StartupAssetLoader(assetLoader);

    assetLoader.loadJson.onFirstCall().rejects(new Error('selected airport unavailable'));
    assetLoader.loadJson.onSecondCall().resolves(defaultAirport);

    const result = await startupAssetLoader.loadAirportWithFallback('KPDX', 'KSEA');

    t.deepEqual(assetLoader.loadJson.args, [
        ['assets/airports/kpdx.json'],
        ['assets/airports/ksea.json']
    ]);
    t.deepEqual(result, {
        airport: defaultAirport,
        icao: 'ksea'
    });
});

ava('.loadInitialAssets() includes the reviewed schedule map in startup composition', async (t) => {
    const assetLoader = {
        loadJson: sinon.stub().callsFake((url) => {
            const payloads = {
                'assets/airports/ksea.json': { icao: 'KSEA' },
                'assets/airlines/airlines.json': { airlines: [] },
                'assets/aircraft/aircraft.json': { aircraft: [] },
                'assets/guides/guides.json': {},
                'assets/schedules/scheduleLoadList.json': [{ icao: 'ksea', file: 'ksea.json' }],
                'assets/schedules/ksea.json': { airportIcao: 'KSEA', flights: [{}] }
            };

            return Promise.resolve(payloads[url]);
        })
    };
    const startupAssetLoader = new StartupAssetLoader(assetLoader);

    const result = await startupAssetLoader.loadInitialAssets('KSEA', 'KSEA');

    t.deepEqual(result.schedulesByAirport, {
        ksea: { airportIcao: 'KSEA', flights: [{}] }
    });
});

ava('.loadInitialAssets() propagates definition failure without retrying the airport', async (t) => {
    const selectedAirport = { icao: 'KPDX' };
    const assetLoader = { loadJson: sinon.stub() };
    const startupAssetLoader = new StartupAssetLoader(assetLoader);

    assetLoader.loadJson.onCall(0).resolves(selectedAirport);
    assetLoader.loadJson.onCall(1).rejects(new Error('airline definitions unavailable'));
    assetLoader.loadJson.onCall(2).resolves({ aircraft: [] });
    assetLoader.loadJson.onCall(3).resolves({});
    assetLoader.loadJson.onCall(4).resolves([]);

    await t.throwsAsync(
        startupAssetLoader.loadInitialAssets('KPDX', 'KSEA'),
        { message: 'airline definitions unavailable' }
    );
    t.deepEqual(assetLoader.loadJson.args, [
        ['assets/airports/kpdx.json'],
        ['assets/airlines/airlines.json'],
        ['assets/aircraft/aircraft.json'],
        ['assets/guides/guides.json'],
        ['assets/schedules/scheduleLoadList.json']
    ]);
});
