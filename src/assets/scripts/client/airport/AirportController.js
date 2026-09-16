import _has from 'lodash/has';
import AirportModel from './AirportModel';
import EventBus from '../lib/EventBus';
import { EVENT } from '../constants/eventNames';
import { STORAGE_KEY } from '../constants/storageKeys';

/**
 * Responsible for maintaining references to all the available airports
 *
 * @class AirportController
 */
export class AirportControllerClass {
    /**
     * @constructor
     */
    constructor(eventBus = EventBus) {
        /**
         * @property _eventBus
         * @type {EventBus}
         */
        this._eventBus = eventBus;

        /**
         * Local reference to `window.AIRPORT_LOAD_LIST`
         *
         * This is defined in `assets/airports/airportLoadList.json`
         * This property is the only way the possible list of airports
         * makes its way into the app.
         *
         * @property _airportListToLoad
         * @type {Array<object>}
         * @default []
         */
        this._airportListToLoad = [];

        /**
         * Shared asset-loading queue injected in `init` and passed into every
         * `AirportModel` this controller creates, so all flyweights share the
         * single app-wide `ContentQueue` instance.
         *
         * @property _contentQueue
         * @type {ContentQueue}
         * @default null
         */
        this._contentQueue = null;

        /**
         * Persistence boundary injected in `init` and passed into every
         * `AirportModel` this controller creates, so the last-selected airport
         * is read and written through the single app-wide `StorageAdapter`
         * instead of a browser global.
         *
         * @property _storageAdapter
         * @type {StorageAdapter}
         * @default null
         */
        this._storageAdapter = null;

        /**
         * Shared async error reporter forwarded to every AirportModel.
         *
         * @property _reportError
         * @type {Function|null}
         * @default null
         */
        this._reportError = null;

        /**
         * Dictionary of available airports
         *
         * @property airports
         * @type {Object<string, AirportModel>}
         * @default {}
         */
        this.airports = {};

        /**
         * The current airport
         *
         * This is a mutable property that will change based on
         * the currently selected airport
         *
         * @property current
         * @type {AirportModel}
         * @default null
         */
        this.current = null;
    }

    /**
     * Lifecycle method. Should run only once on App initialiazation
     *
     * Load each airport in the `airportLoadList`
     *
     * @for AirportController
     * @method init
     * @param InitialAirportIcao {string}
     * @param initialAirportData {object}
     * @param airportLoadList {array<object>}  List of airports to load
     * @param contentQueue {ContentQueue}  Shared asset-loading queue
     * @param storageAdapter {StorageAdapter}  Shared persistence boundary
     * @param reportError {Function}  Shared async error reporter
     */
    init(initialAirportIcao, initialAirportData, airportLoadList, contentQueue, storageAdapter, reportError) {
        this._contentQueue = contentQueue;
        this._storageAdapter = storageAdapter;
        this._reportError = reportError ?? null;
        this._airportListToLoad = airportLoadList;

        for (let i = 0; i < this._airportListToLoad.length; i++) {
            const airport = this._airportListToLoad[i];

            this.airport_load(airport);
        }

        this.airport_set(initialAirportIcao, initialAirportData);
    }

    /**
     * Create a new `AirportModel` flyweight
     *
     * This will create a minimal `AirportModel` with just enough data to
     * create a valid instance. When switching airports, this model will
     * be filled in with the rest of the airport data if it does
     * not exist already
     *
     * @for AirportController
     * @method airport_load
     * @param icao {string}
     * @param level {string}
     * @param name {string}
     */
    airport_load({ icao, level, name }) {
        icao = icao.toLowerCase();

        if (this.hasAirport(icao)) {
            console.log(`${icao}: already loaded`);

            return null;
        }

        const airportModel = new AirportModel(
            { icao, level, name },
            this._contentQueue,
            this._storageAdapter,
            this._reportError,
            this._eventBus,
            this
        );

        this.airport_add(airportModel);
    }

    /**
     * Add an airport config to the `#airports` dictionary
     *
     * @for AirportController
     * @method airport_add
     * @param airport {object}
     */
    airport_add(airport) {
        this.airports[airport.icao] = airport;
    }

