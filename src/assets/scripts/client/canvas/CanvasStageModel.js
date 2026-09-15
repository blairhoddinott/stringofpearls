import EventBus from '../lib/EventBus';
import { round } from '../math/core';
import { EVENT } from '../constants/eventNames';
import {
    DEFAULT_CANVAS_SIZE,
    PAN,
    SCALE
} from '../constants/canvasConstants';
import { STORAGE_KEY } from '../constants/storageKeys';
import { INVALID_NUMBER } from '../constants/globalConstants';

/**
 * Singleton responsible for mantining canvas dimensions, pan and zoom
 *
 * Also provides methods for translating `[x, y]` positions to
 * and from kilometers or pixels
 *
 * POSITION INFO:
 * "Page Position": the position on the canvas, where the top-left is 0,0 (returned by click events)
 *      V     (shift coordinate origin from top-left to center of canvas)
 * "Canvas Position": the position on the canvas, in pixels, where the canvas center is 0,0 (used in most canvas drawing)
 *      V     (adjust for pan and scale values)
 * "Relative Position": a geographical distance based offset, in km, from the airport center, along magnetic north
 *      V     (haversine math from DynamicPositionModel to find GPS coordinates based on dist/dir from known coordinates)
 * "GPS Coordinates": the latitude/longitude values of a given position
 *
 * @class CanvasStageModel
 */
class CanvasStageModel {
    /**
     * @constructor
     */
    constructor() {
        /**
         * @property _eventBus
         * @type {EventBus}
         * @private
         */
        this._eventBus = EventBus;

        /**
         * Pixel height of the canvas(es)
         *
         * @property height
         * @type {number}
         * @default INVALID_NUMBER
         * @private
         */
        this._height = INVALID_NUMBER;

        /**
         * Pixel width of the canvas(es)
         *
         * @property width
         * @type {number}
         * @default INVALID_NUMBER
         * @private
         */
        this._width = INVALID_NUMBER;

        /**
         * Midpoint of view along the `x` coordinate
         *
         * @property _panX
         * @type {number}
         * @default INVALID_NUMBER
         * @private
         */
        this._panX = INVALID_NUMBER;

        /**
         * Midpoint of view along the `y` coordinate
         *
         * @property _panY
         * @type {number}
         * @default INVALID_NUMBER
         * @private
         */
        this._panY = INVALID_NUMBER;

        /**
         * pixels per km
         *
         * @property _defaultScale
         * @type {number}
         * @default INVALID_NUMBER
         * @private
         */
        this._defaultScale = INVALID_NUMBER;

        /**
         * maximum scale value
         *
         * @property _scaleMax
         * @type {number}
         * @default INVALID_NUMBER
         * @private
         */
        this._scaleMax = INVALID_NUMBER;

        /**
         * minimum scale value
         *
         * @property _scaleMin
         * @type {number}
         * @default INVALID_NUMBER
         * @private
         */
        this._scaleMin = INVALID_NUMBER;

        /**
         * Current scale value
         *
         * scale is essentially the zoom value, the larger the
         * scale the closer the current zoom.
         *
         * @property _scale
         * @type {number}
         * @default INVALID_NUMBER
         * @private
         */
        this._scale = INVALID_NUMBER;

        /**
         * Persistence boundary used to read and write the zoom level.
         *
         * Remains `null` until a composition root configures it through
         * `initStorage()`, so import-time construction never touches a
         * browser global.
         *
         * @property _storageAdapter
         * @type {StorageAdapter}
         * @default null
         * @private
         */
        this._storageAdapter = null;

        return this._init();
    }

    /**
     * @property height
     * @type {number}
     */
    get height() {
        return this._height;
    }

    /**
     * @property halfHeight
     * @type {number}
     */
    get halfHeight() {
        return round(this._height / 2);
    }

    /**
     * @property scale
     * @type {number}
     */
    get scale() {
        return this._scale;
    }

    /**
     * @property width
     * @type {number}
     */
    get width() {
        return this._width;
    }

    /**
     * @property halfWidth
     * @type {number}
     */
    get halfWidth() {
        return round(this._width / 2);
    }

    /**
     * @for CanvasStageModel
     * @method _init
     * @private
     */
    _init() {
        this._height = DEFAULT_CANVAS_SIZE.HEIGHT;
        this._width = DEFAULT_CANVAS_SIZE.WIDTH;
        this._panX = PAN.X;
        this._panY = PAN.Y;
        this._defaultScale = SCALE.DEFAULT;
        this._scaleMin = SCALE.MIN;
        this._scaleMax = SCALE.MAX;
        this._scale = this._retrieveZoomLevelFromStorageOrDefault();
    }

