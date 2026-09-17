import { round } from '../math/core';

/**
 * Draws measurement paths and labels over the dynamic scope canvas.
 */
export default class MeasurementOverlayRenderer {
    constructor(viewport, measureTool) {
        this._viewport = viewport;
        this._measureTool = measureTool;
    }

    draw(cc, theme) {
        if (!this._measureTool.hasPaths) {
            return;
        }

        const pathInfoList = this._measureTool.buildPathInfo();

        cc.save();
        this._translateToAirportCenter(cc);

        pathInfoList.forEach((pathInfo) => {
            this._drawPath(cc, pathInfo, theme);
            this._drawLabels(cc, pathInfo, theme);
        });

        cc.restore();
    }

    _drawLabels(cc, pathInfo, theme) {
        let leg = pathInfo.firstLeg;
        const values = [];
        const labelPadding = 5;

        while (leg != null) {
            if (leg.labels !== null && leg.labels.length !== 0) {
                const position = this._viewport.calculatePreciseCanvasPositionFromRelativePosition(
                    leg.midPoint
                );

                values.push({
                    x: position[0],
                    y: position[1],
                    labels: leg.labels
                });
            }

            leg = leg.next;
        }

        if (values.length === 0) {
            return;
        }

        cc.save();
        cc.fillStyle = theme.SCOPE.MEASURE_BACKGROUND;
        cc.font = theme.DATA_BLOCK.TEXT_FONT;

        values.forEach((item) => {
            const { x, y, labels } = item;
            const height = (2 * labelPadding) + (12 * labels.length);
            const maxLabelWidth = labels.reduce((lastWidth, label) => {
                const newWidth = cc.measureText(label).width;

                return Math.max(lastWidth, newWidth);
            }, 0);
            const width = (2 * labelPadding) + maxLabelWidth;

            cc.fillRect(x, y, width, height);
        });

        cc.fillStyle = theme.SCOPE.MEASURE_TEXT;

        values.forEach((item) => {
            const { labels } = item;
            const x = item.x + labelPadding;
            const y = item.y + 15;

            labels.forEach((line, index) => {
                cc.fillText(line, x, y + (12 * index));
            });
        });

        cc.restore();
    }

    _drawPath(cc, pathInfo, theme) {
        const { initialTurn } = pathInfo;
        let leg = pathInfo.firstLeg;
        const firstPoint = this._viewport.calculatePreciseCanvasPositionFromRelativePosition(
            leg.startPoint
        );
        const firstMidPoint = this._viewport.calculatePreciseCanvasPositionFromRelativePosition(
            leg.midPoint
        );

        cc.save();
        cc.strokeStyle = theme.SCOPE.MEASURE_LINE;
        cc.beginPath();

        if (initialTurn !== null) {
            const {
                isRHT, center, entryAngle, exitAngle, turnRadius
            } = initialTurn;
            const position = this._viewport.calculatePreciseCanvasPositionFromRelativePosition(center);
            const radius = this._viewport._translateKilometersToPixels(turnRadius);

            cc.arc(
                position[0],
                position[1],
                radius,
                entryAngle - Math.PI / 2,
                exitAngle - Math.PI / 2,
                !isRHT
            );
        }

        cc.moveTo(firstPoint[0], firstPoint[1]);
        cc.lineTo(firstMidPoint[0], firstMidPoint[1]);

        while (leg != null) {
            const { next } = leg;
            const radius = this._viewport._translateKilometersToPixels(leg.radius);
            const position1 = this._viewport.calculatePreciseCanvasPositionFromRelativePosition(
                leg.endPoint
            );

            if (next === null) {
                cc.lineTo(position1[0], position1[1]);
            } else {
                const position2 = this._viewport.calculatePreciseCanvasPositionFromRelativePosition(
                    next.midPoint
                );

                cc.arcTo(position1[0], position1[1], position2[0], position2[1], radius);
                cc.lineTo(position2[0], position2[1]);
            }

            leg = next;
        }

        cc.stroke();
        cc.restore();
    }

    _translateToAirportCenter(cc) {
        cc.translate(
            round(this._viewport.halfWidth),
            round(this._viewport.halfHeight)
        );
    }
}
