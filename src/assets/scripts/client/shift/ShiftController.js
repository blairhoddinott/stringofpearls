import EventBus from '../lib/EventBus';
import TimeKeeper from '../engine/TimeKeeper';
import GameController from '../game/GameController';
import AirportController from '../airport/AirportController';
import SpawnScheduler from '../trafficGenerator/SpawnScheduler';
import LeaderboardAdapter from './LeaderboardAdapter';
import ShiftModel from './ShiftModel';
import { EVENT } from '../constants/eventNames';
import { DEFAULT_AIRPORT_ICAO } from '../constants/airportConstants';
import {
    SHIFT_STATE,
    SHIFT_SECTOR_TRAFFIC_MODE,
    SHIFT_LENGTH_MINUTES
} from './shiftConstants';
import { GAME_EVENTS_DESCRIPTION, GAME_EVENTS_POINT_VALUES } from '../game/gameEventConstants';

/**
 * Orchestrates the lifecycle of a controller shift.
 *
 * The controller owns a pure `ShiftModel` and wires it to the rest of the
 * simulation: it reads authoritative simulation time from the `TimeKeeper`,
 * uses controller ownership from the `ScopeModel` as authoritative for
 * remaining traffic, observes the scoring producer and proximity-alarm events
 * on the `EventBus`, halts spawn generation near the shift end, and hands an
 * immutable summary DTO to an injected leaderboard adapter exactly once when a
 * shift ends. All collaborators are injected so the orchestration is testable
 * without the DOM or singletons.
 *
 * @class ShiftController
 */
export default class ShiftController {
    /**
     * @constructor
     * @param options {object} injected collaborators
     */
    constructor({
        shiftModel = new ShiftModel(),
        timeKeeper = TimeKeeper,
        eventBus = EventBus,
        scheduler = SpawnScheduler,
        aircraftController,
        scopeModel,
        gameController = GameController,
        stripView,
        airportController = AirportController,
        leaderboardAdapter = LeaderboardAdapter,
        startView,
        resultsView,
        statusView
    } = {}) {
        this._shiftModel = shiftModel;
        this._timeKeeper = timeKeeper;
        this._eventBus = eventBus;
        this._scheduler = scheduler;
        this._aircraftController = aircraftController;
        this._scopeModel = scopeModel;
        this._gameController = gameController;
        this._stripView = stripView;
        this._airportController = airportController;
        this._leaderboardAdapter = leaderboardAdapter;
        this._startView = startView;
        this._resultsView = resultsView;
        this._statusView = statusView;

        /**
         * Config captured at `.beginShift()`, applied when the airport is ready.
         *
         * @property _pendingConfig
         * @type {object|null}
         * @private
         */
        this._pendingConfig = null;

        this.setupHandlers()
            .enable();
    }

    /**
     * @for ShiftController
     * @method setupHandlers
     * @chainable
     */
    setupHandlers() {
        this._onScoreEventHandler = this._onScoreEvent.bind(this);
        this._onConflictAlarmHandler = this._onConflictAlarm.bind(this);
        this._onSeparationLossHandler = this._onSeparationLoss.bind(this);
        this._onAirportReadyHandler = this._onAirportReady.bind(this);
        this._onEndShiftHandler = this.endManual.bind(this);
        this._onStartHandler = this.beginShift.bind(this);
        this._onStartAnotherHandler = this.startAnother.bind(this);
        this._airportSelectionGuard = () => !this._isShiftActive();

        return this;
    }

    /**
     * @for ShiftController
     * @method enable
     * @chainable
     */
    enable() {
        this._eventBus.on(EVENT.SCORE_EVENT_RECORDED, this._onScoreEventHandler);
        this._eventBus.on(EVENT.PROXIMITY_CONFLICT_ALARM, this._onConflictAlarmHandler);
        this._eventBus.on(EVENT.SEPARATION_LOSS_ALARM, this._onSeparationLossHandler);
        this._airportController.setAirportSelectionGuard(this._airportSelectionGuard);

        if (this._statusView) {
            this._statusView.setEndShiftHandler(this._onEndShiftHandler);
        }

        return this;
    }

    /**
     * @for ShiftController
     * @method disable
     * @chainable
     */
    disable() {
        this._eventBus.off(EVENT.SCORE_EVENT_RECORDED, this._onScoreEventHandler);
        this._eventBus.off(EVENT.PROXIMITY_CONFLICT_ALARM, this._onConflictAlarmHandler);
        this._eventBus.off(EVENT.SEPARATION_LOSS_ALARM, this._onSeparationLossHandler);
        this._eventBus.off(EVENT.AIRPORT_CHANGE, this._onAirportReadyHandler);
        this._airportController.setAirportSelectionGuard(null);

        return this;
    }

