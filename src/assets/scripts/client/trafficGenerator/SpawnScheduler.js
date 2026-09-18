import _forEach from 'lodash/forEach';
import SpawnPatternCollection from './SpawnPatternCollection';
import TimeKeeper from '../engine/TimeKeeper';
import GameController from '../game/GameController';
import { FLIGHT_CATEGORY } from '../constants/aircraftConstants';
import { INVALID_NUMBER } from '../constants/globalConstants';
import TrafficMode from './TrafficMode';

const LEGACY_TIMER_QUEUE = {
    scheduleTimeout: (...args) => GameController.game_timeout(...args),
    destroyTimer: (timer) => GameController.destroyTimer(timer)
};

/**
 * Used to create a game_timer for a `SpawnPatternModel` and provide
 * methods for re-creating a new timer on timer expiration.
 *
 * This is designed to be a stateless class.
 *
 * @class SpawnScheduler
 */
export class SpawnSchedulerClass {
    /**
     * @constructor
     * @for SpawnScheduler
     * @param spawnPatternCollection {SpawnPatternCollection}
     * @param clock {TimeKeeper|SimulationClock}
     * @param timerQueue {object}
     * @param aircraftController {AircraftController|null} [optional]
     * @param trafficMode {TrafficMode} [optional]
     */
    constructor(
        spawnPatternCollection = SpawnPatternCollection,
        clock = TimeKeeper,
        timerQueue = LEGACY_TIMER_QUEUE,
        aircraftController = null,
        trafficMode = new TrafficMode()
    ) {
        this._spawnPatternCollection = spawnPatternCollection;
        this._clock = clock;
        this._timerQueue = timerQueue;
        this._trafficMode = trafficMode;

        /**
         * @property _aircraftController
         * @type {AircraftController}
         * @default null
         * @private
         */
        this._aircraftController = aircraftController;
    }

    /**
     * @for SpawnScheduler
     * @method init
     * @param aircraftController {AircraftController}
     * @chainable
     */
    init(aircraftController) {
        if (typeof aircraftController === 'undefined') {
            throw new TypeError('Invalid parameter. SpawnScheduler requires aircraftController to be defined.');
        }

        this._aircraftController = aircraftController;

        this.startScheduler();

        return this;
    }

    selectTrafficMode(trafficMode) {
        return this._trafficMode.select(trafficMode);
    }

    /**
     * Starts the scheduler and prespawns departures
     *
     * @for SpawnScheduler
     * @method startScheduler
     */
    startScheduler() {
        // TODO: rename to createSchedulesWithTimer
        this.createSchedulesFromList();
        // TODO: create getter on collection to get all preSpawn including departures
        // TODO: create method `createPreSpawnDeparturesAndArrivals`
        this.createPreSpawnDepartures();
    }

    /**
     * Loop through each `SpawnPatternModel` and create a `game_timeout` for each
     *
     * @for SpawnScheduler
     * @method createSchedulesFromList
     */
    createSchedulesFromList() {
        _forEach(this._spawnPatternCollection.spawnPatternModels, (spawnPatternModel) => {
            if (!this._trafficMode.allows(spawnPatternModel.category)) {
                return;
            }

            // set the #cycleStartTime for this `spawnPatternModel` with current game time
            spawnPatternModel.cycleStart(this._clock.accumulatedDeltaTime);
            spawnPatternModel.scheduleId = this.createNextSchedule(spawnPatternModel);
            spawnPatternModel.createPreSpawnAircraft(this._aircraftController);
        });
    }

    /**
     * Loop through each airborne `SpawnPatternModel` and reset the spawned and preSpawned traffic.
     *
     * Used when resetting the traffic in the traffic settings panel.
     *
     * @for SpawnScheduler
     * @method resetAirborneTraffic
     */
    resetAirborneTraffic() {
        this._spawnPatternCollection.spawnPatternModels
            .filter((spawnPatternModel) => this._trafficMode.allows(spawnPatternModel.category))
            .filter((spawnPatternModel) => spawnPatternModel.isAirborneAtSpawn())
            .forEach((spawnPatternModel) => {
                spawnPatternModel.preSpawnAircraftList = [];
                spawnPatternModel.createPreSpawnAircraft(this._aircraftController);
                this.resetTimer(spawnPatternModel);
            });
    }

