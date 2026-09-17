import ava from 'ava';
import sinon from 'sinon';
import CanvasController from '../../src/assets/scripts/client/canvas/CanvasController';
import CanvasRenderScheduler from '../../src/assets/scripts/client/canvas/CanvasRenderScheduler';
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
