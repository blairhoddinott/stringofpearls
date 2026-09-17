import { round } from '../math/core';

/**
 * Draws airport runway bodies, extended centerlines, and labels.
 *
 * The renderer owns no mutable presentation state. Callers supply the current
 * draw flags and theme for each static frame, while the exact viewport and
 * airport-model provider identities are retained at construction.
 */
export default class AirportRunwayRenderer {
    /**
     * @param viewport {CanvasStageModel} coordinate and scale owner
     * @param airportModelProvider {Function} returns the current AirportModel
     */
    constructor(viewport, airportModelProvider) {
        this._viewport = viewport;
        this._airportModelProvider = airportModelProvider;
    }

    /**
     * Draw runway bodies and extended centerlines.
     *
     * @param cc {CanvasRenderingContext2D}
     * @param shouldDrawFixLabels {boolean}
     * @param theme {object}
     * @returns {undefined}
     */
    drawRunways(cc, shouldDrawFixLabels, theme) {
        if (!shouldDrawFixLabels) {
            return;
        }

        cc.save();
        this._translateToAirportCenter(cc);
        cc.font = '11px monoOne, monospace';
        cc.strokeStyle = theme.SCOPE.RUNWAY;
        cc.fillStyle = theme.SCOPE.RUNWAY;
        cc.lineWidth = 4;

        const airportModel = this._airportModelProvider();

        for (let i = 0; i < airportModel.runways.length; i++) {
            this._drawSingleRunway(cc, airportModel.runways[i][0], true, theme);
            this._drawSingleRunway(cc, airportModel.runways[i][1], true, theme);
        }

        for (let i = 0; i < airportModel.runways.length; i++) {
            this._drawSingleRunway(cc, airportModel.runways[i][0], false, theme);
        }

        cc.restore();
    }

    /**
     * Draw both reciprocal runway labels for every runway pair.
     *
     * @param cc {CanvasRenderingContext2D}
     * @param shouldDrawFixLabels {boolean}
     * @param theme {object}
     * @returns {undefined}
     */
    drawRunwayLabels(cc, shouldDrawFixLabels, theme) {
        if (!shouldDrawFixLabels) {
            return;
        }

        const airportModel = this._airportModelProvider();

        cc.save();
        this._translateToAirportCenter(cc);
        cc.fillStyle = theme.SCOPE.RUNWAY_LABELS;

        for (let i = 0; i < airportModel.runways.length; i++) {
            this._drawRunwayLabel(cc, airportModel.runways[i][0]);
            this._drawRunwayLabel(cc, airportModel.runways[i][1]);
        }

        cc.restore();
    }

    _drawRunwayLabel(cc, runwayModel) {
        const length = round(this._viewport._translateKilometersToPixels(runwayModel.length / 2)) + 0.5;
        const { angle, relativePosition } = runwayModel;
        const runwayCanvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(relativePosition);
        const textHeight = 14;

        cc.save();
        cc.textAlign = 'center';
        cc.textBaseline = 'middle';
        cc.translate(...runwayCanvasPosition);
        cc.rotate(angle);
        cc.translate(0, length + textHeight);
        cc.rotate(-angle);
        cc.fillText(runwayModel.name, 0, 0);
        cc.restore();
    }

    _drawSingleRunway(cc, runwayModel, mode, theme) {
        const runwayLength = round(this._viewport._translateKilometersToPixels(runwayModel.length / 2)) * -2;
        const { angle, relativePosition } = runwayModel;
        const runwayCanvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(relativePosition);

        cc.save();
        cc.translate(...runwayCanvasPosition);
        cc.rotate(angle);

        if (!mode) {
            cc.strokeStyle = '#899';
            cc.lineWidth = 2.8;
            cc.beginPath();
            cc.moveTo(0, 0);
            cc.lineTo(0, runwayLength);
            cc.stroke();
        } else {
            if (!runwayModel.ils.enabled) {
                cc.restore();

                return;
            }

            cc.strokeStyle = theme.SCOPE.RUNWAY_EXTENDED_CENTERLINE;
            cc.lineWidth = 1;
            cc.beginPath();
            cc.moveTo(0, 0);
            cc.lineTo(0, this._viewport._translateKilometersToPixels(runwayModel.ils.loc_maxDist));
            cc.stroke();
        }

        cc.restore();
    }

    _translateToAirportCenter(cc) {
        cc.translate(
            round(this._viewport.halfWidth),
            round(this._viewport.halfHeight)
        );
    }
}
