import ava from 'ava';
import ShiftModel from '../../src/assets/scripts/client/shift/ShiftModel';
import {
    SHIFT_STATE,
    SHIFT_SECTOR,
    SHIFT_END_TYPE,
    SPAWN_CUTOFF_SECONDS
} from '../../src/assets/scripts/client/shift/shiftConstants';
import { TRAFFIC_MODE } from '../../src/assets/scripts/client/trafficGenerator/TrafficMode';

const APPROACH_CONFIG = {
    sector: SHIFT_SECTOR.APPROACH,
    airportIcao: 'ksea',
    shiftLengthMinutes: 30
};

ava('a new ShiftModel starts in the PENDING state with no configuration', (t) => {
    const model = new ShiftModel();

    t.is(model.state, SHIFT_STATE.PENDING);
    t.is(model.config, null);
});

ava('.start() maps the sector to a traffic mode, records timing, and enters RUNNING', (t) => {
    const model = new ShiftModel();

    model.start(APPROACH_CONFIG, 100);

    t.is(model.state, SHIFT_STATE.RUNNING);
    t.is(model.config.sector, SHIFT_SECTOR.APPROACH);
    t.is(model.config.trafficMode, TRAFFIC_MODE.ARRIVALS);
    t.is(model.config.airportIcao, 'ksea');
    t.is(model.config.shiftLengthMinutes, 30);
    t.is(model.scheduledEndTime, 100 + (30 * 60));
    t.is(model.cutoffTime, 100 + (30 * 60) - SPAWN_CUTOFF_SECONDS);
});

ava('.start() maps departure and both sectors to their traffic modes', (t) => {
    const departureModel = new ShiftModel();
    const bothModel = new ShiftModel();

    departureModel.start({ ...APPROACH_CONFIG, sector: SHIFT_SECTOR.DEPARTURE }, 0);
    bothModel.start({ ...APPROACH_CONFIG, sector: SHIFT_SECTOR.BOTH }, 0);

    t.is(departureModel.config.trafficMode, TRAFFIC_MODE.DEPARTURES);
    t.is(bothModel.config.trafficMode, TRAFFIC_MODE.BOTH);
});

ava('.start() throws for an unknown sector', (t) => {
    const model = new ShiftModel();

    t.throws(() => model.start({ ...APPROACH_CONFIG, sector: 'clearance' }, 0), { instanceOf: RangeError });
});

ava('.isPastCutoff() is true only once the cutoff time is reached', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 0); // end at 1800, cutoff at 1500

    t.false(model.isPastCutoff(1499));
    t.true(model.isPastCutoff(1500));
    t.true(model.isPastCutoff(1800));
});

ava('.isPastScheduledEnd() is true only once the scheduled end is reached', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 0); // end at 1800

    t.false(model.isPastScheduledEnd(1799));
    t.true(model.isPastScheduledEnd(1800));
});

ava('.remainingSeconds() counts down and never goes negative', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 0); // end at 1800

    t.is(model.remainingSeconds(0), 1800);
    t.is(model.remainingSeconds(1750), 50);
    t.is(model.remainingSeconds(1900), 0);
});

ava('.elapsedSeconds() measures from this shift start and never goes negative', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 100);

    t.is(model.elapsedSeconds(90), 0);
    t.is(model.elapsedSeconds(165), 65);
});

ava('.recordScoreEvent() appends chronological entries while the shift is active', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 0);

    model.recordScoreEvent({ event: 'ARRIVAL', description: 'Aircraft landed successfully', points: 10, simulationTime: 42 });
    model.recordScoreEvent({ event: 'COLLISION', description: 'Multiple aircraft collided', points: -1000, simulationTime: 99 });

    t.deepEqual(model.scoreEvents, [
        { event: 'ARRIVAL', description: 'Aircraft landed successfully', points: 10, simulationTime: 42 },
        { event: 'COLLISION', description: 'Multiple aircraft collided', points: -1000, simulationTime: 99 }
    ]);
});

ava('.recordScoreEvent() ignores events when the shift is not active', (t) => {
    const model = new ShiftModel();

    model.recordScoreEvent({ event: 'ARRIVAL', description: 'x', points: 10, simulationTime: 1 });

    t.is(model.scoreEvents.length, 0);
});

ava('recorded score-event entries are frozen and the log is a defensive copy', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 0);
    model.recordScoreEvent({ event: 'ARRIVAL', description: 'x', points: 10, simulationTime: 1 });

    const firstRead = model.scoreEvents;
    firstRead.push({ event: 'DEPARTURE', description: 'y', points: 10, simulationTime: 2 });

    t.is(model.scoreEvents.length, 1);
    t.true(Object.isFrozen(model.scoreEvents[0]));
});

