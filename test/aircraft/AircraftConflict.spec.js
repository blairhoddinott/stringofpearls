import ava from 'ava';
import sinon from 'sinon';
import AircraftConflict from '../../src/assets/scripts/client/aircraft/AircraftConflict';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';

// Build a pair of minimal aircraft stubs and an AircraftConflict that skips the
// heavy `update()` path. Passing a conflictCollection that already contains a
// matching conflict makes `isAlreadyKnown()` true, so the constructor returns
// before running proximity/collision math, letting us exercise the alarm
// transition helpers in isolation.
const buildConflict = () => {
    const eventBus = { trigger: sinon.stub() };
    const first = { relativePosition: [0, 0], altitude: 5000, callsign: 'AAL1' };
    const second = { relativePosition: [1, 1], altitude: 5000, callsign: 'AAL2' };
    const conflictCollection = [{ aircraft: [first, second] }];
    const conflict = new AircraftConflict(first, second, eventBus, {}, {}, {}, conflictCollection);

    return { conflict, eventBus };
};

ava('an ineligible altitude clears active alarm state before returning', (t) => {
    const { conflict } = buildConflict();
    conflict._airportController = { airport_get: () => ({ elevation: 0 }) };
    conflict._clock = { accumulatedDeltaTime: 200 };
    conflict.aircraft.forEach((aircraft) => {
        aircraft.isOnGround = () => false;
        aircraft.takeoffTime = 0;
    });
    conflict.aircraft[0].altitude = 500;
    conflict.checkCollision = sinon.stub();
    conflict._updateConflictState(true);
    conflict._updateViolationState(true);

    conflict.update();

    t.false(conflict.hasConflict());
    t.false(conflict.hasViolation());
});

ava('a newly airborne pair clears active alarm state before returning', (t) => {
    const { conflict } = buildConflict();
    conflict._airportController = { airport_get: () => ({ elevation: 0 }) };
    conflict._clock = { accumulatedDeltaTime: 60 };
    conflict.aircraft.forEach((aircraft) => {
        aircraft.isOnGround = () => false;
        aircraft.takeoffTime = 0;
    });
    conflict.checkCollision = sinon.stub();
    conflict._updateConflictState(true);
    conflict._updateViolationState(true);

    conflict.update();

    t.false(conflict.hasConflict());
    t.false(conflict.hasViolation());
});

ava('a collided pair clears active alarm state before returning', (t) => {
    const { conflict } = buildConflict();
    conflict.collided = true;
    conflict._updateConflictState(true);
    conflict._updateViolationState(true);

    conflict.update();

    t.false(conflict.hasConflict());
    t.false(conflict.hasViolation());
});

ava('a conflict activation emits PROXIMITY_CONFLICT_ALARM exactly once per activation', (t) => {
    const { conflict, eventBus } = buildConflict();

    conflict._updateConflictState(true);
    conflict._updateConflictState(true);

    t.true(conflict.hasConflict());
    t.true(eventBus.trigger.calledOnceWithExactly(EVENT.PROXIMITY_CONFLICT_ALARM, conflict));
});

ava('a conflict that clears and reactivates counts as a second alarm', (t) => {
    const { conflict, eventBus } = buildConflict();

    conflict._updateConflictState(true);
    conflict._updateConflictState(false);
    conflict._updateConflictState(true);

    t.false(eventBus.trigger.calledWith(EVENT.SEPARATION_LOSS_ALARM));
    t.is(eventBus.trigger.withArgs(EVENT.PROXIMITY_CONFLICT_ALARM, conflict).callCount, 2);
});

ava('a separation-loss activation emits SEPARATION_LOSS_ALARM once per activation', (t) => {
    const { conflict, eventBus } = buildConflict();

    conflict._updateViolationState(true);
    conflict._updateViolationState(true);
    conflict._updateViolationState(false);
    conflict._updateViolationState(true);

    t.true(conflict.hasViolation());
    t.is(eventBus.trigger.withArgs(EVENT.SEPARATION_LOSS_ALARM, conflict).callCount, 2);
});

ava('conflict and separation alarms are independent and not conflated', (t) => {
    const { conflict, eventBus } = buildConflict();

    conflict._updateConflictState(true);

    t.is(eventBus.trigger.withArgs(EVENT.PROXIMITY_CONFLICT_ALARM, conflict).callCount, 1);
    t.is(eventBus.trigger.withArgs(EVENT.SEPARATION_LOSS_ALARM, conflict).callCount, 0);
});
