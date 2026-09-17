import ava from 'ava';
import InputEventBindings from '../../src/assets/scripts/client/input/InputEventBindings';

ava('retains exact DOM, event-bus, event-name, and handler identities', (t) => {
    const windowTarget = {};
    const canvasTarget = {};
    const bodyTarget = {};
    const eventBus = {};
    const stripClickEvent = 'strip:click';
    const handlers = {};
    const bindings = new InputEventBindings(
        windowTarget,
        canvasTarget,
        bodyTarget,
        eventBus,
        stripClickEvent,
        handlers
    );

    t.is(bindings._windowTarget, windowTarget);
    t.is(bindings._canvasTarget, canvasTarget);
    t.is(bindings._bodyTarget, bodyTarget);
    t.is(bindings._eventBus, eventBus);
    t.is(bindings._stripClickEvent, stripClickEvent);
    t.is(bindings._handlers, handlers);
});

ava('enable() preserves registration APIs, order, and exact handler identities', (t) => {
    const calls = [];
    const windowTarget = {
        on: (...args) => calls.push(['window.on', ...args])
    };
    const canvasTarget = {
        bind: (...args) => calls.push(['canvas.bind', ...args]),
        on: (...args) => calls.push(['canvas.on', ...args])
    };
    const bodyTarget = {
        addEventListener: (...args) => calls.push(['body.addEventListener', ...args])
    };
    const eventBus = {
        on: (...args) => calls.push(['eventBus.on', ...args])
    };
    const handlers = {
        keydown: () => {},
        keyup: () => {},
        mouseScroll: () => {},
        mouseMove: () => {},
        mouseUp: () => {},
        mouseDown: () => {},
        doubleClick: () => {},
        stripClick: () => {}
    };
    const bindings = new InputEventBindings(
        windowTarget,
        canvasTarget,
        bodyTarget,
        eventBus,
        'strip:click',
        handlers
    );

    t.is(bindings.enable(), bindings);
    t.is(calls.length, 9);
    t.deepEqual(calls.slice(0, 7), [
        ['window.on', 'keydown', handlers.keydown],
        ['window.on', 'keyup', handlers.keyup],
        ['canvas.bind', 'DOMMouseScroll mousewheel', handlers.mouseScroll],
        ['canvas.on', 'mousemove', handlers.mouseMove],
        ['canvas.on', 'mouseup', handlers.mouseUp],
        ['canvas.on', 'mousedown', handlers.mouseDown],
        ['canvas.on', 'dblclick', handlers.doubleClick]
    ]);
    t.is(calls[7][0], 'body.addEventListener');
    t.is(calls[7][1], 'contextmenu');
    t.is(typeof calls[7][2], 'function');
    const preventDefault = { preventDefault: () => calls.push(['preventDefault']) };

    calls[7][2](preventDefault);
    t.deepEqual(calls[8], ['eventBus.on', 'strip:click', handlers.stripClick]);
    t.deepEqual(calls[9], ['preventDefault']);
});

ava('disable() preserves incomplete unbinding and fresh context-menu callback behavior', (t) => {
    const enableCalls = [];
    const disableCalls = [];
    const windowTarget = {
        on: (...args) => enableCalls.push(['window.on', ...args]),
        off: (...args) => disableCalls.push(['window.off', ...args])
    };
    const canvasTarget = {
        bind: (...args) => enableCalls.push(['canvas.bind', ...args]),
        on: (...args) => enableCalls.push(['canvas.on', ...args]),
        off: (...args) => disableCalls.push(['canvas.off', ...args])
    };
    const bodyTarget = {
        addEventListener: (...args) => enableCalls.push(['body.addEventListener', ...args]),
        removeEventListener: (...args) => disableCalls.push(['body.removeEventListener', ...args])
    };
    const eventBus = {
        on: (...args) => enableCalls.push(['eventBus.on', ...args]),
        off: (...args) => disableCalls.push(['eventBus.off', ...args])
    };
    const handlers = {
        keydown: () => {}, keyup: () => {}, mouseScroll: () => {}, mouseMove: () => {},
        mouseUp: () => {}, mouseDown: () => {}, doubleClick: () => {}, stripClick: () => {}
    };
    const bindings = new InputEventBindings(
        windowTarget, canvasTarget, bodyTarget, eventBus, 'strip:click', handlers
    );

    bindings.enable();
    t.is(bindings.disable(), bindings);
    t.deepEqual(disableCalls.slice(0, 6), [
        ['window.off', 'keydown', handlers.keydown],
        ['window.off', 'keyup', handlers.keyup],
        ['canvas.off', 'mousemove', handlers.mouseMove],
        ['canvas.off', 'mouseup', handlers.mouseUp],
        ['canvas.off', 'mousedown', handlers.mouseDown],
        ['canvas.off', 'dblclick', handlers.doubleClick]
    ]);
    t.is(disableCalls[6][0], 'body.removeEventListener');
    t.is(disableCalls[6][1], 'contextmenu');
    t.is(typeof disableCalls[6][2], 'function');
    t.not(disableCalls[6][2], enableCalls[7][2]);
    t.deepEqual(disableCalls[7], ['eventBus.off', 'strip:click', handlers.stripClick]);
    t.false(disableCalls.some(([, eventName]) => eventName === 'DOMMouseScroll mousewheel'));
});
