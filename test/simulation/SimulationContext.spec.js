import ava from 'ava';
import sinon from 'sinon';
import SimulationContext from '../../src/assets/scripts/client/simulation/SimulationContext';
import SimulationClock from '../../src/assets/scripts/client/simulation/SimulationClock';
import SimulationGameState from '../../src/assets/scripts/client/simulation/SimulationGameState';
import { EventBusClass } from '../../src/assets/scripts/client/lib/EventBus';
import { AirportControllerClass } from '../../src/assets/scripts/client/airport/AirportController';
import { GAME_EVENTS } from '../../src/assets/scripts/client/game/gameEventConstants';
import { NavigationLibraryClass } from '../../src/assets/scripts/client/navigationLibrary/NavigationLibrary';
import { AIRPORT_JSON_KLAS_MOCK } from '../airport/_mocks/airportJsonMock';
import {
    ARRIVAL_PATTERN_MOCK,
    DEPARTURE_PATTERN_MOCK
} from '../trafficGenerator/_mocks/spawnPatternMocks';
import SpawnPatternModel from '../../src/assets/scripts/client/trafficGenerator/SpawnPatternModel';

ava('creates an isolated event bus for each simulation session', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();
    const firstObserver = sinon.stub();
    const secondObserver = sinon.stub();

    first.eventBus.on('proof', firstObserver);
    second.eventBus.on('proof', secondObserver);
    first.eventBus.trigger('proof', 'first');

    t.not(first.eventBus, second.eventBus);
    t.true(firstObserver.calledOnceWithExactly('first'));
    t.false(secondObserver.called);
});

ava('creates isolated navigation and fix state for each simulation session', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();

    t.not(first.navigationLibrary, second.navigationLibrary);
    t.not(first.navigationLibrary.fixCollection, second.navigationLibrary.fixCollection);
});

ava('creates isolated airport controller state using each simulation session event bus', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();

    t.not(first.airportController, second.airportController);
    t.is(first.airportController._eventBus, first.eventBus);
    t.is(second.airportController._eventBus, second.eventBus);
});

ava('creates isolated aircraft collection state for each simulation session', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();
    const aircraft = { id: 'first' };

    first.aircraftCollection.addItem(aircraft);

    t.not(first.aircraftCollection, second.aircraftCollection);
    t.deepEqual(first.aircraftCollection.items, [aircraft]);
    t.deepEqual(second.aircraftCollection.items, []);
});

ava('creates isolated game and simulation-option state for each simulation session', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();

    first.gameState.events_recordNew(GAME_EVENTS.ARRIVAL);
    first.gameState.setGameOption('towerController', 'USER');

    t.is(first.gameState.score, 10);
    t.is(first.gameState.events[GAME_EVENTS.ARRIVAL], 1);
    t.is(first.gameState.getGameOption('towerController'), 'USER');
    t.is(second.gameState.score, 0);
    t.is(second.gameState.events[GAME_EVENTS.ARRIVAL], 0);
    t.is(second.gameState.getGameOption('towerController'), 'SYSTEM');
});

ava('uses an injected aircraft controller collection when no collection is supplied', (t) => {
    const aircraftCollection = { reset: () => {} };
    const aircraftController = { aircraft: aircraftCollection };
    const context = new SimulationContext({ aircraftController });

    t.is(context.aircraftCollection, aircraftCollection);
    t.is(context.spawnScheduler._aircraftController, aircraftController);
});

ava('uses injected aircraft controller service owners when none are supplied', (t) => {
    const clock = new SimulationClock();
    const eventBus = new EventBusClass();
    const airportController = new AirportControllerClass(new EventBusClass());
    const navigationLibrary = new NavigationLibraryClass();
    const gameState = new SimulationGameState();
    const aircraftController = {
        aircraft: { reset: () => {} },
        _clock: clock,
        _eventBus: eventBus,
        _airportController: airportController,
        _navigationLibrary: navigationLibrary,
        _gameState: gameState
    };
    const context = new SimulationContext({ aircraftController });

    t.is(context.clock, clock);
    t.is(context.eventBus, eventBus);
    t.is(context.airportController, airportController);
    t.is(context.navigationLibrary, navigationLibrary);
    t.is(context.gameState, gameState);
});

ava('rejects a mismatched injected aircraft controller clock owner', (t) => {
    const error = t.throws(() => new SimulationContext({
        clock: {},
        aircraftController: {
            aircraft: { reset: () => {} },
            _clock: {}
        }
    }), { instanceOf: TypeError });

    t.is(error.message, 'aircraftController must own the supplied clock.');
});

