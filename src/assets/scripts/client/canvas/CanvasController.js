import $ from 'jquery';
import _filter from 'lodash/filter';
import _has from 'lodash/has';
import _inRange from 'lodash/inRange';
import AirportController from '../airport/AirportController';
import AirportBackgroundRenderer from './AirportBackgroundRenderer';
import AirportNavigationRenderer from './AirportNavigationRenderer';
import AirportRunwayRenderer from './AirportRunwayRenderer';
import AircraftTargetRenderer from './AircraftTargetRenderer';
import CanvasHost from './CanvasHost';
import CanvasRenderScheduler from './CanvasRenderScheduler';
import CanvasStageModel from './CanvasStageModel';
import MeasurementOverlayRenderer from './MeasurementOverlayRenderer';
import EventBus from '../lib/EventBus';
import GameController from '../game/GameController';
import MeasureTool from '../measurement/MeasureTool';
import NavigationLibrary from '../navigationLibrary/NavigationLibrary';
import TimeKeeper from '../engine/TimeKeeper';
import { round } from '../math/core';
import {
    positive_intersection_with_rect,
    vectorize2dFromDegrees,
    vadd,
    vscale
} from '../math/vector';
import { FLIGHT_CATEGORY } from '../constants/aircraftConstants';
import {
    BASE_CANVAS_FONT,
    CANVAS_NAME
} from '../constants/canvasConstants';
import { THEME } from '../constants/themes';
import { EVENT } from '../constants/eventNames';
import { INVALID_NUMBER } from '../constants/globalConstants';
import { GAME_OPTION_NAMES } from '../constants/gameOptionConstants';
import {
    degreesToRadians,
    km,
    nm
} from '../utilities/unitConverters';

/**
 * @class CanvasController
 */
export default class CanvasController {
    /**
     * @constructor
     * @param $element {JQuery|HTML Element}
     * @param aircraftController {AircraftController}
     * @param scopeModel {ScopeModel}
     * @param storageAdapter {StorageAdapter}
     * @param delayScheduler {DelayScheduler} delayed-callback boundary; nullish/omitted normalizes to null
     * @param renderScheduler {CanvasRenderScheduler} render dirty-state/update policy; nullish/omitted constructs a default
     * @param canvasHost {CanvasHost} browser-bound canvas DOM/context lifecycle; nullish/omitted constructs a default
     * @param viewport {CanvasStageModel} viewport/camera dimensions, pan and zoom; nullish/omitted uses the shared singleton
     * @param runwayRenderer {AirportRunwayRenderer} airport runway presentation; nullish/omitted constructs a default
     * @param navigationRenderer {AirportNavigationRenderer} airport fix/procedure presentation; nullish/omitted constructs a default
     * @param backgroundRenderer {AirportBackgroundRenderer} airport background presentation; nullish/omitted constructs a default
     * @param measurementRenderer {MeasurementOverlayRenderer} measurement overlay presentation; nullish/omitted constructs a default
     * @param aircraftTargetRenderer {AircraftTargetRenderer} aircraft target geometry presentation; nullish/omitted constructs a default
     */
    constructor($element, aircraftController, scopeModel, storageAdapter, delayScheduler, renderScheduler, canvasHost, viewport, runwayRenderer, navigationRenderer, backgroundRenderer, measurementRenderer, aircraftTargetRenderer) {
        /**
         * Reference to the `window` object
         *
         * @property $window
         * @type {JQuery|HTML Element}
         */
        this.$window = $(window);

        /**
         * Reference to the `#canvases` tag which acts as the container
         * element for all the `<canvas />` elements
         *
         * @property $element
         * @type $element {JQuery|HTML Element}
         * @default $element
         */
        this.$element = $element;

        /**
         * @property _aircraftController
         * @type {AircraftController}
         * @private
         */
        this._aircraftController = aircraftController;

        /**
         * @property _scopeModel
         * @type {ScopeModel}
         * @private
         */
        this._scopeModel = scopeModel;

        /**
         * @property _eventBus
         * @type {EventBus}
         * @private
         */
        this._eventBus = EventBus;

        /**
         * Owns the viewport/camera: canvas dimensions, pan and zoom, plus the
         * coordinate translations built on them.
         *
         * Nullish/omitted uses the shared `CanvasStageModel` singleton for
         * compatibility with unmigrated consumers; when injected, the exact
         * instance is retained and every coordinate/draw path reads from it.
         *
         * @property _viewport
         * @type {CanvasStageModel}
         * @private
         */
        this._viewport = viewport ?? CanvasStageModel;

        /**
         * Owns airport runway body, extended-centerline, and label rendering.
         *
         * The default renderer receives the controller's exact viewport and a
         * lazy provider for the current airport so airport changes are observed
         * at draw time. An explicit renderer is retained unchanged.
         *
         * @property _runwayRenderer
         * @type {AirportRunwayRenderer}
         * @private
         */
        this._runwayRenderer = runwayRenderer ?? new AirportRunwayRenderer(
            this._viewport,
            () => AirportController.airport_get()
        );

        /**
         * Owns airport fix, SID, and STAR presentation.
         *
         * The default renderer receives the controller's exact viewport and
         * the compatibility navigation owner. An explicit renderer is retained
         * unchanged.
         *
         * @property _navigationRenderer
         * @type {AirportNavigationRenderer}
         * @private
         */
        this._navigationRenderer = navigationRenderer ?? new AirportNavigationRenderer(
            this._viewport,
            NavigationLibrary
        );

        /**
         * Owns airport map, terrain, restricted-area, and airspace background rendering.
         *
         * @property _backgroundRenderer
         * @type {AirportBackgroundRenderer}
         * @private
         */
        this._backgroundRenderer = backgroundRenderer ?? new AirportBackgroundRenderer(
            this._viewport,
            () => AirportController.airport_get(),
            () => GameController.getGameOption(GAME_OPTION_NAMES.RANGE_RINGS)
        );
        this._measurementRenderer = measurementRenderer ?? new MeasurementOverlayRenderer(
            this._viewport,
            MeasureTool
        );
        this._aircraftTargetRenderer = aircraftTargetRenderer ?? new AircraftTargetRenderer(
            this._viewport,
            this._scopeModel,
            GameController,
            TimeKeeper,
            () => prop.input.callsign
        );

        /**
         * Owns the browser-bound canvas DOM/context lifecycle.
         *
         * Nullish/omitted constructs a default host at this presentation
         * boundary from the same `$element`, wired to this controller's exact
         * `_viewport` so host sizing and drawing agree on one stage model;
         * `CanvasController` retains ownership of actual drawing and render
         * scheduling.
         *
         * @property _canvasHost
         * @type {CanvasHost}
         * @private
         */
        this._canvasHost = canvasHost ?? new CanvasHost(this.$element, this._viewport);

        /**
         * Owns the render dirty-state and per-frame update policy.
         *
         * Nullish/omitted constructs a default scheduler at this presentation
         * boundary; `CanvasController` retains ownership of actual drawing and
         * `TimeKeeper` access.
         *
         * @property _renderScheduler
         * @type {CanvasRenderScheduler}
         * @private
         */
        this._renderScheduler = renderScheduler ?? new CanvasRenderScheduler();

        /**
         * Flag used to determine if airspace polygons should be displayed and labeled
         *
         * @property _shouldDrawAirspace
         * @type {boolean}
         * @default false
         */
        this._shouldDrawAirspace = false;

        /**
         * Flag used to determine if fix labels should be displayed
         *
         * @property _shouldDrawFixLabels
         * @type {boolean}
         * @default false
         */
        this._shouldDrawFixLabels = false;

        /**
         * Flag used to determine if restricted areas should be displayed
         *
         * @property _shouldDrawRestrictedAreas
         * @type {boolean}
         * @default false
         */
        this._shouldDrawRestrictedAreas = false;

        /**
         * Flag used to determine if the sid map should be displayed
         *
         * @property _shouldDrawSidMap
         * @type {boolean}
         * @default false
         */
        this._shouldDrawSidMap = false;

        /**
         * Flag used to determine if the star map should be displayed
         *
         * @property _shouldDrawStarMap
         * @type {boolean}
         * @default false
         */
        this._shouldDrawStarMap = false;

        /**
         * Flag used to determine if terrain should be displayed
         *
         * @property _shouldDrawTerrain
         * @type {boolean}
         * @default true
         */
        this._shouldDrawTerrain = true;

        /**
         * container property for the current canvas theme
         *
         * @property theme
         * @type {object}
         * @default null
         */
        this.theme = null;

        /**
         * Delayed-callback boundary used to defer the initial deep render.
         *
         * Nullish/omitted normalizes to canonical null so `canvas_complete()`
         * becomes a safe no-op rather than reaching for a browser global.
         *
         * @property _delayScheduler
         * @type {DelayScheduler|null}
         * @private
         */
        this._delayScheduler = delayScheduler ?? null;

        // Configure the owned viewport's persistence boundary at the composition
        // root, on the exact `_viewport` instance and before any normal canvas
        // behavior, so it rehydrates the zoom level without reaching for a
        // browser global itself.
        this._viewport.initStorage(storageAdapter);

        return this._init()
            ._setupHandlers()
            .enable();
    }

