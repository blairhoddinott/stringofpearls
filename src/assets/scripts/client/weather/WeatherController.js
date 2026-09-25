import { EVENT } from '../constants/eventNames';

const FRESH_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const STALE_OBSERVATION_AGE_MS = 90 * 60 * 1000;

export default class WeatherController {
    constructor(weatherClient, clockAdapter, scheduler, eventBus) {
        this._weatherClient = weatherClient;
        this._clockAdapter = clockAdapter;
        this._scheduler = scheduler;
        this._eventBus = eventBus;
        this._generation = 0;
        this._station = null;
        this._lastObservation = null;
        this._timer = null;
        this._onAirportChangeHandler = ({ icao }) => this.start(icao);
        this._eventBus.on(EVENT.AIRPORT_CHANGE, this._onAirportChangeHandler);
    }

    async start(station) {
        if (this._timer !== null) {
            this._scheduler.cancel(this._timer);
            this._timer = null;
        }

        this._station = station.toUpperCase();
        this._generation += 1;
        this._lastObservation = null;
        this._publish({
            station: this._station,
            status: 'loading',
            observation: null,
            usesLiveWeather: false
        });

        return this._refresh(this._generation, this._station);
    }

    destroy() {
        if (this._timer !== null) {
            this._scheduler.cancel(this._timer);
        }

        this._eventBus.off(EVENT.AIRPORT_CHANGE, this._onAirportChangeHandler);
        this._generation += 1;
        this._station = null;
        this._lastObservation = null;
        this._timer = null;
        this._weatherClient = null;
        this._clockAdapter = null;
        this._scheduler = null;
        this._onAirportChangeHandler = null;
        this._eventBus = null;
    }

    async _refresh(generation, station) {
        let observation;

        try {
            observation = await this._weatherClient.getMetar(station);
        } catch {
            if (!this._isCurrent(generation, station)) {
                return;
            }

            this._publishRetainedOrUnavailable(station);
            this._schedule(generation, station, RETRY_INTERVAL_MS);
            return;
        }

        if (!this._isCurrent(generation, station)) {
            return;
        }

        if (!observation) {
            this._publishRetainedOrUnavailable(station);
            this._schedule(generation, station, RETRY_INTERVAL_MS);
            return;
        }

        this._lastObservation = observation;

        const observationAge = this._clockAdapter.now().getTime() - Date.parse(observation.observedAt);
        const isFresh = observationAge <= STALE_OBSERVATION_AGE_MS;

        this._publish({
            station,
            status: isFresh ? 'available' : 'stale',
            observation,
            usesLiveWeather: observation.usableForSimulation
        });
        const refreshInterval = isFresh && observation.usableForSimulation
            ? FRESH_REFRESH_INTERVAL_MS
            : RETRY_INTERVAL_MS;
        this._schedule(generation, station, refreshInterval);
    }

    _isCurrent(generation, station) {
        return generation === this._generation && station === this._station;
    }

    _publishRetainedOrUnavailable(station) {
        this._publish({
            station,
            status: this._lastObservation ? 'stale' : 'unavailable',
            observation: this._lastObservation,
            usesLiveWeather: this._lastObservation?.usableForSimulation ?? false
        });
    }

    _schedule(generation, station, delay) {
        this._timer = this._scheduler.schedule(() => this._refresh(generation, station), delay);
    }

    _publish(state) {
        this._eventBus.trigger(EVENT.WEATHER_CHANGE, state);
    }
}
