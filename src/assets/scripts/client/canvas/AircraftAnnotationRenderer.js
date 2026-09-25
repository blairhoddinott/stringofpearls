import _filter from 'lodash/filter';
import _inRange from 'lodash/inRange';
import { round } from '../math/core';
import {
    positive_intersection_with_rect,
    vectorize2dFromDegrees,
    vadd,
    vscale
} from '../math/vector';
import { BASE_CANVAS_FONT } from '../constants/canvasConstants';
import { FLIGHT_CATEGORY } from '../constants/aircraftConstants';
import { INVALID_NUMBER } from '../constants/globalConstants';
import { degreesToRadians } from '../utilities/unitConverters';

export default class AircraftAnnotationRenderer {
    constructor(viewport, scopeModel, aircraftController, gameController, timeKeeper, callsignProvider) {
        this._viewport = viewport;
        this._scopeModel = scopeModel;
        this._aircraftController = aircraftController;
        this._gameController = gameController;
        this._timeKeeper = timeKeeper;
        this._callsignProvider = callsignProvider;
    }

    drawCompass(cc, theme) {
        if (this._gameController.game_paused()) {
            return;
        }

        const callsign = this._callsignProvider().toUpperCase();

        if (callsign.length === 0) {
            return;
        }

        const aircraft = _filter(this._aircraftController.aircraft.list, (candidate) => {
            return candidate.matchCallsign(callsign) && candidate.isVisible();
        })[0];

        if (!aircraft) {
            return;
        }

        const canvasOrigin = [0, 0];
        const canvasSize = [this._viewport.width, this._viewport.height];
        const aircraftPosition = this._toCanvasPosition(aircraft.relativePosition);

        cc.save();
        cc.strokeStyle = theme.SCOPE.COMPASS_HASH;
        cc.fillStyle = theme.SCOPE.COMPASS_TEXT;
        cc.textAlign = 'center';
        cc.textBaseline = 'middle';

        for (let heading = 1; heading <= 360; heading++) {
            const rayUnitVector = vectorize2dFromDegrees(heading);

            rayUnitVector[1] = -rayUnitVector[1];

            const intersection = positive_intersection_with_rect(
                aircraftPosition,
                rayUnitVector,
                canvasOrigin,
                canvasSize
            );

            if (!intersection) {
                continue;
            }

            let markLen = 8;

            if (heading % 5 === 0) {
                markLen = heading % 10 === 0 ? 16 : 12;
            }

            const markWeight = heading % 30 === 0 ? 2 : 1;
            const markVector = vscale(rayUnitVector, -markLen);
            const markStartPoint = intersection;
            const markEndPoint = vadd(markStartPoint, markVector);

            cc.lineWidth = markWeight;
            cc.beginPath();
            cc.moveTo(...markStartPoint);
            cc.lineTo(...markEndPoint);
            cc.stroke();

            if (heading % 10 !== 0) {
                continue;
            }

            cc.font = heading % 30 === 0 ?
                'bold 10px monoOne, monospace' :
                BASE_CANVAS_FONT;

            const text = `${String(heading).padStart(3, '0')}`;
            const textWidth = cc.measureText(text).width;

            cc.fillText(
                text,
                markEndPoint[0] - rayUnitVector[0] * (textWidth / 2 + 4),
                markEndPoint[1] - rayUnitVector[1] * 7
            );
        }

        cc.restore();
    }

    drawDataBlocks(cc, theme) {
        const radarTargetModels = this._scopeModel.radarTargetCollection.items;

        cc.save();
        cc.translate(
            round(this._viewport.halfWidth),
            round(this._viewport.halfHeight)
        );

        for (let i = 0; i < radarTargetModels.length; i++) {
            this._drawSingleDataBlock(cc, theme, radarTargetModels[i]);
        }

        cc.restore();
    }

