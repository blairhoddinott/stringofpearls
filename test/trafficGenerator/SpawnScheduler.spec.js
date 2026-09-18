import ava from 'ava';
import sinon from 'sinon';
import AircraftCollection from '../../src/assets/scripts/client/aircraft/AircraftCollection';
import AircraftController from '../../src/assets/scripts/client/aircraft/AircraftController';
import AirportController from '../../src/assets/scripts/client/airport/AirportController';
import GameController from '../../src/assets/scripts/client/game/GameController';
import { EventBusClass } from '../../src/assets/scripts/client/lib/EventBus';
import { NavigationLibraryClass } from '../../src/assets/scripts/client/navigationLibrary/NavigationLibrary';
import SpawnScheduler, { SpawnSchedulerClass } from '../../src/assets/scripts/client/trafficGenerator/SpawnScheduler';
import SpawnPatternCollection from '../../src/assets/scripts/client/trafficGenerator/SpawnPatternCollection';
import TrafficMode, { TRAFFIC_MODE } from '../../src/assets/scripts/client/trafficGenerator/TrafficMode';
import {
    AIRCRAFT_DEFINITION_LIST_MOCK,
    DEPARTURE_AIRCRAFT_INIT_PROPS_MOCK
} from '../aircraft/_mocks/aircraftMocks';
import { AIRPORT_JSON_KLAS_MOCK } from '../airport/_mocks/airportJsonMock';
import { airlineControllerFixture } from '../fixtures/airlineFixtures';
import {
    createAirportControllerFixture,
    resetAirportControllerFixture
} from '../fixtures/airportFixtures';
import {
    createNavigationLibraryFixture,
    resetNavigationLibraryFixture
} from '../fixtures/navigationLibraryFixtures';
import { AIRPORT_JSON_FOR_SPAWN_MOCK } from './_mocks/spawnPatternMocks';
import { INVALID_NUMBER } from '../../src/assets/scripts/client/constants/globalConstants';
import { scopeModelFixture } from '../fixtures/scopeFixtures';

let aircraftControllerStub;
let spawnPatternCollectionFixture;
let sandbox; // using the sinon sandbox ensures stubs are restored after each test

ava.beforeEach(() => {
    createNavigationLibraryFixture();
    createAirportControllerFixture();
    SpawnPatternCollection.init(AIRPORT_JSON_FOR_SPAWN_MOCK);

    sandbox = sinon.createSandbox();
    aircraftControllerStub = {
        createAircraftWithSpawnPatternModel: sinon.stub(),
        createPreSpawnAircraftWithSpawnPatternModel: sinon.stub()
    };
});

ava.afterEach.always(() => {
    resetNavigationLibraryFixture();
    resetAirportControllerFixture();
    sandbox.restore();

    spawnPatternCollectionFixture = null;
    aircraftControllerStub = null;
});

ava('throws when passed invalid parameters', (t) => {
    t.throws(() => SpawnScheduler.init());
    t.throws(() => SpawnScheduler.init(spawnPatternCollectionFixture));
    t.throws(() => SpawnScheduler.init({}, aircraftControllerStub));
});

ava('does not throw when passed valid parameters', (t) => {
    t.notThrows(() => SpawnScheduler.init(aircraftControllerStub));
});

ava('.createSchedulesFromList() calls .createNextSchedule() for each SpawnPatternModel in the collection', (t) => {
    const createSchedulesFromListSpy = sandbox.spy(SpawnScheduler, 'createSchedulesFromList');
    const createNextScheduleSpy = sandbox.spy(SpawnScheduler, 'createNextSchedule');
    const expectedCallCount = SpawnPatternCollection.spawnPatternModels.length;

    SpawnScheduler.init(aircraftControllerStub);

    t.true(createSchedulesFromListSpy.called);
    t.true(createNextScheduleSpy.callCount === expectedCallCount);

    createSchedulesFromListSpy.restore();
    createNextScheduleSpy.restore();
});

ava('.createSchedulesFromList() calls aircraftController.createPreSpawnAircraftWithSpawnPatternModel() if preSpawnAircraftList has items', (t) => {
    SpawnScheduler.init(aircraftControllerStub);
    SpawnScheduler.createSchedulesFromList();

    t.true(aircraftControllerStub.createPreSpawnAircraftWithSpawnPatternModel.called);
});

