import ava from 'ava';
import sinon from 'sinon';
import $ from 'jquery';
import CanvasHost from '../../src/assets/scripts/client/canvas/CanvasHost';
import { CANVAS_NAME } from '../../src/assets/scripts/client/constants/canvasConstants';

// `CanvasHost` owns only the browser-bound canvas DOM/context lifecycle that
// `CanvasController` previously expressed inline: creating the `<canvas>`
// elements, storing/retrieving their 2d contexts by `CANVAS_NAME`, sizing them
// against the stage model, applying the HiDPI backing-store adjustment, and
// clearing a context. The tests exercise this against the shared jsdom document
// with a stubbed `getContext` so no native canvas package is required.

/**
 * Build a host attached to the shared jsdom document with a fake stage model
 * and a `getContext` stub that returns a per-element sentinel context.
 *
 * The returned `cleanup` restores every shared global the test mutated.
 */
const setupHost = (stageOverrides = {}) => {
    window.document.body.innerHTML = '';

    const $element = $('<div id="canvases"></div>');

    $(window.document.body).append($element);

    const stageModel = {
        height: 300,
        width: 500,
        updateHeightAndWidth: sinon.spy(),
        ...stageOverrides
    };

    // Record the exact element each `getContext` call is asked of, and hand back
    // a sentinel context that back-references that element (as a real 2d context
    // would via `context.canvas`).
    const getContextElements = [];
    const getContextStub = sinon.stub(window.HTMLCanvasElement.prototype, 'getContext').callsFake(
        function fakeGetContext(contextType) {
            getContextElements.push({ element: this, contextType });

            return {
                canvas: this,
                scale: sinon.spy(),
                clearRect: sinon.spy()
            };
        }
    );

    const host = new CanvasHost($element, stageModel);
    const cleanup = () => {
        getContextStub.restore();
        window.document.body.innerHTML = '';
    };

    return {
        $element,
        stageModel,
        getContextElements,
        getContextStub,
        host,
        cleanup
    };
};

const withDevicePixelRatio = (ratio, callback) => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');

    Object.defineProperty(window, 'devicePixelRatio', { value: ratio, configurable: true });

    try {
        callback();
    } finally {
        if (originalDescriptor) {
            Object.defineProperty(window, 'devicePixelRatio', originalDescriptor);
        } else {
            delete window.devicePixelRatio;
        }
    }
};

ava.serial('init() appends the static then dynamic canvas to the exact host element and stores each exact 2d context', (t) => {
    const { $element, getContextElements, host, cleanup } = setupHost();

    try {
        host.init();

        const canvases = $element.children('canvas');

        t.is(canvases.length, 2);
        t.is(canvases.get(0).id, 'static-canvas');
        t.is(canvases.get(1).id, 'dynamic-canvas');

        t.is(getContextElements.length, 2);
        t.is(getContextElements[0].contextType, '2d');
        t.is(getContextElements[1].contextType, '2d');
        t.is(getContextElements[0].element.id, 'static-canvas');
        t.is(getContextElements[1].element.id, 'dynamic-canvas');

        // the stored context is the exact one returned for the exact element
        t.is(host.getContext(CANVAS_NAME.STATIC).canvas, getContextElements[0].element);
        t.is(host.getContext(CANVAS_NAME.DYNAMIC).canvas, getContextElements[1].element);
    } finally {
        cleanup();
    }
});

ava.serial('resize() updates the stage once then sizes every context to stage dimensions in enumeration order when _shouldResize is true', (t) => {
    const { stageModel, host, cleanup } = setupHost();

    host.$window = {
        height: sinon.stub().returns(900),
        width: sinon.stub().returns(1200)
    };

    try {
        host.init();

        const staticContext = host.getContext(CANVAS_NAME.STATIC);
        const dynamicContext = host.getContext(CANVAS_NAME.DYNAMIC);

        host.resize();

        t.true(stageModel.updateHeightAndWidth.calledOnceWithExactly(900, 1200));
        t.is(staticContext.canvas.height, 300);
        t.is(staticContext.canvas.width, 500);
        t.is(dynamicContext.canvas.height, 300);
        t.is(dynamicContext.canvas.width, 500);
    } finally {
        cleanup();
    }
});

