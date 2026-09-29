/**
 * Derives the *live* normalization context consumed by
 * {@link AviationCommandNormalizer} at recognition time.
 *
 * The provider is a thin, injected adapter over the app's authoritative
 * singletons — the aircraft controller, the navigation library, and the airport
 * controller. It reads their public surface on *every* call (never caches), so
 * the transcript is always normalized against exactly the aircraft, fixes, and
 * runways that are live at the moment recognition completes. It references no
 * browser globals and holds no state of its own.
 *
 * It deliberately fails *open to empty*: a missing or half-initialised
 * singleton (for example between airport changes) yields an empty array rather
 * than throwing, and empty context simply makes the normalizer reject the
 * transcript — the fail-closed outcome we want.
 *
 * @class VoiceCommandContextProvider
 */
export default class VoiceCommandContextProvider {
    /**
     * @constructor
     * @param dependencies {object}
     * @param dependencies.aircraftController {object}  exposes `aircraft.list`
     * @param dependencies.navigationLibrary {object}  exposes `realFixes`
     * @param dependencies.airportController {object}  exposes `airport_get()`
     */
    constructor({ aircraftController, navigationLibrary, airportController } = {}) {
        this._aircraftController = aircraftController;
        this._navigationLibrary = navigationLibrary;
        this._airportController = airportController;
    }

    /**
     * Build the normalization context from current live state.
     *
     * @for VoiceCommandContextProvider
     * @method getContext
     * @return {object}  `{ activeAircraft, fixes, runways }`
     */
    getContext() {
        return {
            activeAircraft: this._readActiveAircraft(),
            fixes: this._readFixes(),
            runways: this._readRunways()
        };
    }

    /**
     * @for VoiceCommandContextProvider
     * @method _readActiveAircraft
     * @return {array<object>}
     * @private
     */
    _readActiveAircraft() {
        const list = this._aircraftController
            && this._aircraftController.aircraft
            && this._aircraftController.aircraft.list;

        if (!Array.isArray(list)) {
            return [];
        }

        return list
            .filter((aircraft) => aircraft !== null && typeof aircraft === 'object')
            .map((aircraft) => ({
                commandCallsign: aircraft.callsign,
                airlineCallsign: aircraft.airlineCallsign,
                flightNumber: aircraft.flightNumber
            }));
    }

    /**
     * @for VoiceCommandContextProvider
     * @method _readFixes
     * @return {array<string>}
     * @private
     */
    _readFixes() {
        if (this._navigationLibrary === null || typeof this._navigationLibrary !== 'object') {
            return [];
        }

        let realFixes;

        try {
            realFixes = this._navigationLibrary.realFixes;
        } catch {
            // navigation library not yet initialised for the current airport
            return [];
        }

        if (!Array.isArray(realFixes)) {
            return [];
        }

        if (!realFixes.every((fix) => fix !== null && typeof fix === 'object' && typeof fix.name === 'string')) {
            return [];
        }

        return realFixes.map((fix) => fix.name);
    }

    /**
     * @for VoiceCommandContextProvider
     * @method _readRunways
     * @return {array<string>}
     * @private
     */
    _readRunways() {
        if (this._airportController === null || typeof this._airportController !== 'object') {
            return [];
        }

        let airport;

        try {
            airport = this._airportController.airport_get();
        } catch {
            return [];
        }

        if (!airport || !Array.isArray(airport.runways)) {
            return [];
        }

        if (!airport.runways.every((pair) => Array.isArray(pair))) {
            return [];
        }

        // `AirportModel.runways` returns runway ends chunked into pairs; flatten
        // back to a single list of runway-end names via public accessors only.
        const runwayEnds = airport.runways.reduce((ends, pair) => ends.concat(pair), []);

        if (!runwayEnds.every((runway) => runway !== null
            && typeof runway === 'object'
            && typeof runway.name === 'string')) {
            return [];
        }

        return runwayEnds.map((runway) => runway.name);
    }
}
