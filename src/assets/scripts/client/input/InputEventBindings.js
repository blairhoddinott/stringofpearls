export default class InputEventBindings {
    constructor(windowTarget, canvasTarget, bodyTarget, eventBus, stripClickEvent, handlers) {
        this._windowTarget = windowTarget;
        this._canvasTarget = canvasTarget;
        this._bodyTarget = bodyTarget;
        this._eventBus = eventBus;
        this._stripClickEvent = stripClickEvent;
        this._handlers = handlers;
    }

    enable() {
        const handlers = this._resolveHandlers();

        this._windowTarget.on('keydown', handlers.keydown);
        this._windowTarget.on('keyup', handlers.keyup);
        this._canvasTarget.bind('DOMMouseScroll mousewheel', handlers.mouseScroll);
        this._canvasTarget.on('mousemove', handlers.mouseMove);
        this._canvasTarget.on('mouseup', handlers.mouseUp);
        this._canvasTarget.on('mousedown', handlers.mouseDown);
        this._canvasTarget.on('dblclick', handlers.doubleClick);
        this._bodyTarget.addEventListener('contextmenu', (event) => event.preventDefault());
        this._eventBus.on(this._stripClickEvent, handlers.stripClick);

        return this;
    }

    disable() {
        const handlers = this._resolveHandlers();

        this._windowTarget.off('keydown', handlers.keydown);
        this._windowTarget.off('keyup', handlers.keyup);
        this._canvasTarget.off('mousemove', handlers.mouseMove);
        this._canvasTarget.off('mouseup', handlers.mouseUp);
        this._canvasTarget.off('mousedown', handlers.mouseDown);
        this._canvasTarget.off('dblclick', handlers.doubleClick);
        this._bodyTarget.removeEventListener('contextmenu', (event) => event.preventDefault());
        this._eventBus.off(this._stripClickEvent, handlers.stripClick);

        return this;
    }

    _resolveHandlers() {
        return typeof this._handlers === 'function' ? this._handlers() : this._handlers;
    }
}