ava.skip('.createNextSchedule() calls GameController.game_timeout()', (t) => {
    const gameControllerGameTimeoutStub = {
        game_timeout: sandbox.stub(),
        game: {
            time: 0
        }
    };
    SpawnScheduler.init(aircraftControllerStub);
    const spawnPatternModel = SpawnPatternCollection._items[0];

    SpawnScheduler.createNextSchedule(spawnPatternModel, aircraftControllerStub);

    t.true(gameControllerGameTimeoutStub.game_timeout.called);
});

ava('.createAircraftAndRegisterNextTimeout() calls aircraftController.createAircraftWithSpawnPatternModel()', (t) => {
    SpawnScheduler.init(aircraftControllerStub);
    const spawnPatternModel = SpawnPatternCollection._items[0];

    SpawnScheduler.createAircraftAndRegisterNextTimeout([spawnPatternModel, aircraftControllerStub]);

    t.true(aircraftControllerStub.createAircraftWithSpawnPatternModel.called);
});

ava('.createAircraftAndRegisterNextTimeout() calls .createNextSchedule()', (t) => {
    SpawnScheduler.init(aircraftControllerStub);
    const createNextScheduleSpy = sandbox.spy(SpawnScheduler, 'createNextSchedule');
    const spawnPatternModel = SpawnPatternCollection._items[0];

    SpawnScheduler.createAircraftAndRegisterNextTimeout([spawnPatternModel, aircraftControllerStub]);

    t.true(createNextScheduleSpy.calledOnce);

    createNextScheduleSpy.restore();
});

ava.serial('dispatches a created aircraft only into its controller-owned collection', (t) => {
    const ownedCollection = new AircraftCollection();
    const siblingCollection = new AircraftCollection();
    const navigationLibrary = new NavigationLibraryClass();
    navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    const airportController = {
        current: AirportController.current,
        airport_get: (...args) => AirportController.airport_get(...args)
    };
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        undefined,
        ownedCollection,
        new EventBusClass(),
        airportController,
        navigationLibrary
    );
    controller.createAircraftWithSpawnPatternModel = () =>
        controller._createAircraftWithInitializationProps(DEPARTURE_AIRCRAFT_INIT_PROPS_MOCK);
    const timerQueue = {
        scheduleTimeout: sinon.stub().returns(['schedule']),
        destroyTimer: sinon.stub()
    };
    const scheduler = new SpawnSchedulerClass(
        SpawnPatternCollection,
        { accumulatedDeltaTime: 0 },
        timerQueue,
        controller
    );
    const spawnPatternModel = {
        getNextDelayValue: sinon.stub().returns(10),
        scheduleId: null
    };

    scheduler.createAircraftAndRegisterNextTimeout([spawnPatternModel, controller]);

    t.is(ownedCollection.list.length, 1);
    t.is(siblingCollection.list.length, 0);
    t.is(ownedCollection.list[0].fms._navigationLibrary, navigationLibrary);
    t.is(ownedCollection.list[0].fms._airportController, airportController);
});

ava('.resetTimer() returns early when SpawnPatternModel has no #scheduleId', (t) => {
    SpawnScheduler.init(aircraftControllerStub);
    const destroyTimerStub = sandbox.stub(GameController, 'destroyTimer');
    const spawnPatternModel = SpawnPatternCollection._items[0];
    spawnPatternModel.scheduleId = INVALID_NUMBER;

    SpawnScheduler.resetTimer(spawnPatternModel);

    delete spawnPatternModel.scheduleId;

    SpawnScheduler.resetTimer(spawnPatternModel);

    t.true(destroyTimerStub.notCalled);

    destroyTimerStub.restore();
});