ava('.recordCaAlarm() and .recordSeparationLoss() count independently while active', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 0);

    model.recordCaAlarm();
    model.recordCaAlarm();
    model.recordSeparationLoss();

    t.is(model.caAlarmCount, 2);
    t.is(model.separationLossCount, 1);
});

ava('.recordCaAlarm() and .recordSeparationLoss() are ignored when not active', (t) => {
    const model = new ShiftModel();

    model.recordCaAlarm();
    model.recordSeparationLoss();

    t.is(model.caAlarmCount, 0);
    t.is(model.separationLossCount, 0);
});

ava('.noteHandledAircraft() tracks unique player-owned aircraft ids', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 0);

    model.noteHandledAircraft('aircraft-1');
    model.noteHandledAircraft('aircraft-1');
    model.noteHandledAircraft('aircraft-2');

    t.is(model.uniqueAircraftHandledCount, 2);
});

ava('.enterClearing() transitions from RUNNING to CLEARING', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 0);

    model.enterClearing();

    t.is(model.state, SHIFT_STATE.CLEARING);
});

ava('.enterClearing() only transitions from RUNNING', (t) => {
    const model = new ShiftModel();

    model.enterClearing();

    t.is(model.state, SHIFT_STATE.PENDING);
});

ava('.completeManual() snapshots remaining aircraft and marks a manual end', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 0);

    model.completeManual(340, 3);

    t.is(model.state, SHIFT_STATE.ENDED);
    t.is(model.endType, SHIFT_END_TYPE.MANUAL);
    t.is(model.finalScore, 340);
    t.is(model.aircraftRemaining, 3);
});

ava('.completeAutomatic() records zero aircraft remaining and an automatic end', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 0);
    model.enterClearing();

    model.completeAutomatic(500);

    t.is(model.state, SHIFT_STATE.ENDED);
    t.is(model.endType, SHIFT_END_TYPE.AUTOMATIC);
    t.is(model.finalScore, 500);
    t.is(model.aircraftRemaining, 0);
});

ava('.buildSummaryDTO() produces an immutable summary with derived stats', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 100); // duration 1800s

    model.noteHandledAircraft('aircraft-1');
    model.noteHandledAircraft('aircraft-2');
    model.recordScoreEvent({ event: 'ARRIVAL', description: 'a', points: 10, simulationTime: 5 });
    model.recordScoreEvent({ event: 'ARRIVAL', description: 'a', points: 10, simulationTime: 6 });
    model.recordScoreEvent({ event: 'DEPARTURE', description: 'd', points: 10, simulationTime: 7 });
    model.recordScoreEvent({ event: 'COLLISION', description: 'c', points: -1000, simulationTime: 8 });
    model.recordScoreEvent({ event: 'MISSED_HANDOFF', description: 'm', points: -25, simulationTime: 9 });
    model.recordCaAlarm();
    model.recordSeparationLoss();
    model.recordSeparationLoss();
    model.completeManual(-995, 1, 700);

    const dto = model.buildSummaryDTO();

    t.is(dto.finalScore, -995);
    t.is(dto.endType, SHIFT_END_TYPE.MANUAL);
    t.is(dto.aircraftRemaining, 1);
    t.is(dto.shiftDurationSeconds, 1800);
    t.is(dto.scheduledShiftDurationSeconds, 1800);
    t.is(dto.elapsedShiftDurationSeconds, 600);
    t.is(dto.config.sector, SHIFT_SECTOR.APPROACH);
    t.is(dto.config.trafficMode, TRAFFIC_MODE.ARRIVALS);
    t.is(dto.config.airportIcao, 'ksea');
    t.is(dto.config.shiftLengthMinutes, 30);
    t.is(dto.stats.uniqueAircraftHandled, 2);
    t.is(dto.stats.arrivalsCompleted, 2);
    t.is(dto.stats.departuresHandedOff, 1);
    t.is(dto.stats.collisions, 1);
    t.is(dto.stats.missedHandoffs, 1);
    t.is(dto.stats.caAlarms, 1);
    t.is(dto.stats.separationLosses, 2);
    t.is(dto.stats.aircraftRemaining, 1);
    t.is(dto.stats.scorePerAircraft, -995 / 2);
    t.is(dto.scoreEvents.length, 5);
    t.true(Object.isFrozen(dto));
    t.true(Object.isFrozen(dto.stats));
    t.true(Object.isFrozen(dto.config));
    t.true(Object.isFrozen(dto.scoreEvents));
});

ava('.buildSummaryDTO() reports a null score-per-aircraft when none were handled', (t) => {
    const model = new ShiftModel();
    model.start(APPROACH_CONFIG, 0);
    model.completeAutomatic(0);

    const dto = model.buildSummaryDTO();

    t.is(dto.stats.uniqueAircraftHandled, 0);
    t.is(dto.stats.scorePerAircraft, null);
});
