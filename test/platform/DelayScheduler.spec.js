import ava from 'ava';
import sinon from 'sinon';
import DelayScheduler from '../../src/assets/scripts/client/platform/DelayScheduler';

ava('.schedule() invokes the injected callable exactly once with only the supplied callback and delay', (t) => {
    const delay = sinon.stub().returns(1);
    const delayScheduler = new DelayScheduler(delay);
    const callback = () => {};

    delayScheduler.schedule(callback, 500);

    t.true(delay.calledOnceWithExactly(callback, 500));
});

ava('.schedule() returns the exact handle produced by the injected callable', (t) => {
    const handle = 42;
    const delay = sinon.stub().returns(handle);
    const delayScheduler = new DelayScheduler(delay);

    const value = delayScheduler.schedule(() => {}, 1500);

    t.is(value, handle);
});

ava('.schedule() lets a thrown error propagate with the exact error identity', (t) => {
    const failure = new Error('delay unavailable');
    const delay = sinon.stub().throws(failure);
    const delayScheduler = new DelayScheduler(delay);

    const thrown = t.throws(() => delayScheduler.schedule(() => {}, 300));

    t.is(thrown, failure);
});
