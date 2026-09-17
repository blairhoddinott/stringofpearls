import _cloneDeep from 'lodash/cloneDeep';
import { tau } from '../math/circle';
import { round } from '../math/core';
import {
    vectorize2dFromRadians,
    vscale
} from '../math/vector';
import {
    FLIGHT_PHASE,
    FLIGHT_CATEGORY
} from '../constants/aircraftConstants';
import { BASE_CANVAS_FONT } from '../constants/canvasConstants';
import { TIME } from '../constants/globalConstants';
import { km } from '../utilities/unitConverters';

export default class AircraftTargetRenderer {
    constructor(viewport, scopeModel, gameController, timeKeeper, callsignProvider) {
        this._viewport = viewport;
        this._scopeModel = scopeModel;
        this._gameController = gameController;
        this._timeKeeper = timeKeeper;
        this._callsignProvider = callsignProvider;
    }

    draw(cc, theme) {
        cc.font = BASE_CANVAS_FONT;
        cc.save();
        cc.translate(
            round(this._viewport.halfWidth),
            round(this._viewport.halfHeight)
        );

        const radarTargetModels = this._scopeModel.radarTargetCollection.items;

        for (let i = 0; i < radarTargetModels.length; i++) {
            this._drawSingleRadarTarget(cc, theme, radarTargetModels[i]);
        }

        cc.restore();
    }

    _drawSeparationIndicator(cc, theme, aircraftModel) {
        if (!this._gameController.shouldUseTrailingSeparationIndicator(aircraftModel)) {
            return;
        }

        cc.save();

        const { fms, relativePosition } = aircraftModel;
        const oppositeOfRunwayHeading = fms.arrivalRunwayModel.oppositeAngle;
        const aircraftCanvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(relativePosition);
        cc.strokeStyle = theme.RADAR_TARGET.TRAILING_SEPARATION_INDICATOR;
        cc.lineWidth = 3;

        cc.translate(...aircraftCanvasPosition);
        cc.rotate(oppositeOfRunwayHeading);
        cc.beginPath();

        const indicatorPaddingPx = 5;
        const indicatorKmInTrail = 5.556;
        const pixelsInTrail = this._viewport._translateKilometersToPixels(indicatorKmInTrail);

        cc.moveTo(-indicatorPaddingPx, -pixelsInTrail);
        cc.lineTo(indicatorPaddingPx, -pixelsInTrail);
        cc.stroke();

        cc.restore();
    }

    _drawAircraftConflictRings(cc, theme, radarTargetModel) {
        const { aircraftModel } = radarTargetModel;
        const aircraftAlerts = aircraftModel.getAlerts();
        const radiusNm = 3;

        if (!aircraftAlerts[0]) {
            return;
        }

        let strokeStyle = theme.RADAR_TARGET.RING_CONFLICT;

        if (aircraftAlerts[1]) {
            strokeStyle = theme.RADAR_TARGET.RING_VIOLATION;
        }

        cc.strokeStyle = strokeStyle;
        cc.beginPath();
        cc.arc(0, 0, this._viewport._translateKilometersToPixels(km(radiusNm)), 0, tau());
        cc.stroke();
    }

    _drawAircraftHalo(cc, theme, radarTargetModel) {
        if (!radarTargetModel.hasHalo) {
            return;
        }

        const radiusNm = radarTargetModel.haloRadius;
        cc.strokeStyle = theme.RADAR_TARGET.HALO;
        cc.beginPath();
        cc.arc(0, 0, this._viewport._translateKilometersToPixels(km(radiusNm)), 0, tau());
        cc.stroke();
    }

    _drawSingleRadarTarget(cc, theme, radarTargetModel) {
        const { aircraftModel } = radarTargetModel;

        if (!aircraftModel.isVisible()) {
            return;
        }

        cc.save();

        const callsign = this._callsignProvider();
        const match = callsign.length > 0 && aircraftModel.matchCallsign(callsign);
        let fillStyle = theme.RADAR_TARGET.HISTORY_DOT_OUTSIDE_RANGE;

        if (aircraftModel.isControllable) {
            fillStyle = theme.RADAR_TARGET.HISTORY_DOT_INSIDE_RANGE;
        }

        cc.fillStyle = fillStyle;

        const positionHistory = aircraftModel.relativePositionHistory;

        for (let i = 0; i < positionHistory.length; i++) {
            const position = aircraftModel.relativePositionHistory[i];
            const canvasPosition = this._viewport.calculatePreciseCanvasPositionFromRelativePosition(position);

            cc.beginPath();
            cc.arc(
                ...canvasPosition,
                this._viewport._translateKilometersToPixels(theme.RADAR_TARGET.HISTORY_DOT_RADIUS_KM),
                0,
                tau()
            );
            cc.closePath();
            cc.fill();
        }

        cc.restore();
        cc.save();

        if (positionHistory.length > theme.RADAR_TARGET.HISTORY_LENGTH) {
            aircraftModel.relativePositionHistory = positionHistory.slice(
                positionHistory.length - theme.RADAR_TARGET.HISTORY_LENGTH,
                positionHistory.length
            );
        }

        if (aircraftModel.isEstablishedOnCourse()) {
            this._drawSeparationIndicator(cc, theme, aircraftModel);
        }

        switch (this._gameController.game.option.getOptionByName('drawProjectedPaths')) {
            case 'always':
                this._drawAircraftFuturePath(cc, theme, aircraftModel, match);
                break;
            case 'selected':
                if (match) {
                    this._drawAircraftFuturePath(cc, theme, aircraftModel, match);
                }
                break;
            default:
                break;
        }

        const aircraftCanvasPosition = this._viewport.calculatePreciseCanvasPositionFromRelativePosition(
            aircraftModel.relativePosition
        );

        cc.translate(...aircraftCanvasPosition);
        this._drawAircraftVectorLines(cc, theme, aircraftModel);
        this._drawAircraftHalo(cc, theme, radarTargetModel);
        this._drawAircraftConflictRings(cc, theme, radarTargetModel);

        let radarTargetRadiusKm = theme.RADAR_TARGET.RADIUS_KM;

        if (match) {
            radarTargetRadiusKm = theme.RADAR_TARGET.RADIUS_SELECTED_KM;
        }

        cc.fillStyle = theme.RADAR_TARGET.RADAR_TARGET;
        cc.beginPath();
        cc.arc(0, 0, this._viewport._translateKilometersToPixels(radarTargetRadiusKm), 0, tau());
        cc.fill();
        cc.restore();
    }

