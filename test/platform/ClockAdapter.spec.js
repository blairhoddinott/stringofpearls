import ava from 'ava';
import sinon from 'sinon';
import ClockAdapter from '../../src/assets/scripts/client/platform/ClockAdapter';

ava('.now() returns the exact value produced by the injected callable', (t) => {
    const currentDate = new Date(1500000000000);
    const now = sinon.stub().returns(currentDate);
    const clockAdapter = new ClockAdapter(now);

    const value = clockAdapter.now();

    t.is(value, currentDate);
});

ava('.now() invokes the injected callable exactly once with no arguments', (t) => {
    const now = sinon.stub().returns(new Date(1500000000000));
    const clockAdapter = new ClockAdapter(now);

    clockAdapter.now();

    t.true(now.calledOnceWithExactly());
});

ava('.now() lets a thrown error propagate with the exact error identity', (t) => {
    const failure = new Error('clock unavailable');
    const now = sinon.stub().throws(failure);
    const clockAdapter = new ClockAdapter(now);

    const thrown = t.throws(() => clockAdapter.now());

    t.is(thrown, failure);
});
