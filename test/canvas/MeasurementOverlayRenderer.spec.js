import ava from 'ava';
import sinon from 'sinon';
import MeasurementOverlayRenderer from '../../src/assets/scripts/client/canvas/MeasurementOverlayRenderer';

function buildRecordingContext(calls, methods) {
    const target = {};

    for (const method of methods) {
        target[method] = (...args) => calls.push(`${method}:${args.join(',')}`);
    }

    target.measureText = (label) => {
        calls.push(`measureText:${label}`);

        return { width: label.length * 2 };
    };

    return new Proxy(target, {
        set(object, property, value) {
            calls.push(`${String(property)}=${value}`);
            object[property] = value;

            return true;
        }
    });
}

ava('retains the exact viewport and measure-tool identities', (t) => {
    const viewport = {};
    const measureTool = {};
    const renderer = new MeasurementOverlayRenderer(viewport, measureTool);

    t.is(renderer._viewport, viewport);
    t.is(renderer._measureTool, measureTool);
});

ava('draw() returns before canvas and viewport access when there are no paths', (t) => {
    const viewport = new Proxy({}, {
        get() {
            throw new Error('viewport should not be read');
        }
    });
    const context = new Proxy({}, {
        get() {
            throw new Error('context should not be read');
        }
    });
    const measureTool = {
        hasPaths: false,
        buildPathInfo: sinon.spy()
    };
    const renderer = new MeasurementOverlayRenderer(viewport, measureTool);

    t.is(renderer.draw(context, {}), undefined);
    t.true(measureTool.buildPathInfo.notCalled);
});

ava('draw() preserves linked path, initial-turn, and label operation order', (t) => {
    const calls = [];
    const secondLeg = {
        startPoint: [6, 6],
        midPoint: [7, 7],
        endPoint: [8, 8],
        radius: 1,
        labels: ['B', 'CC'],
        next: null
    };
    const firstLeg = {
        startPoint: [1, 1],
        midPoint: [2, 2],
        endPoint: [3, 3],
        radius: 0.5,
        labels: ['A'],
        next: secondLeg
    };
    const pathInfo = {
        firstLeg,
        initialTurn: {
            isRHT: false,
            center: [9, 9],
            entryAngle: 1,
            exitAngle: 2,
            turnRadius: 2
        }
    };
    const viewport = {
        halfWidth: 100.4,
        halfHeight: 80.4,
        calculatePreciseCanvasPositionFromRelativePosition: sinon.stub(),
        _translateKilometersToPixels: sinon.stub()
    };
    const positions = [
        [[1, 1], [1, 2]],
        [[2, 2], [3, 4]],
        [[3, 3], [5, 6]],
        [[7, 7], [7, 8]],
        [[8, 8], [9, 10]],
        [[9, 9], [11, 12]]
    ];

    for (const [relative, canvas] of positions) {
        viewport.calculatePreciseCanvasPositionFromRelativePosition
            .withArgs(sinon.match(relative)).returns(canvas);
    }

    viewport._translateKilometersToPixels.withArgs(2).returns(20);
    viewport._translateKilometersToPixels.withArgs(0.5).returns(5);
    viewport._translateKilometersToPixels.withArgs(1).returns(10);

    const measureTool = {
        hasPaths: true,
        buildPathInfo: sinon.stub().returns([pathInfo])
    };
    const renderer = new MeasurementOverlayRenderer(viewport, measureTool);
    const context = buildRecordingContext(calls, [
        'save', 'translate', 'beginPath', 'arc', 'moveTo', 'lineTo', 'arcTo',
        'stroke', 'fillRect', 'fillText', 'restore'
    ]);
    const theme = {
        SCOPE: {
            MEASURE_LINE: 'line',
            MEASURE_BACKGROUND: 'background',
            MEASURE_TEXT: 'text'
        },
        DATA_BLOCK: { TEXT_FONT: 'font' }
    };

    t.is(renderer.draw(context, theme), undefined);
    t.true(measureTool.buildPathInfo.calledOnce);
    t.deepEqual(calls, [
        'save:',
        'translate:100,80',
        'save:',
        'strokeStyle=line',
        'beginPath:',
        `arc:11,12,20,${1 - Math.PI / 2},${2 - Math.PI / 2},true`,
        'moveTo:1,2',
        'lineTo:3,4',
        'arcTo:5,6,7,8,5',
        'lineTo:7,8',
        'lineTo:9,10',
        'stroke:',
        'restore:',
        'save:',
        'fillStyle=background',
        'font=font',
        'measureText:A',
        'fillRect:3,4,12,22',
        'measureText:B',
        'measureText:CC',
        'fillRect:7,8,14,34',
        'fillStyle=text',
        'fillText:A,8,19',
        'fillText:B,12,23',
        'fillText:CC,12,35',
        'restore:',
        'restore:'
    ]);
});
