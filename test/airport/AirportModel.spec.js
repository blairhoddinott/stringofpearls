import ava from 'ava';
import sinon from 'sinon';

import AirportController from '../../src/assets/scripts/client/airport/AirportController';
import AirportModel from '../../src/assets/scripts/client/airport/AirportModel';
import DynamicPositionModel from '../../src/assets/scripts/client/base/DynamicPositionModel';
import { AssetLoadError } from '../../src/assets/scripts/client/platform/AssetLoader';
import { FLIGHT_CATEGORY } from '../../src/assets/scripts/client/constants/aircraftConstants';
import { AIRPORT_JSON_KLAS_MOCK } from './_mocks/airportJsonMock';

const FLYWEIGHT_OPTIONS_MOCK = { icao: 'ksfo', level: 'medium', name: 'San Francisco International Airport' };

ava('does not throw when passed valid parameters', (t) => {
    t.notThrows(() => new AirportModel(AIRPORT_JSON_KLAS_MOCK));
});

ava('#runways retuns an array of RunwayModels with the correct data', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);

    t.true(model.runways[0][0].name === '07L');
    t.true(model.runways[0][1].name === '25R');
    t.deepEqual(model.runways[0][0].relativePosition, [-1.5972765965064895, -0.7590007123826077]);
    t.deepEqual(model.runways[0][1].relativePosition, [2.8236983855119275, 0.17990498917699685]);
});

ava('does not call .setCurrentPosition() when airportData does not have a position value', (t) => {
    const invalidAirportJsonMock = Object.assign({}, AIRPORT_JSON_KLAS_MOCK, { position: null });
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const setCurrentPositionSpy = sinon.spy(model, 'setCurrentPosition');

    model.init(invalidAirportJsonMock);

    t.false(setCurrentPositionSpy.called);
});

ava('calls .setCurrentPosition() when airportData has a position value', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const setCurrentPositionSpy = sinon.spy(model, 'setCurrentPosition');

    model.init(AIRPORT_JSON_KLAS_MOCK);

    t.true(setCurrentPositionSpy.calledOnce);
});

ava('.setCurrentPosition() returns early when passed an invalid coordinate', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    model._positionModel = null;

    model.setCurrentPosition([]);

    t.true(!model._positionModel);
});

ava('.buildAirportAirspace() returns early when passed a null or undefined argument', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    model.airspace = null;

    model.buildAirspace();

    t.true(!model.airspace);
});

ava('.buildRestrictedAreas() returns early when passed a null or undefined argument', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    model.restricted_areas = null;

    model.buildRestrictedAreas();

    t.true(!model.restricted_areas);
});

ava('.updateCurrentWind() returns early when passed a null or undefined argument', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    model.wind.speed = 42;
    model.wind.angle = 42;

    model.updateCurrentWind();

    t.true(model.wind.speed === 42);
    t.true(model.wind.angle === 42);
});

ava('.set() calls .load() when #lodaed is false', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const loadSpy = sinon.spy(model, 'load');
    model.loaded = false;

    model.set(AIRPORT_JSON_KLAS_MOCK);

    t.true(loadSpy.calledWithExactly(AIRPORT_JSON_KLAS_MOCK));
});

ava('.loadTerrain() returns early when #has_terrain is false', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const parseTerrainSpy = sinon.spy(model, 'parseTerrain');
    model.has_terrain = false;

    model.loadTerrain();

    t.false(parseTerrainSpy.calledOnce);
});

ava('.load() calls .onLoadIntialAirportFromJson() when passed an object', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const onLoadIntialAirportFromJsonSpy = sinon.spy(model, 'onLoadIntialAirportFromJson');

    model.load(AIRPORT_JSON_KLAS_MOCK);

    t.true(onLoadIntialAirportFromJsonSpy.calledWithExactly(AIRPORT_JSON_KLAS_MOCK));
});

ava('.load() does not call .onLoadIntialAirportFromJson() when no parameters are received', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const onLoadIntialAirportFromJsonSpy = sinon.spy(model, 'onLoadIntialAirportFromJson');

    model.load();

    t.false(onLoadIntialAirportFromJsonSpy.called);
});

ava('.load() without an injected queue returns before changing loading state or pausing', (t) => {
    const model = new AirportModel(FLYWEIGHT_OPTIONS_MOCK);
    const triggerSpy = sinon.spy();
    model.eventBus = { trigger: triggerSpy };

    model.load();

    t.false(model.loading);
    t.false(triggerSpy.called);
});

ava('.getRunwayByName() returns null when passed an invalid runwayname', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const result = model.getRunway();

    t.true(!result);
});

