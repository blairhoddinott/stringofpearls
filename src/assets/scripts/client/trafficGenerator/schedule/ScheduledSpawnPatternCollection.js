import _filter from 'lodash/filter';
import ScheduledSpawnPatternModel from './ScheduledSpawnPatternModel';
import MappedScheduledSpawnPatternModel from './MappedScheduledSpawnPatternModel';
import {
    secondsOfDayInZone,
    selectScheduleSubset,
    DEFAULT_SCHEDULE_SUBSET_PERCENT,
    ONE_DAY_IN_SECONDS
} from './scheduleTrafficPlanUtils';
import { FLIGHT_CATEGORY } from '../../constants/aircraftConstants';
import { isEmptyOrNotObject } from '../../utilities/validatorUtilities';

const SCHEDULE_KEYS = ['schemaVersion', 'airportIcao', 'timezone', 'sampleDate', 'source', 'flights'];
const SCHEDULE_SOURCE_KEYS = ['name', 'url', 'retrievedAt', 'license', 'coverage'];

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function isRealCalendarDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value : '');

    if (match === null) {
        return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function isAbsoluteHttpUrl(value) {
    try {
        const url = new URL(value);

        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function validateScheduleSource(source) {
    if (isEmptyOrNotObject(source)) {
        throw new TypeError('scheduleDocument source must be an object.');
    }

    Object.keys(source).filter((key) => !SCHEDULE_SOURCE_KEYS.includes(key)).forEach((key) => {
        throw new TypeError(`scheduleDocument source has unsupported property ${key}.`);
    });
    SCHEDULE_SOURCE_KEYS.forEach((key) => {
        if (!isNonEmptyString(source[key])) {
            throw new TypeError(`scheduleDocument source.${key} must be a non-empty string.`);
        }
    });
    if (!isAbsoluteHttpUrl(source.url)) {
        throw new TypeError('scheduleDocument source.url must be an absolute HTTP(S) URL.');
    }
    if (!isRealCalendarDate(source.retrievedAt)) {
        throw new TypeError('scheduleDocument source.retrievedAt must be a real YYYY-MM-DD calendar date.');
    }
}

function validateScheduleDocument(scheduleDocument) {
    if (isEmptyOrNotObject(scheduleDocument) || !Array.isArray(scheduleDocument.flights)) {
        throw new TypeError('Invalid scheduleDocument passed to ScheduledSpawnPatternCollection.fromScheduleDocument.');
    }
    if (scheduleDocument.schemaVersion !== 1) {
        throw new TypeError('scheduleDocument schemaVersion must be 1.');
    }
    Object.keys(scheduleDocument).filter((key) => !SCHEDULE_KEYS.includes(key)).forEach((key) => {
        throw new TypeError(`scheduleDocument has unsupported property ${key}.`);
    });
    if (typeof scheduleDocument.airportIcao !== 'string' || !/^[A-Z]{4}$/.test(scheduleDocument.airportIcao)) {
        throw new TypeError('scheduleDocument airportIcao must contain four uppercase letters.');
    }
    if (typeof scheduleDocument.timezone !== 'string' || scheduleDocument.timezone.length === 0) {
        throw new TypeError('scheduleDocument timezone must be a non-empty IANA time zone.');
    }
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: scheduleDocument.timezone }).format(new Date(0));
    } catch {
        throw new TypeError('scheduleDocument timezone must be a valid IANA time zone.');
    }
    if (!isRealCalendarDate(scheduleDocument.sampleDate)) {
        throw new TypeError('scheduleDocument sampleDate must be a real YYYY-MM-DD calendar date.');
    }
    validateScheduleSource(scheduleDocument.source);
    if (scheduleDocument.flights.length === 0) {
        throw new TypeError('scheduleDocument flights must contain at least one flight.');
    }

    const seenIds = new Set();
    const flightKeys = [
        'id', 'category', 'scheduledTime', 'airlineIcao', 'flightNumber',
        'originIcao', 'destinationIcao', 'aircraftTypeIcao'
    ];

    let previousFlightKey = null;

    scheduleDocument.flights.forEach((flight, index) => {
        const prefix = `scheduleDocument flights[${index}]`;
        if (isEmptyOrNotObject(flight)) {
            throw new TypeError(`${prefix} must be an object.`);
        }
        if (flight.category !== FLIGHT_CATEGORY.ARRIVAL && flight.category !== FLIGHT_CATEGORY.DEPARTURE) {
            throw new TypeError(`${prefix} category must be arrival or departure.`);
        }
        ['id', 'scheduledTime', 'airlineIcao', 'flightNumber', 'originIcao', 'destinationIcao'].forEach((key) => {
            if (typeof flight[key] !== 'string' || flight[key].length === 0) {
                throw new TypeError(`${prefix} ${key} must be a non-empty string.`);
            }
        });
        if (seenIds.has(flight.id)) {
            throw new TypeError(`${prefix} has duplicate flight id ${flight.id}.`);
        }
        seenIds.add(flight.id);
        if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(flight.scheduledTime)) {
            throw new TypeError(`${prefix} scheduledTime must be local HH:mm.`);
        }
        if (!/^[a-z]{3}$/.test(flight.airlineIcao)) {
            throw new TypeError(`${prefix} airlineIcao must contain three lowercase letters.`);
        }
        if (!/^[0-9A-Za-z]+$/.test(flight.flightNumber)) {
            throw new TypeError(`${prefix} flightNumber must be alphanumeric.`);
        }
        if (!/^[A-Z]{4}$/.test(flight.originIcao) || !/^[A-Z]{4}$/.test(flight.destinationIcao)) {
            throw new TypeError(`${prefix} route endpoints must be uppercase four-letter ICAO identifiers.`);
        }
        if (flight.aircraftTypeIcao !== undefined &&
            (typeof flight.aircraftTypeIcao !== 'string' || !/^[0-9A-Z]+$/.test(flight.aircraftTypeIcao))) {
            throw new TypeError(`${prefix} aircraftTypeIcao must be uppercase alphanumeric.`);
        }
        if (flight.category === FLIGHT_CATEGORY.ARRIVAL &&
            (flight.destinationIcao !== scheduleDocument.airportIcao || flight.originIcao === scheduleDocument.airportIcao)) {
            throw new TypeError(`${prefix} arrival endpoints do not match the schedule airport.`);
        }
        if (flight.category === FLIGHT_CATEGORY.DEPARTURE &&
            (flight.originIcao !== scheduleDocument.airportIcao || flight.destinationIcao === scheduleDocument.airportIcao)) {
            throw new TypeError(`${prefix} departure endpoints do not match the schedule airport.`);
        }
        Object.keys(flight).filter((key) => !flightKeys.includes(key)).forEach((key) => {
            throw new TypeError(`${prefix} has unsupported property ${key}.`);
        });

        const currentFlightKey = `${flight.scheduledTime}\u0000${flight.id}`;
        if (previousFlightKey !== null && currentFlightKey < previousFlightKey) {
            throw new TypeError('scheduleDocument flights must be ordered by scheduledTime then id.');
        }
        previousFlightKey = currentFlightKey;
    });
}