    _drawSingleDataBlock(cc, theme, radarTargetModel) {
        const { aircraftModel } = radarTargetModel;

        if (!aircraftModel.isVisible() || aircraftModel.hit || !this._isDataBlockVisible(radarTargetModel)) {
            return;
        }

        cc.save();

        const paddingLR = 5;
        const callsign = this._callsignProvider();
        const match = callsign.length > 0 && aircraftModel.matchCallsign(callsign);
        let white = aircraftModel.isControllable ?
            theme.DATA_BLOCK.TEXT_IN_RANGE :
            theme.DATA_BLOCK.TEXT_OUT_OF_RANGE;

        if (match) {
            white = theme.DATA_BLOCK.TEXT_SELECTED;
        }

        cc.textBaseline = 'middle';

        let { dataBlockLeaderDirection } = radarTargetModel;

        if (dataBlockLeaderDirection === INVALID_NUMBER) {
            dataBlockLeaderDirection = theme.DATA_BLOCK.LEADER_DIRECTION;
        }

        let offsetComponent = [
            Math.sin(degreesToRadians(dataBlockLeaderDirection)),
            -Math.cos(degreesToRadians(dataBlockLeaderDirection))
        ];

        if (dataBlockLeaderDirection === 'ctr') {
            offsetComponent = [0, 0];
        }

        const radarTargetPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(
            aircraftModel.relativePosition
        );
        const leaderLength = this._calculateLeaderLength(theme, radarTargetModel.dataBlockLeaderLength);
        const leaderStart = [
            radarTargetPosition[0] + (offsetComponent[0] * theme.DATA_BLOCK.LEADER_PADDING_FROM_TARGET_PX),
            radarTargetPosition[1] + (offsetComponent[1] * theme.DATA_BLOCK.LEADER_PADDING_FROM_TARGET_PX)
        ];
        const leaderEnd = [
            radarTargetPosition[0] + offsetComponent[0] * (leaderLength - theme.DATA_BLOCK.LEADER_PADDING_FROM_BLOCK_PX),
            radarTargetPosition[1] + offsetComponent[1] * (leaderLength - theme.DATA_BLOCK.LEADER_PADDING_FROM_BLOCK_PX)
        ];
        const leaderIntersectionWithBlock = [
            radarTargetPosition[0] + offsetComponent[0] * leaderLength,
            radarTargetPosition[1] + offsetComponent[1] * leaderLength
        ];

        cc.beginPath();
        cc.moveTo(...leaderStart);
        cc.lineTo(...leaderEnd);
        cc.strokeStyle = white;
        cc.stroke();

        const dataBlockCenterCanvasPosition = radarTargetModel.calculateDataBlockCenter(leaderIntersectionWithBlock);

        cc.translate(...dataBlockCenterCanvasPosition);
        this._drawLegacyDataBlock(cc, theme, aircraftModel);

        const gap = 3;
        const lineheight = 4.5;
        const row1text = radarTargetModel.buildDataBlockRowOne(
            this._isControllerIdentifierVisible(radarTargetModel)
        );
        let row2text = radarTargetModel.buildDataBlockRowTwoPrimaryInfo();

        if (this._shouldShowSecondaryDataBlock()) {
            row2text = radarTargetModel.buildDataBlockRowTwoSecondaryInfo();
        }

        const fillStyle = aircraftModel.isControllable ?
            theme.DATA_BLOCK.TEXT_IN_RANGE :
            theme.DATA_BLOCK.TEXT_OUT_OF_RANGE;

        cc.fillStyle = fillStyle;
        cc.font = theme.DATA_BLOCK.TEXT_FONT;
        cc.textAlign = 'left';
        cc.fillText(row1text, -theme.DATA_BLOCK.HALF_WIDTH + paddingLR, -gap / 2 - lineheight);
        cc.fillText(row2text, -theme.DATA_BLOCK.HALF_WIDTH + paddingLR, gap / 2 + lineheight);
        cc.font = BASE_CANVAS_FONT;
        cc.restore();
    }