ava.serial('resize() skips the stage update but still resizes every context when _shouldResize is false', (t) => {
    const { stageModel, host, cleanup } = setupHost();

    host.$window = {
        height: sinon.stub().returns(900),
        width: sinon.stub().returns(1200)
    };

    try {
        host.init();
        host._shouldResize = false;

        host.resize();

        t.true(stageModel.updateHeightAndWidth.notCalled);
        t.is(host.getContext(CANVAS_NAME.STATIC).canvas.height, 300);
        t.is(host.getContext(CANVAS_NAME.STATIC).canvas.width, 500);
        t.is(host.getContext(CANVAS_NAME.DYNAMIC).canvas.height, 300);
        t.is(host.getContext(CANVAS_NAME.DYNAMIC).canvas.width, 500);
    } finally {
        cleanup();
    }
});

ava.serial('resize() leaves backing dimensions unscaled and does not scale when devicePixelRatio is <= 1', (t) => {
    const { host, cleanup } = setupHost();

    host.$window = {
        height: sinon.stub().returns(900),
        width: sinon.stub().returns(1200)
    };

    try {
        host.init();

        const staticContext = host.getContext(CANVAS_NAME.STATIC);

        withDevicePixelRatio(1, () => host.resize());

        t.is(staticContext.canvas.height, 300);
        t.is(staticContext.canvas.width, 500);
        t.true(staticContext.scale.notCalled);
    } finally {
        cleanup();
    }
});

ava.serial('resize() applies HiDPI backing dimensions, unscaled CSS dimensions, then scales when devicePixelRatio is > 1', (t) => {
    const { host, cleanup } = setupHost();

    host.$window = {
        height: sinon.stub().returns(900),
        width: sinon.stub().returns(1200)
    };

    try {
        host.init();

        const staticContext = host.getContext(CANVAS_NAME.STATIC);
        const staticElement = staticContext.canvas;

        withDevicePixelRatio(2, () => host.resize());

        t.is(staticElement.getAttribute('height'), '600');
        t.is(staticElement.getAttribute('width'), '1000');
        t.is(staticElement.style.height, '300px');
        t.is(staticElement.style.width, '500px');
        t.true(staticContext.scale.calledOnceWithExactly(2, 2));
    } finally {
        cleanup();
    }
});

ava.serial('clearContext() clears the full stage rect exactly once and returns undefined', (t) => {
    const { host, cleanup } = setupHost();
    const context = { clearRect: sinon.spy() };

    try {
        const result = host.clearContext(context);

        t.true(context.clearRect.calledOnceWithExactly(0, 0, 500, 300));
        t.is(result, undefined);
    } finally {
        cleanup();
    }
});

ava.serial('getContext() retrieves the stored context by CANVAS_NAME', (t) => {
    const { host, cleanup } = setupHost();

    try {
        host.init();

        t.is(host.getContext(CANVAS_NAME.STATIC).canvas.id, 'static-canvas');
        t.is(host.getContext(CANVAS_NAME.DYNAMIC).canvas.id, 'dynamic-canvas');
    } finally {
        cleanup();
    }
});

ava.serial('destroy() releases only this host window/element/context references and restores _shouldResize without affecting another host', (t) => {
    const { host, stageModel, cleanup } = setupHost();
    const otherHost = new CanvasHost($('<div></div>'), stageModel);

    try {
        host.init();
        host._shouldResize = false;

        const otherWindow = otherHost.$window;

        const result = host.destroy();

        t.is(result, host);
        t.is(host.$window, null);
        t.is(host.$element, null);
        t.deepEqual(host._context, {});
        t.true(host._shouldResize);

        // the shared stage model is not released
        t.is(host._stageModel, stageModel);

        // the sibling host is untouched
        t.is(otherHost.$window, otherWindow);
        t.not(otherHost.$element, null);
    } finally {
        cleanup();
    }
});
