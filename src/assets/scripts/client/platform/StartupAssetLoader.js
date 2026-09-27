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

    loadSchedules() {
        return this._assetLoader.loadJson('assets/schedules/scheduleLoadList.json')
            .then((catalog) => {
                if (!Array.isArray(catalog)) {
                    throw new TypeError('Schedule catalog must be an array.');
                }

                const seenIcaos = new Set();

                catalog.forEach((entry) => {
                    const keys = entry && typeof entry === 'object' ? Object.keys(entry).sort() : [];
                    const isValid = keys.length === 2 && keys[0] === 'file' && keys[1] === 'icao' &&
                        /^[a-z]{4}$/.test(entry.icao) && entry.file === `${entry.icao}.json` &&
                        !seenIcaos.has(entry.icao);

                    if (!isValid) {
                        throw new TypeError('Schedule catalog contains an invalid or duplicate entry.');
                    }

                    seenIcaos.add(entry.icao);
                });

                return Promise.all(catalog.map((entry) =>
                    this._assetLoader.loadJson(`assets/schedules/${entry.file}`)
                        .then((schedule) => [entry.icao, schedule])
                ));
            })
            .then((entries) => Object.fromEntries(entries));
    }

    loadInitialAssets(selectedIcao, defaultIcao) {
        return this.loadAirportWithFallback(selectedIcao, defaultIcao)
            .then(({ airport, icao }) => Promise.all([
                this.loadDefinitions(),
                this.loadSchedules()
            ]).then(([definitions, schedulesByAirport]) => ({
                airport,
                icao,
                ...definitions,
                schedulesByAirport
            })));
    }
}
