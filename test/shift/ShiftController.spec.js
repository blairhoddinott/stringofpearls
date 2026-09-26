import ava from 'ava';
import sinon from 'sinon';
import ShiftController from '../../src/assets/scripts/client/shift/ShiftController';
import ShiftModel from '../../src/assets/scripts/client/shift/ShiftModel';
import { EventBusClass } from '../../src/assets/scripts/client/lib/EventBus';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';
import { GAME_EVENTS } from '../../src/assets/scripts/client/game/gameEventConstants';
import { GameControllerClass } from '../../src/assets/scripts/client/game/GameController';
import {
    SHIFT_STATE,
    SHIFT_SECTOR,
    SHIFT_END_TYPE
} from '../../src/assets/scripts/client/shift/shiftConstants';
import { TRAFFIC_MODE } from '../../src/assets/scripts/client/trafficGenerator/TrafficMode';
import { DEFAULT_AIRPORT_ICAO } from '../../src/assets/scripts/client/constants/airportConstants';

const buildRadarTarget = (id, isPlayerControlled) => ({
    aircraftModel: { id },
    handoffModel: { isPlayerControlled }
});

const buildHarness = (overrides = {}) => {
    const eventBus = new EventBusClass();
    const shiftModel = new ShiftModel();
    const timeKeeper = { accumulatedDeltaTime: 0, setPause: sinon.stub() };
    const scheduler = {
        selectTrafficMode: sinon.stub(),
        resumeSpawning: sinon.stub(),
        setSpawnCutoffTime: sinon.stub(),
        setAircraftController: sinon.stub(),
        isSpawningHalted: false,
        haltSpawning: sinon.stub().callsFake(function halt() {
            this.isSpawningHalted = true;
        })
    };
    const radarTargetCollection = { items: [], reset: sinon.stub() };
    const scopeModel = { radarTargetCollection };
    const aircraftController = {
        aircraft_remove_all: sinon.stub(),
        activeStripCount: 0
    };
    const gameController = {
        game: { score: 0 },
        game_reset_score_and_events: sinon.stub(),
        destroyTimers: sinon.stub()
    };
    const stripView = { apply: sinon.stub() };
    const airportController = {
        airport_set: sinon.stub(),
        setAirportSelectionGuard: sinon.stub(),
        airports: {
            ksea: { icao: 'ksea', name: 'Seattle-Tacoma' },
            klas: { icao: 'klas', name: 'Las Vegas' }
        }
    };
    const leaderboardAdapter = { submit: sinon.stub() };
    const startView = { show: sinon.stub(), hide: sinon.stub() };
    const resultsView = { show: sinon.stub(), hide: sinon.stub() };
    const statusView = {
        update: sinon.stub(),
        setEndShiftHandler: sinon.stub(),
        reset: sinon.stub(),
        destroy: sinon.stub()
    };

    const controller = new ShiftController({
        shiftModel,
        timeKeeper,
        eventBus,
        scheduler,
        aircraftController,
        scopeModel,
        gameController,
        stripView,
        airportController,
        leaderboardAdapter,
        startView,
        resultsView,
        statusView,
        ...overrides
    });

    return {
        controller, eventBus, shiftModel, timeKeeper, scheduler, radarTargetCollection,
        scopeModel, aircraftController, gameController, stripView, airportController,
        leaderboardAdapter, startView, resultsView, statusView
    };
};

const APPROACH_CONFIG = { sector: SHIFT_SECTOR.APPROACH, airportIcao: 'klas', shiftLengthMinutes: 30 };

const beginRunningShift = (h, config = APPROACH_CONFIG) => {
    h.controller.beginShift(config);
    h.eventBus.trigger(EVENT.AIRPORT_CHANGE, { icao: config.airportIcao });
};

