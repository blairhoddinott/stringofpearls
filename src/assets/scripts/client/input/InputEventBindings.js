/**
 * @typedef {(...args: never[]) => unknown} InputEventHandler
 *
 * @typedef {Object} InputHandlers
 * @property {InputEventHandler} keydown
 * @property {InputEventHandler} keyup
 * @property {InputEventHandler} mouseScroll
 * @property {InputEventHandler} mouseMove
 * @property {InputEventHandler} mouseUp
 * @property {InputEventHandler} mouseDown
 * @property {InputEventHandler} doubleClick
 * @property {InputEventHandler} stripClick
 *
 * @typedef {Object} WindowInputTarget
 * @property {(eventName: string, handler: InputEventHandler) => unknown} on
 * @property {(eventName: string, handler: InputEventHandler) => unknown} off
 *
 * @typedef {Object} CanvasInputTarget
 * @property {(eventName: string, handler: InputEventHandler) => unknown} bind
 * @property {(eventName: string, handler: InputEventHandler) => unknown} on
 * @property {(eventName: string, handler: InputEventHandler) => unknown} off
 *
 * @typedef {Object} ContextMenuEvent
 * @property {() => void} preventDefault
 *
 * @typedef {Object} BodyInputTarget
 * @property {(eventName: string, handler: (event: ContextMenuEvent) => void) => unknown} addEventListener
 * @property {(eventName: string, handler: (event: ContextMenuEvent) => void) => unknown} removeEventListener
 *
 * @typedef {Object} InputEventBus
 * @property {(eventName: string, handler: InputEventHandler) => unknown} on
 * @property {(eventName: string, handler: InputEventHandler) => unknown} off
 */

export default class InputEventBindings {
    /**
     * @param {WindowInputTarget} windowTarget
     * @param {CanvasInputTarget} canvasTarget
     * @param {BodyInputTarget} bodyTarget
     * @param {InputEventBus} eventBus
     * @param {string} stripClickEvent
     * @param {InputHandlers | (() => InputHandlers)} handlers
     */
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
        this._bodyTarget.addEventListener('contextmenu', (/** @type {ContextMenuEvent} */ event) => event.preventDefault());
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
        this._bodyTarget.removeEventListener('contextmenu', (/** @type {ContextMenuEvent} */ event) => event.preventDefault());
        this._eventBus.off(this._stripClickEvent, handlers.stripClick);

        return this;
    }

    _resolveHandlers() {
        return typeof this._handlers === 'function' ? this._handlers() : this._handlers;
    }
}
