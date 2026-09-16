import ava from 'ava';
import sinon from 'sinon';
import SimulationContext from '../../src/assets/scripts/client/simulation/SimulationContext';
import { EventBusClass } from '../../src/assets/scripts/client/lib/EventBus';
import { AIRPORT_JSON_KLAS_MOCK } from '../airport/_mocks/airportJsonMock';

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

ava('default navigation state uses this simulation session random source', (t) => {
    const randomSource = { integer: () => 0 };
    const context = new SimulationContext({ randomSource });

    context.navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);

    const procedures = context.navigationLibrary.getProceduresByType('SID')
        .concat(context.navigationLibrary.getProceduresByType('STAR'));

    t.true(procedures.length > 0);
    procedures.forEach((procedure) => t.is(procedure._randomSource, randomSource));
});

ava('retains exact injected clock, random source, event bus, airport, and navigation identities', (t) => {
    const clock = { now: () => 123 };
    const randomSource = { fraction: () => 0.5 };
    const eventBus = new EventBusClass();
    const airportController = { reset: () => {} };
    const navigationLibrary = { reset: () => {} };
    const context = new SimulationContext({
        clock,
        randomSource,
        eventBus,
        airportController,
        navigationLibrary
    });

    t.is(context.clock, clock);
    t.is(context.randomSource, randomSource);
    t.is(context.eventBus, eventBus);
    t.is(context.airportController, airportController);
    t.is(context.navigationLibrary, navigationLibrary);
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
