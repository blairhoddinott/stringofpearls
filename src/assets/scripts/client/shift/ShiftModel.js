import { GAME_EVENTS } from '../game/gameEventConstants';
import {
    SHIFT_STATE,
    SHIFT_SECTOR_TRAFFIC_MODE,
    SHIFT_END_TYPE,
    SECONDS_PER_MINUTE,
    SPAWN_CUTOFF_SECONDS
} from './shiftConstants';

/**
 * Pure, framework-free state for a single controller shift.
 *
 * `ShiftModel` owns the shift lifecycle state machine, the chronological
 * scoring-event log, the shift statistics counters, and the immutable summary
 * DTO produced when the shift ends. It reads no globals and touches no DOM;
 * simulation time is always passed in by the orchestrating `ShiftController`,
 * keeping the model deterministic and unit-testable in isolation.
 *
 * @class ShiftModel
 */
export default class ShiftModel {
    constructor() {
        this.reset();
    }

    /**
     * The current lifecycle state.
     *
     * @property state
     * @type {string}
     */
    get state() {
        return this._state;
    }

    /**
     * The normalized shift configuration, or `null` before the shift starts.
     *
     * @property config
     * @type {object|null}
     */
    get config() {
        return this._config;
    }

    /**
     * The simulation time (seconds) at which the shift was scheduled to end.
     *
     * @property scheduledEndTime
     * @type {number}
     */
    get scheduledEndTime() {
        return this._scheduledEndTime;
    }

    /**
     * The simulation time (seconds) after which no new aircraft may be generated.
     *
     * @property cutoffTime
     * @type {number}
     */
    get cutoffTime() {
        return this._scheduledEndTime - SPAWN_CUTOFF_SECONDS;
    }

    /**
     * A defensive copy of the chronological scoring-event log.
     *
     * @property scoreEvents
     * @type {object[]}
     */
    get scoreEvents() {
        return this._scoreEvents.slice();
    }

    /**
     * How many collision-alarm activations have been recorded this shift.
     *
     * @property caAlarmCount
     * @type {number}
     */
    get caAlarmCount() {
        return this._caAlarmCount;
    }

    /**
     * How many separation-loss activations have been recorded this shift.
     *
     * @property separationLossCount
     * @type {number}
     */
    get separationLossCount() {
        return this._separationLossCount;
    }

    /**
     * How many unique player-owned aircraft have been handled this shift.
     *
     * @property uniqueAircraftHandledCount
     * @type {number}
     */
    get uniqueAircraftHandledCount() {
        return this._handledAircraftIds.size;
    }

    /**
     * How the shift ended, or `null` while it is still active.
     *
     * @property endType
     * @type {string|null}
     */
    get endType() {
        return this._endType;
    }

    /**
     * The number of player-owned aircraft remaining when the shift ended.
     *
     * @property aircraftRemaining
     * @type {number}
     */
    get aircraftRemaining() {
        return this._aircraftRemaining;
    }

    /**
     * The score captured when the shift ended.
     *
     * @property finalScore
     * @type {number}
     */
    get finalScore() {
        return this._finalScore;
    }

    /**
     * Reset every property back to a pristine, pre-shift state.
     *
     * @for ShiftModel
     * @method reset
     * @chainable
     */
    reset() {
        this._state = SHIFT_STATE.PENDING;
        this._config = null;
        this._startTime = 0;
        this._scheduledEndTime = 0;
        this._scoreEvents = [];
        this._caAlarmCount = 0;
        this._separationLossCount = 0;
        this._handledAircraftIds = new Set();
        this._endType = null;
        this._aircraftRemaining = 0;
        this._finalScore = 0;
        this._completedAtTime = 0;

        return this;
    }

    /**
     * Whether the shift is currently accumulating events (running or clearing).
     *
     * @for ShiftModel
     * @method _isActive
     * @return {boolean}
     * @private
     */
    _isActive() {
        return this._state === SHIFT_STATE.RUNNING || this._state === SHIFT_STATE.CLEARING;
    }

