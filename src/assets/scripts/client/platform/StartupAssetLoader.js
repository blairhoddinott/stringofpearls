export default class StartupAssetLoader {
    constructor(assetLoader) {
        this._assetLoader = assetLoader;
    }

    loadAirportList() {
        return this._assetLoader.loadJson('assets/airports/airportLoadList.json');
    }

    loadAirport(icao) {
        return this._assetLoader.loadJson(`assets/airports/${icao.toLowerCase()}.json`);
    }

    loadAirportWithFallback(selectedIcao, defaultIcao) {
        const normalizedSelectedIcao = selectedIcao.toLowerCase();
        const normalizedDefaultIcao = defaultIcao.toLowerCase();

        return this.loadAirport(normalizedSelectedIcao).then(
            (airport) => ({ airport, icao: normalizedSelectedIcao }),
            () => this.loadAirport(normalizedDefaultIcao)
                .then((airport) => ({ airport, icao: normalizedDefaultIcao }))
        );
    }

    loadDefinitions() {
        return Promise.all([
            this._assetLoader.loadJson('assets/airlines/airlines.json'),
            this._assetLoader.loadJson('assets/aircraft/aircraft.json'),
            this._assetLoader.loadJson('assets/guides/guides.json')
        ]).then(([airlinePayload, aircraftPayload, guides]) => ({
            aircraft: aircraftPayload.aircraft,
            airlines: airlinePayload.airlines,
            guides
        }));
    }

    loadInitialAssets(selectedIcao, defaultIcao) {
        return this.loadAirportWithFallback(selectedIcao, defaultIcao)
            .then(({ airport, icao }) => this.loadDefinitions()
                .then((definitions) => ({ airport, icao, ...definitions })));
    }
}