ava('rejects a mismatched injected aircraft controller game state owner', (t) => {
    const error = t.throws(() => new SimulationContext({
        gameState: new SimulationGameState(),
        aircraftController: {
            _gameState: new SimulationGameState()
        }
    }), { instanceOf: TypeError });

    t.is(error.message, 'aircraftController must own the supplied gameState.');
});

ava('rejects mismatched injected aircraft controller and collection state', (t) => {
    const error = t.throws(() => new SimulationContext({
        aircraftCollection: {},
        aircraftController: { aircraft: {} }
    }), { instanceOf: TypeError });

    t.is(error.message, 'aircraftController must own the supplied aircraftCollection.');
});

ava('rejects a mismatched injected aircraft controller airport owner', (t) => {
    const error = t.throws(() => new SimulationContext({
        airportController: new AirportControllerClass(new EventBusClass()),
        aircraftController: {
            aircraft: { reset: () => {} },
            _airportController: new AirportControllerClass(new EventBusClass())
        }
    }), { instanceOf: TypeError });

    t.is(error.message, 'aircraftController must own the supplied airportController.');
});

ava('rejects a mismatched injected aircraft controller event owner', (t) => {
    const error = t.throws(() => new SimulationContext({
        eventBus: new EventBusClass(),
        aircraftController: {
            aircraft: { reset: () => {} },
            _eventBus: new EventBusClass()
        }
    }), { instanceOf: TypeError });

    t.is(error.message, 'aircraftController must own the supplied eventBus.');
});

ava('rejects a mismatched injected aircraft controller navigation owner', (t) => {
    const error = t.throws(() => new SimulationContext({
        navigationLibrary: new NavigationLibraryClass(),
        aircraftController: {
            aircraft: { reset: () => {} },
            _navigationLibrary: new NavigationLibraryClass()
        }
    }), { instanceOf: TypeError });

    t.is(error.message, 'aircraftController must own the supplied navigationLibrary.');
});

ava('default navigation state uses this simulation session random source', (t) => {
    const randomSource = { integer: () => 0 };
    const context = new SimulationContext({ randomSource });

    context.navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);

    const procedures = context.navigationLibrary.getProceduresByType('SID')
        .concat(context.navigationLibrary.getProceduresByType('STAR'));

    t.true(procedures.length > 0);
    procedures.forEach((procedure) => t.is(procedure._randomSource, randomSource));
});

ava('creates isolated spawn pattern state using this simulation session random source', (t) => {
    const firstRandomSource = { integer: () => 0, real: () => 0 };
    const secondRandomSource = { integer: () => 0, real: () => 0 };
    const first = new SimulationContext({ randomSource: firstRandomSource });
    const second = new SimulationContext({ randomSource: secondRandomSource });

    first.navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    first.airportController.airport_load({ icao: 'klas', level: 'easy', name: 'Las Vegas' });
    first.airportController.current = first.airportController.airport_get('klas');
    first.airportController.current._positionModel = first.navigationLibrary.findFixByName('BESSY').positionModel;
    first.spawnPatternCollection.init({ spawnPatterns: [DEPARTURE_PATTERN_MOCK] });

    t.true(first.spawnPatternCollection.spawnPatternModels.length > 0);
    t.is(second.spawnPatternCollection.spawnPatternModels.length, 0);
    first.spawnPatternCollection.spawnPatternModels.forEach((model) => {
        t.is(model._randomSource, firstRandomSource);
        t.is(model._airportController, first.airportController);
    });
});

ava('arrival pre-spawn reuses this simulation session route', (t) => {
    const context = new SimulationContext();

    context.navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    context.airportController.airport_load({ icao: 'klas', level: 'easy', name: 'Las Vegas' });
    const airport = context.airportController.airport_get('klas');
    airport.init(AIRPORT_JSON_KLAS_MOCK);
    context.airportController.current = airport;

    context.spawnPatternCollection.init({ spawnPatterns: [ARRIVAL_PATTERN_MOCK] });
    const [pattern] = context.spawnPatternCollection.spawnPatternModels;

    pattern._routeModel._legCollection.forEach((leg) => {
        t.is(leg._navigationLibrary, context.navigationLibrary);
    });
    t.true(pattern.preSpawnAircraftList.length > 0);
    pattern.preSpawnAircraftList.forEach((aircraft) => {
        t.true(aircraft.altitude > 0);
    });
});