    /**
     * Begin a shift with the supplied configuration and simulation start time.
     *
     * @for ShiftModel
     * @method start
     * @param config {object} `{ sector, airportIcao, shiftLengthMinutes }`
     * @param startTime {number} authoritative simulation time in seconds
     * @chainable
     */
    start(config, startTime) {
        const trafficMode = SHIFT_SECTOR_TRAFFIC_MODE[config.sector];

        if (!trafficMode) {
            throw new RangeError(`Expected a known shift sector, but received '${config.sector}'`);
        }

        this._config = {
            sector: config.sector,
            trafficMode,
            airportIcao: config.airportIcao,
            shiftLengthMinutes: config.shiftLengthMinutes
        };
        this._startTime = startTime;
        this._scheduledEndTime = startTime + (config.shiftLengthMinutes * SECONDS_PER_MINUTE);
        this._state = SHIFT_STATE.RUNNING;

        return this;
    }

    /**
     * Whether the spawn cutoff time has been reached at the given simulation time.
     *
     * @for ShiftModel
     * @method isPastCutoff
     * @param now {number} authoritative simulation time in seconds
     * @return {boolean}
     */
    isPastCutoff(now) {
        return now >= this.cutoffTime;
    }

    /**
     * Whether the scheduled end time has been reached at the given simulation time.
     *
     * @for ShiftModel
     * @method isPastScheduledEnd
     * @param now {number} authoritative simulation time in seconds
     * @return {boolean}
     */
    isPastScheduledEnd(now) {
        return now >= this._scheduledEndTime;
    }

    /**
     * Simulation seconds remaining until the scheduled end, floored at zero.
     *
     * @for ShiftModel
     * @method remainingSeconds
     * @param now {number} authoritative simulation time in seconds
     * @return {number}
     */
    remainingSeconds(now) {
        return Math.max(0, this._scheduledEndTime - now);
    }

    /**
     * Simulation seconds elapsed since this shift started, floored at zero.
     *
     * @for ShiftModel
     * @method elapsedSeconds
     * @param now {number} authoritative simulation time in seconds
     * @return {number}
     */
    elapsedSeconds(now) {
        return Math.max(0, now - this._startTime);
    }

    /**
     * Append a scoring event to the chronological log.
     *
     * Ignored unless the shift is active so events cannot leak in before the
     * shift starts or after it has ended.
     *
     * @for ShiftModel
     * @method recordScoreEvent
     * @param entry {object} `{ event, description, points, simulationTime }`
     * @chainable
     */
    recordScoreEvent(entry) {
        if (!this._isActive()) {
            return this;
        }

        this._scoreEvents.push(Object.freeze({
            event: entry.event,
            description: entry.description,
            points: entry.points,
            simulationTime: entry.simulationTime
        }));

        return this;
    }

    /**
     * Record a single collision-alarm activation.
     *
     * @for ShiftModel
     * @method recordCaAlarm
     * @chainable
     */
    recordCaAlarm() {
        if (this._isActive()) {
            this._caAlarmCount += 1;
        }

        return this;
    }

    /**
     * Record a single separation-loss activation.
     *
     * @for ShiftModel
     * @method recordSeparationLoss
     * @chainable
     */
    recordSeparationLoss() {
        if (this._isActive()) {
            this._separationLossCount += 1;
        }

        return this;
    }

    /**
     * Note that a given aircraft was player-owned at some point during the shift.
     *
     * @for ShiftModel
     * @method noteHandledAircraft
     * @param aircraftId {string}
     * @chainable
     */
    noteHandledAircraft(aircraftId) {
        if (this._isActive()) {
            this._handledAircraftIds.add(aircraftId);
        }

        return this;
    }

    /**
     * Enter the clearing/overtime state once the scheduled end has passed.
     *
     * Only transitions from `RUNNING`, so it is safe to call repeatedly.
     *
     * @for ShiftModel
     * @method enterClearing
     * @chainable
     */
    enterClearing() {
        if (this._state === SHIFT_STATE.RUNNING) {
            this._state = SHIFT_STATE.CLEARING;
        }

        return this;
    }

