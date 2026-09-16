import { EventBusClass } from '../lib/EventBus';
import { AirportControllerClass } from '../airport/AirportController';
import { NavigationLibraryClass } from '../navigationLibrary/NavigationLibrary';
import { SpawnPatternCollectionClass } from '../trafficGenerator/SpawnPatternCollection';
import { SpawnSchedulerClass } from '../trafficGenerator/SpawnScheduler';
import AircraftCollection from '../aircraft/AircraftCollection';
import SimulationClock from './SimulationClock';
import SimulationTimerQueue from './SimulationTimerQueue';

/**
 * Owns the mutable domain services for one simulation session.
 *
 * Phase 4 migrates those services incrementally. The initial context establishes
 * per-session event dispatch while retaining explicit seams for the session clock
 * and random source.
 *
 * @class SimulationContext
 */
export default class SimulationContext {
    /**
     * @constructor
     * @param options {object} [optional]
     * @param options.clock {*} [optional] session clock
     * @param options.randomSource {RandomSource|null} [optional] session random source
     * @param options.eventBus {EventBus|null} [optional] session event bus; a fresh instance is created when nullish
     * @param options.airportController {AirportController|null} [optional] session airport registry; a fresh instance is created when nullish
     * @param options.navigationLibrary {NavigationLibrary|null} [optional] session navigation state; a fresh instance is created when nullish
     * @param options.aircraftCollection {AircraftCollection|null} [optional] session aircraft state; a fresh instance is created when nullish
     * @param options.aircraftController {AircraftController|null} [optional] session aircraft behavior
     * @param options.spawnPatternCollection {SpawnPatternCollection|null} [optional] session traffic patterns
     */
    constructor({
        clock = null,
        randomSource = null,
        eventBus = null,
        airportController = null,
        navigationLibrary = null,
        aircraftCollection = null,
        aircraftController = null,
        spawnPatternCollection = null
    } = {}) {
        if (aircraftCollection != null && aircraftController != null &&
            aircraftController.aircraft !== aircraftCollection) {
            throw new TypeError('aircraftController must own the supplied aircraftCollection.');
        }

        this._clock = clock ?? new SimulationClock();
        this._timerQueue = new SimulationTimerQueue(this._clock);
        this._randomSource = randomSource;
        this._eventBus = eventBus ?? new EventBusClass();
        this._airportController = airportController ?? new AirportControllerClass(this._eventBus);
        this._navigationLibrary = navigationLibrary ?? new NavigationLibraryClass();
        this._aircraftCollection = aircraftCollection ?? aircraftController?.aircraft ?? new AircraftCollection();
        this._aircraftController = aircraftController;
        this._spawnPatternCollection = spawnPatternCollection ?? new SpawnPatternCollectionClass(
            this._navigationLibrary,
            this._airportController
        );

        if (spawnPatternCollection == null) {
            this._spawnPatternCollection.initRandomSource(this._randomSource);
        }

        this._spawnScheduler = new SpawnSchedulerClass(
            this._spawnPatternCollection,
            this._clock,
            this._timerQueue,
            this._aircraftController
        );

        if (navigationLibrary == null) {
            this._navigationLibrary.initRandomSource(this._randomSource);
        }
    }

    get clock() {
        return this._clock;
    }

    get timerQueue() {
        return this._timerQueue;
    }

    get randomSource() {
        return this._randomSource;
    }

    get eventBus() {
        return this._eventBus;
    }

    get airportController() {
        return this._airportController;
    }

    get navigationLibrary() {
        return this._navigationLibrary;
    }

    get aircraftCollection() {
        return this._aircraftCollection;
    }

    get aircraftController() {
        return this._aircraftController;
    }

    get spawnPatternCollection() {
        return this._spawnPatternCollection;
    }

    get spawnScheduler() {
        return this._spawnScheduler;
    }

    tick(delta) {
        const result = this._clock.tick(delta);

        this._timerQueue.update();

        return result;
    }

    destroy() {
        if (this._aircraftController) {
            this._aircraftController.disable();
        }

        this._eventBus.destroy();
        this._timerQueue.destroyTimers();
        this._aircraftCollection.reset();
        this._spawnPatternCollection.reset();
        this._airportController.reset();
        this._navigationLibrary.reset();
    }
}