ava('spawn pattern route mutations retain this simulation session navigation state', (t) => {
    const context = new SimulationContext();

    context.navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    context.airportController.airport_load({ icao: 'klas', level: 'easy', name: 'Las Vegas' });
    context.airportController.current = context.airportController.airport_get('klas');
    context.airportController.current._positionModel = context.navigationLibrary.findFixByName('BESSY').positionModel;
    context.spawnPatternCollection.init({ spawnPatterns: [DEPARTURE_PATTERN_MOCK] });
    const [pattern] = context.spawnPatternCollection.spawnPatternModels;

    t.true(pattern._routeModel.replaceArrivalProcedure('BETHL.GRNPA1.KLAS07R'));
    t.true(pattern._routeModel.replaceDepartureProcedure('KLAS07L.COWBY6.GUP')[0]);
    pattern._routeModel._legCollection.forEach((leg) => {
        t.is(leg._navigationLibrary, context.navigationLibrary);
    });
});

ava('retains exact injected service identities', (t) => {
    const clock = { now: () => 123 };
    const randomSource = { fraction: () => 0.5 };
    const eventBus = new EventBusClass();
    const airportController = { reset: () => {} };
    const navigationLibrary = { reset: () => {} };
    const aircraftCollection = {};
    const aircraftController = { aircraft: aircraftCollection };
    const spawnPatternCollection = { reset: () => {} };
    const gameState = { reset: () => {} };
    const context = new SimulationContext({
        clock,
        randomSource,
        eventBus,
        airportController,
        navigationLibrary,
        aircraftCollection,
        aircraftController,
        spawnPatternCollection,
        gameState
    });

    t.is(context.clock, clock);
    t.is(context.randomSource, randomSource);
    t.is(context.eventBus, eventBus);
    t.is(context.airportController, airportController);
    t.is(context.navigationLibrary, navigationLibrary);
    t.is(context.aircraftCollection, aircraftCollection);
    t.is(context.aircraftController, aircraftController);
    t.is(context.spawnScheduler._aircraftController, aircraftController);
    t.is(context.spawnPatternCollection, spawnPatternCollection);
    t.is(context.gameState, gameState);
});

ava('destroy clears only this simulation session observers and timers', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();
    const firstObserver = sinon.stub();
    const secondObserver = sinon.stub();

    first.eventBus.on('proof', firstObserver);
    second.eventBus.on('proof', secondObserver);
    first.timerQueue.scheduleTimeout(() => {}, 1);
    second.timerQueue.scheduleTimeout(() => {}, 1);
    first.destroy();
    first.eventBus.trigger('proof');
    second.eventBus.trigger('proof');

    t.false(firstObserver.called);
    t.true(secondObserver.calledOnceWithExactly());
    t.deepEqual(first.timerQueue.timers, []);
    t.is(second.timerQueue.timers.length, 1);
});

ava('destroy resets only this simulation session navigation state', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();

    first.navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    second.navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    first.destroy();

    t.is(first.navigationLibrary.findFixByName('BAKRR'), null);
    t.truthy(second.navigationLibrary.findFixByName('BAKRR'));
});

ava('destroy resets only this simulation session airport controller state', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();
    const firstAirport = { icao: 'kaaa' };
    const secondAirport = { icao: 'kbbb' };

    first.airportController.airport_add(firstAirport);
    second.airportController.airport_add(secondAirport);
    first.airportController.current = firstAirport;
    second.airportController.current = secondAirport;
    first.destroy();

    t.deepEqual(first.airportController.airports, {});
    t.is(first.airportController.current, null);
    t.is(second.airportController.airport_get('kbbb'), secondAirport);
    t.is(second.airportController.current, secondAirport);
});

ava('destroy resets only this simulation session spawn pattern state', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();
    const firstPattern = { reset: sinon.stub() };
    const secondPattern = { reset: sinon.stub() };

    first.spawnPatternCollection._items = [firstPattern];
    second.spawnPatternCollection._items = [secondPattern];

    first.destroy();

    t.true(firstPattern.reset.calledOnce);
    t.is(first.spawnPatternCollection.spawnPatternModels.length, 0);
    t.false(secondPattern.reset.called);
    t.is(second.spawnPatternCollection.spawnPatternModels.length, 1);
});

