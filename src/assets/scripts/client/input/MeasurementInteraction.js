import { EVENT } from '../constants/eventNames';

export default class MeasurementInteraction {
    constructor(viewport, measureTool, eventBus, aircraftController, fixCollection) {
        this._viewport = viewport;
        this._measureTool = measureTool;
        this._eventBus = eventBus;
        this._aircraftController = aircraftController;
        this._fixCollection = fixCollection;
    }

    get hasStarted() {
        return this._measureTool.hasStarted;
    }

    get isMeasuring() {
        return this._measureTool.isMeasuring;
    }

    addPoint(event, shouldReplaceLastPoint = false) {
        const mouseCanvasPosition = this._viewport.calculateCanvasPositionFromPagePosition(
            event.pageX,
            event.pageY
        );
        let relativePosition = this._viewport.calculateRelativePositionFromCanvasPosition(
            ...mouseCanvasPosition
        );

        if (event.originalEvent.shiftKey) {
            const [aircraftModel, distanceFromAircraft] = this._aircraftController.aircraft_get_nearest(
                this._viewport.calculateRelativePositionFromCanvasPosition(...mouseCanvasPosition)
            );
            const [fixModel, distanceFromFix] = this._fixCollection.getNearestFix(
                this._viewport.calculateRelativePositionFromCanvasPosition(...mouseCanvasPosition)
            );
            let distance;
            let nearestModel;

            if (distanceFromFix < distanceFromAircraft) {
                distance = distanceFromFix;
                nearestModel = fixModel;
            } else {
                distance = distanceFromAircraft;
                nearestModel = aircraftModel;
            }

            if (distance < this._viewport.translatePixelsToKilometers(50)) {
                relativePosition = nearestModel;
            }
        }

        if (this._measureTool.hasStarted && shouldReplaceLastPoint) {
            this._measureTool.updateLastPoint(relativePosition);
        } else {
            this._measureTool.addPoint(relativePosition);
        }

        this._eventBus.trigger(EVENT.MARK_SHALLOW_RENDER);
    }

    removePreviousPoint() {
        this._measureTool.removePreviousPoint();
        this._eventBus.trigger(EVENT.MARK_SHALLOW_RENDER);
    }

    reset() {
        const { hasPaths } = this._measureTool;

        this._measureTool.reset();

        if (hasPaths) {
            this._eventBus.trigger(EVENT.MARK_SHALLOW_RENDER);
        }
    }

    start() {
        if (this._measureTool.isMeasuring) {
            return;
        }

        this._measureTool.startNewPath();
    }

    stop() {
        this._measureTool.endPath();
    }
}
