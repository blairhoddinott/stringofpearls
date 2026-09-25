export default class WeatherClient {
    constructor(fetchWeather) {
        this._fetchWeather = fetchWeather;
    }

    async getMetar(station) {
        const normalizedStation = station.toUpperCase();
        const response = await this._fetchWeather(`/api/weather/metar/${normalizedStation}`, {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            method: 'GET'
        });

        if (!response.ok) {
            const error = new Error(`weather request failed with HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }

        const { observation } = await response.json();

        return observation;
    }
}