    /**
     * Configure the persistence boundary used for the zoom level.
     *
     * Called by `CanvasController` during construction, at the composition
     * root, before any normal canvas behavior. Storing the adapter and
     * rehydrating `#_scale` from it is the only way this singleton reaches
     * storage; before this runs it stays browser-global-free.
     *
     * @for CanvasStageModel
     * @method initStorage
     * @param storageAdapter {StorageAdapter}  boundary exposing `get(key)`/`set(key, value)`
     */
    initStorage(storageAdapter) {
        this._storageAdapter = storageAdapter == null ? null : storageAdapter;
        this._scale = this._retrieveZoomLevelFromStorageOrDefault();
    }

    /**
     * @for CanvasStageModel
     * @method reset
     */
    reset() {
        this._height = INVALID_NUMBER;
        this._width = INVALID_NUMBER;
        this._panX = INVALID_NUMBER;
        this._panY = INVALID_NUMBER;
        this._defaultScale = INVALID_NUMBER;
        this._scaleMax = INVALID_NUMBER;
        this._scaleMin = INVALID_NUMBER;
        this._scale = INVALID_NUMBER;
        this._storageAdapter = null;
    }

    /**
     * Translate a kilometer value to pixels based on the current `#_scale` value
     *
     * @for CanvasStageModel
     * @method _translateKilometersToPixels
     * @param kilometerValue {number}   value in kilometers
     * @return {number}                 value in pixels
     * @private
     */
    _translateKilometersToPixels(kilometerValue) {
        return kilometerValue * this._scale;
    }

    /**
     * Translate the specified x, y pixel coordinates to map kilometers
     *
     * @for CanvasStageModel
     * @method calculateRelativePositionFromCanvasPosition
     * @param x {number} canvas position X value, in px
     * @param y {number} canvas position Y value, in px
     * @returns {array<number>} [x, y], in km
     * @private
     */
    calculateRelativePositionFromCanvasPosition(x, y) {
        const relativePositionX = this.translatePixelsToKilometers(x - this._panX);
        const relativePositionY = this.translatePixelsToKilometers(y + this._panY);
        const relativePosition = [relativePositionX, relativePositionY];

        return relativePosition;
    }

    /**
     * Translate a page position, in pixels, as it relates to the browser window to canvas position
     *
     * @for CanvasStageModel
     * @method calculateCanvasPositionFromPagePosition
     * @param x {number}
     * @param y {number}
     * @return {array<number>}
     */
    calculateCanvasPositionFromPagePosition(x, y) {
        const canvasPositionX = x - this.halfWidth;
        const canvasPositionY = -y + this.halfHeight;

        return [canvasPositionX, canvasPositionY];
    }

    /**
     * Translate a pixel value to kilometers based on the current `#_scale` value
     *
     * @for CanvasStageModel
     * @method translatePixelsToKilometers
     * @param pixelValue {number}  value in pixels
     * @return {number}            value in kilometers
     */
    translatePixelsToKilometers(pixelValue) {
        return pixelValue / this._scale;
    }

    /**
     * Calculate a canvas position (in px) from the provided relative position (km offset from airport center)
     *
     * NOTE: The return values will be high precision floating-point numbers with subpixel resolution. This will cause the
     * browser to perform additional antialiasing, and therefore should not be used for things like aircraft projections.
     *
     * @for CanvasStageModel
     * @method calculatePreciseCanvasPositionFromRelativePosition
     * @param relativePosition {array<number>} `[x, y]` position coordinates (in km offset from airport center)
     * @return {array<number>} - `[154.173, 381.029]`
     */
    calculatePreciseCanvasPositionFromRelativePosition(relativePosition) {
        const [x, y] = relativePosition;
        const canvasX = this._translateKilometersToPixels(x) + this._panX;
        const canvasY = (this._translateKilometersToPixels(y) * -1) + this._panY;
        const precisePosition = [canvasX, canvasY];

        return precisePosition;
    }

    /**
     * Calculate a canvas position (in px) from the provided relative position (km offset from airport center)
     *
     * NOTE: The return values will be rounded to the nearest integer, and are thus not considered precise.
     *
     * Calls to this method should be used to calculate approximate canvas position, useful for plotting things
     * in an imprecise, but non-subpixelated manner, which are corrected for user panning. This method should
     * not be used to translate an aircraft position due to this inherent inaccuracy.
     *
     * @for CanvasStageModel
     * @method calculateRoundedCanvasPositionFromRelativePosition
     * @param relativePosition {array<number>} `[x, y]` position coordinates (in km offset from airport center)
     * @return {array<number>} - `[154.173, 381.029]`
     */
    calculateRoundedCanvasPositionFromRelativePosition(relativePosition) {
        const precisePosition = this.calculatePreciseCanvasPositionFromRelativePosition(relativePosition);
        const roundedPosition = [round(precisePosition[0]), round(precisePosition[1])];

        return roundedPosition;
    }