ava('.resetTimer() destroys existing timers but does not create a new spawn schedule when SpawnPatternModel has a non-positive spawn rate', (t) => {
    SpawnScheduler.init(aircraftControllerStub);
    const spawnPatternModel = SpawnPatternCollection._items[0];
    const destroyTimerStub = sandbox.stub(GameController, 'destroyTimer');
    const getNextDelayValueStub = sandbox.stub(spawnPatternModel, 'getNextDelayValue');
    spawnPatternModel.rate = 0;

    SpawnScheduler.resetTimer(spawnPatternModel);

    spawnPatternModel.rate = -6;
    spawnPatternModel.scheduleId = 10;

    SpawnScheduler.resetTimer(spawnPatternModel);

    t.true(destroyTimerStub.calledTwice);
    t.true(getNextDelayValueStub.notCalled);

    destroyTimerStub.restore();
    getNextDelayValueStub.restore();
});

ava('.createSchedulesFromList() schedules and pre-spawns only categories allowed by the traffic mode', (t) => {
    const buildPattern = (category) => ({
        category,
        createPreSpawnAircraft: sinon.stub(),
        cycleStart: sinon.stub(),
        getNextDelayValue: sinon.stub().returns(10),
        scheduleId: null
    });
    const arrival = buildPattern('arrival');
    const departure = buildPattern('departure');
    const overflight = buildPattern('overflight');
    const trafficMode = new TrafficMode();
    trafficMode.select(TRAFFIC_MODE.ARRIVALS);
    const scheduler = new SpawnSchedulerClass(
        { spawnPatternModels: [arrival, departure, overflight] },
        { accumulatedDeltaTime: 25 },
        { scheduleTimeout: sinon.stub().returns(['schedule']) },
        aircraftControllerStub,
        trafficMode
    );

    scheduler.createSchedulesFromList();

    t.true(arrival.cycleStart.calledOnceWithExactly(25));
    t.true(arrival.createPreSpawnAircraft.calledOnceWithExactly(aircraftControllerStub));
    t.deepEqual(arrival.scheduleId, ['schedule']);
    t.true(departure.cycleStart.notCalled);
    t.true(departure.createPreSpawnAircraft.notCalled);
    t.is(departure.scheduleId, null);
    t.true(overflight.cycleStart.notCalled);
    t.true(overflight.createPreSpawnAircraft.notCalled);
    t.is(overflight.scheduleId, null);
});

ava('.createPreSpawnDepartures() does not inspect or create departures when the mode excludes them', (t) => {
    const getDepartureModelsForPreSpawn = sinon.stub().returns([{ category: 'departure' }]);
    const trafficMode = new TrafficMode();
    const localAircraftController = {
        createAircraftWithSpawnPatternModel: sinon.stub()
    };
    trafficMode.select(TRAFFIC_MODE.ARRIVALS);
    const scheduler = new SpawnSchedulerClass(
        { getDepartureModelsForPreSpawn },
        { accumulatedDeltaTime: 0 },
        { scheduleTimeout: sinon.stub() },
        localAircraftController,
        trafficMode
    );

    scheduler.createPreSpawnDepartures();

    t.true(getDepartureModelsForPreSpawn.notCalled);
    t.true(localAircraftController.createAircraftWithSpawnPatternModel.notCalled);
});

ava('.resetAirborneTraffic() leaves excluded airborne categories untouched', (t) => {
    const buildAirbornePattern = (category) => ({
        category,
        createPreSpawnAircraft: sinon.stub(),
        isAirborneAtSpawn: sinon.stub().returns(true),
        preSpawnAircraftList: ['existing']
    });
    const arrival = buildAirbornePattern('arrival');
    const overflight = buildAirbornePattern('overflight');
    const trafficMode = new TrafficMode();
    trafficMode.select(TRAFFIC_MODE.DEPARTURES);
    const scheduler = new SpawnSchedulerClass(
        { spawnPatternModels: [arrival, overflight] },
        { accumulatedDeltaTime: 0 },
        { scheduleTimeout: sinon.stub() },
        aircraftControllerStub,
        trafficMode
    );
    const resetTimer = sinon.stub(scheduler, 'resetTimer');

    scheduler.resetAirborneTraffic();

    t.deepEqual(arrival.preSpawnAircraftList, ['existing']);
    t.true(arrival.createPreSpawnAircraft.notCalled);
    t.deepEqual(overflight.preSpawnAircraftList, ['existing']);
    t.true(overflight.createPreSpawnAircraft.notCalled);
    t.true(resetTimer.notCalled);
});

