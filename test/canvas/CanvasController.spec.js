import ava from 'ava';
import sinon from 'sinon';
import $ from 'jquery';
import CanvasController from '../../src/assets/scripts/client/canvas/CanvasController';
import CanvasRenderScheduler from '../../src/assets/scripts/client/canvas/CanvasRenderScheduler';
import CanvasStageModel from '../../src/assets/scripts/client/canvas/CanvasStageModel';
import { CANVAS_NAME } from '../../src/assets/scripts/client/constants/canvasConstants';
import TimeKeeper from '../../src/assets/scripts/client/engine/TimeKeeper';

const STATIC_DRAW_METHODS = [
    '_drawVideoMap',
    '_drawTerrain',
    '_drawRestrictedAirspace',
    '_drawRunways',
    '_drawAirportFixesAndLabels',
    '_drawSids',
    '_drawStars',
    '_drawAirspaceAndRangeRings',
    '_drawAirspaceShelvesAndLabels',
    '_drawRunwayLabels',
    '_drawCurrentScale'
];

const DYNAMIC_DRAW_METHODS = [
    '_drawSelectedAircraftCompass',
    '_drawRadarTargetList',
    '_drawAircraftDataBlocks',
    '_drawMeasureTool'
];

const buildController = () => {
    const calls = [];
    const controller = Object.create(CanvasController.prototype);
    const staticContext = { name: CANVAS_NAME.STATIC };
    const dynamicContext = { name: CANVAS_NAME.DYNAMIC };

    controller._renderScheduler = new CanvasRenderScheduler();
    controller._getCanvasContextByName = (canvasName) => {
        calls.push(`context:${canvasName}`);

        return canvasName === CANVAS_NAME.STATIC ? staticContext : dynamicContext;
    };
    controller._clearCanvasContext = (context) => {
        calls.push(`${context.name}:clear`);
    };

    for (const methodName of STATIC_DRAW_METHODS) {
        controller[methodName] = () => calls.push(`${staticContext.name}:${methodName}`);
    }

    for (const methodName of DYNAMIC_DRAW_METHODS) {
        controller[methodName] = () => calls.push(`${dynamicContext.name}:${methodName}`);
    }

    return { calls, controller };
};

const expectedInitialFrameCalls = () => [
    `context:${CANVAS_NAME.STATIC}`,
    `${CANVAS_NAME.STATIC}:clear`,
    ...STATIC_DRAW_METHODS.map((methodName) => `${CANVAS_NAME.STATIC}:${methodName}`),
    `context:${CANVAS_NAME.DYNAMIC}`,
    `${CANVAS_NAME.DYNAMIC}:clear`,
    ...DYNAMIC_DRAW_METHODS.map((methodName) => `${CANVAS_NAME.DYNAMIC}:${methodName}`)
];

ava.serial('canvasUpdatePost() preserves static-then-dynamic draw order and acknowledges a successful frame', (t) => {
    const { calls, controller } = buildController();
    const shouldUpdate = sinon.stub(TimeKeeper, 'shouldUpdate').returns(false);

    try {
        controller.canvasUpdatePost();

        t.deepEqual(calls, expectedInitialFrameCalls());
        t.true(shouldUpdate.notCalled);

        calls.length = 0;
        controller.canvasUpdatePost();

        t.deepEqual(calls, []);
        t.true(shouldUpdate.calledOnce);
    } finally {
        shouldUpdate.restore();
    }
});

ava.serial('canvasUpdatePost() leaves a deep frame pending when a static renderer throws', (t) => {
    const { calls, controller } = buildController();
    const shouldUpdate = sinon.stub(TimeKeeper, 'shouldUpdate').returns(false);
    const renderError = new Error('terrain render failed');

    controller._drawTerrain = () => {
        calls.push(`${CANVAS_NAME.STATIC}:_drawTerrain`);
        throw renderError;
    };

    try {
        const error = t.throws(() => controller.canvasUpdatePost());

        t.is(error, renderError);
        t.true(shouldUpdate.notCalled);

        calls.length = 0;
        controller._drawTerrain = () => calls.push(`${CANVAS_NAME.STATIC}:_drawTerrain`);
        controller.canvasUpdatePost();

        t.deepEqual(calls, expectedInitialFrameCalls());
        t.true(shouldUpdate.notCalled);
    } finally {
        shouldUpdate.restore();
    }
});

ava.serial('canvasUpdatePost() renders only the dynamic canvas when simulation time advances', (t) => {
    const { calls, controller } = buildController();
    const shouldUpdate = sinon.stub(TimeKeeper, 'shouldUpdate').returns(true);

    try {
        controller.canvasUpdatePost();
        calls.length = 0;

        controller.canvasUpdatePost();

        t.deepEqual(calls, [
            `context:${CANVAS_NAME.DYNAMIC}`,
            `${CANVAS_NAME.DYNAMIC}:clear`,
            ...DYNAMIC_DRAW_METHODS.map((methodName) => `${CANVAS_NAME.DYNAMIC}:${methodName}`)
        ]);
        t.true(shouldUpdate.calledOnce);
    } finally {
        shouldUpdate.restore();
    }
});