    _drawAircraftVectorLines(cc, theme, aircraftModel) {
        if (aircraftModel.hit) {
            return;
        }

        cc.save();
        cc.fillStyle = theme.RADAR_TARGET.PROJECTED_TRACK_LINES;
        cc.strokeStyle = theme.RADAR_TARGET.PROJECTED_TRACK_LINES;

        const lineLengthInMinutes = this._scopeModel.ptlLength;
        const lineLengthInHours = lineLengthInMinutes * TIME.ONE_MINUTE_IN_HOURS;
        const lineLengthKm = km(aircraftModel.groundSpeed * lineLengthInHours);
        const groundTrackVector = vectorize2dFromRadians(aircraftModel.groundTrack);
        const scaledGroundTrackVector = vscale(groundTrackVector, lineLengthKm);
        const screenPositionOffsetX = this._viewport._translateKilometersToPixels(scaledGroundTrackVector[0]);
        const screenPositionOffsetY = this._viewport._translateKilometersToPixels(scaledGroundTrackVector[1]);

        cc.beginPath();
        cc.moveTo(0, 0);
        cc.lineTo(screenPositionOffsetX, -screenPositionOffsetY);
        cc.stroke();
        cc.restore();
    }

    _drawAircraftFuturePath(cc, theme, aircraftModel, selected) {
        if (aircraftModel.isTaxiing() || this._timeKeeper.simulationRate !== 1) {
            return;
        }

        let wasLocked = false;
        const futureTrack = [];
        const fmsTwin = _cloneDeep(aircraftModel.fms);
        const twin = _cloneDeep(aircraftModel);

        twin.fms = fmsTwin;
        twin.projected = true;
        this._timeKeeper.saveDeltaTimeBeforeFutureTrackCalculation();

        for (let i = 0; i < 60; i++) {
            twin.update();

            const ilsLocked = twin.isEstablishedOnCourse() && twin.fms.currentPhase === FLIGHT_PHASE.APPROACH;

            futureTrack.push([...twin.relativePosition, ilsLocked]);

            if (ilsLocked && twin.altitude < 500) {
                break;
            }
        }

        this._timeKeeper.restoreDeltaTimeAfterFutureTrackCalculation();
        cc.save();

        let strokeStyle = theme.RADAR_TARGET.PROJECTION_ARRIVAL_ALL;

        if (aircraftModel.category === FLIGHT_CATEGORY.DEPARTURE) {
            if (selected) {
                strokeStyle = theme.RADAR_TARGET.PROJECTION_DEPARTURE;
            } else {
                strokeStyle = theme.RADAR_TARGET.PROJECTION_DEPARTURE_ALL;
            }
        } else if (selected) {
            strokeStyle = theme.RADAR_TARGET.PROJECTION_ARRIVAL;
        }

        cc.strokeStyle = strokeStyle;
        cc.globalCompositeOperation = 'screen';
        cc.lineWidth = 2;
        cc.beginPath();

        for (let i = 0; i < futureTrack.length; i++) {
            const track = futureTrack[i];
            const ilsLocked = track[2];
            const trackPosition = this._viewport.calculatePreciseCanvasPositionFromRelativePosition(track);

            if (ilsLocked && !wasLocked) {
                cc.lineTo(trackPosition[0], trackPosition[1]);
                cc.stroke();
                cc.strokeStyle = theme.RADAR_TARGET.PROJECTION_ESTABLISHED_ON_APPROACH;
                cc.lineWidth = 2;
                cc.beginPath();
                cc.moveTo(trackPosition[0], trackPosition[1]);

                wasLocked = true;
                continue;
            }

            if (i === 0) {
                cc.moveTo(trackPosition[0], trackPosition[1]);
            } else {
                cc.lineTo(trackPosition[0], trackPosition[1]);
            }
        }

        cc.stroke();
        cc.restore();
    }
}