    /**
     * Update the current canvas dimensions
     *
     * Calls to this method will happen as a result of a browser window resize
     *
     * @for CanvasStageModel
     * @method updateHeightAndWidth
     * @param nextHeight {number}   next height value in pixels
     * @param nextWidth {number}    next width value in pixels
     */
    updateHeightAndWidth(nextHeight, nextWidth) {
        this._height = nextHeight - DEFAULT_CANVAS_SIZE.FOTTER_HEIGHT_OFFSET;
        this._width = nextWidth;
    }

    /**
     * Update the current pan values.
     *
     * @for CanvasStageModel
     * @method updatePan
     * @param x {number}
     * @param y {number}
     */
    updatePan(x, y) {
        this._panX = x;
        this._panY = y;

        this._eventBus.trigger(EVENT.PAN_VIEWPORT);
    }

    /**
     * @for CanvasStageModel
     * @method zoomIn
     */
    zoomIn() {
        const isZoomOut = true;

        this._updateZoom(isZoomOut);
    }

    /**
     * @for CanvasStageModel
     * @method zoomOut
     */
    zoomOut() {
        const isZoomOut = false;

        this._updateZoom(isZoomOut);
    }

    /**
     * Reset the current `#_scale` value to the `#_defaultScale`
     *
     * @for CanvasStageModel
     * @method zoomReset
     */
    zoomReset() {
        this._scale = this._defaultScale;

        this._storeZoomLevel();
        this._eventBus.trigger(EVENT.ZOOM_VIEWPORT);
    }

    /**
     * Look for a stored `#_scale` value through the storage boundary
     *
     * When no adapter has been configured, or the stored value is missing,
     * use the numeric `SCALE.DEFAULT` value. A present raw value is returned
     * verbatim (this boundary neither parses nor coerces it).
     *
     * @for CanvasStageModel
     * @method _retrieveZoomLevelFromStorageOrDefault
     * @return {number|string}
     * @private
     */
    _retrieveZoomLevelFromStorageOrDefault() {
        if (this._storageAdapter === null) {
            return SCALE.DEFAULT;
        }

        const storedScale = this._storageAdapter.get(STORAGE_KEY.ZOOM_LEVEL);

        // Web Storage `getItem()` returns `null` for a missing key; treat both
        // `null` and `undefined` as missing, while preserving any present raw
        // value (including falsy strings like `'0'` and `''`).
        if (storedScale == null) {
            return SCALE.DEFAULT;
        }

        return storedScale;
    }

    /**
     * Store the current `#_scale` value through the storage boundary
     *
     * When no adapter has been configured this is a safe no-op, so the
     * singleton remains usable before the composition root wires storage.
     *
     * @for CanvasStageModel
     * @method _storeZoomLevel
     * @private
     */
    _storeZoomLevel() {
        if (this._storageAdapter === null) {
            return;
        }

        this._storageAdapter.set(STORAGE_KEY.ZOOM_LEVEL, this._scale);
    }

    /**
     * Update the current `#_scale` value
     *
     * @for CanvasStageModel
     * @method _updateScale
     * @param isZoomIn {boolean}
     * @private
     */
    _updateScale(isZoomIn) {
        if (isZoomIn) {
            this._scale = Math.min(this._scale / SCALE.CHANGE_FACTOR, this._scaleMax);

            return;
        }

        this._scale = Math.max(this._scale * SCALE.CHANGE_FACTOR, this._scaleMin);
    }

    /**
     * Update the current `#_panX`, `#_panY`, and `#_scale` values
     *
     * When a user changes the zoom level, we must also adjust pan
     * values to account for a change in `#_scale`. Pixel dimensions of
     * the canvas don't change on zoom, but the `#_scale` does. So we
     * must re-calculate current pan values with the updated `#_scale`
     *
     * Calling this method will trigger an `EventBus` event that the
     * `CanvasController` is listening for that will trigger a deepRender
     *
     * @for CanvasStageModel
     * @method _updateZoom
     * @param isZoomIn {boolean}  flag for when use is zooming in
     * @private
     */
    _updateZoom(isZoomIn) {
        // store current pan in km, so it can be re-calculated with an updated `_#scale`
        const previousX = round(this.translatePixelsToKilometers(this._panX));
        const previousY = round(this.translatePixelsToKilometers(this._panY));

        this._updateScale(isZoomIn);

        // take previous pan values (in km) and calculate their current position
        // based on the new `#_scale` value
        const nextPanX = round(this._translateKilometersToPixels(previousX));
        const nextPanY = round(this._translateKilometersToPixels(previousY));

        this.updatePan(nextPanX, nextPanY);
        this._storeZoomLevel();
        this._eventBus.trigger(EVENT.ZOOM_VIEWPORT);
    }
}

export default new CanvasStageModel();