ava('.getActiveRunwayForCategory() returns the correct RunwayModel for departure', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const result = model.getActiveRunwayForCategory(FLIGHT_CATEGORY.DEPARTURE);

    t.true(result.name === model.departureRunwayModel.name);
});

ava('.getActiveRunwayForCategory() returns the correct RunwayModel for arrival', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const result = model.getActiveRunwayForCategory(FLIGHT_CATEGORY.ARRIVAL);

    t.true(result.name === model.arrivalRunwayModel.name);
});

ava('.getActiveRunwayForCategory() returns the arrivalRunway when an invalid category is passed', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const result = model.getActiveRunwayForCategory('threeve');

    t.true(result.name === model.arrivalRunwayModel.name);
});

ava('.isPointWithinAirspace() returns true when the provided point is inside the lateral and vertical boundaries', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const coordinatesMock = [36, -114.5];
    const positionMock = DynamicPositionModel.calculateRelativePosition(coordinatesMock, model.positionModel, model.magneticNorth);
    const altitudeMock = 19000;
    const result = model.isPointWithinAirspace(positionMock, altitudeMock);

    t.true(result);
});

ava('.isPointWithinAirspace() returns false when the provided point is inside the lateral boundary but not within vertical boundaries', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const coordinatesMock = [36, -114.5];
    const positionMock = DynamicPositionModel.calculateRelativePosition(coordinatesMock, model.positionModel, model.magneticNorth);
    const altitudeMock = 19001;
    const result = model.isPointWithinAirspace(positionMock, altitudeMock);

    t.false(result);
});

ava('.isPointWithinAirspace() returns false when the provided point is inside the vertical boundary but not within lateral boundaries', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const coordinatesMock = [36, -114];
    const positionMock = DynamicPositionModel.calculateRelativePosition(coordinatesMock, model.positionModel, model.magneticNorth);
    const altitudeMock = 19000;
    const result = model.isPointWithinAirspace(positionMock, altitudeMock);

    t.false(result);
});

ava('.mapCollection is valid', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);

    t.true(model.mapCollection.hasVisibleMaps);
});

ava.skip('.removeAircraftFromAllRunwayQueues()', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const removeAircraftFromAllRunwayQueuesSpy = sinon.spy(model._runwayCollection, 'removeAircraftFromAllRunwayQueues');
    model.removeAircraftFromAllRunwayQueues({});

    t.true(removeAircraftFromAllRunwayQueuesSpy.calledOnce);
});

ava.serial('.load() requests the airport json from the injected content queue with immediate priority', async (t) => {
    const responseMock = { icao: 'ksfo' };
    const addPromiseStub = sinon.stub().resolves(responseMock);
    const contentQueueMock = { addPromise: addPromiseStub };
    const model = new AirportModel(FLYWEIGHT_OPTIONS_MOCK, contentQueueMock);
    const onLoadAirportSuccessStub = sinon.stub(model, 'onLoadAirportSuccess');

    await model.load();

    t.true(addPromiseStub.calledOnceWithExactly({ url: 'assets/airports/ksfo.json', immediate: true }));
    t.true(onLoadAirportSuccessStub.calledOnceWithExactly(responseMock));
});

ava.serial('.load() logs the transport diagnostic and recovers when the content queue rejects with an AssetLoadError', async (t) => {
    const previousCurrent = AirportController.current;
    const setSpy = sinon.spy();
    const consoleErrorStub = sinon.stub(console, 'error');

    AirportController.current = { set: setSpy };
    t.teardown(() => {
        consoleErrorStub.restore();
        AirportController.current = previousCurrent;
    });

    const assetLoadError = new AssetLoadError({ status: 404, statusText: 'Not Found' }, 'timeout');
    const contentQueueMock = { addPromise: sinon.stub().rejects(assetLoadError) };
    const model = new AirportModel(FLYWEIGHT_OPTIONS_MOCK, contentQueueMock);

    await t.notThrowsAsync(model.load());

    t.true(consoleErrorStub.calledOnceWithExactly('Unable to load airport/ksfo: timeout'));
    t.is(model.loading, false);
    t.true(setSpy.calledOnce);
});

ava.serial('.load() surfaces an exception thrown while processing a successful response through the injected reporter', async (t) => {
    const consoleErrorStub = sinon.stub(console, 'error');
    t.teardown(() => consoleErrorStub.restore());

    const processingError = new Error('kaboom');
    const reportErrorSpy = sinon.spy();
    const contentQueueMock = { addPromise: sinon.stub().resolves({ icao: 'ksfo' }) };
    const model = new AirportModel(FLYWEIGHT_OPTIONS_MOCK, contentQueueMock, reportErrorSpy);
    sinon.stub(model, 'onLoadAirportSuccess').throws(processingError);

    await t.notThrowsAsync(model.load());

    t.true(reportErrorSpy.calledOnceWithExactly(processingError));
    t.false(consoleErrorStub.called);
});