ava('destroy resets only this simulation session aircraft collection state', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();
    const firstAircraft = { id: 'first' };
    const secondAircraft = { id: 'second' };

    first.aircraftCollection.addItem(firstAircraft);
    second.aircraftCollection.addItem(secondAircraft);
    first.aircraftCollection.auto.enabled = true;
    second.aircraftCollection.auto.enabled = true;
    first.destroy();

    t.deepEqual(first.aircraftCollection.items, []);
    t.false(first.aircraftCollection.auto.enabled);
    t.deepEqual(second.aircraftCollection.items, [secondAircraft]);
    t.true(second.aircraftCollection.auto.enabled);
});

ava('destroy disables only this simulation session aircraft controller', (t) => {
    const firstAircraftController = { disable: sinon.stub() };
    const secondAircraftController = { disable: sinon.stub() };
    const first = new SimulationContext({ aircraftController: firstAircraftController });
    new SimulationContext({ aircraftController: secondAircraftController });

    first.destroy();

    t.true(firstAircraftController.disable.calledOnceWithExactly());
    t.false(secondAircraftController.disable.called);
});

ava('ticks only this simulation session traffic schedule', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();
    const firstAircraftController = {
        createAircraftWithSpawnPatternModel: sinon.stub()
    };
    const secondAircraftController = {
        createAircraftWithSpawnPatternModel: sinon.stub()
    };
    const pattern = new SpawnPatternModel();

    sinon.stub(pattern, 'getNextDelayValue').returns(1);
    first.spawnScheduler._aircraftController = firstAircraftController;
    second.spawnScheduler._aircraftController = secondAircraftController;

    pattern.scheduleId = first.spawnScheduler.createNextSchedule(pattern);
    first.tick(2);

    t.true(firstAircraftController.createAircraftWithSpawnPatternModel.calledOnceWithExactly(pattern));
    t.false(secondAircraftController.createAircraftWithSpawnPatternModel.called);
});

ava('tick advances only this simulation session clock', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();

    first.tick(0.5);
    first.tick(1.25);

    t.not(first.clock, second.clock);
    t.is(first.clock.deltaTime, 1.25);
    t.is(first.clock.elapsedTime, 1.75);
    t.is(second.clock.deltaTime, 0);
    t.is(second.clock.elapsedTime, 0);
});

ava('tick forwards the exact delta once and returns the clock result verbatim', (t) => {
    const expectedResult = { advanced: true };
    const clock = { tick: sinon.stub().returns(expectedResult) };
    const context = new SimulationContext({ clock });

    const result = context.tick(0.125);

    t.true(clock.tick.calledOnceWithExactly(0.125));
    t.is(result, expectedResult);
});

ava('tick advances the clock before updating only this session timer queue', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();
    const firstCallback = sinon.spy();
    const secondCallback = sinon.spy();

    first.timerQueue.scheduleTimeout(firstCallback, 1);
    second.timerQueue.scheduleTimeout(secondCallback, 1);

    first.tick(1);
    t.false(firstCallback.called);

    first.tick(0.01);

    t.not(first.timerQueue, second.timerQueue);
    t.true(firstCallback.calledOnceWithExactly(undefined));
    t.false(secondCallback.called);
});

ava('tick updates aircraft after the clock and timer queue without changing its return value', (t) => {
    const order = [];
    const expectedResult = { advanced: true };
    const clock = {
        tick: sinon.stub().callsFake(() => {
            order.push('clock');
            return expectedResult;
        })
    };
    const aircraftController = {
        update: sinon.stub().callsFake(() => order.push('aircraft'))
    };
    const context = new SimulationContext({ clock, aircraftController });
    sinon.stub(context.timerQueue, 'update').callsFake(() => order.push('timers'));

    const result = context.tick(0.25);

    t.deepEqual(order, ['clock', 'timers', 'aircraft']);
    t.true(aircraftController.update.calledOnceWithExactly());
    t.is(result, expectedResult);
});

ava('tick updates only this simulation session aircraft controller', (t) => {
    const firstAircraftController = { update: sinon.stub() };
    const secondAircraftController = { update: sinon.stub() };
    const first = new SimulationContext({ aircraftController: firstAircraftController });
    new SimulationContext({ aircraftController: secondAircraftController });

    first.tick(0.5);

    t.true(firstAircraftController.update.calledOnceWithExactly());
    t.false(secondAircraftController.update.called);
});
