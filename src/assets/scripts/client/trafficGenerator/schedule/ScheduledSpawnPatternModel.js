import { FLIGHT_CATEGORY } from '../../constants/aircraftConstants';
import { INVALID_NUMBER } from '../../constants/globalConstants';
import {
    parseScheduledTimeToSecondsOfDay,
    secondsUntilNextOccurrence
} from './scheduleTrafficPlanUtils';

/**
 * A single historical-schedule slot presented to the `SpawnScheduler` as a spawn pattern.
 *
 * The scheduler is category- and delay-driven: it reads `category`, calls
 * `cycleStart`, `getNextDelayValue` and `createPreSpawnAircraft`, and treats the
 * returned delay as the number of seconds until the next spawn. This model reuses
 * that authoritative boundary so schedule-backed traffic rides the existing
 * `game_timeout` lifecycle (pre-spawn, pause/timewarp, teardown, and the T-5 cutoff)
 * without a second timer loop.
 *
 * The delay is computed from the slot's local `HH:mm`, anchored to the selected
 * airport's IANA time zone, and repeats every 24 hours.
 *
 * Concrete mapped models extend this timing contract with airport-authored geometry
 * and either exact scheduled identity or a generated same-slot fallback.
 *
 * @class ScheduledSpawnPatternModel
 */
export default class ScheduledSpawnPatternModel {
    /**
     * @constructor
     * @for ScheduledSpawnPatternModel
     * @param flight {object} a normalized schedule flight (see schedule.schema.json)
     * @param context {object}
     * @param context.airportIcao {string} schedule airport ICAO
     * @param context.timezone {string} airport IANA time zone
     * @param context.zoneSecondsOfDayAtSimZero {number} airport-local seconds-of-day at sim time 0
     */
    constructor(flight, { airportIcao, timezone, zoneSecondsOfDayAtSimZero }) {
        /**
         * Stable schedule slot identity, unique within the schedule.
         *
         * @property id
         * @type {string}
         */
        this.id = flight.id;

        /**
         * One of `FLIGHT_CATEGORY` (`arrival` or `departure`).
         *
         * @property category
         * @type {string}
         */
        this.category = flight.category;

        /**
         * Local `HH:mm` of the scheduled movement.
         *
         * @property scheduledTime
         * @type {string}
         */
        this.scheduledTime = flight.scheduledTime;

        /**
         * Stable airport-authored pattern key, or null for sourced flights.
         *
         * @property spawnPatternKey
         * @type {string|null}
         */
        this.spawnPatternKey = flight.spawnPatternKey ?? null;

        /**
         * `scheduledTime` expressed as local seconds-of-day.
         *
         * @property scheduledSecondsOfDay
         * @type {number}
         */
        this.scheduledSecondsOfDay = parseScheduledTimeToSecondsOfDay(flight.scheduledTime);

        /**
         * Operating airline ICAO (lowercase).
         *
         * @property airlineIcao
         * @type {string}
         */
        this.airlineIcao = flight.airlineIcao;

        /**
         * Flight number as published in the schedule.
         *
         * @property flightNumber
         * @type {string}
         */
        this.flightNumber = flight.flightNumber;

        /**
         * Origin airport ICAO (uppercase).
         *
         * @property originIcao
         * @type {string}
         */
        this.originIcao = flight.originIcao;

        /**
         * Destination airport ICAO (uppercase).
         *
         * @property destinationIcao
         * @type {string}
         */
        this.destinationIcao = flight.destinationIcao;

        /**
         * Optional ICAO aircraft type designator; `null` when the source omits it.
         *
         * @property aircraftTypeIcao
         * @type {string|null}
         */
        this.aircraftTypeIcao = flight.aircraftTypeIcao ?? null;

        /**
         * Schedule airport ICAO the slot belongs to.
         *
         * @property airportIcao
         * @type {string}
         */
        this.airportIcao = airportIcao;

        /**
         * Airport IANA time zone the slot's local time is expressed in.
         *
         * @property timezone
         * @type {string}
         */
        this.timezone = timezone;

        /**
         * Airport-local seconds-of-day at simulation time zero, used to align the
         * repeating day to the airport's local time rather than the host zone.
         *
         * @property _zoneSecondsOfDayAtSimZero
         * @type {number}
         * @private
         */
        this._zoneSecondsOfDayAtSimZero = zoneSecondsOfDayAtSimZero;

        /**
         * Timer handle owned by the `SpawnScheduler`.
         *
         * @property scheduleId
         * @type {number}
         * @default INVALID_NUMBER
         */
        this.scheduleId = INVALID_NUMBER;

        /**
         * Base timing-only models have no pre-spawn geometry. Mapped subclasses
         * preserve the airport-authored pre-spawn lifecycle.
         *
         * @property preSpawnAircraftList
         * @type {array<object>}
         * @default []
         */
        this.preSpawnAircraftList = [];
    }

    /**
     * No-op cycle hook.
     *
     * The scheduler calls this for every pattern, but schedule slots are not cyclic:
     * their timing comes entirely from `getNextDelayValue`.
     *
     * @for ScheduledSpawnPatternModel
     * @method cycleStart
     */
    cycleStart() {}

    /**
     * Seconds until the next occurrence of this slot in the repeating representative day.
     *
     * @for ScheduledSpawnPatternModel
     * @method getNextDelayValue
     * @param simNowSeconds {number} authoritative simulation time in seconds
     * @return {number} delay in seconds, in (0, 86400]
     */
    getNextDelayValue(simNowSeconds = 0) {
        return secondsUntilNextOccurrence(
            this.scheduledSecondsOfDay,
            this._zoneSecondsOfDayAtSimZero,
            simNowSeconds
        );
    }

    /**
     * Return the remaining delay after an existing timer is reset.
     *
     * Legacy spawn patterns return a newly sampled interval from
     * `getNextDelayValue()`, so `SpawnScheduler.resetTimer()` subtracts the old
     * timer's elapsed age. Scheduled slots instead calculate their delay from
     * the authoritative current simulation time; subtracting elapsed age again
     * would move the fixed slot earlier.
     *
     * @param simNowSeconds {number} authoritative simulation time in seconds
     * @return {number} delay to the unchanged absolute schedule slot
     */
    getResetDelayValue(simNowSeconds = 0) {
        return this.getNextDelayValue(simNowSeconds);
    }

    /**
     * Whether this slot spawns airborne (arrivals) rather than on the ground.
     *
     * @for ScheduledSpawnPatternModel
     * @method isAirborneAtSpawn
     * @return {boolean}
     */
    isAirborneAtSpawn() {
        return this.isArrival();
    }

    /**
     * @for ScheduledSpawnPatternModel
     * @method isArrival
     * @return {boolean}
     */
    isArrival() {
        return this.category === FLIGHT_CATEGORY.ARRIVAL;
    }

    /**
     * @for ScheduledSpawnPatternModel
     * @method isDeparture
     * @return {boolean}
     */
    isDeparture() {
        return this.category === FLIGHT_CATEGORY.DEPARTURE;
    }

    /**
     * Pre-spawn hook invoked by the scheduler on session start.
     *
     * Timing-only models are inert; mapped subclasses override this hook.
     *
     * @for ScheduledSpawnPatternModel
     * @method createPreSpawnAircraft
     */
    createPreSpawnAircraft() {}
}
