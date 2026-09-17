import ava from 'ava';
import sinon from 'sinon';
import createAsyncErrorReporter from '../../src/assets/scripts/client/platform/reportAsyncError';

ava('createAsyncErrorReporter() returns a callable reporter', (t) => {
    const delayScheduler = { schedule: sinon.stub() };

    const reporter = createAsyncErrorReporter(delayScheduler);

    t.is(typeof reporter, 'function');
});

ava('reporter schedules the throw exactly once with only the callback and a delay of 0', (t) => {
    const schedule = sinon.stub().returns({});
    const delayScheduler = { schedule };
    const reporter = createAsyncErrorReporter(delayScheduler);

    reporter(new Error('boom'));

    t.true(schedule.calledOnce);
    t.is(schedule.firstCall.args.length, 2);
    t.is(typeof schedule.firstCall.args[0], 'function');
    t.is(schedule.firstCall.args[1], 0);
});

ava('reporter returns undefined and does not leak the scheduler handle', (t) => {
    const handle = { id: 42 };
    const delayScheduler = { schedule: sinon.stub().returns(handle) };
    const reporter = createAsyncErrorReporter(delayScheduler);

    const result = reporter(new Error('boom'));

    t.is(result, undefined);
});

ava('the scheduled callback throws the exact error object', (t) => {
    const error = new Error('boom');
    let scheduledCallback = null;
    const delayScheduler = {
        schedule: (callback) => {
            scheduledCallback = callback;
        }
    };
    const reporter = createAsyncErrorReporter(delayScheduler);

    reporter(error);

    const thrown = t.throws(() => scheduledCallback());
    t.is(thrown, error);
});

ava('reporter is a safe no-op returning undefined when the scheduler is omitted', (t) => {
    const reporter = createAsyncErrorReporter();

    t.is(reporter(new Error('boom')), undefined);
});

ava('reporter is a safe no-op returning undefined when the scheduler is null', (t) => {
    const reporter = createAsyncErrorReporter(null);

    t.is(reporter(new Error('boom')), undefined);
});

ava('a scheduling error propagates unchanged with the exact error identity', (t) => {
    const failure = new Error('delay unavailable');
    const delayScheduler = { schedule: sinon.stub().throws(failure) };
    const reporter = createAsyncErrorReporter(delayScheduler);

    const thrown = t.throws(() => reporter(new Error('boom')));

    t.is(thrown, failure);
});
