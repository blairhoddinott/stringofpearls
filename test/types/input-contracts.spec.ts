import InputEventBindings from '../../src/assets/scripts/client/input/InputEventBindings';
import ViewportGestureInteraction from '../../src/assets/scripts/client/input/ViewportGestureInteraction';

const handler = (_event: unknown): void => {};
type ForwardedHandler = (...args: never[]) => unknown;
const handlers = {
    keydown: handler,
    keyup: handler,
    mouseScroll: handler,
    mouseMove: handler,
    mouseUp: handler,
    mouseDown: handler,
    doubleClick: handler,
    stripClick: handler
};
const windowTarget = {
    on: (_eventName: string, _handler: ForwardedHandler): void => {},
    off: (_eventName: string, _handler: ForwardedHandler): void => {}
};
const canvasTarget = {
    bind: (_eventName: string, _handler: ForwardedHandler): void => {},
    on: (_eventName: string, _handler: ForwardedHandler): void => {},
    off: (_eventName: string, _handler: ForwardedHandler): void => {}
};
const bodyTarget = {
    addEventListener: (_eventName: string, _handler: (event: { preventDefault(): void }) => void): void => {},
    removeEventListener: (_eventName: string, _handler: (event: { preventDefault(): void }) => void): void => {}
};
const eventBus = {
    on: (_eventName: string, _handler: ForwardedHandler): void => {},
    off: (_eventName: string, _handler: ForwardedHandler): void => {}
};

new InputEventBindings(windowTarget, canvasTarget, bodyTarget, eventBus, 'strip-click', handlers);
new InputEventBindings(windowTarget, canvasTarget, bodyTarget, eventBus, 'strip-click', () => handlers);

const inputState = { isMouseDown: false };
const viewport = {
    _panX: 0,
    _panY: 0,
    zoomIn: (): void => {},
    zoomOut: (): void => {},
    zoomReset: (): void => {},
    updatePan: (_x: number, _y: number): void => {}
};
const viewportInteraction = new ViewportGestureInteraction(inputState, viewport, () => 'left');

viewportInteraction.zoom({ originalEvent: { wheelDelta: 1 } });
viewportInteraction.zoom({ originalEvent: { detail: -1 } });
viewportInteraction.zoom({ originalEvent: { wheelDelta: 1, detail: 0 } });
// @ts-expect-error A supported wheel event must provide wheelDelta or detail.
viewportInteraction.zoom({ originalEvent: {} });