    /**
     * Send `SpawnPatternModel` objects off the the `AircraftController` to create
     * new aircraft onLoad or onAirportChange.
     *
     * When starting a session there should always be at least one departure waiting
     * to taxi. The logic for determining _which_ patterns to use, and how many,
     * is handled within the `SpawnPatternCollection`. Here we simply get the
     * result and loop through each `SpawnPatternModel`.
     *
     * @for SpawnScheduler
     * @method createPreSpawnDepartures
     */
    createPreSpawnDepartures() {
        if (!this._trafficMode.allows(FLIGHT_CATEGORY.DEPARTURE)) {
            return;
        }

        const departureModelsToPreSpawn = this._spawnPatternCollection.getDepartureModelsForPreSpawn();

        for (let i = 0; i < departureModelsToPreSpawn.length; i++) {
            const spawnPatternModel = departureModelsToPreSpawn[i];

            this._aircraftController.createAircraftWithSpawnPatternModel(spawnPatternModel);
        }
    }

    /**
     * Registers a new timeout, its callback and callback arguments with the `GameController`
     *
     * @for SpawnScheduler
     * @method createNextSchedule
     * @param spawnPatternModel {SpawnPatternModel}
     * @return {array}
     */
    createNextSchedule(spawnPatternModel) {
        const delay = spawnPatternModel.getNextDelayValue(this._clock.accumulatedDeltaTime);

        return this._createTimeout(spawnPatternModel, delay);
    }

    /**
     * Resets the timer for a specific spawn pattern
     *
     * @for SpawnScheduler
     * @method resetTimer
     * @param spawnPatternModel {SpawnPatternModel}
     */
    resetTimer(spawnPatternModel) {
        let timePassed = 0;
        const { scheduleId } = spawnPatternModel;

        if (scheduleId && scheduleId !== INVALID_NUMBER) {
            this._timerQueue.destroyTimer(spawnPatternModel.scheduleId);

            const timerStart = spawnPatternModel.scheduleId[1] - spawnPatternModel.scheduleId[3];
            timePassed = this._clock.accumulatedDeltaTime - timerStart;
            spawnPatternModel.scheduleId = null;
        }

        if (!this._trafficMode.allows(spawnPatternModel.category)) {
            return;
        }

        if (spawnPatternModel.rate <= 0) {
            return;
        }

        let nextDelay = spawnPatternModel.getNextDelayValue(this._clock.accumulatedDeltaTime);

        if (timePassed < nextDelay) {
            nextDelay -= timePassed;
        } else {
            this._aircraftController.createAircraftWithSpawnPatternModel(spawnPatternModel);
        }

        spawnPatternModel.scheduleId = this._createTimeout(spawnPatternModel, nextDelay);
    }

    /**
     * Registers a new timeout, its callback and callback arguments with the `GameController`
     *
     * @for SpawnScheduler
     * @method _createTimeout
     * @param spawnPatternModel {SpawnPatternModel}
     * @param delay {number} time in seconds
     * @return {array}
     */
    _createTimeout(spawnPatternModel, delay) {
        return this._timerQueue.scheduleTimeout(
            this.createAircraftAndRegisterNextTimeout,
            // lifespan of timeout
            delay,
            // passing null only to match existing api
            null,
            // arguments sent to callback as it's first parameter. using array so multiple arg can be sent
            [spawnPatternModel, this._aircraftController]
        );
    }

    /**
     * Method sent to `game_timeout` as the callback
     *
     * When fired, this method will call `createAircraftWithSpawnPatternModel` and then
     * create a new time by calling `createNextSchedule`. Doing so will also result
     * in calculating a new delay period.
     *
     * Accepts two arguments; `spawnPattern` and `aircraftController`.
     *
     * @for SpawnScheduler
     * @method createAircraftAndRegisterNextTimeout
     * @param args {*[]}
     */
    createAircraftAndRegisterNextTimeout = (...args) => {
        const spawnPatternModel = args[0][0];
        const aircraftController = args[0][1];

        if (!this._trafficMode.allows(spawnPatternModel.category)) {
            spawnPatternModel.scheduleId = null;

            return;
        }

        aircraftController.createAircraftWithSpawnPatternModel(spawnPatternModel);

        spawnPatternModel.scheduleId = this.createNextSchedule(spawnPatternModel);
    };
}


export default new SpawnSchedulerClass();
