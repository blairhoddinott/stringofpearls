import { BASE_CANVAS_FONT } from '../constants/canvasConstants';
import { PROCEDURE_TYPE } from '../constants/routeConstants';
import { round } from '../math/core';

/**
 * Draws airport navigation fixes and procedure geometry.
 *
 * Mutable navigation state remains owned by the injected navigation library;
 * this renderer retains only exact presentation and domain-owner identities.
 */
export default class AirportNavigationRenderer {
    /**
     * @param viewport {CanvasStageModel} coordinate and scale owner
     * @param navigationLibrary {NavigationLibrary} current fixes/procedures owner
     */
    constructor(viewport, navigationLibrary) {
        this._viewport = viewport;
        this._navigationLibrary = navigationLibrary;
    }

    drawFixes(cc, shouldDrawFixLabels, theme) {
        if (!shouldDrawFixLabels) {
            return;
        }

        cc.save();
        this._translateToAirportCenter(cc);
        cc.lineJoin = 'round';
        cc.font = BASE_CANVAS_FONT;

        for (let i = 0; i < this._navigationLibrary.realFixes.length; i++) {
            const fixModel = this._navigationLibrary.realFixes[i];

            this._drawSingleFixAndLabel(cc, fixModel, theme);
        }

        cc.restore();
    }

    drawSids(cc, shouldDrawSidMap, theme) {
        if (!shouldDrawSidMap) {
            return;
        }

        const textAtFix = [];
        const sidLines = this._navigationLibrary.getProcedureLines(PROCEDURE_TYPE.SID);

        cc.save();
        this._translateToAirportCenter(cc);
        cc.strokeStyle = theme.SCOPE.SID;
        cc.fillStyle = theme.SCOPE.SID;
        cc.setLineDash([1, 10]);
        cc.font = 'italic 14px monoOne, monospace';

        for (let i = 0; i < sidLines.length; i++) {
            const sid = sidLines[i];
            let shouldDrawProcedureName = true;

            for (let j = 0; j < sid.lines.length; j++) {
                this._drawPolyLineFromRelativePositions(cc, sid.lines[j]);
            }

            for (let j = 0; j < sid.exits.length; j++) {
                const exitName = sid.exits[j];

                if (!(exitName in textAtFix)) {
                    textAtFix[exitName] = [];
                }

                textAtFix[exitName].push(`${sid.identifier}.${exitName}`);
                shouldDrawProcedureName = false;
            }

            if (shouldDrawProcedureName) {
                const { lastFixName } = sid;

                if (!(lastFixName in textAtFix)) {
                    textAtFix[lastFixName] = [];
                }

                textAtFix[lastFixName].push(sid.identifier);
            }
        }

        for (const fix in textAtFix) {
            const textItemsToPrint = textAtFix[fix];
            const fixPosition = this._navigationLibrary.getFixRelativePosition(fix);

            this._drawText(cc, fixPosition, textItemsToPrint);
        }

        cc.restore();
    }

    drawStars(cc, shouldDrawStarMap, theme) {
        if (!shouldDrawStarMap) {
            return;
        }

        const starLines = this._navigationLibrary.getProcedureLines(PROCEDURE_TYPE.STAR);
        const textAtFix = [];

        cc.save();
        this._translateToAirportCenter(cc);
        cc.strokeStyle = theme.SCOPE.STAR;
        cc.fillStyle = theme.SCOPE.STAR;
        cc.setLineDash([1, 10]);
        cc.font = 'italic 14px monoOne, monospace';
        cc.textAlign = 'right';

        for (let i = 0; i < starLines.length; i++) {
            const star = starLines[i];

            for (let j = 0; j < star.lines.length; j++) {
                this._drawPolyLineFromRelativePositions(cc, star.lines[j]);
            }

            const { firstFixName } = star;

            if (!(firstFixName in textAtFix)) {
                textAtFix[firstFixName] = [];
            }

            textAtFix[firstFixName].push(star.identifier);
        }

        for (const fix in textAtFix) {
            const textItemsToPrint = textAtFix[fix];
            const fixPosition = this._navigationLibrary.getFixRelativePosition(fix);

            this._drawText(cc, fixPosition, textItemsToPrint);
        }

        cc.restore();
    }

    _drawSingleFixAndLabel(cc, fixModel, theme) {
        const fixCanvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(fixModel.relativePosition);

        cc.save();
        cc.translate(...fixCanvasPosition);
        cc.fillStyle = theme.SCOPE.FIX_FILL;
        cc.globalCompositeOperation = 'source-over';
        cc.lineWidth = 1;
        cc.beginPath();
        cc.moveTo(0, -5);
        cc.lineTo(4, 3);
        cc.lineTo(-4, 3);
        cc.closePath();
        cc.fill();
        cc.fillStyle = theme.SCOPE.FIX_TEXT;
        cc.textAlign = 'center';
        cc.textBaseline = 'top';
        cc.fillText(fixModel.name, 0, 6);
        cc.restore();
    }

    _drawPolyLineFromRelativePositions(cc, relativePositions) {
        if (relativePositions.length < 2) {
            return;
        }

        const lineStartPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(relativePositions[0]);

        cc.beginPath();
        cc.moveTo(...lineStartPosition);

        for (let i = 0; i < relativePositions.length; i++) {
            const canvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(relativePositions[i]);

            cc.lineTo(...canvasPosition);
        }

        cc.stroke();
    }

    _drawText(cc, relativePosition, labels, lineHeight = 15) {
        const canvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(relativePosition);
        let dx = cc.textAlign === 'right' ? -10 : 10;

        if (cc.textAlign === 'center') {
            dx = 0;
        }

        for (let i = 0; i < labels.length; i++) {
            cc.fillText(
                labels[i],
                canvasPosition[0] + dx,
                canvasPosition[1] + (lineHeight * i)
            );
        }
    }

    _translateToAirportCenter(cc) {
        cc.translate(
            round(this._viewport.halfWidth),
            round(this._viewport.halfHeight)
        );
    }
}