    /**
     * Reset the instance
     *
     * Placeholder method, currently not in use
     *
     * @for AircraftController
     * @method reset
     */
    reset() {
        this._contentQueue = null;
        this._storageAdapter = null;
        this._reportError = null;
        this._airportListToLoad = [];
        this.airports = {};
        this.current = null;
    }

    /**
     * Set a given `icao` as the `#current` airport
     *
     * @for AirportController
     * @method airport_set
     * @param icao {string}
     * @param airportJson {object} [default=null]
     */
    airport_set(icao, airportJson = null) {
        icao = this._resolveInitialIcao(icao);
        icao = icao.toLowerCase();

        if (!this.airports[icao]) {
            console.warn(`${icao}: no such airport`);

            return;
        }

        const nextAirportModel = this.airports[icao];
        this.current = nextAirportModel;

        // if loaded is true, we wont need to load any data thus the call to `onAirportChange` within the
        // success callback will never fire so we do that here.
        if (nextAirportModel.loaded) {
            this._eventBus.trigger(EVENT.AIRPORT_CHANGE, nextAirportModel.data);
        }

        nextAirportModel.set(airportJson);
    }

    /**
     * @for AirportController
     * @method getAiracCycle
     * @property airac
     * @return {number}
    */
    getAiracCycle() {
        return this.current.airac;
    }

    /**
     * Retrieve a specific `AirportModel` instance
     *
     * @for AirportController
     * @method airport_get
     * @param icao {string}
     * @return {AirportModel}
     */
    airport_get(icao) {
        if (!icao) {
            return this.current;
        }

        return this.airports[icao.toLowerCase()];
    }

    /**
     * Return the name of the `arrivalRunwayModel`.
     *
     * This should be used only in the `SpawnPatternModel` when determining initial
     * heading for arrival aircraft. We only need the name so we can properly select
     * an exit segment of a STAR.
     *
     * Sometimes route definitions do not contain enough waypoints in the entry and body
     * segments. This gives us a way to guess the runway and grab an exit segment.
     *
     * @for AirportController
     * @method getInitialArrivalRunwayName
     * @return {string}
     */
    getInitialArrivalRunwayName() {
        return this.current.arrivalRunwayModel.name;
    }

    /**
     * Resolve the `icao` to select, substituting the persisted last-selected
     * airport when no explicit `icao` is supplied.
     *
     * When a truthy `icao` is passed it is returned untouched and storage is
     * never read, preserving the short-circuit for an explicit selection. When
     * `icao` is falsy and an injected adapter is present, the value stored under
     * `STORAGE_KEY.ATC_LAST_AIRPORT` is read through the adapter. Web Storage
     * returns `null` for a missing key; browser-light fakes may return
     * `undefined`. Both are treated as "no stored airport", in which case the
     * supplied (falsy) `icao` is returned rather than fabricating a value.
     *
     * @for AirportController
     * @method _resolveInitialIcao
     * @param icao {string}
     * @return {string}
     * @private
     */
    _resolveInitialIcao(icao) {
        if (icao || !this._storageAdapter) {
            return icao;
        }

        const storedIcao = this._storageAdapter.get(STORAGE_KEY.ATC_LAST_AIRPORT);

        return storedIcao == null ? icao : storedIcao;
    }

    /**
     * Boolean helper used to determine if a given `icao` exists within `#airports`
     *
     * @for AirportController
     * @method hasAirport
     * @param icao {string}
     * @return {boolean}
     */
    hasAirport(icao) {
        return _has(this.airports, icao);
    }

    /**
     * Remove an aircraft from the queue of any `AirportModel` `RunwayModel`(s)
     *
     * @for AirportModel
     * @method removeAircraftFromAllRunwayQueues
     * @param  aircraft {AircraftModel}
     */
    removeAircraftFromAllRunwayQueues(aircraft) {
        this.current.removeAircraftFromAllRunwayQueues(aircraft.id);
    }
}

export default new AirportControllerClass();
