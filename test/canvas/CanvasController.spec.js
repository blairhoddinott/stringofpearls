import ava from 'ava';
import sinon from 'sinon';
import $ from 'jquery';
import AirportController from '../../src/assets/scripts/client/airport/AirportController';
import CanvasController from '../../src/assets/scripts/client/canvas/CanvasController';
import CanvasRenderScheduler from '../../src/assets/scripts/client/canvas/CanvasRenderScheduler';
import CanvasStageModel from '../../src/assets/scripts/client/canvas/CanvasStageModel';
import { CANVAS_NAME } from '../../src/assets/scripts/client/constants/canvasConstants';
import TimeKeeper from '../../src/assets/scripts/client/engine/TimeKeeper';
import GameController from '../../src/assets/scripts/client/game/GameController';
import NavigationLibrary from '../../src/assets/scripts/client/navigationLibrary/NavigationLibrary';

const STATIC_DRAW_METHODS = [
    'backgroundRenderer.drawVideoMap',
    'backgroundRenderer.drawTerrain',
    'backgroundRenderer.drawRestrictedAirspace',
    'runwayRenderer.drawRunways',
    'navigationRenderer.drawFixes',
    'navigationRenderer.drawSids',
    'navigationRenderer.drawStars',
    'backgroundRenderer.drawAirspaceAndRangeRings',
    'backgroundRenderer.drawAirspaceShelvesAndLabels',
    'runwayRenderer.drawRunwayLabels',
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

    controller._runwayRenderer = {
        drawRunways: () => calls.push(`${staticContext.name}:runwayRenderer.drawRunways`),
        drawRunwayLabels: () => calls.push(`${staticContext.name}:runwayRenderer.drawRunwayLabels`)
    };
    controller._navigationRenderer = {
        drawFixes: () => calls.push(`${staticContext.name}:navigationRenderer.drawFixes`),
        drawSids: () => calls.push(`${staticContext.name}:navigationRenderer.drawSids`),
        drawStars: () => calls.push(`${staticContext.name}:navigationRenderer.drawStars`)
    };
    controller._backgroundRenderer = {
        drawVideoMap: () => calls.push(`${staticContext.name}:backgroundRenderer.drawVideoMap`),
        drawTerrain: () => calls.push(`${staticContext.name}:backgroundRenderer.drawTerrain`),
        drawRestrictedAirspace: () => calls.push(`${staticContext.name}:backgroundRenderer.drawRestrictedAirspace`),
        drawAirspaceAndRangeRings: () => calls.push(`${staticContext.name}:backgroundRenderer.drawAirspaceAndRangeRings`),
        drawAirspaceShelvesAndLabels: () => calls.push(`${staticContext.name}:backgroundRenderer.drawAirspaceShelvesAndLabels`)
    };

    for (const methodName of STATIC_DRAW_METHODS.filter((name) => !name.includes('Renderer.'))) {
        controller[methodName] = () => calls.push(`${staticContext.name}:${methodName}`);
    }

    for (const methodName of DYNAMIC_DRAW_METHODS) {
        controller[methodName] = () => calls.push(`${dynamicContext.name}:${methodName}`);
    }

    return {
        calls,
        controller,
        staticContext,
        dynamicContext
    };
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

ava.serial('canvasUpdatePost() delegates runway bodies and labels to the exact renderer at their inherited order positions', (t) => {
    const {
        calls, controller, staticContext
    } = buildController();
    const shouldUpdate = sinon.stub(TimeKeeper, 'shouldUpdate').returns(false);
    const oldDrawRunways = sinon.spy();
    const oldDrawRunwayLabels = sinon.spy();

    controller.theme = { name: 'theme' };
    controller._shouldDrawFixLabels = 'enabled';
    controller._drawRunways = oldDrawRunways;
    controller._drawRunwayLabels = oldDrawRunwayLabels;
    controller._runwayRenderer = {
        drawRunways: sinon.spy(() => calls.push(`${CANVAS_NAME.STATIC}:runway-bodies`)),
        drawRunwayLabels: sinon.spy(() => calls.push(`${CANVAS_NAME.STATIC}:runway-labels`))
    };

    try {
        controller.canvasUpdatePost();

        t.true(controller._runwayRenderer.drawRunways.calledOnceWithExactly(
            staticContext,
            'enabled',
            controller.theme
        ));
        t.true(controller._runwayRenderer.drawRunwayLabels.calledOnceWithExactly(
            staticContext,
            'enabled',
            controller.theme
        ));
        t.true(oldDrawRunways.notCalled);
        t.true(oldDrawRunwayLabels.notCalled);
        t.true(calls.indexOf(`${CANVAS_NAME.STATIC}:_drawRestrictedAirspace`) < calls.indexOf(`${CANVAS_NAME.STATIC}:runway-bodies`));
        t.true(calls.indexOf(`${CANVAS_NAME.STATIC}:runway-bodies`) < calls.indexOf(`${CANVAS_NAME.STATIC}:navigationRenderer.drawFixes`));
        t.true(calls.indexOf(`${CANVAS_NAME.STATIC}:_drawAirspaceShelvesAndLabels`) < calls.indexOf(`${CANVAS_NAME.STATIC}:runway-labels`));
        t.true(calls.indexOf(`${CANVAS_NAME.STATIC}:runway-labels`) < calls.indexOf(`${CANVAS_NAME.STATIC}:_drawCurrentScale`));
    } finally {
        shouldUpdate.restore();
    }
});

ava.serial('canvasUpdatePost() delegates fixes and procedures at their inherited order positions', (t) => {
    const {
        calls, controller, staticContext
    } = buildController();
    const shouldUpdate = sinon.stub(TimeKeeper, 'shouldUpdate').returns(false);
    const oldDrawFixes = sinon.spy();
    const oldDrawSids = sinon.spy();
    const oldDrawStars = sinon.spy();

    controller.theme = { name: 'theme' };
    controller._shouldDrawFixLabels = 'fixes-enabled';
    controller._shouldDrawSidMap = 'sids-enabled';
    controller._shouldDrawStarMap = 'stars-enabled';
    controller._drawAirportFixesAndLabels = oldDrawFixes;
    controller._drawSids = oldDrawSids;
    controller._drawStars = oldDrawStars;
    controller._navigationRenderer = {
        drawFixes: sinon.spy(() => calls.push(`${CANVAS_NAME.STATIC}:navigation-fixes`)),
        drawSids: sinon.spy(() => calls.push(`${CANVAS_NAME.STATIC}:navigation-sids`)),
        drawStars: sinon.spy(() => calls.push(`${CANVAS_NAME.STATIC}:navigation-stars`))
    };

    try {
        controller.canvasUpdatePost();

        t.true(controller._navigationRenderer.drawFixes.calledOnceWithExactly(
            staticContext, 'fixes-enabled', controller.theme
        ));
        t.true(controller._navigationRenderer.drawSids.calledOnceWithExactly(
            staticContext, 'sids-enabled', controller.theme
        ));
        t.true(controller._navigationRenderer.drawStars.calledOnceWithExactly(
            staticContext, 'stars-enabled', controller.theme
        ));
        t.true(oldDrawFixes.notCalled);
        t.true(oldDrawSids.notCalled);
        t.true(oldDrawStars.notCalled);
        t.true(calls.indexOf(`${CANVAS_NAME.STATIC}:runwayRenderer.drawRunways`) < calls.indexOf(`${CANVAS_NAME.STATIC}:navigation-fixes`));
        t.true(calls.indexOf(`${CANVAS_NAME.STATIC}:navigation-fixes`) < calls.indexOf(`${CANVAS_NAME.STATIC}:navigation-sids`));
        t.true(calls.indexOf(`${CANVAS_NAME.STATIC}:navigation-sids`) < calls.indexOf(`${CANVAS_NAME.STATIC}:navigation-stars`));
        t.true(calls.indexOf(`${CANVAS_NAME.STATIC}:navigation-stars`) < calls.indexOf(`${CANVAS_NAME.STATIC}:backgroundRenderer.drawAirspaceAndRangeRings`));
    } finally {
        shouldUpdate.restore();
    }
});

ava.serial('canvasUpdatePost() delegates airport backgrounds at inherited order positions', (t) => {
    const {
        calls, controller, staticContext
    } = buildController();
    const shouldUpdate = sinon.stub(TimeKeeper, 'shouldUpdate').returns(false);

    controller._backgroundRenderer = {
        drawVideoMap: sinon.spy((context, theme) => {
            t.is(context, staticContext);
            t.is(theme, controller.theme);
            calls.push(`${CANVAS_NAME.STATIC}:background-video`);
        }),
        drawTerrain: sinon.spy((context, enabled, theme) => {
            t.is(context, staticContext);
            t.is(enabled, controller._shouldDrawTerrain);
            t.is(theme, controller.theme);
            calls.push(`${CANVAS_NAME.STATIC}:background-terrain`);
        }),
        drawRestrictedAirspace: sinon.spy((context, enabled, theme) => {
            t.is(context, staticContext);
            t.is(enabled, controller._shouldDrawRestrictedAreas);
            t.is(theme, controller.theme);
            calls.push(`${CANVAS_NAME.STATIC}:background-restricted`);
        }),
        drawAirspaceAndRangeRings: sinon.spy((context, theme) => {
            t.is(context, staticContext);
            t.is(theme, controller.theme);
            calls.push(`${CANVAS_NAME.STATIC}:background-airspace-rings`);
        }),
        drawAirspaceShelvesAndLabels: sinon.spy((context, enabled) => {
            t.is(context, staticContext);
            t.is(enabled, controller._shouldDrawAirspace);
            calls.push(`${CANVAS_NAME.STATIC}:background-airspace-shelves`);
        })
    };

    try {
        controller.canvasUpdatePost();

        const staticCalls = calls.filter((call) => call.startsWith(`${CANVAS_NAME.STATIC}:`));

        t.deepEqual(staticCalls.slice(1, 6), [
            `${CANVAS_NAME.STATIC}:background-video`,
            `${CANVAS_NAME.STATIC}:background-terrain`,
            `${CANVAS_NAME.STATIC}:background-restricted`,
            `${CANVAS_NAME.STATIC}:runwayRenderer.drawRunways`,
            `${CANVAS_NAME.STATIC}:navigationRenderer.drawFixes`
        ]);
        t.deepEqual(staticCalls.slice(8, 12), [
            `${CANVAS_NAME.STATIC}:background-airspace-rings`,
            `${CANVAS_NAME.STATIC}:background-airspace-shelves`,
            `${CANVAS_NAME.STATIC}:runwayRenderer.drawRunwayLabels`,
            `${CANVAS_NAME.STATIC}:_drawCurrentScale`
        ]);
        t.true(controller._backgroundRenderer.drawVideoMap.calledOnce);
        t.true(controller._backgroundRenderer.drawTerrain.calledOnce);
        t.true(controller._backgroundRenderer.drawRestrictedAirspace.calledOnce);
        t.true(controller._backgroundRenderer.drawAirspaceAndRangeRings.calledOnce);
        t.true(controller._backgroundRenderer.drawAirspaceShelvesAndLabels.calledOnce);
    } finally {
        shouldUpdate.restore();
    }
});

ava.serial('canvasUpdatePost() leaves a deep frame pending when a static renderer throws', (t) => {
    const { calls, controller } = buildController();
    const shouldUpdate = sinon.stub(TimeKeeper, 'shouldUpdate').returns(false);
    const renderError = new Error('terrain render failed');

    controller._backgroundRenderer.drawTerrain = () => {
        calls.push(`${CANVAS_NAME.STATIC}:backgroundRenderer.drawTerrain`);
        throw renderError;
    };

    try {
        const error = t.throws(() => controller.canvasUpdatePost());

        t.is(error, renderError);
        t.true(shouldUpdate.notCalled);

        calls.length = 0;
        controller._backgroundRenderer.drawTerrain = () => calls.push(`${CANVAS_NAME.STATIC}:backgroundRenderer.drawTerrain`);
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
        t.is(controller._runwayRenderer._viewport, viewport);
        t.is(controller._navigationRenderer._viewport, viewport);
        t.is(controller._navigationRenderer._navigationLibrary, NavigationLibrary);
        t.is(controller._backgroundRenderer._viewport, viewport);
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
    const runwayRenderer = {};
    const navigationRenderer = {};
    const backgroundRenderer = {};

    const initStub = sinon.stub(CanvasController.prototype, '_init').returnsThis();
    const setupStub = sinon.stub(CanvasController.prototype, '_setupHandlers').returnsThis();
    const enableStub = sinon.stub(CanvasController.prototype, 'enable').returnsThis();

    try {
        const controller = new CanvasController(
            $element, null, null, null, null, null, explicitHost, viewport,
            runwayRenderer, navigationRenderer, backgroundRenderer
        );

        t.is(controller._canvasHost, explicitHost);
        t.is(controller._viewport, viewport);
        t.is(controller._runwayRenderer, runwayRenderer);
        t.is(controller._navigationRenderer, navigationRenderer);
        t.is(controller._backgroundRenderer, backgroundRenderer);
        t.true(viewport.initStorage.calledOnce);
    } finally {
        initStub.restore();
        setupStub.restore();
        enableStub.restore();
    }
});

ava.serial('default airport renderers resolve live airport and range-ring state lazily', (t) => {
    const $element = $('<div></div>');
    const viewport = { initStorage: sinon.spy() };
    const firstAirport = {};
    const secondAirport = {};
    const airportGet = sinon.stub(AirportController, 'airport_get');
    const getGameOption = sinon.stub(GameController, 'getGameOption').returns('off');
    const initStub = sinon.stub(CanvasController.prototype, '_init').returnsThis();
    const setupStub = sinon.stub(CanvasController.prototype, '_setupHandlers').returnsThis();
    const enableStub = sinon.stub(CanvasController.prototype, 'enable').returnsThis();

    airportGet.onFirstCall().returns(firstAirport);
    airportGet.onSecondCall().returns(secondAirport);

    try {
        const controller = new CanvasController($element, null, null, null, null, null, null, viewport);

        t.is(controller._runwayRenderer._airportModelProvider(), firstAirport);
        t.is(controller._backgroundRenderer._airportProvider(), secondAirport);
        t.is(controller._backgroundRenderer._rangeRingOptionProvider(), 'off');
        t.true(airportGet.calledTwice);
        t.true(getGameOption.calledOnce);
    } finally {
        airportGet.restore();
        getGameOption.restore();
        initStub.restore();
        setupStub.restore();
        enableStub.restore();
    }
});
