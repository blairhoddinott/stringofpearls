/**
 * @typedef {Object} ViewportInputState
 * @property {boolean} isMouseDown
 *
 * @typedef {Object} GestureViewport
 * @property {number} _panX
 * @property {number} _panY
 * @property {() => unknown} zoomIn
 * @property {() => unknown} zoomOut
 * @property {() => unknown} zoomReset
 * @property {(x: number, y: number) => unknown} updatePan
 *
 * @typedef {{ wheelDelta: number, detail?: number } | { wheelDelta?: number, detail: number }} WheelDeltaEvent
 *
 * @typedef {Object} WheelGestureEvent
 * @property {WheelDeltaEvent} originalEvent
 *
 * @typedef {Object} PointerGestureEvent
 * @property {number} pageX
 * @property {number} pageY
 */

export default class ViewportGestureInteraction {
    /**
     * @param {ViewportInputState} inputState
     * @param {GestureViewport} viewport
     * @param {() => string} dragButtonProvider
     */
    constructor(inputState, viewport, dragButtonProvider) {
        this._inputState = inputState;
        this._viewport = viewport;
        this._dragButtonProvider = dragButtonProvider;
        this._mouseDownScreenPosition = [0, 0];
    }

    /** @param {WheelGestureEvent} event */
    zoom(event) {
        if (
            /** @type {number} */ (event.originalEvent.wheelDelta) > 0 ||
            /** @type {number} */ (event.originalEvent.detail) < 0
        ) {
            this._viewport.zoomIn();

            return;
        }

        this._viewport.zoomOut();
    }

    /**
     * @param {PointerGestureEvent} event
     * @param {string} mouseButton
     */
    markPressed(event, mouseButton) {
        const canvasDragButton = this._dragButtonProvider();

        if (mouseButton !== canvasDragButton) {
            return;
        }

        const mousePositionX = event.pageX - this._viewport._panX;
        const mousePositionY = event.pageY - this._viewport._panY;

        this._mouseDownScreenPosition = [mousePositionX, mousePositionY];
        this._inputState.isMouseDown = true;
    }

    release() {
        this._inputState.isMouseDown = false;
    }

    resetZoom() {
        this._viewport.zoomReset();
    }

    /** @param {PointerGestureEvent} event */
    drag(event) {
        if (!this._inputState.isMouseDown) {
            return false;
        }

        const nextXPan = event.pageX - this._mouseDownScreenPosition[0];
        const nextYPan = event.pageY - this._mouseDownScreenPosition[1];

        this._viewport.updatePan(nextXPan, nextYPan);

        return true;
    }
}