// `CanvasController` no longer owns the browser-bound canvas DOM/context
// lifecycle; it delegates to an injected `CanvasHost`. These characterizations
// prove that delegation and that a resize still marks a deep render afterwards.
const buildControllerWithHost = () => {
    const controller = Object.create(CanvasController.prototype);
    const host = {
        init: sinon.spy(),
        resize: sinon.spy(),
        getContext: sinon.stub(),
        clearContext: sinon.spy(),
        destroy: sinon.spy()
    };

    controller._canvasHost = host;
    controller._renderScheduler = new CanvasRenderScheduler();

    return { controller, host };
};

ava('canvas_init() delegates canvas creation to the host', (t) => {
    const { controller, host } = buildControllerWithHost();

    controller.canvas_init();

    t.true(host.init.calledOnce);
});

ava('canvas_resize() delegates to the host then marks a deep render', (t) => {
    const { controller, host } = buildControllerWithHost();

    controller._renderScheduler.completeFrame();

    const markDeep = sinon.spy(controller._renderScheduler, 'markDeep');

    controller.canvas_resize();

    t.true(host.resize.calledOnce);
    t.true(markDeep.calledOnce);
    t.true(host.resize.calledBefore(markDeep));
    t.deepEqual(
        controller._renderScheduler.nextFrame(() => false),
        { renderStatic: true, renderDynamic: true }
    );
});

ava('_getCanvasContextByName() and _clearCanvasContext() delegate to the host', (t) => {
    const { controller, host } = buildControllerWithHost();
    const staticContext = { name: CANVAS_NAME.STATIC };

    host.getContext.withArgs(CANVAS_NAME.STATIC).returns(staticContext);

    t.is(controller._getCanvasContextByName(CANVAS_NAME.STATIC), staticContext);
    t.true(host.getContext.calledOnceWithExactly(CANVAS_NAME.STATIC));

    controller._clearCanvasContext(staticContext);

    t.true(host.clearContext.calledOnceWithExactly(staticContext));
});

ava('destroy() delegates host teardown and restores an initial render plan', (t) => {
    const { controller, host } = buildControllerWithHost();

    controller._renderScheduler.completeFrame();

    const result = controller.destroy();

    t.is(result, controller);
    t.true(host.destroy.calledOnce);
    t.deepEqual(
        controller._renderScheduler.nextFrame(() => false),
        { renderStatic: true, renderDynamic: true }
    );
});

// `CanvasController` now owns its viewport/camera (a `CanvasStageModel`) as an
// injectable dependency rather than reaching for the shared singleton. These
// characterizations prove the coordinate/pan paths use the exact injected
// viewport and that a default-created host is wired to that same viewport.

ava('_onCenterPointInView() pans the exact injected viewport, not the default singleton', (t) => {
    const controller = Object.create(CanvasController.prototype);
    const viewport = {
        _translateKilometersToPixels: sinon.stub(),
        updatePan: sinon.spy()
    };

    viewport._translateKilometersToPixels.withArgs(10).returns(100.4);
    viewport._translateKilometersToPixels.withArgs(20).returns(200.6);
    controller._viewport = viewport;

    const singletonTranslate = sinon.spy(CanvasStageModel, '_translateKilometersToPixels');
    const singletonUpdatePan = sinon.spy(CanvasStageModel, 'updatePan');

    try {
        controller._onCenterPointInView([10, 20]);

        // newPanX = -round(100.4) = -100; newPanY = round(200.6) = 201
        t.true(viewport.updatePan.calledOnceWithExactly(-100, 201));
        t.true(singletonTranslate.notCalled);
        t.true(singletonUpdatePan.notCalled);
    } finally {
        singletonTranslate.restore();
        singletonUpdatePan.restore();
    }
});

ava.serial('constructing without an explicit host builds a default CanvasHost owning the exact injected viewport', (t) => {
    const $element = $('<div></div>');
    const viewport = { initStorage: sinon.spy() };

    // Isolate the wiring-under-test from unrelated theme/handler/enable behavior,
    // none of which this characterization is asserting.
    const initStub = sinon.stub(CanvasController.prototype, '_init').returnsThis();
    const setupStub = sinon.stub(CanvasController.prototype, '_setupHandlers').returnsThis();
    const enableStub = sinon.stub(CanvasController.prototype, 'enable').returnsThis();

    try {
        const controller = new CanvasController($element, null, null, null, null, null, null, viewport);

        t.is(controller._viewport, viewport);
        t.is(controller._canvasHost._stageModel, viewport);
        t.true(viewport.initStorage.calledOnce);
    } finally {
        initStub.restore();
        setupStub.restore();
        enableStub.restore();
    }
});

ava.serial('an explicitly supplied host is retained unchanged while the viewport still owns storage config', (t) => {
    const $element = $('<div></div>');
    const viewport = { initStorage: sinon.spy() };
    const explicitHost = { destroy: sinon.spy() };

    const initStub = sinon.stub(CanvasController.prototype, '_init').returnsThis();
    const setupStub = sinon.stub(CanvasController.prototype, '_setupHandlers').returnsThis();
    const enableStub = sinon.stub(CanvasController.prototype, 'enable').returnsThis();

    try {
        const controller = new CanvasController(
            $element, null, null, null, null, null, explicitHost, viewport
        );

        t.is(controller._canvasHost, explicitHost);
        t.is(controller._viewport, viewport);
        t.true(viewport.initStorage.calledOnce);
    } finally {
        initStub.restore();
        setupStub.restore();
        enableStub.restore();
    }
});
