import { FLIGHT_CATEGORY } from '../constants/aircraftConstants';

export const TRAFFIC_MODE = Object.freeze({
    ARRIVALS: 'arrivals',
    DEPARTURES: 'departures',
    BOTH: 'both'
});

export default class TrafficMode {
    constructor() {
        this._value = TRAFFIC_MODE.BOTH;
    }

    get value() {
        return this._value;
    }

    select(trafficMode) {
        if (!Object.values(TRAFFIC_MODE).includes(trafficMode)) {
            throw new RangeError(`Unknown traffic mode: ${trafficMode}`);
        }

        this._value = trafficMode;

        return trafficMode;
    }

    allows(flightCategory) {
        if (this._value === TRAFFIC_MODE.ARRIVALS) {
            return flightCategory === FLIGHT_CATEGORY.ARRIVAL;
        }

        if (this._value === TRAFFIC_MODE.DEPARTURES) {
            return flightCategory === FLIGHT_CATEGORY.DEPARTURE;
        }

        return true;
    }
}