/**
 * A schedule-backed drop-in for `SpawnPatternCollection`.
 *
 * The `SpawnScheduler` only depends on a collection exposing `spawnPatternModels`
 * and `getDepartureModelsForPreSpawn()`. This collection satisfies that contract with
 * `ScheduledSpawnPatternModel` slots derived from a normalized historical schedule,
 * so a schedule-backed airport rides the existing scheduler lifecycle without a
 * parallel generator.
 *
 * @class ScheduledSpawnPatternCollection
 */
export default class ScheduledSpawnPatternCollection {
    /**
     * @constructor
     * @for ScheduledSpawnPatternCollection
     * @param spawnPatternModels {array<ScheduledSpawnPatternModel>}
     * @param context {object}
     * @param context.airportIcao {string}
     * @param context.timezone {string}
     * @param context.subsetPercent {number}
     */
    constructor(spawnPatternModels, {
        airportIcao,
        timezone,
        subsetPercent,
        departurePreSpawnModels = []
    }) {
        this._items = spawnPatternModels;
        this._departurePreSpawnModels = departurePreSpawnModels;

        /**
         * Schedule airport ICAO this plan was built for.
         *
         * @property airportIcao
         * @type {string}
         */
        this.airportIcao = airportIcao;

        /**
         * Airport IANA time zone the schedule's local times are expressed in.
         *
         * @property timezone
         * @type {string}
         */
        this.timezone = timezone;

        /**
         * Deterministic subset density applied when building this plan.
         *
         * @property subsetPercent
         * @type {number}
         */
        this.subsetPercent = subsetPercent;
    }