    _drawLegacyDataBlock(cc, theme, aircraftModel) {
        if (!theme.DATA_BLOCK.HAS_FILL) {
            return;
        }

        const width = theme.DATA_BLOCK.WIDTH;
        const halfWidth = theme.DATA_BLOCK.HALF_WIDTH;
        const height = theme.DATA_BLOCK.HEIGHT;
        const halfHeight = theme.DATA_BLOCK.HALF_HEIGHT;
        const barWidth = 3;
        const barHalfWidth = barWidth / 2;
        const lockSize = height / 3;
        const lockOffset = lockSize / 8;
        const point1 = lockSize - barHalfWidth;
        const a = point1 - lockOffset;
        const b = barHalfWidth;
        const clippingMaskAngle = Math.atan(b / a);
        const piSlice = Math.PI / 24;
        const callsign = this._callsignProvider();
        const match = callsign.length > 0 && aircraftModel.matchCallsign(callsign);
        let red = theme.DATA_BLOCK.ARRIVAL_BAR_OUT_OF_RANGE;
        let green = theme.DATA_BLOCK.BACKGROUND_OUT_OF_RANGE;
        let blue = theme.DATA_BLOCK.DEPARTURE_BAR_OUT_OF_RANGE;
        let white = theme.DATA_BLOCK.TEXT_OUT_OF_RANGE;

        if (aircraftModel.isControllable) {
            red = theme.DATA_BLOCK.ARRIVAL_BAR_IN_RANGE;
            green = theme.DATA_BLOCK.BACKGROUND_IN_RANGE;
            blue = theme.DATA_BLOCK.DEPARTURE_BAR_IN_RANGE;
            white = theme.DATA_BLOCK.TEXT_IN_RANGE;

            if (match) {
                red = theme.DATA_BLOCK.ARRIVAL_BAR_SELECTED;
                green = theme.DATA_BLOCK.BACKGROUND_SELECTED;
                blue = theme.DATA_BLOCK.DEPARTURE_BAR_SELECTED;
                white = theme.DATA_BLOCK.TEXT_SELECTED;
            }
        }

        if (!aircraftModel.pilot.hasApproachClearance && theme.DATA_BLOCK.HAS_FILL) {
            cc.fillStyle = green;
            cc.fillRect(-halfWidth, -halfHeight, width, height);
            cc.fillStyle = (aircraftModel.category === FLIGHT_CATEGORY.DEPARTURE) ? blue : red;
            cc.fillRect(-halfWidth - barWidth, -halfHeight, barWidth, height);

            return;
        }

        cc.save();
        cc.fillStyle = green;
        cc.beginPath();
        cc.moveTo(-halfWidth, halfHeight);
        cc.lineTo(halfWidth, halfHeight);
        cc.lineTo(halfWidth, -halfHeight);
        cc.lineTo(-halfWidth, -halfHeight);
        cc.lineTo(-halfWidth, -point1);
        cc.arc(
            -halfWidth - barHalfWidth,
            -lockOffset,
            lockSize / 2 + barHalfWidth,
            clippingMaskAngle - Math.PI / 2,
            0
        );
        cc.lineTo(-halfWidth + lockSize / 2, lockOffset);
        cc.arc(
            -halfWidth - barHalfWidth,
            lockOffset,
            lockSize / 2 + barHalfWidth,
            0,
            Math.PI / 2 - clippingMaskAngle
        );
        cc.closePath();
        cc.fill();

        cc.translate(-halfWidth - barHalfWidth, 0);
        cc.lineWidth = barWidth;
        cc.strokeStyle = red;
        cc.beginPath();
        cc.arc(0, -lockOffset, lockSize / 2, -piSlice, Math.PI + piSlice, true);
        cc.moveTo(0, -lockSize / 2);
        cc.lineTo(0, -halfHeight);
        cc.stroke();
        cc.beginPath();
        cc.arc(0, lockOffset, lockSize / 2, piSlice, Math.PI - piSlice);
        cc.moveTo(0, lockSize - barWidth);
        cc.lineTo(0, halfHeight);
        cc.stroke();

        if (aircraftModel.isEstablishedOnCourse()) {
            cc.fillStyle = white;
            cc.beginPath();
            cc.arc(0, 0, lockSize / 5, 0, Math.PI * 2);
            cc.fill();
        }

        cc.translate(halfWidth + barHalfWidth, 0);
        cc.beginPath();
        cc.stroke();
        cc.restore();
    }

    _shouldShowSecondaryDataBlock() {
        return _inRange(this._timeKeeper.gameTimeMilliseconds % 3000, 2000, 3000);
    }

    _isDataBlockVisible(radarTargetModel) {
        if (!radarTargetModel.handoffModel?.shouldFlashDataBlock) {
            return true;
        }

        return this._timeKeeper.gameTimeMilliseconds % 1000 < 500;
    }

    _isControllerIdentifierVisible(radarTargetModel) {
        if (!radarTargetModel.handoffModel?.shouldFlashControllerIdentifier) {
            return true;
        }

        return this._timeKeeper.gameTimeMilliseconds % 1000 < 500;
    }

    _calculateLeaderLength(theme, dataBlockLeaderLength) {
        return dataBlockLeaderLength *
            theme.DATA_BLOCK.LEADER_LENGTH_INCREMENT_PIXELS +
            theme.DATA_BLOCK.LEADER_LENGTH_ADJUSTMENT_PIXELS -
            theme.DATA_BLOCK.LEADER_PADDING_FROM_BLOCK_PX -
            theme.DATA_BLOCK.LEADER_PADDING_FROM_TARGET_PX;
    }

    _toCanvasPosition(positionFromScope) {
        const positionInPixels = [
            this._viewport._translateKilometersToPixels(positionFromScope[0]),
            -this._viewport._translateKilometersToPixels(positionFromScope[1])
        ];
        const scopePositionRelativeToView = [this._viewport._panX, this._viewport._panY];
        const viewPositionRelativeToCanvasOrigin = [this._viewport.halfWidth, this._viewport.halfHeight];
        const scopePositionRelativeToCanvasOrigin = vadd(viewPositionRelativeToCanvasOrigin, scopePositionRelativeToView);

        return vadd(scopePositionRelativeToCanvasOrigin, positionInPixels);
    }
}