    /**
     * End the shift manually, snapshotting the remaining player-owned aircraft.
     *
     * @for ShiftModel
     * @method completeManual
     * @param finalScore {number}
     * @param aircraftRemaining {number}
     * @param completedAtTime {number} authoritative simulation time in seconds
     * @chainable
     */
    completeManual(finalScore, aircraftRemaining, completedAtTime = this._scheduledEndTime) {
        return this._complete(SHIFT_END_TYPE.MANUAL, finalScore, aircraftRemaining, completedAtTime);
    }

    /**
     * End the shift automatically once all player-owned traffic has cleared.
     *
     * By definition no player-owned aircraft remain, so `aircraftRemaining` is zero.
     *
     * @for ShiftModel
     * @method completeAutomatic
     * @param finalScore {number}
     * @param completedAtTime {number} authoritative simulation time in seconds
     * @chainable
     */
    completeAutomatic(finalScore, completedAtTime = this._scheduledEndTime) {
        return this._complete(SHIFT_END_TYPE.AUTOMATIC, finalScore, 0, completedAtTime);
    }

    /**
     * Shared completion transition.
     *
     * @for ShiftModel
     * @method _complete
     * @param endType {string}
     * @param finalScore {number}
     * @param aircraftRemaining {number}
     * @param completedAtTime {number}
     * @chainable
     * @private
     */
    _complete(endType, finalScore, aircraftRemaining, completedAtTime) {
        this._state = SHIFT_STATE.ENDED;
        this._endType = endType;
        this._finalScore = finalScore;
        this._aircraftRemaining = aircraftRemaining;
        this._completedAtTime = completedAtTime;

        return this;
    }

    /**
     * Count how many logged scoring events match the given game-event key.
     *
     * @for ShiftModel
     * @method _countEvents
     * @param gameEvent {string}
     * @return {number}
     * @private
     */
    _countEvents(gameEvent) {
        return this._scoreEvents.filter((entry) => entry.event === gameEvent).length;
    }

    /**
     * Build an immutable, plain summary DTO describing the finished shift.
     *
     * The DTO is the boundary object handed to the leaderboard adapter and
     * rendered on the results screen. It is frozen so consumers cannot mutate
     * shared shift state.
     *
     * @for ShiftModel
     * @method buildSummaryDTO
     * @return {object}
     */
    buildSummaryDTO() {
        const uniqueAircraftHandled = this._handledAircraftIds.size;
        const scorePerAircraft = uniqueAircraftHandled > 0
            ? this._finalScore / uniqueAircraftHandled
            : null;
        const scheduledShiftDurationSeconds = this._scheduledEndTime - this._startTime;
        const elapsedShiftDurationSeconds = this.elapsedSeconds(this._completedAtTime);

        return Object.freeze({
            finalScore: this._finalScore,
            endType: this._endType,
            aircraftRemaining: this._aircraftRemaining,
            // Compatibility name retained for the initial summary contract.
            shiftDurationSeconds: scheduledShiftDurationSeconds,
            scheduledShiftDurationSeconds,
            elapsedShiftDurationSeconds,
            config: Object.freeze({ ...this._config }),
            stats: Object.freeze({
                uniqueAircraftHandled,
                arrivalsCompleted: this._countEvents(GAME_EVENTS.ARRIVAL),
                departuresHandedOff: this._countEvents(GAME_EVENTS.DEPARTURE),
                caAlarms: this._caAlarmCount,
                separationLosses: this._separationLossCount,
                collisions: this._countEvents(GAME_EVENTS.COLLISION),
                missedHandoffs: this._countEvents(GAME_EVENTS.MISSED_HANDOFF),
                aircraftRemaining: this._aircraftRemaining,
                scorePerAircraft
            }),
            scoreEvents: Object.freeze(this._scoreEvents.slice())
        });
    }
}
