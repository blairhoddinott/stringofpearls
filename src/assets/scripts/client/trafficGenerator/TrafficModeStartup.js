export default class TrafficModeStartup {
    constructor(view, scheduler) {
        this._view = view;
        this._scheduler = scheduler;
    }

    start(aircraftController) {
        return this._view.show((trafficMode) => {
            this._scheduler.selectTrafficMode(trafficMode);
            this._scheduler.init(aircraftController);

            return trafficMode;
        });
    }

    destroy() {
        this._view.hide();
        this._view = null;
        this._scheduler = null;

        return this;
    }
}
