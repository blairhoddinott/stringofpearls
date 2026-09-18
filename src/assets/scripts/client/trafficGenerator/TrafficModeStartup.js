export default class TrafficModeStartup {
    constructor(view, scheduler, stripView = null) {
        this._view = view;
        this._scheduler = scheduler;
        this._stripView = stripView;
    }

    start(aircraftController) {
        return this._view.show((trafficMode) => {
            this._scheduler.selectTrafficMode(trafficMode);

            if (this._stripView) {
                this._stripView.apply(trafficMode);
            }

            this._scheduler.init(aircraftController);

            return trafficMode;
        });
    }

    destroy() {
        this._view.hide();
        this._view = null;
        this._scheduler = null;
        this._stripView = null;

        return this;
    }
}