ava('airport selection is rejected only while a shift is active', (t) => {
    const h = buildHarness();

    t.true(h.airportController.setAirportSelectionGuard.calledOnce);
    const guard = h.airportController.setAirportSelectionGuard.firstCall.args[0];
    t.true(guard('ksea'));

    beginRunningShift(h);
    t.false(guard('ksea'));

    h.controller.endManual();
    t.true(guard('ksea'));
});

ava('.promptStart() shows the landing view with all airports and the default selection', (t) => {
    const h = buildHarness();

    h.controller.promptStart();

    t.true(h.startView.show.calledOnce);
    const [airportOptions, defaultIcao] = h.startView.show.firstCall.args;
    t.is(defaultIcao, DEFAULT_AIRPORT_ICAO);
    t.deepEqual(airportOptions.map((a) => a.icao).sort(), ['klas', 'ksea']);
});

ava('.beginShift() rejects malformed or unavailable configuration before side effects', (t) => {
    const h = buildHarness();
    const invalidConfigs = [
        { ...APPROACH_CONFIG, sector: 'tower' },
        { ...APPROACH_CONFIG, shiftLengthMinutes: 45 },
        { ...APPROACH_CONFIG, airportIcao: 'kzzz' }
    ];

    invalidConfigs.forEach((config) => {
        t.throws(() => h.controller.beginShift(config), { instanceOf: RangeError });
    });
    t.true(h.scheduler.selectTrafficMode.notCalled);
    t.true(h.airportController.airport_set.notCalled);
});

ava('.beginShift() selects the mode, applies strips, and routes airport before starting the clock', (t) => {
    const h = buildHarness();

    h.controller.beginShift(APPROACH_CONFIG);

    t.true(h.scheduler.selectTrafficMode.calledOnceWithExactly(TRAFFIC_MODE.ARRIVALS));
    t.true(h.stripView.apply.calledOnceWithExactly(TRAFFIC_MODE.ARRIVALS));
    t.true(h.scheduler.resumeSpawning.called);
    t.true(h.scheduler.setAircraftController.calledOnceWithExactly(h.aircraftController));
    t.true(h.airportController.airport_set.calledOnceWithExactly('klas'));
    // clock not started until the airport is ready
    t.is(h.shiftModel.state, SHIFT_STATE.PENDING);
});

ava('the shift clock starts once the airport change lifecycle completes', (t) => {
    const h = buildHarness();
    h.timeKeeper.accumulatedDeltaTime = 120;

    h.controller.beginShift(APPROACH_CONFIG);
    h.eventBus.trigger(EVENT.AIRPORT_CHANGE, { icao: 'klas' });

    t.is(h.shiftModel.state, SHIFT_STATE.RUNNING);
    t.is(h.shiftModel.scheduledEndTime, 120 + (30 * 60));
    t.true(h.scheduler.setSpawnCutoffTime.calledOnceWithExactly(1620));
    t.true(h.gameController.game_reset_score_and_events.called);
    t.true(h.startView.hide.called);
});

ava('a later airport change does not restart an already-running shift', (t) => {
    const h = buildHarness();
    beginRunningShift(h);
    h.gameController.game_reset_score_and_events.resetHistory();

    h.eventBus.trigger(EVENT.AIRPORT_CHANGE, { icao: 'klas' });

    t.false(h.gameController.game_reset_score_and_events.called);
});

ava('the real scoring producer feeds the shift log through the production event contract', (t) => {
    const eventBus = new EventBusClass();
    const gameController = new GameControllerClass(undefined, eventBus);
    sinon.stub(gameController, 'game_updateScore');
    sinon.stub(gameController, 'updateScoreHistory');
    sinon.stub(gameController, 'game_reset_score_and_events').callsFake(() => {
        gameController.game.score = 0;
        gameController.game.events = { [GAME_EVENTS.ARRIVAL]: 0 };
    });
    const h = buildHarness({ eventBus, gameController });
    h.controller.beginShift(APPROACH_CONFIG);
    eventBus.trigger(EVENT.AIRPORT_CHANGE, { icao: 'klas' });

    gameController.events_recordNew(GAME_EVENTS.ARRIVAL);

    t.deepEqual(h.shiftModel.scoreEvents, [{
        event: GAME_EVENTS.ARRIVAL,
        description: 'Aircraft landed successfully',
        points: 10,
        simulationTime: 0
    }]);
    t.is(gameController.game.score, 10);
});