    /**
     * @for CanvasController
     * @method _init
     * @private
     * @chainable
     */
    _init() {
        this._setTheme(GameController.getGameOption(GAME_OPTION_NAMES.THEME));

        return this;
    }

    /**
     * @for CanvasController
     * @method _setupHandlers
     * @chainable
     * @private
     */
    _setupHandlers() {
        this._onSelectAircraftHandler = this._onSelectAircraft.bind(this);
        this._onDeselectAircraftHandler = this._onDeselectAircraft.bind(this);
        this._onCenterPointInViewHandler = this._onCenterPointInView.bind(this);
        this._onChangeViewportPanHandler = this._onChangeViewportPan.bind(this);
        this._onChangeViewportZoomHandler = this._onChangeViewportZoom.bind(this);
        this._onMarkDirtyCanvasHandler = this._onMarkDirtyCanvas.bind(this);
        this._onToggleAirspaceHandler = this._onToggleAirspace.bind(this);
        this._onToggleLabelsHandler = this._onToggleLabels.bind(this);
        this._onToggleRestrictedAreasHandler = this._onToggleRestrictedAreas.bind(this);
        this._onToggleSidMapHandler = this._onToggleSidMap.bind(this);
        this._onToggleStarMapHandler = this._onToggleStarMap.bind(this);
        this._onAirportChangeHandler = this._onAirportChange.bind(this);
        this._onToggleTerrainHandler = this._onToggleTerrain.bind(this);
        this._onToggleVideoMapHandler = this._onToggleVideoMap.bind(this);
        this._onRangeRingsChangeHandler = this._onRangeRingsChange.bind(this);
        this._onResizeHandler = this.canvas_resize.bind(this);

        this._setThemeHandler = this._setTheme.bind(this);

        return this;
    }

    /**
     * @for CanvasController
     * @method enable
     * @chainable
     */
    enable() {
        this._eventBus.on(EVENT.SELECT_AIRCRAFT, this._onSelectAircraftHandler);
        this._eventBus.on(EVENT.DESELECT_AIRCRAFT, this._onDeselectAircraftHandler);
        this._eventBus.on(EVENT.REQUEST_TO_CENTER_POINT_IN_VIEW, this._onCenterPointInViewHandler);
        this._eventBus.on(EVENT.PAN_VIEWPORT, this._onChangeViewportPanHandler);
        this._eventBus.on(EVENT.ZOOM_VIEWPORT, this._onChangeViewportZoomHandler);
        this._eventBus.on(EVENT.MARK_SHALLOW_RENDER, this._onMarkDirtyCanvasHandler);
        this._eventBus.on(EVENT.TOGGLE_AIRSPACE, this._onToggleAirspaceHandler);
        this._eventBus.on(EVENT.TOGGLE_LABELS, this._onToggleLabelsHandler);
        this._eventBus.on(EVENT.TOGGLE_RESTRICTED_AREAS, this._onToggleRestrictedAreasHandler);
        this._eventBus.on(EVENT.TOGGLE_SID_MAP, this._onToggleSidMapHandler);
        this._eventBus.on(EVENT.TOGGLE_STAR_MAP, this._onToggleStarMapHandler);
        this._eventBus.on(EVENT.TOGGLE_TERRAIN, this._onToggleTerrainHandler);
        this._eventBus.on(EVENT.TOGGLE_VIDEO_MAP, this._onToggleVideoMapHandler);
        this._eventBus.on(EVENT.RANGE_RINGS_CHANGE, this._onRangeRingsChangeHandler);
        this._eventBus.on(EVENT.AIRPORT_CHANGE, this._onAirportChangeHandler);
        this._eventBus.on(EVENT.SET_THEME, this._setThemeHandler);
        window.addEventListener('resize', this._onResizeHandler);

        this.$element.addClass(this.theme.CLASSNAME);

        return this;
    }

