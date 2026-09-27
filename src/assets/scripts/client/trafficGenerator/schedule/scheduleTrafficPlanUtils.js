import { TIME } from '../../constants/globalConstants';

/**
 * Number of seconds in a 24 hour representative day.
 *
 * The historical schedule describes a single representative day that repeats
 * every 24 hours, so slot timing is computed modulo this value.
 *
 * @property ONE_DAY_IN_SECONDS
 * @type {number}
 * @final
 */
export const ONE_DAY_IN_SECONDS = 24 * TIME.ONE_HOUR_IN_SECONDS;

/**
 * Supported deterministic subset sizes, expressed as whole percentages of the
 * full representative day. Smaller subsets are strictly nested within larger
 * ones (see `selectScheduleSubset`).
 *
 * @property SCHEDULE_SUBSET_PERCENTS
 * @type {array<number>}
 * @final
 */
export const SCHEDULE_SUBSET_PERCENTS = [25, 50, 75, 100];

/**
 * Subset applied when the caller does not request a specific density.
 *
 * @property DEFAULT_SCHEDULE_SUBSET_PERCENT
 * @type {number}
 * @final
 */
export const DEFAULT_SCHEDULE_SUBSET_PERCENT = 100;

const SCHEDULED_TIME_PATTERN = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

/**
 * Convert a normalized local `HH:mm` schedule time into seconds since local midnight.
 *
 * Mirrors the `scheduledTime` contract in `assets/schedules/schedule.schema.json`
 * and fails closed on anything that does not match it.
 *
 * @function parseScheduledTimeToSecondsOfDay
 * @param scheduledTime {string} local `HH:mm`
 * @return {number} seconds since local midnight, in [0, 86340]
 */
export function parseScheduledTimeToSecondsOfDay(scheduledTime) {
    const match = SCHEDULED_TIME_PATTERN.exec(scheduledTime);

    if (match === null) {
        throw new TypeError(`Invalid scheduledTime "${scheduledTime}". Expected local HH:mm.`);
    }

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);

    return (hours * TIME.ONE_HOUR_IN_SECONDS) + (minutes * TIME.ONE_MINUTE_IN_SECONDS);
}

/**
 * Resolve a wall-clock instant to seconds-of-day within a specific IANA time zone.
 *
 * This is the seam that anchors the repeating representative day to the selected
 * airport's local time rather than the host machine's zone. It relies on
 * `Intl.DateTimeFormat`, which resolves the zone's UTC offset for the instant.
 *
 * @function secondsOfDayInZone
 * @param instant {Date} wall-clock instant
 * @param timeZone {string} IANA time zone name (e.g. `America/Los_Angeles`)
 * @return {number} seconds since local midnight in `timeZone`, in [0, 86399]
 */
export function secondsOfDayInZone(instant, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).formatToParts(instant);

    const valueByType = {};

    for (const part of parts) {
        valueByType[part.type] = part.value;
    }

    const hours = parseInt(valueByType.hour, 10);
    const minutes = parseInt(valueByType.minute, 10);
    const seconds = parseInt(valueByType.second, 10);

    return (hours * TIME.ONE_HOUR_IN_SECONDS) + (minutes * TIME.ONE_MINUTE_IN_SECONDS) + seconds;
}

/**
 * Seconds from the current simulation instant until the next occurrence of a slot.
 *
 * The representative day repeats every 24 hours. `zoneSecondsOfDayAtSimZero` is the
 * airport-local seconds-of-day that corresponds to simulation time zero; adding the
 * elapsed simulation seconds and reducing modulo one day gives the current local
 * seconds-of-day. The returned delay always lands in `(0, 86400]` so a slot that is
 * due exactly now re-arms a full day out rather than firing repeatedly.
 *
 * @function secondsUntilNextOccurrence
 * @param slotSecondsOfDay {number} local seconds-of-day of the scheduled slot
 * @param zoneSecondsOfDayAtSimZero {number} airport-local seconds-of-day at sim time 0
 * @param simNowSeconds {number} authoritative simulation time in seconds
 * @return {number} delay in seconds until the next occurrence, in (0, 86400]
 */
export function secondsUntilNextOccurrence(slotSecondsOfDay, zoneSecondsOfDayAtSimZero, simNowSeconds) {
    const localSecondsOfDayNow = ((zoneSecondsOfDayAtSimZero + simNowSeconds) % ONE_DAY_IN_SECONDS + ONE_DAY_IN_SECONDS)
        % ONE_DAY_IN_SECONDS;
    let delay = (slotSecondsOfDay - localSecondsOfDayNow) % ONE_DAY_IN_SECONDS;

    if (delay <= 0) {
        delay += ONE_DAY_IN_SECONDS;
    }

    return delay;
}

/**
 * Deterministic 32-bit FNV-1a hash of a string.
 *
 * Used to assign each flight a stable, time-independent selection rank so that
 * subsets are reproducible and spread across the representative day rather than
 * clustered at its start.
 *
 * @function fnv1aHash
 * @param value {string}
 * @return {number} unsigned 32-bit hash
 * @private
 */
function fnv1aHash(value) {
    let hash = 0x811c9dc5;

    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        // 32-bit FNV prime multiply, kept unsigned via >>> 0
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    return hash >>> 0;
}

/**
 * Select a deterministic, strictly nested subset of schedule flights.
 *
 * Every flight receives a stable rank derived from its id, and subsets are taken
 * as a prefix of that rank ordering. Because the ordering never changes, the 25%
 * subset is contained in the 50% subset, which is contained in the 75% subset, and
 * so on. The returned flights preserve the input (schedule) ordering.
 *
 * @function selectScheduleSubset
 * @param flights {array<object>} deterministically ordered schedule flights
 * @param subsetPercent {number} one of `SCHEDULE_SUBSET_PERCENTS`; defaults to 100
 * @return {array<object>} selected flights in schedule order
 */
export function selectScheduleSubset(flights, subsetPercent = DEFAULT_SCHEDULE_SUBSET_PERCENT) {
    if (!SCHEDULE_SUBSET_PERCENTS.includes(subsetPercent)) {
        throw new RangeError(
            `Invalid schedule subset percent "${subsetPercent}". Expected one of ${SCHEDULE_SUBSET_PERCENTS.join(', ')}.`
        );
    }

    if (subsetPercent === 100) {
        return flights.slice();
    }

    const rankedIds = flights
        .map((flight) => ({ id: flight.id, rank: fnv1aHash(flight.id) }))
        .sort((a, b) => (a.rank - b.rank) || (a.id < b.id ? -1 : 1));
    const selectedCount = Math.round((flights.length * subsetPercent) / 100);
    const selectedIds = new Set(rankedIds.slice(0, selectedCount).map((entry) => entry.id));

    return flights.filter((flight) => selectedIds.has(flight.id));
}
