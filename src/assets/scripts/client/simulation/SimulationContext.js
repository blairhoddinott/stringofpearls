import { EventBusClass } from '../lib/EventBus';
import { AirportControllerClass } from '../airport/AirportController';
import { NavigationLibraryClass } from '../navigationLibrary/NavigationLibrary';
import { SpawnPatternCollectionClass } from '../trafficGenerator/SpawnPatternCollection';
import { SpawnSchedulerClass } from '../trafficGenerator/SpawnScheduler';
import AircraftCollection from '../aircraft/AircraftCollection';
import SimulationClock from './SimulationClock';
import SimulationGameState from './SimulationGameState';
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
     * @param options.gameState {SimulationGameState|null} [optional] session score and simulation options
     */
    constructor({
        clock = null,
        randomSource = null,
        eventBus = null,
        airportController = null,
        navigationLibrary = null,
        aircraftCollection = null,
        aircraftController = null,
        spawnPatternCollection = null,
        gameState = null
    } = {}) {
        if (gameState != null && aircraftController?._gameState != null &&
            aircraftController._gameState !== gameState) {
            throw new TypeError('aircraftController must own the supplied gameState.');
        }

        if (gameState != null && airportController?._gameState != null &&
            airportController._gameState !== gameState) {
            throw new TypeError('airportController must own the supplied gameState.');
        }

        if (clock != null && aircraftController?._clock != null &&
            aircraftController._clock !== clock) {
            throw new TypeError('aircraftController must own the supplied clock.');
        }

        if (clock != null && airportController?._clock != null &&
            airportController._clock !== clock) {
            throw new TypeError('airportController must own the supplied clock.');
        }

        if (eventBus != null && aircraftController?._eventBus != null &&
            aircraftController._eventBus !== eventBus) {
            throw new TypeError('aircraftController must own the supplied eventBus.');
        }

        if (eventBus != null && airportController?._eventBus != null &&
            airportController._eventBus !== eventBus) {
            throw new TypeError('airportController must own the supplied eventBus.');
        }

        if (aircraftController?._clock != null && airportController?._clock != null &&
            aircraftController._clock !== airportController._clock) {
            throw new TypeError('aircraftController and airportController must own the same clock.');
        }

        if (aircraftController?._eventBus != null && airportController?._eventBus != null &&
            aircraftController._eventBus !== airportController._eventBus) {
            throw new TypeError('aircraftController and airportController must own the same eventBus.');
        }

        if (aircraftController?._gameState != null && airportController?._gameState != null &&
            aircraftController._gameState !== airportController._gameState) {
            throw new TypeError('aircraftController and airportController must own the same gameState.');
        }

        if (airportController != null && aircraftController?._airportController != null &&
            aircraftController._airportController !== airportController) {
            throw new TypeError('aircraftController must own the supplied airportController.');
        }

        if (navigationLibrary != null && aircraftController?._navigationLibrary != null &&
            aircraftController._navigationLibrary !== navigationLibrary) {
            throw new TypeError('aircraftController must own the supplied navigationLibrary.');
        }

        if (aircraftCollection != null && aircraftController != null &&
            aircraftController.aircraft !== aircraftCollection) {
            throw new TypeError('aircraftController must own the supplied aircraftCollection.');
        }

        this._clock = clock ?? aircraftController?._clock ?? airportController?._clock ?? new SimulationClock();
        this._timerQueue = new SimulationTimerQueue(this._clock);
        this._randomSource = randomSource;
        this._eventBus = eventBus ?? aircraftController?._eventBus ??
            airportController?._eventBus ?? new EventBusClass();
        this._gameState = gameState ?? aircraftController?._gameState ??
            airportController?._gameState ?? new SimulationGameState();
        this._airportController = airportController ??
            aircraftController?._airportController ??
            new AirportControllerClass(this._eventBus, this._clock, this._gameState);
        this._navigationLibrary = navigationLibrary ??
            aircraftController?._navigationLibrary ??
            new NavigationLibraryClass();
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

    get gameState() {
        return this._gameState;
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

        if (this._aircraftController) {
            this._aircraftController.update();
        }

        return result;
    }

    destroy() {
        if (this._aircraftController) {
            this._aircraftController.disable();
        }

        this._eventBus.destroy();
        this._timerQueue.destroyTimers();
        this._aircraftCollection.reset();
        this._gameState.reset();
        this._spawnPatternCollection.reset();
        this._airportController.reset();
        this._navigationLibrary.reset();
    }
}