    /**
     * @for CanvasController
     * @method disable
     */
    disable() {
        this._eventBus.off(EVENT.SELECT_AIRCRAFT, this._onSelectAircraftHandler);
        this._eventBus.off(EVENT.DESELECT_AIRCRAFT, this._onDeselectAircraftHandler);
        this._eventBus.off(EVENT.REQUEST_TO_CENTER_POINT_IN_VIEW, this._onCenterPointInView);
        this._eventBus.off(EVENT.PAN_VIEWPORT, this._onChangeViewportPan);
        this._eventBus.off(EVENT.ZOOM_VIEWPORT, this._onChangeViewportZoom);
        this._eventBus.off(EVENT.MARK_SHALLOW_RENDER, this._onMarkDirtyCanvas);
        this._eventBus.off(EVENT.TOGGLE_AIRSPACE, this._onToggleAirspaceHandler);
        this._eventBus.off(EVENT.TOGGLE_LABELS, this._onToggleLabels);
        this._eventBus.off(EVENT.TOGGLE_RESTRICTED_AREAS, this._onToggleRestrictedAreas);
        this._eventBus.off(EVENT.TOGGLE_SID_MAP, this._onToggleSidMap);
        this._eventBus.off(EVENT.TOGGLE_STAR_MAP, this._onToggleStarMap);
        this._eventBus.off(EVENT.TOGGLE_TERRAIN, this._onToggleTerrain);
        this._eventBus.off(EVENT.TOGGLE_VIDEO_MAP, this._onToggleVideoMapHandler);
        this._eventBus.off(EVENT.RANGE_RINGS_CHANGE, this._onRangeRingsChangeHandler);
        this._eventBus.off(EVENT.AIRPORT_CHANGE, this._onAirportChangeHandler);
        this._eventBus.off(EVENT.SET_THEME, this._setTheme);
        window.removeEventListener('resize', this._onResizeHandler);

        return this.destroy();
    }

    /**
     * @for CanvasController
     * @method destroy
     */
    destroy() {
        this.$window = null;
        this.$element = null;
        this._canvasHost.destroy();
        this._renderScheduler.reset();
        this._shouldDrawFixLabels = false;
        this._shouldDrawRestrictedAreas = false;
        this._shouldDrawSidMap = false;
        this._shouldDrawStarMap = false;
        this._shouldDrawTerrain = true;

        return this;
    }

    /**
     * Called by `AppController.init()`
     *
     * Creates canvas elements and stores context
     *
     * @for CanvasController
     * @method canvas_init
     */
    canvas_init() {
        this._canvasHost.init();
    }

    /**
     * Called by `AppController.complete()`
     *
     * @for CanvasController
     * @method
     */
    canvas_complete() {
        // TODO: not sure what the rationale is here. this should be removed/reworked if possible
        if (!this._delayScheduler) {
            return;
        }

        this._delayScheduler.schedule(() => {
            this._markDeepRender();
        }, 500);
    }

    /**
     * A `resize` event was captured by the `AppController`
     *
     * Here we re-calculate the canvas dimensions
     *
     * @for CanvasController
     * @method canvas_resize
     */
    canvas_resize() {
        this._canvasHost.resize();

        this._markDeepRender();
    }

    /**
     * Main update method called by `AppController.update_post()` within the game loop
     *
     * All methods called from this function should accept a canvas context argument.
     * The rationale here is that each method sets up and tears down any origin or state
     * transformations themselves. This way the methods can be organized or moved any
     * way we choose without having to worry about what the current state of the `context`
     *
     * It is important for code in this method, or called by this method, to be as
     * performant as possible so as not to degrade performance.
     *
     * @for CanvasController
     * @method canvasUpdatePost
     */
    canvasUpdatePost() {
        const renderPlan = this._renderScheduler.nextFrame(() => TimeKeeper.shouldUpdate());

        if (renderPlan === null) {
            return;
        }

        if (renderPlan.renderStatic) {
            // we should only ever enter this block as a result of a change in the view
            // or an airport change. these methods involve much more complicated drawing
            // and can degrade performance if called too frequently.
            const staticCanvasCtx = this._getCanvasContextByName(CANVAS_NAME.STATIC);

            this._clearCanvasContext(staticCanvasCtx);
            this._backgroundRenderer.drawVideoMap(staticCanvasCtx, this.theme);
            this._backgroundRenderer.drawTerrain(staticCanvasCtx, this._shouldDrawTerrain, this.theme);
            this._backgroundRenderer.drawRestrictedAirspace(
                staticCanvasCtx,
                this._shouldDrawRestrictedAreas,
                this.theme
            );
            this._runwayRenderer.drawRunways(staticCanvasCtx, this._shouldDrawFixLabels, this.theme);
            this._navigationRenderer.drawFixes(staticCanvasCtx, this._shouldDrawFixLabels, this.theme);
            this._navigationRenderer.drawSids(staticCanvasCtx, this._shouldDrawSidMap, this.theme);
            this._navigationRenderer.drawStars(staticCanvasCtx, this._shouldDrawStarMap, this.theme);
            this._backgroundRenderer.drawAirspaceAndRangeRings(staticCanvasCtx, this.theme);
            this._backgroundRenderer.drawAirspaceShelvesAndLabels(
                staticCanvasCtx,
                this._shouldDrawAirspace
            );
            this._runwayRenderer.drawRunwayLabels(staticCanvasCtx, this._shouldDrawFixLabels, this.theme);
            this._drawCurrentScale(staticCanvasCtx);
        }

        const dynamicCanvasCtx = this._getCanvasContextByName(CANVAS_NAME.DYNAMIC);

        this._clearCanvasContext(dynamicCanvasCtx);
        this._drawSelectedAircraftCompass(dynamicCanvasCtx);
        this._aircraftTargetRenderer.draw(dynamicCanvasCtx, this.theme);
        this._drawAircraftDataBlocks(dynamicCanvasCtx);
        this._measurementRenderer.draw(dynamicCanvasCtx, this.theme);

        this._renderScheduler.completeFrame();
    }

