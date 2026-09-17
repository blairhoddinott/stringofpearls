import { BASE_CANVAS_FONT } from '../constants/canvasConstants';
import { INVALID_INDEX } from '../constants/globalConstants';
import { tau } from '../math/circle';
import { clamp, round } from '../math/core';
import { leftPad } from '../utilities/generalUtilities';
import { DECIMAL_RADIX, km } from '../utilities/unitConverters';

/**
 * Draws airport-owned static background geometry.
 */
export default class AirportBackgroundRenderer {
    constructor(viewport, airportProvider, rangeRingOptionProvider) {
        this._viewport = viewport;
        this._airportProvider = airportProvider;
        this._rangeRingOptionProvider = rangeRingOptionProvider;
        this._hasSeenTerrainWarning = false;
    }

    drawVideoMap(cc, theme) {
        const airportModel = this._airportProvider();

        if (!airportModel.mapCollection.hasVisibleMaps) {
            return;
        }

        cc.save();
        this._translateToAirportCenter(cc);
        cc.strokeStyle = theme.SCOPE.VIDEO_MAP;
        cc.lineWidth = Math.max(1, this._viewport.scale / 15);
        cc.lineJoin = 'round';
        cc.font = BASE_CANVAS_FONT;
        cc.beginPath();

        const lines = airportModel.mapCollection.getVisibleMapLines();

        lines.forEach((mapItem) => {
            const startRelativePosition = [mapItem[0], mapItem[1]];
            const startCanvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(
                startRelativePosition
            );
            const endRelativePosition = [mapItem[2], mapItem[3]];
            const endCanvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(
                endRelativePosition
            );

            cc.moveTo(...startCanvasPosition);
            cc.lineTo(...endCanvasPosition);
        });

        cc.stroke();
        cc.restore();
    }

    drawTerrain(cc, shouldDrawTerrain, theme) {
        const airport = this._airportProvider();
        const airportTerrain = airport.terrain;
        let maxElevation = 0;

        if (!shouldDrawTerrain || Object.keys(airportTerrain).length === 0) {
            return;
        }

        cc.save();
        this._translateToAirportCenter(cc);
        cc.strokeStyle = theme.SCOPE.FIX_FILL;
        cc.fillStyle = theme.SCOPE.FIX_FILL;
        cc.lineWidth = clamp(0.5, this._viewport.scale / 10, 2);
        cc.lineJoin = 'round';

        for (const elevation in airportTerrain) {
            // eslint-disable-next-line no-prototype-builtins
            if (!airportTerrain.hasOwnProperty(elevation)) {
                continue;
            }

            const terrainLevel = airportTerrain[elevation];

            if (elevation < 0 && !this._hasSeenTerrainWarning) {
                console.warn(`${airport.icao}.geojson contains 'terrain' ` +
                    ' below sea level, which is not supported!');
                this._hasSeenTerrainWarning = true;

                continue;
            }

            maxElevation = Math.max(maxElevation, elevation);
            this._drawTerrainAtElevation(cc, terrainLevel, elevation, theme);
        }

        if (maxElevation !== 0) {
            this._drawTerrainElevationLegend(cc, maxElevation, theme);
        }

        cc.restore();
    }

