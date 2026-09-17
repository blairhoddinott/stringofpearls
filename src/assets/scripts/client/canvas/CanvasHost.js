import $ from 'jquery';
import CanvasStageModel from './CanvasStageModel';
import { CANVAS_NAME } from '../constants/canvasConstants';

/**
 * Owns the browser-bound canvas DOM/context lifecycle for the scope.
 *
 * This is the presentation-layer extraction of the `<canvas>` creation, the
 * `getContext('2d')` acquisition, the per-context sizing/HiDPI adjustment and
 * the context clearing that previously lived inline in `CanvasController`. It is
 * explicitly the browser canvas host, so it may reach for `jQuery`, the shared
 * `CanvasStageModel` and the `window` global; it performs no drawing and owns no
 * render dirty-state or simulation behavior.
 *
 * @class CanvasHost
 */
export default class CanvasHost {
    /**
     * @constructor
     * @param $element {JQuery|HTML Element} container element for the `<canvas>` elements
     * @param stageModel {CanvasStageModel}  supplies canvas dimensions; defaults to the shared singleton
     */
    constructor($element, stageModel = CanvasStageModel) {
        /**
         * Reference to the `window` object
         *
         * @property $window
         * @type {JQuery|HTML Element}
         */
        this.$window = $(window);

        /**
         * Container element to which the `<canvas />` elements are appended
         *
         * @property $element
         * @type {JQuery|HTML Element}
         */
        this.$element = $element;

        /**
         * Supplies the current canvas dimensions.
         *
         * @property _stageModel
         * @type {CanvasStageModel}
         * @private
         */
        this._stageModel = stageModel;

        /**
         * @property _context
         * @type {object<string, HTMLCanvasContext>}
         * @private
         */
        this._context = {};

        /**
         * Flag used to determine if the canvas dimensions should be resized
         *
         * @property _shouldResize
         * @type {boolean}
         * @default true
         * @private
         */
        this._shouldResize = true;
    }

    /**
     * Create the `<canvas>` elements and store their 2d contexts.
     *
     * @for CanvasHost
     * @method init
     * @chainable
     */
    init() {
        this._addCanvas(CANVAS_NAME.STATIC);
        this._addCanvas(CANVAS_NAME.DYNAMIC);

        return this;
    }

    /**
     * Re-calculate the canvas dimensions.
     *
     * When `_shouldResize` is true the stage model is updated once from the
     * current window dimensions before the contexts are sized; otherwise the
     * existing stage dimensions are reused.
     *
     * @for CanvasHost
     * @method resize
     * @chainable
     */
    resize() {
        if (this._shouldResize) {
            this._stageModel.updateHeightAndWidth(
                this.$window.height(),
                this.$window.width()
            );
        }

        for (const canvasName in this._context) {
            const context = this._context[canvasName];
            context.canvas.height = this._stageModel.height;
            context.canvas.width = this._stageModel.width;

            this._adjustHidpi(canvasName);
        }

        return this;
    }

    /**
     * Find a canvas context stored within `#_context`
     *
     * @for CanvasHost
     * @method getContext
     * @param name {string} name of the canvas you desire
     * @returns {HTMLCanvasContext}
     */
    getContext(name) {
        return this._context[name];
    }

    /**
     * Clear the provided canvas context
     *
     * @for CanvasHost
     * @method clearContext
     * @param context {HTMLCanvasContext}
     * @returns undefined
     */
    clearContext(context) {
        context.clearRect(0, 0, this._stageModel.width, this._stageModel.height);
    }

    /**
     * Release this host's window/element/context references.
     *
     * The shared stage model is intentionally retained.
     *
     * @for CanvasHost
     * @method destroy
     * @chainable
     */
    destroy() {
        this.$window = null;
        this.$element = null;
        this._context = {};
        this._shouldResize = true;

        return this;
    }

    /**
     * Add a `canvas` element to the DOM and store its 2d context
     *
     * @for CanvasHost
     * @method _addCanvas
     * @param name {CANVAS_NAME|string}
     * @private
     */
    _addCanvas(name) {
        const canvasTemplate = `<canvas id='${name}-canvas'></canvas>`;

        this.$element.append(canvasTemplate);

        this._context[name] = $(`#${name}-canvas`).get(0).getContext('2d');
    }

    /**
     * Apply the HiDPI backing-store adjustment for the named context.
     *
     * @for CanvasHost
     * @method _adjustHidpi
     * @param canvasName {CANVAS_NAME|string}
     * @private
     */
    _adjustHidpi(canvasName) {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const canvasContext = this._context[canvasName];

        if (devicePixelRatio <= 1) {
            return;
        }

        const $canvasElement = $(`#${canvasContext.canvas.id}`).get(0);

        $($canvasElement).attr('height', this._stageModel.height * devicePixelRatio);
        $($canvasElement).css('height', this._stageModel.height);
        $($canvasElement).attr('width', this._stageModel.width * devicePixelRatio);
        $($canvasElement).css('width', this._stageModel.width);

        canvasContext.scale(devicePixelRatio, devicePixelRatio);
    }
}
