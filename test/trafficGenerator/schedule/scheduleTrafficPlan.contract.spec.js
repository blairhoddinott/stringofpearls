import fs from 'fs';
import path from 'path';
import ava from 'ava';
import sinon from 'sinon';
import { SpawnSchedulerClass } from '../../../src/assets/scripts/client/trafficGenerator/SpawnScheduler';
import SimulationClock from '../../../src/assets/scripts/client/simulation/SimulationClock';
import SimulationTimerQueue from '../../../src/assets/scripts/client/simulation/SimulationTimerQueue';
import ScheduledSpawnPatternModel from '../../../src/assets/scripts/client/trafficGenerator/schedule/ScheduledSpawnPatternModel';
import { resolveTrafficPlan } from '../../../src/assets/scripts/client/trafficGenerator/schedule/resolveTrafficPlan';
import {
    secondsOfDayInZone,
    secondsUntilNextOccurrence,
    selectScheduleSubset
} from '../../../src/assets/scripts/client/trafficGenerator/schedule/scheduleTrafficPlanUtils';

// Load the real, reviewed normalized schedule asset.
const KSEA_SCHEDULE = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../assets/schedules/ksea.json'), 'utf8')
);

// Fixed instant so the airport-zone anchor is deterministic across hosts.
const SESSION_START = new Date('2026-07-15T12:00:00Z');

const buildScheduler = (collection, clock) => {
    const scheduledTimeouts = [];
    const timerQueue = {
        scheduleTimeout: (...args) => {
            scheduledTimeouts.push(args);

            return ['schedule', args[1]];
        },
        destroyTimer: sinon.stub()
    };
    const aircraftController = {
        createAircraftWithSpawnPatternModel: sinon.stub(),
        createPreSpawnAircraftWithSpawnPatternModel: sinon.stub()
    };
    const scheduler = new SpawnSchedulerClass(collection, clock, timerQueue, aircraftController);

    return { scheduler, scheduledTimeouts, aircraftController };
};

ava('a real schedule flows through the provider into the real SpawnScheduler, arming one timer per slot at its airport-local delay', (t) => {
    const clock = { accumulatedDeltaTime: 0 };
    const plan = resolveTrafficPlan({
        airportIcao: KSEA_SCHEDULE.airportIcao,
        scheduleDocument: KSEA_SCHEDULE,
        legacyCollection: null,
        sessionStartDate: SESSION_START
    });
    const { scheduler, scheduledTimeouts } = buildScheduler(plan.collection, clock);

    scheduler.startScheduler();

    t.is(plan.mode, 'scheduled');
    // one armed timer per flight in the full representative day
    t.is(scheduledTimeouts.length, KSEA_SCHEDULE.flights.length);

    const expectedZoneSeconds = secondsOfDayInZone(SESSION_START, KSEA_SCHEDULE.timezone);

    // Every armed timer carries a real scheduled slot model, and its delay matches
    // the slot's next 24h-aligned occurrence in the airport's local time.
    for (const call of scheduledTimeouts) {
        const delay = call[1];
        const [spawnPatternModel] = call[3];

        t.true(spawnPatternModel instanceof ScheduledSpawnPatternModel);
        t.is(
            delay,
            secondsUntilNextOccurrence(spawnPatternModel.scheduledSecondsOfDay, expectedZoneSeconds, 0)
        );
        t.true(delay > 0 && delay <= 86400);
    }
});

ava('the armed timers preserve the scheduled identity needed by the mapping slice', (t) => {
    const clock = { accumulatedDeltaTime: 0 };
    const plan = resolveTrafficPlan({
        airportIcao: KSEA_SCHEDULE.airportIcao,
        scheduleDocument: KSEA_SCHEDULE,
        legacyCollection: null,
        sessionStartDate: SESSION_START
    });
    const { scheduler, scheduledTimeouts } = buildScheduler(plan.collection, clock);

    scheduler.startScheduler();

    const flightById = new Map(KSEA_SCHEDULE.flights.map((flight) => [flight.id, flight]));

    for (const call of scheduledTimeouts) {
        const [spawnPatternModel] = call[3];
        const sourceFlight = flightById.get(spawnPatternModel.id);

        t.truthy(sourceFlight);
        t.is(spawnPatternModel.category, sourceFlight.category);
        t.is(spawnPatternModel.scheduledTime, sourceFlight.scheduledTime);
        t.is(spawnPatternModel.airlineIcao, sourceFlight.airlineIcao);
        t.is(spawnPatternModel.flightNumber, sourceFlight.flightNumber);
        t.is(spawnPatternModel.originIcao, sourceFlight.originIcao);
        t.is(spawnPatternModel.destinationIcao, sourceFlight.destinationIcao);
    }
});

ava('a nested 25% subset arms a deterministic, smaller set of timers through the scheduler', (t) => {
    const clock = { accumulatedDeltaTime: 0 };
    const plan = resolveTrafficPlan({
        airportIcao: KSEA_SCHEDULE.airportIcao,
        scheduleDocument: KSEA_SCHEDULE,
        legacyCollection: null,
        subsetPercent: 25,
        sessionStartDate: SESSION_START
    });
    const { scheduler, scheduledTimeouts } = buildScheduler(plan.collection, clock);

    scheduler.startScheduler();

    const expectedIds = selectScheduleSubset(KSEA_SCHEDULE.flights, 25).map((flight) => flight.id);
    const armedIds = scheduledTimeouts.map((call) => call[3][0].id);

    t.is(armedIds.length, expectedIds.length);
    t.deepEqual([...armedIds].sort(), [...expectedIds].sort());
});