    /**
     * Tear down the controller and release collaborators.
     *
     * @for ShiftController
     * @method destroy
     * @chainable
     */
    destroy() {
        this.disable();
        this._startView.hide();
        this._resultsView.hide();

        if (this._statusView) {
            this._statusView.destroy();
        }

        this._shiftModel = null;
        this._aircraftController = null;
        this._scopeModel = null;
        this._stripView = null;
        this._startView = null;
        this._resultsView = null;
        this._statusView = null;
        this._pendingConfig = null;

        return this;
    }

    /**
     * Show the Start Shift landing page so the player can configure a shift.
     *
     * @for ShiftController
     * @method promptStart
     */
    promptStart() {
        this._startView.show(this._buildAirportOptions(), DEFAULT_AIRPORT_ICAO, this._onStartHandler);
    }

    /**
     * Begin a shift with the chosen configuration.
     *
     * Traffic generation is routed through the real airport change/load
     * lifecycle: the scheduler mode is selected, the controller is attached,
     * and the airport is set. The shift clock only starts once the airport is
     * ready (`EVENT.AIRPORT_CHANGE`), at which point spawning has begun.
     *
     * @for ShiftController
     * @method beginShift
     * @param config {object} `{ sector, airportIcao, shiftLengthMinutes }`
     */
    beginShift(config) {
        const trafficMode = SHIFT_SECTOR_TRAFFIC_MODE[config?.sector];
        const hasValidLength = SHIFT_LENGTH_MINUTES.includes(config?.shiftLengthMinutes);
        const hasEnabledAirport = Boolean(this._airportController.airports[config?.airportIcao]);

        if (!trafficMode || !hasValidLength || !hasEnabledAirport) {
            throw new RangeError('Expected a valid sector, shift length, and enabled airport');
        }

        this._pendingConfig = config;
        this._scheduler.selectTrafficMode(trafficMode);
        this._stripView.apply(trafficMode);
        this._scheduler.resumeSpawning();
        this._scheduler.setAircraftController(this._aircraftController);

        this._eventBus.on(EVENT.AIRPORT_CHANGE, this._onAirportReadyHandler);
        this._airportController.airport_set(config.airportIcao);
    }

    /**
     * Advance the shift each frame: track handled traffic, halt spawning at the
     * cutoff, transition into clearing at the scheduled end, refresh the status
     * readout, and auto-end once all player-owned traffic has cleared.
     *
     * @for ShiftController
     * @method update
     */
    update() {
        const { state } = this._shiftModel;

        if (state !== SHIFT_STATE.RUNNING && state !== SHIFT_STATE.CLEARING) {
            return;
        }

        const now = this._timeKeeper.accumulatedDeltaTime;
        const playerOwnedTargets = this._playerOwnedRadarTargets();

        playerOwnedTargets.forEach((radarTargetModel) => {
            this._shiftModel.noteHandledAircraft(radarTargetModel.aircraftModel.id);
        });

        if (this._shiftModel.state === SHIFT_STATE.RUNNING) {
            if (this._shiftModel.isPastCutoff(now) && !this._scheduler.isSpawningHalted) {
                this._scheduler.haltSpawning();
            }

            if (this._shiftModel.isPastScheduledEnd(now)) {
                this._shiftModel.enterClearing();
            }
        }

        this._updateStatusView(now);

        if (
            this._shiftModel.state === SHIFT_STATE.CLEARING
            && playerOwnedTargets.length === 0
            && this._aircraftController.activeStripCount === 0
        ) {
            this._autoEnd();
        }
    }

    /**
     * End the shift manually and immediately, with no confirmation.
     *
     * @for ShiftController
     * @method endManual
     */
    endManual() {
        if (!this._isShiftActive()) {
            return;
        }

        const aircraftRemaining = this._playerOwnedRadarTargets().length;

        this._shiftModel.completeManual(
            this._gameController.game.score,
            aircraftRemaining,
            this._timeKeeper.accumulatedDeltaTime
        );
        this._finishShift();
    }

    /**
     * Automatically end the shift once all player-owned traffic has cleared.
     *
     * @for ShiftController
     * @method _autoEnd
     * @private
     */
    _autoEnd() {
        this._shiftModel.completeAutomatic(
            this._gameController.game.score,
            this._timeKeeper.accumulatedDeltaTime
        );
        this._finishShift();
    }

