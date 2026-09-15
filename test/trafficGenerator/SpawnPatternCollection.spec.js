import ava from 'ava';
import sinon from 'sinon';
import SpawnPatternCollection from '../../src/assets/scripts/client/trafficGenerator/SpawnPatternCollection';
import {
    createAirportControllerFixture,
    resetAirportControllerFixture
} from '../fixtures/airportFixtures';
import {
    createNavigationLibraryFixture,
    resetNavigationLibraryFixture
} from '../fixtures/navigationLibraryFixtures';
import { spawnPatternModelArrivalFixture, spawnPatternModelDepartureFixture } from '../fixtures/trafficGeneratorFixtures';
import SpawnPatternModel from '../../src/assets/scripts/client/trafficGenerator/SpawnPatternModel';
import { FLIGHT_CATEGORY } from '../../src/assets/scripts/client/constants/aircraftConstants';
import {
    AIRPORT_JSON_FOR_SPAWN_MOCK,
    SPAWN_PATTERN_MODEL_FOR_DEPARTURE_FIXTURE
} from './_mocks/spawnPatternMocks';

let sandbox; // using the sinon sandbox ensures stubs are restored after each test

ava.beforeEach(() => {
    sandbox = sinon.createSandbox();

    createNavigationLibraryFixture();
    createAirportControllerFixture();
});

ava.afterEach.always(() => {
    sandbox.restore();

    resetNavigationLibraryFixture();
    resetAirportControllerFixture();
    SpawnPatternCollection.reset();
    // `.reset()` deliberately retains the app-level source, so clear it explicitly
    SpawnPatternCollection.initRandomSource();
});

ava('.init() throws when the provided airport JSON data is empty or invalid', (t) => {
    const expectedMessage = /Invalid airportJson passed to SpawnPatternCollection\.init\. Expected a non-empty object, but received .*/;

    t.throws(() => SpawnPatternCollection.init(), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => SpawnPatternCollection.init(null), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => SpawnPatternCollection.init([]), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => SpawnPatternCollection.init({}), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => SpawnPatternCollection.init(42), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => SpawnPatternCollection.init('threeve'), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => SpawnPatternCollection.init(false), {
        instanceOf: TypeError,
        message: expectedMessage
    });
});

ava('.init() calls _buildSpawnPatternModels()', (t) => {
    const _buildSpawnPatternModelsSpy = sandbox.spy(SpawnPatternCollection, '_buildSpawnPatternModels');

    SpawnPatternCollection.init(AIRPORT_JSON_FOR_SPAWN_MOCK);

    t.true(_buildSpawnPatternModelsSpy.calledWithExactly(AIRPORT_JSON_FOR_SPAWN_MOCK.spawnPatterns));
});

ava('.addItems() does not call .addItem() if passed an invalid value', (t) => {
    SpawnPatternCollection.init(AIRPORT_JSON_FOR_SPAWN_MOCK);

    const addItemSpy = sandbox.spy(SpawnPatternCollection, 'addItem');

    SpawnPatternCollection.addItems([]);
    t.false(addItemSpy.called);

    SpawnPatternCollection.addItems();
    t.false(addItemSpy.called);

    addItemSpy.restore();
});

ava('.addItems() calls .addItem() for each item in the list passed as an argument', (t) => {
    SpawnPatternCollection.init(AIRPORT_JSON_FOR_SPAWN_MOCK);

    const addItemSpy = sandbox.spy(SpawnPatternCollection, 'addItem');

    SpawnPatternCollection.addItems([spawnPatternModelArrivalFixture, spawnPatternModelDepartureFixture]);

    t.true(addItemSpy.calledTwice);

    addItemSpy.restore();
});

ava('.addItem() throws if anything other than a SpawnPatternModel is passed as an argument', (t) => {
    SpawnPatternCollection.init(AIRPORT_JSON_FOR_SPAWN_MOCK);

    t.throws(() => SpawnPatternCollection.addItem());
    t.throws(() => SpawnPatternCollection.addItem([]));
    t.throws(() => SpawnPatternCollection.addItem({}));
    t.throws(() => SpawnPatternCollection.addItem(42));
    t.throws(() => SpawnPatternCollection.addItem('threeve'));
    t.throws(() => SpawnPatternCollection.addItem(false));
    t.throws(() => SpawnPatternCollection.addItem(null));
    t.throws(() => SpawnPatternCollection.addItem(undefined));
});

ava('.findSpawnPatternsByCategory() returns an empty array when no spawn patterns of the specified category are found', (t) => {
    SpawnPatternCollection.init(AIRPORT_JSON_FOR_SPAWN_MOCK);
    SpawnPatternCollection.addItems([spawnPatternModelArrivalFixture, spawnPatternModelDepartureFixture]);

    const categoryMock = 'threeve';
    const expectedResult = [];
    const result = SpawnPatternCollection.findSpawnPatternsByCategory(categoryMock);

    t.deepEqual(result, expectedResult);
});

