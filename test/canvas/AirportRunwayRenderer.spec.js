import ava from 'ava';
import sinon from 'sinon';
import AirportRunwayRenderer from '../../src/assets/scripts/client/canvas/AirportRunwayRenderer';

ava('retains the exact viewport and airport-model provider identities', (t) => {
    const viewport = {};
    const airportModelProvider = () => null;
    const renderer = new AirportRunwayRenderer(viewport, airportModelProvider);

    t.is(renderer._viewport, viewport);
    t.is(renderer._airportModelProvider, airportModelProvider);
});

ava('drawRunways() preserves runway-pair order, centerline short-circuiting, and canvas operations', (t) => {
    const calls = [];
    const contextTarget = {};
    const context = new Proxy(contextTarget, {
        set(target, property, value) {
            calls.push(`set:${String(property)}:${value}`);
            target[property] = value;

            return true;
        }
    });

    for (const methodName of ['save', 'restore', 'translate', 'rotate', 'beginPath', 'moveTo', 'lineTo', 'stroke']) {
        contextTarget[methodName] = (...args) => calls.push(`${methodName}:${args.join(',')}`);
    }

    const reciprocalA = {
        length: 2,
        angle: 0.1,
        relativePosition: [1, 2],
        ils: { enabled: true, loc_maxDist: 3 }
    };
    const reciprocalB = {
        length: 4,
        angle: 0.2,
        relativePosition: [3, 4],
        ils: { enabled: false, loc_maxDist: 5 }
    };
    const airportModel = { runways: [[reciprocalA, reciprocalB]] };
    const viewport = {
        halfWidth: 320,
        halfHeight: 240,
        _translateKilometersToPixels: sinon.stub().callsFake((value) => value * 10),
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub()
    };

    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(reciprocalA.relativePosition).returns([11, 22]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(reciprocalB.relativePosition).returns([33, 44]);

    const airportModelProvider = sinon.stub().callsFake(() => {
        calls.push('airport');

        return airportModel;
    });
    const renderer = new AirportRunwayRenderer(viewport, airportModelProvider);
    const theme = { SCOPE: { RUNWAY: 'runway', RUNWAY_EXTENDED_CENTERLINE: 'centerline' } };

    const result = renderer.drawRunways(context, true, theme);

    t.is(result, undefined);
    t.deepEqual(calls, [
        'save:',
        'translate:320,240',
        'set:font:11px monoOne, monospace',
        'set:strokeStyle:runway',
        'set:fillStyle:runway',
        'set:lineWidth:4',
        'airport',
        'save:',
        'translate:11,22',
        'rotate:0.1',
        'set:strokeStyle:centerline',
        'set:lineWidth:1',
        'beginPath:',
        'moveTo:0,0',
        'lineTo:0,30',
        'stroke:',
        'restore:',
        'save:',
        'translate:33,44',
        'rotate:0.2',
        'restore:',
        'save:',
        'translate:11,22',
        'rotate:0.1',
        'set:strokeStyle:#899',
        'set:lineWidth:2.8',
        'beginPath:',
        'moveTo:0,0',
        'lineTo:0,-20',
        'stroke:',
        'restore:',
        'restore:'
    ]);
});

ava('drawRunways() returns before reading the airport or context when fix labels are disabled', (t) => {
    const airportModelProvider = sinon.spy();
    const renderer = new AirportRunwayRenderer({}, airportModelProvider);
    const context = new Proxy({}, {
        get() {
            t.fail('disabled runway rendering must not read the canvas context');
        }
    });

    t.is(renderer.drawRunways(context, false, {}), undefined);
    t.true(airportModelProvider.notCalled);
});

ava('drawRunwayLabels() draws both reciprocal labels in inherited operation order', (t) => {
    const calls = [];
    const contextTarget = {};
    const context = new Proxy(contextTarget, {
        set(target, property, value) {
            calls.push(`set:${String(property)}:${value}`);
            target[property] = value;

            return true;
        }
    });

    for (const methodName of ['save', 'restore', 'translate', 'rotate', 'fillText']) {
        contextTarget[methodName] = (...args) => calls.push(`${methodName}:${args.join(',')}`);
    }

    const reciprocalA = { name: '09', length: 2, angle: 0.1, relativePosition: [1, 2] };
    const reciprocalB = { name: '27', length: 4, angle: 0.2, relativePosition: [3, 4] };
    const airportModel = { runways: [[reciprocalA, reciprocalB]] };
    const viewport = {
        halfWidth: 320,
        halfHeight: 240,
        _translateKilometersToPixels: sinon.stub().callsFake((value) => value * 10),
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub()
    };

    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(reciprocalA.relativePosition).returns([11, 22]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(reciprocalB.relativePosition).returns([33, 44]);

    const airportModelProvider = sinon.stub().callsFake(() => {
        calls.push('airport');

        return airportModel;
    });
    const renderer = new AirportRunwayRenderer(viewport, airportModelProvider);
    const theme = { SCOPE: { RUNWAY_LABELS: 'labels' } };

    const result = renderer.drawRunwayLabels(context, true, theme);

    t.is(result, undefined);
    t.deepEqual(calls, [
        'airport',
        'save:',
        'translate:320,240',
        'set:fillStyle:labels',
        'save:',
        'set:textAlign:center',
        'set:textBaseline:middle',
        'translate:11,22',
        'rotate:0.1',
        'translate:0,24.5',
        'rotate:-0.1',
        'fillText:09,0,0',
        'restore:',
        'save:',
        'set:textAlign:center',
        'set:textBaseline:middle',
        'translate:33,44',
        'rotate:0.2',
        'translate:0,34.5',
        'rotate:-0.2',
        'fillText:27,0,0',
        'restore:',
        'restore:'
    ]);
});

ava('drawRunwayLabels() returns before reading the airport or context when fix labels are disabled', (t) => {
    const airportModelProvider = sinon.spy();
    const renderer = new AirportRunwayRenderer({}, airportModelProvider);
    const context = new Proxy({}, {
        get() {
            t.fail('disabled runway-label rendering must not read the canvas context');
        }
    });

    t.is(renderer.drawRunwayLabels(context, false, {}), undefined);
    t.true(airportModelProvider.notCalled);
});
