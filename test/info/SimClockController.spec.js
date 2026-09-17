import ava from 'ava';
import sinon from 'sinon';
import SimClockController from '../../src/assets/scripts/client/info/SimClockController';
import { digits_integer } from '../../src/assets/scripts/client/utilities/radioUtilities';
import { TIME } from '../../src/assets/scripts/client/constants/globalConstants';

// Build a fake date-like object exposing only the `getTime()`/`getTimezoneOffset()`
// contract the controller reads, so time behavior is exercised without a real
// `Date`/`window` clock.
const buildFakeDate = ({ time = 1500000000000, timezoneOffset = 0 } = {}) => ({
    getTime: () => time,
    getTimezoneOffset: () => timezoneOffset
});

// Build a clock adapter stub exposing only the `now()` contract used as the
// current-time source.
const buildClockAdapter = (fakeDate = buildFakeDate()) => ({
    now: sinon.stub().returns(fakeDate)
});

ava('constructor without a clock stays browser-free and initializes #startTime to 0', (t) => {
    const controller = new SimClockController();

    t.is(controller.startTime, 0);
    t.is(controller.realWorldCurrentLocalTime, 0);
    t.is(controller.realWorldCurrentZuluTime, 0);
});

ava('constructor reads the injected clock exactly once and sets #startTime to the Zulu instant', (t) => {
    const fakeDate = buildFakeDate({ time: 1500000000000, timezoneOffset: -120 });
    const clockAdapter = buildClockAdapter(fakeDate);

    const controller = new SimClockController(clockAdapter);

    t.is(controller.startTime, 1500000000000 + (-120 * TIME.ONE_MINUTE_IN_MILLISECONDS));
    t.true(clockAdapter.now.calledOnceWithExactly());
});

ava('#realWorldCurrentLocalTime reads the injected clock exactly once and returns getTime', (t) => {
    const fakeDate = buildFakeDate({ time: 1234, timezoneOffset: 0 });
    const clockAdapter = buildClockAdapter(fakeDate);
    const controller = new SimClockController(clockAdapter);
    clockAdapter.now.resetHistory();

    const result = controller.realWorldCurrentLocalTime;

    t.is(result, 1234);
    t.true(clockAdapter.now.calledOnceWithExactly());
});

ava('#realWorldCurrentZuluTime reads the injected clock exactly once and uses one date for time and offset', (t) => {
    const fakeDate = buildFakeDate({ time: 1000, timezoneOffset: 60 });
    const clockAdapter = buildClockAdapter(fakeDate);
    const controller = new SimClockController(clockAdapter);
    clockAdapter.now.resetHistory();

    const result = controller.realWorldCurrentZuluTime;

    t.is(result, 1000 + (60 * TIME.ONE_MINUTE_IN_MILLISECONDS));
    t.true(clockAdapter.now.calledOnceWithExactly());
});

ava('#realWorldCurrentZuluTime lets a clock read error propagate with the exact error identity', (t) => {
    const failure = new Error('clock unavailable');
    const clockAdapter = { now: sinon.stub().returns(buildFakeDate()) };
    const controller = new SimClockController(clockAdapter);
    clockAdapter.now.throws(failure);

    const thrown = t.throws(() => controller.realWorldCurrentZuluTime);

    t.is(thrown, failure);
});

ava('.buildClockReadout() formats the startTime instant unchanged when no game time has elapsed', (t) => {
    const fakeDate = buildFakeDate({ time: 1500000000000, timezoneOffset: 0 });
    const controller = new SimClockController(buildClockAdapter(fakeDate));
    const clockDate = new Date(controller.startTime);
    const hours = digits_integer(clockDate.getHours(), 2);
    const minutes = digits_integer(clockDate.getMinutes(), 2);
    const seconds = digits_integer(clockDate.getSeconds(), 2);
    const expected = `${hours}${minutes}/${seconds}`;

    t.is(controller.buildClockReadout(), expected);
});

ava('.reset() returns #startTime to 0', (t) => {
    const controller = new SimClockController(buildClockAdapter());

    controller.reset();

    t.is(controller.startTime, 0);
});
