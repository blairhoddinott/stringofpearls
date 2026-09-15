import ava from 'ava';
import sinon from 'sinon';
import TimeKeeper from '../../src/assets/scripts/client/engine/TimeKeeper';
import ClockAdapter from '../../src/assets/scripts/client/platform/ClockAdapter';
import { TIME } from '../../src/assets/scripts/client/constants/globalConstants';

// Fixed wall-clock instant (2017-07-14T02:40:00Z) used so the frame-timing
// tests that read the clock behave deterministically.
const FIXED_TIMESTAMP_MILLISECONDS = 1500000000000;

// Build a clock adapter stub exposing only the `now()` contract so the
// time-source boundary is exercised without a real `Date`/`window` clock.
const buildClockAdapter = ({ currentDate = new Date(FIXED_TIMESTAMP_MILLISECONDS) } = {}) => ({
    now: sinon.stub().returns(currentDate)
});

ava.beforeEach(() => {
    TimeKeeper.initClock(new ClockAdapter(() => new Date(FIXED_TIMESTAMP_MILLISECONDS)));
});

ava.afterEach(() => {
    TimeKeeper.reset();
});

ava.serial('throws when attempting to instantiate', (t) => {
    t.throws(() => new TimeKeeper());
});

ava.serial('#deltaTime is the product of #_frameDeltaTime and #_simulationRate', (t) => {
    TimeKeeper._frameDeltaTime = 33;
    TimeKeeper._simulationRate = 1;

    t.true(TimeKeeper.deltaTime === 33);
});

ava.serial('#deltaTime returns a max value of 100', (t) => {
    TimeKeeper._frameDeltaTime = 33;
    TimeKeeper._simulationRate = 10;

    t.true(TimeKeeper.deltaTime === 100);
});

ava.skip('#accumulatedDeltaTime is the sum of each deltaTime value from instantiation to now', (t) => {
    const deltaValues = [];

    deltaValues.push(TimeKeeper.deltaTime);

    TimeKeeper.update();
    deltaValues.push(TimeKeeper.deltaTime);

    TimeKeeper.update();
    deltaValues.push(TimeKeeper.deltaTime);

    TimeKeeper.update();
    deltaValues.push(TimeKeeper.deltaTime);

    const sum = deltaValues.reduce((accumulator, item) => accumulator + item, 0);

    t.true(sum === TimeKeeper.accumulatedDeltaTime);
});

ava.skip('#accumulatedDeltaTime is the sum of each deltaTime value from instantiation to now offset by timewarp', (t) => {
    const deltaValues = [];

    deltaValues.push(TimeKeeper.deltaTime);

    TimeKeeper.update();
    deltaValues.push(TimeKeeper.deltaTime);

    TimeKeeper.update();
    deltaValues.push(TimeKeeper.deltaTime);

    TimeKeeper._simulationRate = 5;

    TimeKeeper.update();
    deltaValues.push(TimeKeeper.deltaTime);

    const sum = deltaValues.reduce((accumulator, item) => accumulator + item, 0);

    t.true(sum === TimeKeeper.accumulatedDeltaTime);
});

ava.serial('.getDeltaTimeForGameStateAndTimewarp() returns 0 when #isPaused is true', (t) => {
    const result = TimeKeeper.getDeltaTimeForGameStateAndTimewarp(true);

    t.true(result === 0);
});

ava.serial('.getDeltaTimeForGameStateAndTimewarp() returns 0 when #deltaTime > 1 and #timewarp is 1', (t) => {
    TimeKeeper._frameDeltaTime = 2;
    TimeKeeper._simulationRate = 1;

    const result = TimeKeeper.getDeltaTimeForGameStateAndTimewarp(false);

    t.true(result === 0);
});

ava.serial('.getDeltaTimeForGameStateAndTimewarp() returns #deltaTime when if conditions are not met', (t) => {
    const result = TimeKeeper.getDeltaTimeForGameStateAndTimewarp(false);

    t.true(result === TimeKeeper.deltaTime);
});

ava.serial('.saveDeltaTimeBeforeFutureTrackCalculation() ', (t) => {
    TimeKeeper._frameDeltaTime = 3;

    TimeKeeper.saveDeltaTimeBeforeFutureTrackCalculation();

    t.true(TimeKeeper._futureTrackDeltaTimeCache === 3);
    t.true(TimeKeeper._frameDeltaTime === 5);
});

ava.serial('.restoreDeltaTimeAfterFutureTrackCalculation() ', (t) => {
    TimeKeeper._frameDeltaTime = 5;
    TimeKeeper._futureTrackDeltaTimeCache = 3;

    TimeKeeper.restoreDeltaTimeAfterFutureTrackCalculation();

    t.true(TimeKeeper._futureTrackDeltaTimeCache === -1);
    t.true(TimeKeeper._frameDeltaTime === 3);
});

ava.serial('.setPause() does not update #_isPaused when nextPause is the same value', (t) => {
    TimeKeeper._isPaused = false;
    TimeKeeper.setPause(false);

    t.false(TimeKeeper._isPaused);
});

ava.serial('.setPause() updates #_isPaused when nextPause is a different value', (t) => {
    TimeKeeper._isPaused = false;
    TimeKeeper.setPause(true);

    t.true(TimeKeeper._isPaused);
});

ava.serial('.update() increments #_elapsedFrameCount by 1', (t) => {
    t.true(TimeKeeper._elapsedFrameCount === 0);

    TimeKeeper.update();

    t.true(TimeKeeper._elapsedFrameCount === 1);
});

