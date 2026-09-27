import ScheduledSpawnPatternModel from './ScheduledSpawnPatternModel';
import { resolveScheduledSpawnPlan } from './scheduledSlotMapping';

/**
 * A scheduled slot bound to a concrete airport-authored spawn pattern.
 *
 * Extends `ScheduledSpawnPatternModel` so the `SpawnScheduler` sees identical
 * timing/lifecycle behaviour (delay, cycle, pre-spawn, cutoff), while adding the
 * geometry and identity the `AircraftController` consumer reads when a slot's timer
 * fires. Rather than recomputing spawn geometry, it delegates every geometric
 * property to the chosen candidate `SpawnPatternModel`, and overlays the scheduled
 * airline/flight-number/aircraft-type identity when that identity is mappable. When
 * it is not, the slot still spawns from the same candidate as a generated flight,
 * preserving the arrival/departure category and the local pattern's own endpoints.
 *
 * The mapping is resolved once during construction and reused, so an unusable plan
 * fails before the scheduler arms any slot timers.
 *
 * @class MappedScheduledSpawnPatternModel
 * @extends ScheduledSpawnPatternModel
 */
export default class MappedScheduledSpawnPatternModel extends ScheduledSpawnPatternModel {
    /**
     * @constructor
     * @for MappedScheduledSpawnPatternModel
     * @param flight {object} normalized schedule flight
     * @param context {object} see `ScheduledSpawnPatternModel`
     * @param mappingContext {object}
     * @param mappingContext.candidatePatterns {array<SpawnPatternModel>} airport-authored patterns
     * @param mappingContext.isAirlineKnown {function} `(airlineIcao) => boolean`
     * @param mappingContext.isAircraftTypeKnown {function} `(aircraftTypeIcao) => boolean`
     */
    constructor(flight, context, mappingContext) {
        super(flight, context);

        /**
         * @property _mappingContext
         * @type {object}
         * @private
         */
        this._mappingContext = mappingContext;

        /**
         * Eagerly resolved `{ candidate, identity }` mapping.
         *
         * Resolving at construction makes an unusable selected schedule fail before
         * the scheduler can arm timers and later drop a slot in its callback.
         *
         * @property _resolvedPlan
         * @type {object}
         * @private
         */
        this._resolvedPlan = resolveScheduledSpawnPlan(this, this._mappingContext);
        this._candidatePreSpawnEnabled = false;
    }

    /**
     * The chosen candidate spawn pattern, resolved once and reused.
     *
     * @property _candidate
     * @type {SpawnPatternModel}
     * @private
     */
    get _candidate() {
        return this._plan().candidate;
    }

    get positionModel() {
        return this._candidate.positionModel;
    }

    get altitude() {
        return this._candidate.altitude;
    }

    get heading() {
        return this._candidate.heading;
    }

    get speed() {
        return this._candidate.speed;
    }

    get routeString() {
        return this._candidate.routeString;
    }

    get commands() {
        return this._candidate.commands;
    }

    get waypoints() {
        return this._candidate.waypoints;
    }

    get centerHandoffFix() {
        return this._candidate.centerHandoffFix;
    }

    /**
     * Origin label for the spawning aircraft.
     *
     * A mapped flight carries its exact scheduled origin; a generated fallback keeps
     * the local candidate pattern's own origin.
     *
     * @property origin
     * @type {string}
     */
    get origin() {
        const { identity } = this._plan();

        return identity === null ? this._candidate.origin : this.originIcao;
    }

    /**
     * Destination label for the spawning aircraft.
     *
     * @property destination
     * @type {string}
     */
    get destination() {
        const { identity } = this._plan();

        return identity === null ? this._candidate.destination : this.destinationIcao;
    }

    /**
     * Airline the consumer should spawn with.
     *
     * Mapped: the exact scheduled airline. Fallback: the candidate pattern's own
     * weighted random airline.
     *
     * @for MappedScheduledSpawnPatternModel
     * @method getRandomAirlineForSpawn
     * @return {string}
     */
    getRandomAirlineForSpawn() {
        const { identity, candidate } = this._plan();

        return identity === null ? candidate.getRandomAirlineForSpawn() : identity.airlineIcao;
    }

    /**
     * Exact scheduled identity to spawn with, or `null` for a generated fallback.
     *
     * The `AircraftController` reads this to honour the scheduled flight number and
     * aircraft type; a `null` result leaves it to generate those from the airline.
     *
     * @for MappedScheduledSpawnPatternModel
     * @method getScheduledIdentity
     * @return {object|null}
     */
    getScheduledIdentity() {
        return this._plan().identity;
    }

    /**
     * Mark this slot as the sole pre-spawn owner for its mapped local pattern.
     * The collection assigns one arrival owner per candidate so hundreds of
     * scheduled slots do not duplicate the legacy route population.
     */
    enableCandidatePreSpawn() {
        this._candidatePreSpawnEnabled = true;
    }

    /**
     * Preserve airport-authored arrival pre-spawn traffic. These aircraft are
     * generated baseline traffic, not the scheduled slot itself, so creation is
     * delegated directly to the local candidate without scheduled identity.
     */
    createPreSpawnAircraft(aircraftController) {
        if (!this._candidatePreSpawnEnabled || !this.isArrival()) {
            return;
        }

        this._candidate.createPreSpawnAircraft(aircraftController);
    }

    /**
     * Return the eagerly resolved candidate/identity mapping for this slot.
     *
     * @return {{ candidate: SpawnPatternModel, identity: object|null }}
     * @private
     */
    _plan() {
        if (this._resolvedPlan === null) {
            this._resolvedPlan = resolveScheduledSpawnPlan(this, this._mappingContext);
        }

        return this._resolvedPlan;
    }
}
