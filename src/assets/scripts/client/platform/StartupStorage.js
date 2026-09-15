import _isNil from 'lodash/isNil';
import _lowerCase from 'lodash/lowerCase';
import { DEFAULT_AIRPORT_ICAO } from '../constants/airportConstants';
import { STORAGE_KEY } from '../constants/storageKeys';

/**
 * Pure startup storage service.
 *
 * Chooses the initial airport for App startup from an already-filtered airport
 * load list, reading the previously selected airport through an injected
 * `StorageAdapter` and falling back to `DEFAULT_AIRPORT_ICAO`.
 *
 * @class StartupStorage
 */
export default class StartupStorage {
    /**
     * @constructor
     * @param storageAdapter {StorageAdapter}
     */
    constructor(storageAdapter) {
        this._storageAdapter = storageAdapter;
    }

    /**
     * Choose the ICAO for the initial airport to load.
     *
     * Reads the stored ICAO and accepts it only when it is non-null/undefined
     * and exactly matches an `airport.icao` in the provided list, returning it
     * normalized with the same lowercase behavior App historically used.
     * Otherwise the `DEFAULT_AIRPORT_ICAO` is returned. Invalid storage is left
     * untouched.
     *
     * @for StartupStorage
     * @method getInitialAirport
     * @param airportLoadList {array<object>}  Already-filtered list of airports to load
     * @return {string}  ICAO of the initial airport
     */
    getInitialAirport(airportLoadList) {
        const storedIcao = this._storageAdapter.get(STORAGE_KEY.ATC_LAST_AIRPORT);

        if (this._isAirportIcaoInLoadList(storedIcao, airportLoadList)) {
            return _lowerCase(storedIcao);
        }

        return DEFAULT_AIRPORT_ICAO;
    }

    /**
     * Check if a given icao exists in the list of available airports.
     *
     * @for StartupStorage
     * @method _isAirportIcaoInLoadList
     * @param icao {string}
     * @param airportLoadList {array<object>}  List of available airports
     * @return {boolean}
     * @private
     */
    _isAirportIcaoInLoadList(icao, airportLoadList) {
        return !_isNil(icao) && airportLoadList.some((airport) => airport.icao === icao);
    }
}