ava('scoring events are logged with shift-relative simulation time, description, and point delta', (t) => {
    const h = buildHarness();
    h.timeKeeper.accumulatedDeltaTime = 120;
    beginRunningShift(h);
    h.timeKeeper.accumulatedDeltaTime = 200;

    h.eventBus.trigger(EVENT.SCORE_EVENT_RECORDED, GAME_EVENTS.ARRIVAL);

    t.deepEqual(h.shiftModel.scoreEvents, [{
        event: GAME_EVENTS.ARRIVAL,
        description: 'Aircraft landed successfully',
        points: 10,
        simulationTime: 80
    }]);
});

ava('CA alarms and separation losses are counted from their transition events', (t) => {
    const h = buildHarness();
    beginRunningShift(h);

    h.eventBus.trigger(EVENT.PROXIMITY_CONFLICT_ALARM, {});
    h.eventBus.trigger(EVENT.PROXIMITY_CONFLICT_ALARM, {});
    h.eventBus.trigger(EVENT.SEPARATION_LOSS_ALARM, {});

    t.is(h.shiftModel.caAlarmCount, 2);
    t.is(h.shiftModel.separationLossCount, 1);
});

ava('.update() halts spawning at the cutoff without deleting active traffic', (t) => {
    const h = buildHarness();
    beginRunningShift(h); // end 1800, cutoff 1500
    h.timeKeeper.accumulatedDeltaTime = 1500;

    h.controller.update();

    t.true(h.scheduler.haltSpawning.called);
    t.true(h.aircraftController.aircraft_remove_all.notCalled);
});

ava('.update() enters the clearing state at the scheduled end', (t) => {
    const h = buildHarness();
    beginRunningShift(h);
    h.radarTargetCollection.items = [buildRadarTarget('aircraft-1', true)];
    h.timeKeeper.accumulatedDeltaTime = 1800;

    h.controller.update();

    t.is(h.shiftModel.state, SHIFT_STATE.CLEARING);
});

ava('.update() tracks unique player-owned aircraft as handled', (t) => {
    const h = buildHarness();
    beginRunningShift(h);
    h.radarTargetCollection.items = [
        buildRadarTarget('aircraft-1', true),
        buildRadarTarget('aircraft-2', false)
    ];

    h.controller.update();

    t.is(h.shiftModel.uniqueAircraftHandledCount, 1);
});

ava('.update() remains in clearing while a player strip is still present', (t) => {
    const h = buildHarness();
    beginRunningShift(h);
    h.aircraftController.activeStripCount = 1;
    h.timeKeeper.accumulatedDeltaTime = 1800;

    h.controller.update();

    t.is(h.shiftModel.state, SHIFT_STATE.CLEARING);
    t.true(h.resultsView.show.notCalled);
});

ava('.update() auto-ends once no player-owned aircraft remain in the clearing state', (t) => {
    const h = buildHarness();
    beginRunningShift(h);
    h.gameController.game.score = 480;
    h.radarTargetCollection.items = [{ aircraftModel: { id: 'c1' }, handoffModel: { isPlayerControlled: false } }];
    h.timeKeeper.accumulatedDeltaTime = 1800;

    h.controller.update();

    t.is(h.shiftModel.state, SHIFT_STATE.ENDED);
    t.is(h.shiftModel.endType, SHIFT_END_TYPE.AUTOMATIC);
    t.is(h.shiftModel.aircraftRemaining, 0);
    t.is(h.shiftModel.finalScore, 480);
    t.true(h.leaderboardAdapter.submit.calledOnce);
    t.true(h.resultsView.show.calledOnce);
    t.true(h.aircraftController.aircraft_remove_all.called);
    t.true(h.radarTargetCollection.reset.called);
    t.true(h.timeKeeper.setPause.calledWithExactly(true));
});