    /**
     * Used primarily for the data block
     *
     * This provides a way to know when to show the primary
     * dataBlock or the secondary dataBlock
     *
     * @method shouldShowSecondaryDataBlock
     * @returns {boolean}
     */
    shouldShowSecondaryDataBlock() {
        return _inRange(TimeKeeper.gameTimeMilliseconds % 3000, 2000, 3000);
    }

    /**
     * Clear the current canvas context
     *
     * @for CanvasController
     * @method _clearCanvasContext
     * @param cc {HTMLCanvasContext}
     * @private
     */
    _clearCanvasContext(cc) {
        this._canvasHost.clearContext(cc);
    }

    /**
     * Draw scale in the top right corner of the scope
     *
     * POSITIONING: Before calling this method, ensure NO TRANSLATION has occurred
     *
     * @for CanvasController
     * @method _drawCurrentScale
     * @param cc {HTMLCanvasContext}
     * @returns undefined
     * @private
     */
    _drawCurrentScale(cc) {
        cc.save();

        const offsetX = 35;
        const offsetY = 10;
        const height = 5;
        const lengthNm = round(nm(1 / this._viewport.scale * 50));
        const lengthKm = km(lengthNm);
        const px_length = round(this._viewport._translateKilometersToPixels(lengthKm));
        const widthLessOffset = this._viewport.width - offsetX;

        cc.font = '10px monoOne, monospace';
        cc.fillStyle = this.theme.SCOPE.TOP_ROW_TEXT;
        cc.strokeStyle = this.theme.SCOPE.TOP_ROW_TEXT;
        cc.lineWidth = 1;
        cc.textAlign = 'center';
        cc.beginPath();
        cc.moveTo(widthLessOffset, offsetY);
        cc.lineTo(widthLessOffset, offsetY + height);
        cc.lineTo(widthLessOffset - px_length, offsetY + height);
        cc.lineTo(widthLessOffset - px_length, offsetY);
        cc.stroke();
        cc.fillText(
            `${lengthNm} nm`,
            widthLessOffset - px_length * 0.5,
            offsetY + height + 17
        );
        cc.restore();
    }
    // TODO: This is currently not working correctly and not in use
    /**
     * Draw dashed line from last coordinate of future track through
     * any later requested fixes.
     *
     * POSITIONING: Before calling this method, translate to the AIRPORT CENTER
     *
     * @for CanvasController
     * @method canvas_draw_future_track_fixes
     * @param cc {HTMLCanvasContext}
     * @param aircraft {AircraftModel}
     * @param future_track
     * @returns undefined
     */
    canvas_draw_future_track_fixes(/* cc, aircraft, future_track */) {
        // const waypointList = aircraft.fms.waypoints;

        // if (waypointList.length <= 1) {
        //     return;
        // }

        // const start = future_track.length - 1;
        // const [x, y] = CanvasStageModel.calculateRoundedCanvasPositionFromRelativePosition(future_track[start]);

        // cc.beginPath();
        // cc.moveTo(x, y);
        // cc.setLineDash([3, 10]);

        // for (let i = 0; i < waypointList.length; i++) {
        //     const [fx, fy] = CanvasStageModel.calculateRoundedCanvasPositionFromRelativePosition(
        //         waypointList[i].relativePosition
        //     );

        //     cc.lineTo(fx, fy);
        // }

        // cc.stroke();
    }
    /**
     * Draw an aircraft's data block
     * (box that contains callsign, altitude, speed)
     *
     * POSITIONING: Before calling this method, translate to the AIRPORT CENTER
     *
     * @for CanvasController
     * @method _drawSingleAircraftDataBlock
     * @param cc {HTMLCanvasContext}
     * @param radarTargetModel {RadarTargetModel}
     * @returns undefined
     * @private
     */
    _drawSingleAircraftDataBlock(cc, radarTargetModel) {
        const { aircraftModel } = radarTargetModel;

        if (!aircraftModel.isVisible() || aircraftModel.hit) {
            return;
        }

        cc.save();

        const paddingLR = 5;
        let match = false;

        // Callsign Matching
        if (prop.input.callsign.length > 0 && aircraftModel.matchCallsign(prop.input.callsign)) {
            match = true;
        }

        let white = aircraftModel.isControllable ?
            this.theme.DATA_BLOCK.TEXT_IN_RANGE :
            this.theme.DATA_BLOCK.TEXT_OUT_OF_RANGE;

        if (match) {
            white = this.theme.DATA_BLOCK.TEXT_SELECTED;
        }

        cc.textBaseline = 'middle';

        let { dataBlockLeaderDirection } = radarTargetModel;

        if (dataBlockLeaderDirection === INVALID_NUMBER) {
            dataBlockLeaderDirection = this.theme.DATA_BLOCK.LEADER_DIRECTION;
        }

        let offsetComponent = [
            Math.sin(degreesToRadians(dataBlockLeaderDirection)),
            -Math.cos(degreesToRadians(dataBlockLeaderDirection))
        ];

        // `degreesToRadians('ctr')` above will yield NaN, so we override that here
        if (dataBlockLeaderDirection === 'ctr') {
            offsetComponent = [0, 0];
        }

        // Move to center of where the data block is to be drawn
        const radarTargetPosition = this._viewport.calculateRoundedCanvasPositionFromRelativePosition(
            aircraftModel.relativePosition
        );
        const leaderLength = this._calculateLeaderLength(radarTargetModel.dataBlockLeaderLength);
        const leaderStart = [
            radarTargetPosition[0] + (offsetComponent[0] * this.theme.DATA_BLOCK.LEADER_PADDING_FROM_TARGET_PX),
            radarTargetPosition[1] + (offsetComponent[1] * this.theme.DATA_BLOCK.LEADER_PADDING_FROM_TARGET_PX)
        ];
        const leaderEnd = [
            radarTargetPosition[0] + offsetComponent[0] * (leaderLength - this.theme.DATA_BLOCK.LEADER_PADDING_FROM_BLOCK_PX),
            radarTargetPosition[1] + offsetComponent[1] * (leaderLength - this.theme.DATA_BLOCK.LEADER_PADDING_FROM_BLOCK_PX)
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

        this._drawLegacyDatablock(cc, aircraftModel);

        // height of TOTAL vertical space between the rows (0 for touching)
        const gap = 3;
        const lineheight = 4.5; // height of text row (used for spacing basis)
        const row1text = radarTargetModel.buildDataBlockRowOne();
        let row2text = radarTargetModel.buildDataBlockRowTwoPrimaryInfo();

        if (this.shouldShowSecondaryDataBlock()) {
            row2text = radarTargetModel.buildDataBlockRowTwoSecondaryInfo();
        }

        const fillStyle = aircraftModel.isControllable ?
            this.theme.DATA_BLOCK.TEXT_IN_RANGE :
            this.theme.DATA_BLOCK.TEXT_OUT_OF_RANGE;

        cc.fillStyle = fillStyle;

        // Draw full datablock text
        cc.font = this.theme.DATA_BLOCK.TEXT_FONT;
        cc.textAlign = 'left';
        cc.fillText(row1text, -this.theme.DATA_BLOCK.HALF_WIDTH + paddingLR, -gap / 2 - lineheight);
        cc.fillText(row2text, -this.theme.DATA_BLOCK.HALF_WIDTH + paddingLR, gap / 2 + lineheight);
        cc.font = BASE_CANVAS_FONT;

        cc.restore();
    }

    /**
     * Draw the legacy dataBlock
     *
     * POSITIONING: Before calling this method, translate to the AIRCRAFT'S DATA BLOCK CENTER
     *
     * @for CanvasController
     * @method
     * @param {HTMLCanvasContext} cc
     * @param {AircraftModel} aircraftModel
     * @returns undefined
     * @private
     */
    _drawLegacyDatablock(cc, aircraftModel) {
        if (!this.theme.DATA_BLOCK.HAS_FILL) {
            return;
        }

        // TODO: logic and math here should be done once and not every frame. this could be moved to the `RadarTargetModel`
        // width of datablock (scales to fit callsign)
        const width = this.theme.DATA_BLOCK.WIDTH; // clamp(1, 6 * callsign.length) + (paddingLR * 2);
        const halfWidth = this.theme.DATA_BLOCK.HALF_WIDTH; // width / 2;
        // height of datablock
        const height = this.theme.DATA_BLOCK.HEIGHT; // 31;
        const halfHeight = this.theme.DATA_BLOCK.HALF_HEIGHT; // height / 2;
        // width of colored bar
        const barWidth = 3;
        const barHalfWidth = barWidth / 2;
        // const ILS_enabled = aircraftModel.pilot.hasApproachClearance;
        const lock_size = height / 3;
        const lock_offset = lock_size / 8;
        const point1 = lock_size - barHalfWidth;
        const a = point1 - lock_offset;
        const b = barHalfWidth;
        const clipping_mask_angle = Math.atan(b / a);
        // describes how far around to arc the arms of the ils lock case
        const pi_slice = Math.PI / 24;
        let match = false;

        // Callsign Matching
        if (prop.input.callsign.length > 0 && aircraftModel.matchCallsign(prop.input.callsign)) {
            match = true;
        }

        // set color, intensity, and style elements
        let red = this.theme.DATA_BLOCK.ARRIVAL_BAR_OUT_OF_RANGE;
        let green = this.theme.DATA_BLOCK.BACKGROUND_OUT_OF_RANGE;
        let blue = this.theme.DATA_BLOCK.DEPARTURE_BAR_OUT_OF_RANGE;
        let white = this.theme.DATA_BLOCK.TEXT_OUT_OF_RANGE;

        if (aircraftModel.isControllable) {
            red = this.theme.DATA_BLOCK.ARRIVAL_BAR_IN_RANGE;
            green = this.theme.DATA_BLOCK.BACKGROUND_IN_RANGE;
            blue = this.theme.DATA_BLOCK.DEPARTURE_BAR_IN_RANGE;
            white = this.theme.DATA_BLOCK.TEXT_IN_RANGE;

            if (match) {
                red = this.theme.DATA_BLOCK.ARRIVAL_BAR_SELECTED;
                green = this.theme.DATA_BLOCK.BACKGROUND_SELECTED;
                blue = this.theme.DATA_BLOCK.DEPARTURE_BAR_SELECTED;
                white = this.theme.DATA_BLOCK.TEXT_SELECTED;
            }
        }

        // Draw datablock shapes
        if (!aircraftModel.pilot.hasApproachClearance && this.theme.DATA_BLOCK.HAS_FILL) {
            // data block box background fill
            cc.fillStyle = green;
            cc.fillRect(-halfWidth, -halfHeight, width, height);

            // Draw colored bar
            cc.fillStyle = (aircraftModel.category === FLIGHT_CATEGORY.DEPARTURE) ? blue : red;
            cc.fillRect(-halfWidth - barWidth, -halfHeight, barWidth, height);

            return;
        }

        // Box with ILS Lock Indicator
        cc.save();

        // Draw green part of box (excludes space where ILS Clearance Indicator juts in)
        cc.fillStyle = green;
        cc.beginPath();
        cc.moveTo(-halfWidth, halfHeight); // bottom-left corner
        cc.lineTo(halfWidth, halfHeight); // bottom-right corner
        cc.lineTo(halfWidth, -halfHeight); // top-right corner
        cc.lineTo(-halfWidth, -halfHeight); // top-left corner
        cc.lineTo(-halfWidth, -point1); // begin side cutout
        cc.arc(-halfWidth - barHalfWidth,
            -lock_offset, lock_size / 2 + barHalfWidth,
            clipping_mask_angle - Math.PI / 2,
            0);
        cc.lineTo(-halfWidth + lock_size / 2, lock_offset);
        cc.arc(-halfWidth - barHalfWidth,
            lock_offset,
            lock_size / 2 + barHalfWidth,
            0,
            Math.PI / 2 - clipping_mask_angle);
        cc.closePath();
        cc.fill();

        // Draw ILS Clearance Indicator
        cc.translate(-halfWidth - barHalfWidth, 0);
        cc.lineWidth = barWidth;
        cc.strokeStyle = red;
        cc.beginPath(); // top arc start
        cc.arc(0, -lock_offset, lock_size / 2, -pi_slice, Math.PI + pi_slice, true);
        cc.moveTo(0, -lock_size / 2);
        cc.lineTo(0, -halfHeight);
        cc.stroke(); // top arc end
        cc.beginPath(); // bottom arc start
        cc.arc(0, lock_offset, lock_size / 2, pi_slice, Math.PI - pi_slice);
        cc.moveTo(0, lock_size - barWidth);
        cc.lineTo(0, halfHeight);
        cc.stroke(); // bottom arc end

        if (aircraftModel.isEstablishedOnCourse()) {
            // Localizer Capture Indicator
            cc.fillStyle = white;
            cc.beginPath();
            cc.arc(0, 0, lock_size / 5, 0, Math.PI * 2);
            cc.fill(); // Draw Localizer Capture Dot
        }

        cc.translate(halfWidth + barHalfWidth, 0);
        // unclear how this works...
        cc.beginPath(); // if removed, white lines appear on top of bottom half of lock case
        cc.stroke(); // if removed, white lines appear on top of bottom half of lock case

        cc.restore();
    }

    /**
     * Draw data blocks for each aircraft
     *
     * POSITIONING: Before calling this method, ensure NO TRANSLATION has occurred
     *
     * @for CanvasController
     * @method _drawAircraftDataBlocks
     * @param cc {HTMLCanvasContext}
     * @returns undefined
     * @private
     */
    _drawAircraftDataBlocks(cc) {
        const radarTargetModels = this._scopeModel.radarTargetCollection.items;

        cc.save();
        this._ccTranslateFromCanvasOriginToAirportCenter(cc);

        for (let i = 0; i < radarTargetModels.length; i++) {
            this._drawSingleAircraftDataBlock(cc, radarTargetModels[i]);
        }

        cc.restore();
    }

    // TODO: To round, or not to round?
    /**
     * From the canvas origin, cc.translate() to the airport center, adjusting for user panning
     *
     * @for CanvasController
     * @method _ccTranslateFromCanvasOriginToAirportCenter
     * @param cc {HTMLCanvasContext}
     * @returns undefined
     * @private
     */
    _ccTranslateFromCanvasOriginToAirportCenter(cc) {
        cc.translate(
            round(this._viewport.halfWidth),
            round(this._viewport.halfHeight)
        );
    }

    // TODO: To round, or not to round?
    /**
     * From the airport center, cc.translate() to the canvas origin, adjusting for user panning
     *
     * @for CanvasController
     * @method _ccTranslateFromAirportCenterToCanvasOrigin
     * @param cc {HTMLCanvasContext}
     * @returns undefined
     * @private
     */
    _ccTranslateFromAirportCenterToCanvasOrigin(cc) {
        cc.translate(
            -round(this._viewport.halfWidth),
            -round(this._viewport.halfHeight)
        );
    }

    // TODO: this method should be removed or reworked.
    /**
     * Draw the compass around the edge of the scope view
     *
     * POSITIONING: Before calling this method, ensure NO TRANSLATION has occurred
     *
     * @for CanvasController
     * @method _drawSelectedAircraftCompass
     * @param cc {HTMLCanvasContext}
     * @returns undefined
     * @private
     */
    _drawSelectedAircraftCompass(cc) {
        if (GameController.game_paused()) {
            return;
        }

        const callsign = prop.input.callsign.toUpperCase();

        if (callsign.length === 0) {
            return;
        }

        // TODO: this should be a method on the `AircraftController` if one doesn't already exist.
        // Get the selected aircraft.
        const aircraft = _filter(this._aircraftController.aircraft.list, (p) => {
            return p.matchCallsign(callsign) && p.isVisible();
        })[0];

        if (!aircraft) {
            return;
        }

        const canvasOrigin = [0, 0];
        const canvasSize = [this._viewport.width, this._viewport.height];
        const aircraftPosition = this._toCanvasPosition(aircraft.relativePosition);

        cc.save();

        // generic styles of the compass marks
        cc.strokeStyle = this.theme.SCOPE.COMPASS_HASH;
        cc.fillStyle = this.theme.SCOPE.COMPASS_TEXT;
        cc.textAlign = 'center';
        cc.textBaseline = 'middle';

        // Compute the intersection point between a ray originating from the
        // aircraft at a given heading angle and the canvas boundaries, for
        // each heading angle between 0 and 360 (by 1 degree increment)
        for (let heading = 1; heading <= 360; heading++) {
            // compute the 2D unit vector representing the ray direction using the given
            // heading angle
            const rayUnitVector = vectorize2dFromDegrees(heading);

            // Use the opposite of the y component of the vector because of the vertical
            // axes of the reference frames being oriented in opposite directions
            rayUnitVector[1] = -rayUnitVector[1];

            // compute the intersection point between the ray and the canvas
            const intersection = positive_intersection_with_rect(
                aircraftPosition,
                rayUnitVector,
                canvasOrigin,
                canvasSize
            );

            if (!intersection) {
                continue;
            }

            // draw a mark and label at the intersection point
            // standard marks on all headings
            // minor marks on headings multiple of 5 degrees
            // major marks on headings multiple of 10 degrees
            let markLen = 8;

            if (heading % 5 === 0) {
                markLen = heading % 10 === 0 ? 16 : 12;
            }

            const markWeight = heading % 30 === 0 ? 2 : 1;

            // use the opposite of the length to draw toward the inside of the canvas
            const markVector = vscale(rayUnitVector, -markLen);
            const markStartPoint = intersection;
            const markEndPoint = vadd(markStartPoint, markVector);

            // draw the mark
            cc.lineWidth = markWeight;
            cc.beginPath();
            cc.moveTo(...markStartPoint);
            cc.lineTo(...markEndPoint);
            cc.stroke();

            // only draw label on major marks
            if (heading % 10 !== 0) {
                continue;
            }

            // set label font heavier every 3 major marks
            cc.font = heading % 30 === 0 ?
                'bold 10px monoOne, monospace' :
                BASE_CANVAS_FONT;

            const text = `${String(heading).padStart(3, '0')}`;
            const textWidth = cc.measureText(text).width;

            // draw the label
            cc.fillText(
                text,
                markEndPoint[0] - rayUnitVector[0] * (textWidth / 2 + 4),
                markEndPoint[1] - rayUnitVector[1] * 7
            );
        }

        cc.restore();
    }

    /**
     * Find a canvas context stored within `#_context`
     *
     * @for CanvasController
     * @method _getCanvasContextByName
     * @param name {string} name of the canvas you desire
     * @returns {HTMLCanvasContext}
     * @private
     */
    _getCanvasContextByName(name) {
        return this._canvasHost.getContext(name);
    }

    // TODO: this duplicates (but is slightly different than) the more widely-used method of
    // `CanvasStageModel.calculatePreciseCanvasPositionFromRelativePosition()`. What is the
    // difference, and can _toCanvasPosition() be removed in favor of using the former?
    /**
     * Transform a scope relative position to a canvas relative position.
     *
     * NOTE: DONT USE ME! I AM BEING DEPRECATED! INSTEAD USE:
     * `CanvasStageModel.calculatePreciseCanvasPositionFromRelativePosition()`
     *
     * POSITIONING: Before calling this method, ensure NO TRANSLATION has occurred
     *
     * Create a vector "vCanvasToScope" describing the position of the canvas
     * relative to the scope, and simply add it to the given position to get the
     * position relative to the canvas.
     *
     * The vertical axes are oriented in opposite direction in our source and
     * destination frames of reference (scope versus canvas), so the y component of
     * the given position need to be "reversed".
     *
     * The given position in expressed in kilometers so it needs to be
     * translated to pixels.
     *
     * @for CanvasController
     * @method _toCanvasPosition
     * @param positionFromScope {array<number>} relative position, in km offset from airport center
     * @returns {array<number>} canvas position, in pixels
     * @private
     */
    _toCanvasPosition(positionFromScope) {
        // positionFromScope is given in kilometers so it needs to be translated
        // to pixels first

        // use the opposite of the y component of the aircraft position because
        // the vertical axes are not oriented in the same direction in the
        // scope (aircraft) frame of reference versus the canvas frame of reference
        positionFromScope = [
            this._viewport._translateKilometersToPixels(positionFromScope[0]),
            -this._viewport._translateKilometersToPixels(positionFromScope[1])
        ];

        const scopePositionRelativeToView = [this._viewport._panX, this._viewport._panY];
        const viewPositionRelativeToCanvasOrigin = [this._viewport.halfWidth, this._viewport.halfHeight];
        const scopePositionRelativeToCanvasOrigin = vadd(viewPositionRelativeToCanvasOrigin, scopePositionRelativeToView);

        return vadd(scopePositionRelativeToCanvasOrigin, positionFromScope);
    }

    /**
     * Calculate the length of the leader line connecting the target to the data block
     *
     * @for CanvasController
     * @method _calculateLeaderLength
     * @param dataBlockLeaderLength {number} from RadarTargetModel#dataBlockLeaderLength
     * @return {number} length, in pixels
     * @private
     */
    _calculateLeaderLength(dataBlockLeaderLength) {
        return dataBlockLeaderLength *
            this.theme.DATA_BLOCK.LEADER_LENGTH_INCREMENT_PIXELS +
            this.theme.DATA_BLOCK.LEADER_LENGTH_ADJUSTMENT_PIXELS -
            this.theme.DATA_BLOCK.LEADER_PADDING_FROM_BLOCK_PX -
            this.theme.DATA_BLOCK.LEADER_PADDING_FROM_TARGET_PX;
    }

    /**
     * Mark the canvas as dirty, forcing a redraw during the next frame
     *
     * This method should only be called via the `EventBus`
     * Facade method for `._markShallowRender()`
     *
     * @for CanvasController
     * @method _onMarkDirtyCanvas
     * @returns undefined
     * @private
     */
    _onMarkDirtyCanvas() {
        this._markShallowRender();
    }

    /**
     * Update local props as a result of the user panning the view
     *
     * This method will only be `trigger`ed by some other
     * class via the `EventBus`
     *
     * @for CanvasController
     * @method _onChangeViewportPan
     * @returns undefined
     * @private
     */
    _onChangeViewportPan() {
        this._markDeepRender();
    }

    /**
     * Update local props as a result of a change in the current zoom level
     *
     * This method will only be `trigger`ed by some other
     * class via the `EventBus`
     *
     * @for CanvasController
     * @method _onChangeViewportZoom
     * @returns undefined
     * @private
     */
    _onChangeViewportZoom() {
        this._markDeepRender();
    }

    /**
     * Toogle current value of `#_shouldDrawAirspace`
     *
     * This method will only be `trigger`ed by some other
     * class via the `EventBus`
     *
     * @for CanvasController
     * @method _onToggleAirspace
     * @returns undefined
     * @private
     */
    _onToggleAirspace() {
        this._shouldDrawAirspace = !this._shouldDrawAirspace;

        this._markDeepRender();
    }

    /**
     * Toogle current value of `#draw_labels`
     *
     * This method will only be `trigger`ed by some other
     * class via the `EventBus`
     *
     * @for CanvasController
     * @method _onToggleLabels
     * @returns undefined
     * @private
     */
    _onToggleLabels() {
        this._shouldDrawFixLabels = !this._shouldDrawFixLabels;

        this._markDeepRender();
    }

    /**
     * Toogle current value of `#draw_restricted`
     *
     * This method will only be `trigger`ed by some other
     * class via the `EventBus`
     *
     * @for CanvasController
     * @method _onToggleRestrictedAreas
     * @returns undefined
     * @private
     */
    _onToggleRestrictedAreas() {
        this._shouldDrawRestrictedAreas = !this._shouldDrawRestrictedAreas;

        this._markDeepRender();
    }

    /**
     * Toogle current value of `#draw_sids`
     *
     * This method will only be `trigger`ed by some other
     * class via the `EventBus`
     *
     * @for CanvasController
     * @method _onToggleSidMap
     * @returns undefined
     * @private
     */
    _onToggleSidMap() {
        this._shouldDrawSidMap = !this._shouldDrawSidMap;

        this._markDeepRender();
    }

    /**
     * Toogle display of STAR routes
     *
     * This method will only be `trigger`ed by some other
     * class via the `EventBus`
     *
     * @for CanvasController
     * @method _onToggleStarMap
     * @returns undefined
     * @private
     */
    _onToggleStarMap() {
        this._shouldDrawStarMap = !this._shouldDrawStarMap;

        this._markDeepRender();
    }

    /**
     * Toogle current value of `#draw_terrain`
     *
     * This method will only be `trigger`ed by some other
     * class via the `EventBus`
     *
     * @for CanvasController
     * @method _onToggleTerrain
     * @returns undefined
     * @private
     */
    _onToggleTerrain() {
        this._shouldDrawTerrain = !this._shouldDrawTerrain;

        this._markDeepRender();
    }

    /**
     * Toogle display of video map
     *
     * This method will only be `trigger`ed by some other
     * class via the `EventBus`
     *
     * @for CanvasController
     * @method _onToggleVideoMap
     * @returns undefined
     * @private
     */
    _onToggleVideoMap(mapNames) {
        AirportController.airport_get().mapCollection.setVisibleMaps(mapNames);

        this._markDeepRender();
    }

    /**
     * Notify that the range rings value has changed by the user.
     *
     * This method will only be `trigger`ed by some other
     * class via the `EventBus`
     *
     * @for CanvasController
     * @method _onRangeRingsChange
     * @returns undefined
     * @private
     */
    _onRangeRingsChange() {
        this._markDeepRender();
    }

    /**
     * Mark the render scheduler shallow-dirty, forcing a redraw
     * on the next frame.
     *
     * This method should be used for forcing redraws on _dynamic_ elements
     * only. In the future this will mean only items contained within the
     * `CANVAS_NAME.DYNAMIC` will be redrawn.
     *
     * @for CanvasController
     * @method _markShallowRender
     * @returns undefined
     * @private
     */
    _markShallowRender() {
        this._renderScheduler.markShallow();
    }

    /**
     * Mark the render scheduler deep-dirty (static and dynamic), thus
     * forcing a redraw of both canvases on the next frame.
     *
     * This method should be used for forcing redraws on dynamic _and_ static elements.
     * In the future this will mean both `CANVAS_NAME.STATIC` and `CANVAS_NAME.DYNAMIC`
     * will be redrawn on the next frame.
     *
     * @for CanvasController
     * @method _markDeepRender
     * @returns undefined
     * @private
     */
    _markDeepRender() {
        this._renderScheduler.markDeep();
    }

    /**
     * Trigger _markShallowRender() when an aircraft is selected, thus
     * forcing a redraw of the dynamic canvas on the next frame.
     *
     * @for CanvasController
     * @method _onSelectAircraft
     * @returns undefined
     * @private
     */
    _onSelectAircraft() {
        this._markShallowRender();
    }

    /**
     * Trigger _markShallowRender() when an aircraft is deselected, thus
     * forcing a redraw of the dynamic canvas on the next frame.
     *
     * @for CanvasController
     * @method _onDeselectAircraft
     * @returns undefined
     * @private
     */
    _onDeselectAircraft() {
        this._markShallowRender();
    }

    /**
     * Center a point in the view
     *
     * Used only for centering view on an aircraft position using
     * the x, y of an aircraft's `relativePosition`
     *
     * @for CanvasController
     * @method _onCenterPointInView
     * @param relativePosition {array<string>}
     * @returns undefined
     * @private
     */
    _onCenterPointInView(relativePosition) {
        const newPanX = -round(this._viewport._translateKilometersToPixels(relativePosition[0]));
        const newPanY = round(this._viewport._translateKilometersToPixels(relativePosition[1]));

        this._viewport.updatePan(newPanX, newPanY);
    }

    /**
     * Callback method fired when an airport is changed
     *
     * Changing an airport will require a complete re-draw of all
     * items on all canvases, thus we call `._markDeepRender()` here
     * to initiate that process
     *
     * @for CanvasController
     * @method _onAirportChange
     * @returns undefined
     * @private
     */
    _onAirportChange() {
        this._markDeepRender();
    }

    /**
     * Change theme to the specified name
     *
     * This should ONLY be called through the EventBus during a `SET_THEME` event,
     * thus ensuring that the same theme is always in use by all app components
     *
     * This method must remain an arrow function in order to preserve the scope
     * of `this`, since it is being invoked by an EventBus callback
     *
     * @for CanvasController
     * @method _setTheme
     * @param themeName {string}
     * @returns undefined
     * @private
     */
    _setTheme(themeName) {
        if (!_has(THEME, themeName)) {
            console.error(`Expected valid theme to change to, but received '${themeName}'`);

            return;
        }

        // TODO: abstract to method
        if (this.theme !== null) {
            this.$element.removeClass(this.theme.CLASSNAME);
        }

        this.theme = THEME[themeName];
        // TODO: abstract to method
        this.$element.addClass(this.theme.CLASSNAME);
        this._markDeepRender();
    }
}
