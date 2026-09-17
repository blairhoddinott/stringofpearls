export default class ViewportGestureInteraction {
    constructor(inputState, viewport, dragButtonProvider) {
        this._inputState = inputState;
        this._viewport = viewport;
        this._dragButtonProvider = dragButtonProvider;
        this._mouseDownScreenPosition = [0, 0];
    }

    zoom(event) {
        if (event.originalEvent.wheelDelta > 0 || event.originalEvent.detail < 0) {
            this._viewport.zoomIn();

            return;
        }

        this._viewport.zoomOut();
    }

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