    drawRestrictedAirspace(cc, shouldDrawRestrictedAreas, theme) {
        if (!shouldDrawRestrictedAreas) {
            return;
        }

        cc.save();
        this._translateToAirportCenter(cc);
        cc.fillStyle = theme.SCOPE.RESTRICTED_AIRSPACE;
        cc.strokeStyle = theme.SCOPE.RESTRICTED_AIRSPACE;
        cc.lineWidth = Math.max(this._viewport.scale / 3, 2);
        cc.lineJoin = 'round';
        cc.font = BASE_CANVAS_FONT;
        cc.textAlign = 'center';
        cc.textBaseline = 'top';

        const airportModel = this._airportProvider();

        for (let i = 0; i < airportModel.restricted_areas.length; i++) {
            const area = airportModel.restricted_areas[i];

            this._drawRelativePoly(cc, area.poly, false);

            const height = area.height === Infinity ?
                'UNL' :
                `FL ${Math.ceil(area.height / 1000) * 10}`;

            for (let j = 0; j < area.labelRelativePositions.length; j++) {
                const canvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(
                    area.labelRelativePositions[j]
                );
                let linePaddingPx = 0;

                if (area.name) {
                    linePaddingPx = 6;
                    cc.fillText(area.name, canvasPosition[0], canvasPosition[1] - linePaddingPx);
                }

                cc.fillText(height, canvasPosition[0], canvasPosition[1] + linePaddingPx);
            }
        }

        cc.restore();
    }

    drawAirspaceAndRangeRings(cc, theme) {
        cc.save();
        this._translateToAirportCenter(cc);
        this._drawAirspaceBorder(cc, theme);
        this._drawRangeRings(cc, theme);
        cc.restore();
    }

    drawAirspaceShelvesAndLabels(cc, shouldDrawAirspace) {
        if (!shouldDrawAirspace) {
            return;
        }

        cc.save();

        const airport = this._airportProvider();

        cc.strokeStyle = 'rgba(224, 128, 128, 1.0)';
        cc.fillStyle = 'rgba(224, 128, 128, 1.0)';
        cc.font = '12px monoOne, monospace';
        cc.textAlign = 'center';
        cc.textBaseline = 'middle';

        for (let i = 0; i < airport.airspace.length; i++) {
            const airspace = airport.airspace[i];

            cc.save();
            this._translateToAirportCenter(cc);
            this._drawRelativePoly(cc, airspace.relativePoly, false);

            const bottomFlightLevel = leftPad(Math.floor(airspace.floor / 100), 3);
            const topFlightLevel = leftPad(Math.ceil(airspace.ceiling / 100), 3);
            const content = `${bottomFlightLevel}-${topFlightLevel} (#${i})`;

            cc.restore();
            cc.save();
            this._translateToAirportCenter(cc);

            for (const labelRelativePosition of airspace.labelRelativePositions) {
                this._drawText(cc, labelRelativePosition, [content]);
            }

            cc.restore();
        }

        cc.restore();
    }

    _drawAirspaceBorder(cc, theme) {
        cc.save();

        const airport = this._airportProvider();

        cc.strokeStyle = theme.SCOPE.AIRSPACE_PERIMETER;
        cc.fillStyle = theme.SCOPE.AIRSPACE_FILL;

        for (let i = 0; i < airport.airspace.length; i++) {
            this._drawRelativePoly(cc, airport.airspace[i].relativePoly, true);
        }

        cc.restore();
    }

    _drawRangeRings(cc, theme) {
        const airportModel = this._airportProvider();
        const centerCanvasPosition = this._viewport.calculatePreciseCanvasPositionFromRelativePosition(
            airportModel.rangeRings.center.relativePosition
        );
        const ringRadiusKm = this._calculateRangeRingRadiusKm(airportModel);

        if (ringRadiusKm === 0) {
            return;
        }

        cc.save();
        cc.linewidth = 1;
        cc.strokeStyle = theme.SCOPE.RANGE_RING_COLOR;

        for (let i = 1; i * ringRadiusKm < airportModel.ctr_radius * 3; i++) {
            cc.beginPath();
            cc.arc(...centerCanvasPosition, ringRadiusKm * this._viewport.scale * i, 0, tau());
            cc.stroke();
        }

        cc.restore();
    }

    _calculateRangeRingRadiusKm(airportModel) {
        const userValue = this._rangeRingOptionProvider();
        const useDefault = userValue === 'default';
        const defaultRangeRings = airportModel.rangeRings;

        if (userValue === 'off' || (useDefault && defaultRangeRings.enabled === false)) {
            return 0;
        }

        if (!useDefault) {
            return km(parseInt(userValue, DECIMAL_RADIX));
        }

        return km(defaultRangeRings.radius_nm);
    }

