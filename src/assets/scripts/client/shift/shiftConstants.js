import { TRAFFIC_MODE } from '../trafficGenerator/TrafficMode';

/**
 * Lifecycle states for a controller shift.
 *
 * - `PENDING` before a shift has been started (landing page shown)
 * - `RUNNING` while the shift clock is counting down to the scheduled end
 * - `CLEARING` once the scheduled end has passed but player-owned traffic remains
 * - `ENDED` once results have been produced (manual or automatic end)
 *
 * @enum SHIFT_STATE
 * @type {Object}
 */
export const SHIFT_STATE = Object.freeze({
    PENDING: 'pending',
    RUNNING: 'running',
    CLEARING: 'clearing',
    ENDED: 'ended'
});

/**
 * The controller position a player can work during a shift.
 *
 * @enum SHIFT_SECTOR
 * @type {Object}
 */
export const SHIFT_SECTOR = Object.freeze({
    APPROACH: 'approach',
    DEPARTURE: 'departure',
    BOTH: 'both'
});

/**
 * Maps a `SHIFT_SECTOR` onto the existing `TRAFFIC_MODE` spawn policy.
 *
 * @enum SHIFT_SECTOR_TRAFFIC_MODE
 * @type {Object}
 */
export const SHIFT_SECTOR_TRAFFIC_MODE = Object.freeze({
    [SHIFT_SECTOR.APPROACH]: TRAFFIC_MODE.ARRIVALS,
    [SHIFT_SECTOR.DEPARTURE]: TRAFFIC_MODE.DEPARTURES,
    [SHIFT_SECTOR.BOTH]: TRAFFIC_MODE.BOTH
});

/**
 * How the shift finished, recorded on the results summary.
 *
 * @enum SHIFT_END_TYPE
 * @type {Object}
 */
export const SHIFT_END_TYPE = Object.freeze({
    MANUAL: 'manual',
    AUTOMATIC: 'automatic'
});

/**
 * Selectable shift lengths, in simulation minutes.
 *
 * @constant SHIFT_LENGTH_MINUTES
 * @type {number[]}
 */
export const SHIFT_LENGTH_MINUTES = Object.freeze([30, 60]);

/**
 * The default shift length, in simulation minutes.
 *
 * @constant DEFAULT_SHIFT_LENGTH_MINUTES
 * @type {number}
 */
export const DEFAULT_SHIFT_LENGTH_MINUTES = 30;

/**
 * How many simulation seconds before the scheduled end new aircraft generation stops.
 *
 * @constant SPAWN_CUTOFF_SECONDS
 * @type {number}
 */
export const SPAWN_CUTOFF_SECONDS = 300;

/**
 * Number of simulation seconds in one minute.
 *
 * @constant SECONDS_PER_MINUTE
 * @type {number}
 */
export const SECONDS_PER_MINUTE = 60;