ava('.resetTimer() destroys a stale excluded timer without spawning or rescheduling', (t) => {
    const trafficMode = new TrafficMode();
    trafficMode.select(TRAFFIC_MODE.ARRIVALS);
    const destroyTimer = sinon.stub();
    const scheduleTimeout = sinon.stub();
    const localAircraftController = {
        createAircraftWithSpawnPatternModel: sinon.stub()
    };
    const scheduler = new SpawnSchedulerClass(
        { spawnPatternModels: [] },
        { accumulatedDeltaTime: 20 },
        { destroyTimer, scheduleTimeout },
        localAircraftController,
        trafficMode
    );
    const departure = {
        category: 'departure',
        getNextDelayValue: sinon.stub().returns(10),
        rate: 5,
        scheduleId: ['timer', 30, null, 10]
    };

    scheduler.resetTimer(departure);

    t.true(destroyTimer.calledOnceWithExactly(['timer', 30, null, 10]));
    t.is(departure.scheduleId, null);
    t.true(departure.getNextDelayValue.notCalled);
    t.true(localAircraftController.createAircraftWithSpawnPatternModel.notCalled);
    t.true(scheduleTimeout.notCalled);
});

ava('.createAircraftAndRegisterNextTimeout() ignores a callback for a category excluded by the current mode', (t) => {
    const trafficMode = new TrafficMode();
    trafficMode.select(TRAFFIC_MODE.DEPARTURES);
    const localAircraftController = {
        createAircraftWithSpawnPatternModel: sinon.stub()
    };
    const scheduler = new SpawnSchedulerClass(
        { spawnPatternModels: [] },
        { accumulatedDeltaTime: 0 },
        { scheduleTimeout: sinon.stub() },
        localAircraftController,
        trafficMode
    );
    const createNextSchedule = sinon.stub(scheduler, 'createNextSchedule');
    const arrival = { category: 'arrival', scheduleId: ['expired'] };

    scheduler.createAircraftAndRegisterNextTimeout([arrival, localAircraftController]);

    t.true(localAircraftController.createAircraftWithSpawnPatternModel.notCalled);
    t.true(createNextSchedule.notCalled);
    t.is(arrival.scheduleId, null);
});

ava('.selectTrafficMode() delegates validation and returns the selected mode', (t) => {
    const trafficMode = new TrafficMode();
    const select = sinon.spy(trafficMode, 'select');
    const scheduler = new SpawnSchedulerClass(
        { spawnPatternModels: [] },
        { accumulatedDeltaTime: 0 },
        { scheduleTimeout: sinon.stub() },
        aircraftControllerStub,
        trafficMode
    );

    const result = scheduler.selectTrafficMode(TRAFFIC_MODE.DEPARTURES);

    t.true(select.calledOnceWithExactly(TRAFFIC_MODE.DEPARTURES));
    t.is(result, TRAFFIC_MODE.DEPARTURES);
    t.is(trafficMode.value, TRAFFIC_MODE.DEPARTURES);
    t.throws(() => scheduler.selectTrafficMode('invalid'), { instanceOf: RangeError });
});

// ava('.resetTimer() updates remaining time when timer has not yet expired', (t) => {
//     SpawnScheduler.init(aircraftControllerStub);
//     const spawnPatternModel = SpawnPatternCollection._items[0];
//
//     sandbox.stub(spawnPatternModel, 'getNextDelayValue').returns(15);
//
//     // TimeKeeper.accumulatedDeltaTime += 10;
//     const oldTimerValue = TimeKeeper.accumulatedDeltaTime;
//     const createAircraftWithSpawnPatternModelStub = sandbox.stub(spawnPatternModel.aircraftController, 'createAircraftWithSpawnPatternModel');
//     const _createTimeoutStub = sandbox.stub(SpawnScheduler, '_createTimeout');
//
//     SpawnScheduler.resetTimer(spawnPatternModel);
//
//     t.true(createAircraftWithSpawnPatternModelStub.notCalled);
//     t.true(_createTimeoutStub.calledWithExactly(spawnPatternModel, oldTimerValue + (15)));
// });