ava('resetting airborne traffic preserves a scheduled arrival absolute slot time', (t) => {
    const clock = new SimulationClock();
    const timerQueue = new SimulationTimerQueue(clock);
    const flight = {
        id: 'arrival-aal1-klax-ksea',
        category: 'arrival',
        scheduledTime: '05:30',
        airlineIcao: 'aal',
        flightNumber: '1',
        originIcao: 'KLAX',
        destinationIcao: 'KSEA'
    };
    const model = new ScheduledSpawnPatternModel(flight, {
        airportIcao: 'KSEA',
        timezone: 'America/Los_Angeles',
        zoneSecondsOfDayAtSimZero: 5 * 3600
    });
    const collection = {
        spawnPatternModels: [model],
        getDepartureModelsForPreSpawn: () => []
    };
    const aircraftController = {
        createAircraftWithSpawnPatternModel: sinon.stub(),
        createPreSpawnAircraftWithSpawnPatternModel: sinon.stub()
    };
    const scheduler = new SpawnSchedulerClass(collection, clock, timerQueue, aircraftController);

    scheduler.startScheduler();
    t.is(timerQueue.timers[0][1], 1800);

    for (let i = 0; i < 6; i++) {
        clock.tick(100);
    }
    scheduler.resetAirborneTraffic();

    t.is(clock.accumulatedDeltaTime, 600);
    t.is(timerQueue.timers.length, 1);
    t.is(timerQueue.timers[0][1], 1800, 'reset must not move the fixed schedule slot earlier');
});

ava('a scheduled slot uses real pause/timewarp, callback re-arm, and teardown lifecycle', (t) => {
    const clock = new SimulationClock();
    const timerQueue = new SimulationTimerQueue(clock);
    const model = new ScheduledSpawnPatternModel({
        id: 'arrival-aal1-klax-ksea',
        category: 'arrival',
        scheduledTime: '05:30',
        airlineIcao: 'aal',
        flightNumber: '1',
        originIcao: 'KLAX',
        destinationIcao: 'KSEA'
    }, {
        airportIcao: 'KSEA',
        timezone: 'America/Los_Angeles',
        zoneSecondsOfDayAtSimZero: 5 * 3600
    });
    const collection = {
        spawnPatternModels: [model],
        getDepartureModelsForPreSpawn: () => []
    };
    const aircraftController = {
        createAircraftWithSpawnPatternModel: sinon.stub(),
        createPreSpawnAircraftWithSpawnPatternModel: sinon.stub()
    };
    const scheduler = new SpawnSchedulerClass(collection, clock, timerQueue, aircraftController);

    scheduler.startScheduler();
    clock.setPause(true);
    clock.tick(100);
    timerQueue.update();
    t.is(clock.accumulatedDeltaTime, 0);
    t.true(aircraftController.createAircraftWithSpawnPatternModel.notCalled);

    clock.setPause(false);
    clock.updateSimulationRate(2);
    clock.tick(50);
    for (let i = 0; i < 17; i++) {
        clock.tick(100);
    }
    clock.tick(1);
    timerQueue.update();

    t.is(clock.accumulatedDeltaTime, 1802);
    t.true(aircraftController.createAircraftWithSpawnPatternModel.calledOnceWithExactly(model));
    t.is(timerQueue.timers.length, 1);
    t.is(timerQueue.timers[0][1], 88200, 'callback must re-arm at the next representative-day slot');

    scheduler.haltSpawning();
    t.is(timerQueue.timers.length, 0);
    t.is(model.scheduleId, null);
});

ava('the scheduler cutoff suppresses a due scheduled slot and prevents re-arm', (t) => {
    const clock = new SimulationClock();
    const timerQueue = new SimulationTimerQueue(clock);
    const model = new ScheduledSpawnPatternModel({
        id: 'arrival-aal1-klax-ksea',
        category: 'arrival',
        scheduledTime: '05:30',
        airlineIcao: 'aal',
        flightNumber: '1',
        originIcao: 'KLAX',
        destinationIcao: 'KSEA'
    }, {
        airportIcao: 'KSEA',
        timezone: 'America/Los_Angeles',
        zoneSecondsOfDayAtSimZero: 5 * 3600
    });
    const collection = {
        spawnPatternModels: [model],
        getDepartureModelsForPreSpawn: () => []
    };
    const aircraftController = {
        createAircraftWithSpawnPatternModel: sinon.stub(),
        createPreSpawnAircraftWithSpawnPatternModel: sinon.stub()
    };
    const scheduler = new SpawnSchedulerClass(collection, clock, timerQueue, aircraftController);

    scheduler.startScheduler();
    scheduler.setSpawnCutoffTime(1800);
    for (let i = 0; i < 18; i++) {
        clock.tick(100);
    }
    clock.tick(1);
    timerQueue.update();

    t.true(aircraftController.createAircraftWithSpawnPatternModel.notCalled);
    t.is(timerQueue.timers.length, 0);
    t.is(model.scheduleId, null);
});
