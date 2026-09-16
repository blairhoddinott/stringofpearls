import ava from 'ava';
import sinon from 'sinon';
import SimulationContext from '../../src/assets/scripts/client/simulation/SimulationContext';
import { EventBusClass } from '../../src/assets/scripts/client/lib/EventBus';

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

ava('retains the exact injected clock, random source, and event bus identities', (t) => {
    const clock = { now: () => 123 };
    const randomSource = { fraction: () => 0.5 };
    const eventBus = new EventBusClass();
    const context = new SimulationContext({ clock, randomSource, eventBus });

    t.is(context.clock, clock);
    t.is(context.randomSource, randomSource);
    t.is(context.eventBus, eventBus);
});

ava('destroy clears only this simulation session event bus', (t) => {
    const first = new SimulationContext();
    const second = new SimulationContext();
    const firstObserver = sinon.stub();
    const secondObserver = sinon.stub();

    first.eventBus.on('proof', firstObserver);
    second.eventBus.on('proof', secondObserver);
    first.destroy();
    first.eventBus.trigger('proof');
    second.eventBus.trigger('proof');

    t.false(firstObserver.called);
    t.true(secondObserver.calledOnceWithExactly());
});