ava('.endManual() ends immediately, snapshotting remaining player-owned aircraft', (t) => {
    const h = buildHarness();
    beginRunningShift(h);
    h.gameController.game.score = -50;
    h.radarTargetCollection.items = [
        buildRadarTarget('a1', true),
        buildRadarTarget('a2', true),
        buildRadarTarget('a3', false)
    ];

    h.controller.endManual();

    t.is(h.shiftModel.state, SHIFT_STATE.ENDED);
    t.is(h.shiftModel.endType, SHIFT_END_TYPE.MANUAL);
    t.is(h.shiftModel.aircraftRemaining, 2);
    t.is(h.shiftModel.finalScore, -50);
    t.true(h.leaderboardAdapter.submit.calledOnce);
    t.true(h.resultsView.show.calledOnce);
    t.true(h.statusView.reset.calledOnce);
    t.true(h.timeKeeper.setPause.calledWithExactly(true));
});

ava('the leaderboard adapter receives the immutable summary DTO exactly once', (t) => {
    const h = buildHarness();
    h.timeKeeper.accumulatedDeltaTime = 100;
    beginRunningShift(h);
    h.timeKeeper.accumulatedDeltaTime = 350;

    h.controller.endManual();

    t.true(h.leaderboardAdapter.submit.calledOnce);
    const dto = h.leaderboardAdapter.submit.firstCall.args[0];
    t.true(Object.isFrozen(dto));
    t.is(dto.endType, SHIFT_END_TYPE.MANUAL);
    t.is(dto.elapsedShiftDurationSeconds, 250);
});

ava('.startAnother() resets shift state and returns to the landing view', (t) => {
    const h = buildHarness();
    beginRunningShift(h);
    h.controller.endManual();
    h.startView.show.resetHistory();

    h.controller.startAnother();

    t.is(h.shiftModel.state, SHIFT_STATE.PENDING);
    t.true(h.gameController.game_reset_score_and_events.called);
    t.true(h.scheduler.resumeSpawning.called);
    t.true(h.resultsView.hide.called);
    t.true(h.startView.show.calledOnce);
});

ava('starting another shift resumes simulation time after the results screen paused it', (t) => {
    const h = buildHarness();
    beginRunningShift(h);
    h.controller.endManual();
    h.controller.startAnother();
    h.timeKeeper.setPause.resetHistory();

    beginRunningShift(h);

    t.true(h.timeKeeper.setPause.calledOnceWithExactly(false));
});

ava('.destroy() releases DOM handlers and modal state before collaborators are discarded', (t) => {
    const h = buildHarness();

    h.controller.destroy();

    t.true(h.startView.hide.calledOnce);
    t.true(h.resultsView.hide.calledOnce);
    t.true(h.statusView.destroy.calledOnce);
    t.true(h.airportController.setAirportSelectionGuard.lastCall.calledWithExactly(null));
});

ava('.destroy() unsubscribes so later scoring events are inert', (t) => {
    const h = buildHarness();

    h.controller.destroy();

    t.notThrows(() => h.eventBus.trigger(EVENT.SCORE_EVENT_RECORDED, GAME_EVENTS.ARRIVAL));
});

ava('the controller operates without an optional status view', (t) => {
    const h = buildHarness({ statusView: undefined });
    h.timeKeeper.accumulatedDeltaTime = 10;

    beginRunningShift(h);

    t.notThrows(() => h.controller.update());
    t.is(h.shiftModel.state, SHIFT_STATE.RUNNING);
});

ava('scoring events are ignored once the shift has ended', (t) => {
    const h = buildHarness();
    beginRunningShift(h);
    h.controller.endManual();

    h.eventBus.trigger(EVENT.SCORE_EVENT_RECORDED, GAME_EVENTS.ARRIVAL);

    t.is(h.shiftModel.scoreEvents.length, 0);
});