ava('.findSpawnPatternsByCategory() returns all SpawnPatternModels in the collection which have the specified category', (t) => {
    SpawnPatternCollection.init(AIRPORT_JSON_FOR_SPAWN_MOCK);
    SpawnPatternCollection.addItems([
        spawnPatternModelArrivalFixture,
        spawnPatternModelDepartureFixture
    ]);

    const categoryMock = 'arrival';
    const result = SpawnPatternCollection.findSpawnPatternsByCategory(categoryMock);

    t.true(result.every((spawnPatternModel) => spawnPatternModel.category === categoryMock));
});

ava.serial('.initRandomSource() normalizes a nullish source to null', (t) => {
    SpawnPatternCollection.initRandomSource(undefined);
    t.is(SpawnPatternCollection._randomSource, null);

    SpawnPatternCollection.initRandomSource(null);
    t.is(SpawnPatternCollection._randomSource, null);
});

ava.serial('.init() threads the configured randomSource by identity to every SpawnPatternModel it builds', (t) => {
    const randomSourceStub = { integer: (lower) => lower, real: (lower) => lower };
    SpawnPatternCollection.initRandomSource(randomSourceStub);
    SpawnPatternCollection.init(AIRPORT_JSON_FOR_SPAWN_MOCK);

    t.true(SpawnPatternCollection.spawnPatternModels.length > 0);
    SpawnPatternCollection.spawnPatternModels.forEach((spawnPatternModel) => {
        t.is(spawnPatternModel._randomSource, randomSourceStub);
    });
});

ava.serial('.reset() retains the configured randomSource for subsequent airport rebuilds', (t) => {
    const randomSourceStub = { integer: (lower) => lower, real: (lower) => lower };
    SpawnPatternCollection.initRandomSource(randomSourceStub);
    SpawnPatternCollection.init(AIRPORT_JSON_FOR_SPAWN_MOCK);

    SpawnPatternCollection.reset();

    t.is(SpawnPatternCollection._randomSource, randomSourceStub);

    // rebuild without re-supplying the source
    SpawnPatternCollection.init(AIRPORT_JSON_FOR_SPAWN_MOCK);
    const [spawnPatternModel] = SpawnPatternCollection.spawnPatternModels;

    t.is(spawnPatternModel._randomSource, randomSourceStub);
});

ava.serial('.getDepartureModelsForPreSpawn() draws the weighted position with real(0, rateTotal)', (t) => {
    const randomSourceStub = { real: sandbox.stub().returns(0) };
    const departureModel = new SpawnPatternModel();
    departureModel.category = FLIGHT_CATEGORY.DEPARTURE;
    departureModel.rate = 5;
    departureModel.routeString = 'KSEA16L.TEST';
    SpawnPatternCollection.initRandomSource(randomSourceStub);
    SpawnPatternCollection.addItems([departureModel]);

    const result = SpawnPatternCollection.getDepartureModelsForPreSpawn();

    t.true(randomSourceStub.real.calledOnceWithExactly(0, departureModel.rate));
    t.is(result[0], departureModel);
});

ava.serial('.getDepartureModelsForPreSpawn() selects the pattern at the <= boundary of the weighted range', (t) => {
    const firstPattern = new SpawnPatternModel(Object.assign({}, SPAWN_PATTERN_MODEL_FOR_DEPARTURE_FIXTURE, { rate: 3 }));
    const secondPattern = new SpawnPatternModel(Object.assign({}, SPAWN_PATTERN_MODEL_FOR_DEPARTURE_FIXTURE, { rate: 7 }));
    const randomSourceStub = { real: sandbox.stub().returns(3) };
    SpawnPatternCollection.initRandomSource(randomSourceStub);
    SpawnPatternCollection.addItems([firstPattern, secondPattern]);

    const result = SpawnPatternCollection.getDepartureModelsForPreSpawn();

    t.true(randomSourceStub.real.calledOnceWithExactly(0, 10));
    t.is(result[0], firstPattern);
});

ava.serial('.getDepartureModelsForPreSpawn() treats the weighted position as 0 when no randomSource is injected', (t) => {
    const departureModel = new SpawnPatternModel();
    departureModel.category = FLIGHT_CATEGORY.DEPARTURE;
    departureModel.rate = 5;
    departureModel.routeString = 'KSEA16L.TEST';
    SpawnPatternCollection.addItems([departureModel]);

    const result = SpawnPatternCollection.getDepartureModelsForPreSpawn();

    t.is(result[0], departureModel);
});