ava.serial('.loadTerrain() requests terrain geojson from the injected queue and parses the response', async (t) => {
    const terrainDataMock = { features: [] };
    const addPromiseStub = sinon.stub().resolves(terrainDataMock);
    const contentQueueMock = { addPromise: addPromiseStub };
    const model = new AirportModel(FLYWEIGHT_OPTIONS_MOCK, contentQueueMock);
    model.has_terrain = true;
    const parseTerrainStub = sinon.stub(model, 'parseTerrain');

    await model.loadTerrain();

    t.true(addPromiseStub.calledOnceWithExactly({ url: 'assets/airports/terrain/ksfo.geojson', immediate: true }));
    t.true(parseTerrainStub.calledOnceWithExactly(terrainDataMock));
});

ava.serial('.loadTerrain() logs the terrain transport diagnostic and recovers when the content queue rejects', async (t) => {
    const previousCurrent = AirportController.current;
    const setSpy = sinon.spy();
    const consoleErrorStub = sinon.stub(console, 'error');

    AirportController.current = { set: setSpy };
    t.teardown(() => {
        consoleErrorStub.restore();
        AirportController.current = previousCurrent;
    });

    const assetLoadError = new AssetLoadError({ status: 500, statusText: 'Server Error' }, 'error');
    const contentQueueMock = { addPromise: sinon.stub().rejects(assetLoadError) };
    const model = new AirportModel(FLYWEIGHT_OPTIONS_MOCK, contentQueueMock);
    model.has_terrain = true;

    await t.notThrowsAsync(model.loadTerrain());

    t.true(consoleErrorStub.calledOnceWithExactly('Unable to load airport/terrain/ksfo: error'));
    t.is(model.loading, false);
    t.true(setSpy.calledOnce);
});

ava.serial('.loadTerrain() reports a parse failure through the injected reporter without a transport diagnostic', async (t) => {
    const consoleErrorStub = sinon.stub(console, 'error');
    t.teardown(() => consoleErrorStub.restore());

    const parseError = new Error('bad geojson');
    const reportErrorSpy = sinon.spy();
    const contentQueueMock = { addPromise: sinon.stub().resolves({ features: 'nope' }) };
    const model = new AirportModel(FLYWEIGHT_OPTIONS_MOCK, contentQueueMock, reportErrorSpy);
    model.has_terrain = true;
    sinon.stub(model, 'parseTerrain').throws(parseError);

    await t.notThrowsAsync(model.loadTerrain());

    t.true(reportErrorSpy.calledOnce);
    t.true(reportErrorSpy.firstCall.args[0] instanceof Error);
    t.is(reportErrorSpy.firstCall.args[0].message, 'bad geojson');
    t.false(consoleErrorStub.called);
});

ava('.resetAllRunwayQueues() calls .resetQueue() for all runways', (t) => {
    const model = new AirportModel(AIRPORT_JSON_KLAS_MOCK);
    const resetQueueSpy07L = sinon.spy(model._runwayCollection.findRunwayModelByName('07L'), 'resetQueue');
    const resetQueueSpy25R = sinon.spy(model._runwayCollection.findRunwayModelByName('25R'), 'resetQueue');
    const resetQueueSpy07R = sinon.spy(model._runwayCollection.findRunwayModelByName('07R'), 'resetQueue');
    const resetQueueSpy25L = sinon.spy(model._runwayCollection.findRunwayModelByName('25L'), 'resetQueue');
    const resetQueueSpy01L = sinon.spy(model._runwayCollection.findRunwayModelByName('01L'), 'resetQueue');
    const resetQueueSpy19R = sinon.spy(model._runwayCollection.findRunwayModelByName('19R'), 'resetQueue');
    const resetQueueSpy01R = sinon.spy(model._runwayCollection.findRunwayModelByName('01R'), 'resetQueue');
    const resetQueueSpy19L = sinon.spy(model._runwayCollection.findRunwayModelByName('19L'), 'resetQueue');

    model.resetAllRunwayQueues();

    t.true(resetQueueSpy07L.calledWithExactly());
    t.true(resetQueueSpy25R.calledWithExactly());
    t.true(resetQueueSpy07R.calledWithExactly());
    t.true(resetQueueSpy25L.calledWithExactly());
    t.true(resetQueueSpy01L.calledWithExactly());
    t.true(resetQueueSpy19R.calledWithExactly());
    t.true(resetQueueSpy01R.calledWithExactly());
    t.true(resetQueueSpy19L.calledWithExactly());
});