    _drawRelativePoly(cc, relativePoly, fill = true) {
        cc.beginPath();

        for (let i = 0; i < relativePoly.length; i++) {
            const canvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(
                relativePoly[i]
            );

            cc.lineTo(...canvasPosition);
        }

        cc.closePath();
        cc.stroke();

        if (fill) {
            cc.fill();
        }
    }

    _drawTerrainAtElevation(cc, terrainLevel, elevation, theme) {
        const color = `hsla(${theme.TERRAIN.COLOR[elevation]}`;

        cc.save();
        cc.strokeStyle = `${color}, ${theme.TERRAIN.BORDER_OPACITY})`;
        cc.fillStyle = `${color}, ${theme.TERRAIN.FILL_OPACITY})`;

        for (let i = 0; i < terrainLevel.length; i++) {
            const terrainGroup = terrainLevel[i];

            cc.beginPath();

            for (let j = 0; j < terrainGroup.length; j++) {
                const terrainItem = terrainGroup[j];

                for (let k = 0; k < terrainItem.length; k++) {
                    const canvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(
                        terrainItem[k]
                    );

                    if (k === 0) {
                        cc.moveTo(...canvasPosition);
                    } else {
                        cc.lineTo(...canvasPosition);
                    }
                }

                cc.closePath();
            }

            cc.fill();
            cc.stroke();
        }

        cc.restore();
    }

    _drawTerrainElevationLegend(cc, maxElevation, theme) {
        cc.save();
        cc.font = BASE_CANVAS_FONT;
        cc.lineWidth = 1;

        const offset = 10;
        const { width, height } = this._viewport;
        const boxWidth = 30;
        const boxHeight = 5;

        for (let i = 0; i <= maxElevation; i += 1000) {
            cc.save();
            cc.translate(
                width / 2 - 170 - (maxElevation - i) / 1000 * (boxWidth + 1),
                -height / 2 + offset + 0.5
            );
            cc.beginPath();
            cc.rect(0, 0, boxWidth - 1, boxHeight);
            cc.closePath();

            for (let j = 0; j <= i; j += 1000) {
                cc.fillStyle = `hsla(${theme.TERRAIN.COLOR[j]}, ${theme.TERRAIN.FILL_OPACITY})`;
                cc.fill();
            }

            cc.strokeStyle = `hsla(${theme.TERRAIN.COLOR[i]}, ${theme.TERRAIN.BORDER_OPACITY})`;
            cc.stroke();

            const labeledAltitudes = [0, 5000, 10000, 15000, 20000, 25000, 30000].filter((altitude) => {
                return altitude < maxElevation - 1001;
            });

            if (i === maxElevation || labeledAltitudes.indexOf(i) !== INVALID_INDEX) {
                cc.fillStyle = theme.SCOPE.FIX_FILL;
                cc.textAlign = 'center';
                cc.textBaseline = 'top';

                const text = i === 0 ? 'MSL' : `${i}'`;

                cc.fillText(text, boxWidth / 2 + 0.5, offset + 2);
            }

            cc.restore();
        }

        cc.restore();
    }

    _drawText(cc, relativePosition, labels, lineHeight = 15) {
        const canvasPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(
            relativePosition
        );
        let dx = cc.textAlign === 'right' ? -10 : 10;
        let dy = 0;

        if (cc.textAlign === 'center') {
            dx = 0;
        }

        for (const label of labels) {
            cc.fillText(label, canvasPosition[0] + dx, canvasPosition[1] + dy);
            dy += lineHeight;
        }
    }

    _translateToAirportCenter(cc) {
        cc.translate(
            round(this._viewport.halfWidth),
            round(this._viewport.halfHeight)
        );
    }
}
