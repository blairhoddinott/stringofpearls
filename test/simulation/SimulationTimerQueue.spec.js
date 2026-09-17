import ava from 'ava';
import sinon from 'sinon';
import SimulationClock from '../../src/assets/scripts/client/simulation/SimulationClock';
import SimulationTimerQueue from '../../src/assets/scripts/client/simulation/SimulationTimerQueue';

ava('timeout preserves the legacy timer shape and fires once only after its deadline', (t) => {
    const clock = new SimulationClock();
    const queue = new SimulationTimerQueue(clock);
    const receiver = {};
    const data = { id: 42 };
    const callback = sinon.spy();

    const timer = queue.scheduleTimeout(callback, 2, receiver, data);

    t.deepEqual(timer, [callback, 2, data, 2, false, receiver]);
    t.is(queue.timers[0], timer);

    clock.tick(2);
    queue.update();
    t.false(callback.called);

    clock.tick(0.01);
    queue.update();
    t.true(callback.calledOnceWithExactly(data));
    t.is(callback.firstCall.thisValue, receiver);
    t.deepEqual(queue.timers, []);
});

ava('interval repeats from its prior deadline using the legacy strict comparison', (t) => {
    const clock = new SimulationClock();
    const queue = new SimulationTimerQueue(clock);
    const callback = sinon.spy();

    const timer = queue.scheduleInterval(callback, 2, null, 'payload');

    t.deepEqual(timer, [callback, 2, 'payload', 2, true, null]);

    clock.tick(2.1);
    queue.update();
    t.true(callback.calledOnceWithExactly('payload'));
    t.is(timer[1], 4);

    clock.tick(1.9);
    queue.update();
    t.true(callback.calledOnce);

    clock.tick(0.01);
    queue.update();
    t.true(callback.calledTwice);
    t.is(timer[1], 6);
    t.is(queue.timers[0], timer);
});

ava('destroyTimer removes the selected legacy timer array', (t) => {
    const queue = new SimulationTimerQueue(new SimulationClock());
    const first = queue.scheduleTimeout(() => {}, 1);
    const second = queue.scheduleTimeout(() => {}, 2);

    queue.destroyTimer(first);

    t.deepEqual(queue.timers, [second]);
});

ava('destroyTimers replaces the timer collection with a fresh empty array', (t) => {
    const queue = new SimulationTimerQueue(new SimulationClock());
    const timer = queue.scheduleTimeout(() => {}, 1);
    const previousTimers = queue.timers;

    queue.destroyTimers();

    t.not(queue.timers, previousTimers);
    t.deepEqual(queue.timers, []);
    t.deepEqual(previousTimers, [timer]);
});