ava.serial('.update() resets #_frameStartTimestamp to #currentTime when elapsed time is > frameDelay', (t) => {
    TimeKeeper._frameStartTimestamp = 10;
    TimeKeeper.update();

    t.true(TimeKeeper._frameStartTimestamp === TimeKeeper._previousFrameTimestamp);
});

ava.serial('.update() recalculates the #_frameStep value based on the current #_simulationRate value', (t) => {
    TimeKeeper._simulationRate = 1;
    TimeKeeper.update();

    t.true(TimeKeeper._frameStep === 30);

    TimeKeeper._simulationRate = 2;
    TimeKeeper.update();

    t.true(TimeKeeper._frameStep === 27);

    TimeKeeper._simulationRate = 5;
    TimeKeeper.update();

    t.true(TimeKeeper._frameStep === 17);

    TimeKeeper._simulationRate = 25;
    TimeKeeper.update();

    t.true(TimeKeeper._frameStep === 1);

    TimeKeeper._simulationRate = 50;
    TimeKeeper.update();

    t.true(TimeKeeper._frameStep === 1);
});

ava.serial('.updateTimescale() only accepts positive numbers', (t) => {
    TimeKeeper._simulationRate = 1;

    TimeKeeper.updateSimulationRate(-3);

    t.true(TimeKeeper._simulationRate === 1);
});

ava.serial('.updateTimescale() updates #timescale value', (t) => {
    TimeKeeper._simulationRate = 1;

    TimeKeeper.updateSimulationRate(3);

    t.true(TimeKeeper._simulationRate === 3);
});

ava.serial('._isReturningFromPauseAndNotFutureTrack() returns false when #_frameDeltaTime is > than 1 and #_simulationRate is 1', (t) => {
    TimeKeeper._frameDeltaTime = 0.5;
    TimeKeeper._simulationRate = 1;
    TimeKeeper._futureTrackDeltaTimeCache = -1;

    t.false(TimeKeeper._isReturningFromPauseAndNotFutureTrack());
});

ava.serial('._isReturningFromPauseAndNotFutureTrack() returns false #_simulationRate is not === 1', (t) => {
    TimeKeeper._frameDeltaTime = 0.5;
    TimeKeeper._simulationRate = 2;
    TimeKeeper._futureTrackDeltaTimeCache = -1;

    t.false(TimeKeeper._isReturningFromPauseAndNotFutureTrack());
});

ava.serial('._isReturningFromPauseAndNotFutureTrack() returns false #_futureTrackDeltaTimeCache is not === -1', (t) => {
    TimeKeeper._frameDeltaTime = 0.5;
    TimeKeeper._simulationRate = 1;
    TimeKeeper._futureTrackDeltaTimeCache = 5;

    t.false(TimeKeeper._isReturningFromPauseAndNotFutureTrack());
});

ava.serial('._isReturningFromPauseAndNotFutureTrack() returns true only when all three conditions are met', (t) => {
    TimeKeeper._frameDeltaTime = 2;
    TimeKeeper._simulationRate = 1;
    TimeKeeper._futureTrackDeltaTimeCache = -1;

    t.true(TimeKeeper._isReturningFromPauseAndNotFutureTrack());
});

ava.serial('.initClock() stores the exact clock adapter instance', (t) => {
    const clockAdapter = buildClockAdapter();

    TimeKeeper.initClock(clockAdapter);

    t.is(TimeKeeper._clockAdapter, clockAdapter);
});

ava.serial('.initClock() normalizes an omitted adapter to canonical null', (t) => {
    TimeKeeper.initClock();

    t.is(TimeKeeper._clockAdapter, null);
});

ava.serial('.initClock() normalizes a null adapter to canonical null', (t) => {
    TimeKeeper.initClock(null);

    t.is(TimeKeeper._clockAdapter, null);
});

ava.serial('#gameTimeMilliseconds returns the configured clock getTime from exactly one read', (t) => {
    const clockAdapter = buildClockAdapter({ currentDate: new Date(FIXED_TIMESTAMP_MILLISECONDS) });
    TimeKeeper.initClock(clockAdapter);

    const result = TimeKeeper.gameTimeMilliseconds;

    t.is(result, FIXED_TIMESTAMP_MILLISECONDS);
    t.true(clockAdapter.now.calledOnceWithExactly());
});

ava.serial('#gameTimeSeconds is the configured clock getTime scaled to seconds from exactly one read', (t) => {
    const clockAdapter = buildClockAdapter({ currentDate: new Date(FIXED_TIMESTAMP_MILLISECONDS) });
    TimeKeeper.initClock(clockAdapter);

    const result = TimeKeeper.gameTimeSeconds;

    t.is(result, FIXED_TIMESTAMP_MILLISECONDS * TIME.ONE_MILLISECOND_IN_SECONDS);
    t.true(clockAdapter.now.calledOnceWithExactly());
});

ava.serial('#gameTimeMilliseconds returns 0 when no clock is configured', (t) => {
    TimeKeeper.initClock(null);

    t.is(TimeKeeper.gameTimeMilliseconds, 0);
});

ava.serial('#gameTimeSeconds returns 0 when no clock is configured', (t) => {
    TimeKeeper.initClock(null);

    t.is(TimeKeeper.gameTimeSeconds, 0);
});

ava.serial('.reset() clears the configured clock adapter', (t) => {
    TimeKeeper.initClock(buildClockAdapter());

    TimeKeeper.reset();

    t.is(TimeKeeper._clockAdapter, null);
});