    /**
     * Build a schedule-backed collection from a normalized schedule document.
     *
     * The subset is selected deterministically, and every slot is anchored to the
     * airport's local time-of-day at plan creation. The corresponding simulation-zero
     * anchor keeps repeated shifts aligned when the process-wide simulation clock is nonzero.
     *
     * @for ScheduledSpawnPatternCollection
     * @method fromScheduleDocument
     * @param scheduleDocument {object} normalized schedule (see schedule.schema.json)
     * @param options {object} [optional]
     * @param options.subsetPercent {number} one of `SCHEDULE_SUBSET_PERCENTS`; defaults to 100
     * @param options.sessionStartDate {Date} wall-clock instant at plan creation
     * @param options.simulationStartSeconds {number} simulation time at plan creation
     * @param options.mappingContext {object|null} local pattern and identity resolvers
     * @return {ScheduledSpawnPatternCollection}
     */
    static fromScheduleDocument(scheduleDocument, {
        mappingContext = null,
        subsetPercent = DEFAULT_SCHEDULE_SUBSET_PERCENT,
        sessionStartDate = new Date(),
        simulationStartSeconds = 0
    } = {}) {
        validateScheduleDocument(scheduleDocument);

        if (!Number.isFinite(simulationStartSeconds) || simulationStartSeconds < 0) {
            throw new TypeError('simulationStartSeconds must be a non-negative finite number.');
        }

        const { airportIcao, timezone } = scheduleDocument;
        const localSecondsAtPlanStart = secondsOfDayInZone(sessionStartDate, timezone);
        const zoneSecondsOfDayAtSimZero = (
            (localSecondsAtPlanStart - simulationStartSeconds) % ONE_DAY_IN_SECONDS + ONE_DAY_IN_SECONDS
        ) % ONE_DAY_IN_SECONDS;
        const selectedFlights = selectScheduleSubset(scheduleDocument.flights, subsetPercent);
        const ScheduledModel = mappingContext === null
            ? ScheduledSpawnPatternModel
            : MappedScheduledSpawnPatternModel;
        const spawnPatternModels = selectedFlights.map((flight) => new ScheduledModel(
            flight,
            { airportIcao, timezone, zoneSecondsOfDayAtSimZero },
            ...(mappingContext === null ? [] : [mappingContext])
        ));

        if (mappingContext !== null) {
            const ownedArrivalCandidates = new Set();

            spawnPatternModels
                .filter((model) => model.isArrival())
                .forEach((model) => {
                    if (ownedArrivalCandidates.has(model._candidate)) {
                        return;
                    }

                    ownedArrivalCandidates.add(model._candidate);
                    model.enableCandidatePreSpawn();
                });
        }

        return new ScheduledSpawnPatternCollection(spawnPatternModels, {
            airportIcao,
            timezone,
            subsetPercent,
            departurePreSpawnModels: mappingContext?.departurePreSpawnModels ?? []
        });
    }

    /**
     * @property spawnPatternModels
     * @type {array<ScheduledSpawnPatternModel>}
     */
    get spawnPatternModels() {
        return this._items;
    }

    /**
     * @property departureModels
     * @type {array<ScheduledSpawnPatternModel>}
     */
    get departureModels() {
        return _filter(this._items, { category: FLIGHT_CATEGORY.DEPARTURE });
    }

    /**
     * Departure pre-spawn selection.
     *
     * The scheduler calls this on session start to seed a departure ready to taxi.
     * Scheduled slots reuse the legacy collection only as authored mapping data. Its
     * bounded departure pre-spawn selection is retained here without scheduling the
     * legacy collection's random traffic loop.
     *
     * @for ScheduledSpawnPatternCollection
     * @method getDepartureModelsForPreSpawn
     * @return {array<ScheduledSpawnPatternModel>}
     */
    getDepartureModelsForPreSpawn() {
        return this._departurePreSpawnModels;
    }

    /**
     * Empty the collection.
     *
     * Mirrors `SpawnPatternCollection.reset()` so this plan can be torn down through
     * the same lifecycle when an airport changes.
     *
     * @for ScheduledSpawnPatternCollection
     * @method reset
     */
    reset() {
        this._items = [];
    }
}