    /**
     * Shared shift-completion path: clear the session, hand the summary to the
     * leaderboard adapter exactly once, and open the results screen.
     *
     * @for ShiftController
     * @method _finishShift
     * @private
     */
    _finishShift() {
        this._clearSession();

        const summary = this._shiftModel.buildSummaryDTO();

        if (this._statusView) {
            this._statusView.reset();
        }

        this._leaderboardAdapter.submit(summary);
        this._resultsView.show(summary, this._onStartAnotherHandler);
    }

    /**
     * Reset everything for a fresh shift and return to the landing page.
     *
     * @for ShiftController
     * @method startAnother
     */
    startAnother() {
        this._shiftModel.reset();
        this._clearSession();
        this._gameController.game_reset_score_and_events();
        this._scheduler.resumeSpawning();

        if (this._statusView) {
            this._statusView.reset();
        }

        this._resultsView.hide();
        this.promptStart();
    }

    /**
     * Clear active traffic and scope artifacts and stop session activity,
     * without deleting anything the results screen still needs.
     *
     * @for ShiftController
     * @method _clearSession
     * @private
     */
    _clearSession() {
        this._scheduler.haltSpawning();
        this._aircraftController.aircraft_remove_all();
        this._scopeModel.radarTargetCollection.reset();
        this._gameController.destroyTimers();
        this._timeKeeper.setPause(true);
    }

    /**
     * @for ShiftController
     * @method _onAirportReady
     * @private
     */
    _onAirportReady() {
        this._eventBus.off(EVENT.AIRPORT_CHANGE, this._onAirportReadyHandler);

        if (this._pendingConfig === null) {
            return;
        }

        this._gameController.game_reset_score_and_events();
        this._shiftModel.start(this._pendingConfig, this._timeKeeper.accumulatedDeltaTime);
        this._scheduler.setSpawnCutoffTime(this._shiftModel.cutoffTime);
        this._timeKeeper.setPause(false);
        this._pendingConfig = null;

        this._startView.hide();
    }

    /**
     * @for ShiftController
     * @method _onScoreEvent
     * @param gameEvent {string}
     * @private
     */
    _onScoreEvent(gameEvent) {
        this._shiftModel.recordScoreEvent({
            event: gameEvent,
            description: GAME_EVENTS_DESCRIPTION[gameEvent],
            points: GAME_EVENTS_POINT_VALUES[gameEvent],
            simulationTime: this._shiftModel.elapsedSeconds(this._timeKeeper.accumulatedDeltaTime)
        });
    }

    /**
     * @for ShiftController
     * @method _onConflictAlarm
     * @private
     */
    _onConflictAlarm() {
        this._shiftModel.recordCaAlarm();
    }

    /**
     * @for ShiftController
     * @method _onSeparationLoss
     * @private
     */
    _onSeparationLoss() {
        this._shiftModel.recordSeparationLoss();
    }

    /**
     * The radar targets currently owned by the player (authoritative for
     * remaining traffic). Center/tower-owned targets are excluded.
     *
     * @for ShiftController
     * @method _playerOwnedRadarTargets
     * @return {array}
     * @private
     */
    _playerOwnedRadarTargets() {
        return this._scopeModel.radarTargetCollection.items.filter(
            (radarTargetModel) => radarTargetModel.handoffModel.isPlayerControlled
        );
    }

    /**
     * @for ShiftController
     * @method _isShiftActive
     * @return {boolean}
     * @private
     */
    _isShiftActive() {
        return this._shiftModel.state === SHIFT_STATE.RUNNING
            || this._shiftModel.state === SHIFT_STATE.CLEARING;
    }

    /**
     * @for ShiftController
     * @method _updateStatusView
     * @param now {number}
     * @private
     */
    _updateStatusView(now) {
        if (!this._statusView) {
            return;
        }

        this._statusView.update({
            state: this._shiftModel.state,
            remainingSeconds: this._shiftModel.remainingSeconds(now)
        });
    }

    /**
     * Build the airport option list from the real, already-loaded airport data.
     *
     * @for ShiftController
     * @method _buildAirportOptions
     * @return {array<object>} `{ icao, name }`
     * @private
     */
    _buildAirportOptions() {
        return Object.values(this._airportController.airports)
            .map((airportModel) => ({ icao: airportModel.icao, name: airportModel.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
}
