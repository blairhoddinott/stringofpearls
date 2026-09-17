import ava from 'ava';
import sinon from 'sinon';
import AirportBackgroundRenderer from '../../src/assets/scripts/client/canvas/AirportBackgroundRenderer';

function buildRecordingContext(calls, methods) {
    const target = {};

    for (const method of methods) {
        target[method] = (...args) => calls.push(`${method}:${args.join(',')}`);
    }

    return new Proxy(target, {
        set(object, property, value) {
            calls.push(`${String(property)}=${value}`);
            object[property] = value;

            return true;
        }
    });
}

ava('retains the exact viewport and provider identities', (t) => {
    const viewport = {};
    const airportProvider = () => {};
    const rangeRingOptionProvider = () => {};
    const renderer = new AirportBackgroundRenderer(
        viewport,
        airportProvider,
        rangeRingOptionProvider
    );

    t.is(renderer._viewport, viewport);
    t.is(renderer._airportProvider, airportProvider);
    t.is(renderer._rangeRingOptionProvider, rangeRingOptionProvider);
});

ava('drawVideoMap() preserves invisible short-circuit and visible line operation order', (t) => {
    const calls = [];
    const viewport = {
        halfWidth: 101.2,
        halfHeight: 79.7,
        scale: 30,
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub()
    };
    const mapCollection = {
        hasVisibleMaps: false,
        getVisibleMapLines: sinon.stub()
    };
    const airportProvider = sinon.stub().returns({ mapCollection });
    const renderer = new AirportBackgroundRenderer(viewport, airportProvider, () => 'default');
    const context = buildRecordingContext(calls, [
        'save', 'translate', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'restore'
    ]);
    const theme = { SCOPE: { VIDEO_MAP: 'video' } };

    t.is(renderer.drawVideoMap(context, theme), undefined);
    t.deepEqual(calls, []);
    t.true(airportProvider.calledOnce);
    t.false(mapCollection.getVisibleMapLines.called);

    mapCollection.hasVisibleMaps = true;
    mapCollection.getVisibleMapLines.returns([
        [1, 2, 3, 4],
        [5, 6, 7, 8]
    ]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([1, 2])).returns([10, 20]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([3, 4])).returns([30, 40]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([5, 6])).returns([50, 60]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([7, 8])).returns([70, 80]);

    renderer.drawVideoMap(context, theme);

    t.deepEqual(calls, [
        'save:',
        'translate:101,80',
        'strokeStyle=video',
        'lineWidth=2',
        'lineJoin=round',
        'font=10px monoOne, monospace',
        'beginPath:',
        'moveTo:10,20',
        'lineTo:30,40',
        'moveTo:50,60',
        'lineTo:70,80',
        'stroke:',
        'restore:'
    ]);
});

ava('drawAirspaceAndRangeRings() preserves polygon and configured-ring operations', (t) => {
    const calls = [];
    const polygon = [[1, 2], [3, 4]];
    const airport = {
        airspace: [{ relativePoly: polygon }],
        ctr_radius: 3,
        rangeRings: { center: { relativePosition: [9, 9] } }
    };
    const viewport = {
        halfWidth: 100.4,
        halfHeight: 80.4,
        scale: 10,
        calculatePreciseCanvasPositionFromRelativePosition: sinon.stub().returns([5, 6]),
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub()
    };
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([1, 2])).returns([10, 20]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([3, 4])).returns([30, 40]);
    const airportProvider = sinon.stub().returns(airport);
    const optionProvider = sinon.stub().returns('2');
    const renderer = new AirportBackgroundRenderer(viewport, airportProvider, optionProvider);
    const context = buildRecordingContext(calls, [
        'save', 'translate', 'beginPath', 'lineTo', 'closePath', 'stroke', 'fill', 'arc', 'restore'
    ]);
    const theme = {
        SCOPE: {
            AIRSPACE_PERIMETER: 'perimeter',
            AIRSPACE_FILL: 'airspace-fill',
            RANGE_RING_COLOR: 'rings'
        }
    };

    t.is(renderer.drawAirspaceAndRangeRings(context, theme), undefined);

    t.true(airportProvider.calledTwice);
    t.true(optionProvider.calledOnce);
    t.deepEqual(calls, [
        'save:',
        'translate:100,80',
        'save:',
        'strokeStyle=perimeter',
        'fillStyle=airspace-fill',
        'beginPath:',
        'lineTo:10,20',
        'lineTo:30,40',
        'closePath:',
        'stroke:',
        'fill:',
        'restore:',
        'save:',
        'linewidth=1',
        'strokeStyle=rings',
        'beginPath:',
        `arc:5,6,37.04,0,${Math.PI * 2}`,
        'stroke:',
        'beginPath:',
        `arc:5,6,74.08,0,${Math.PI * 2}`,
        'stroke:',
        'restore:',
        'restore:'
    ]);
});

ava('drawAirspaceShelvesAndLabels() preserves short-circuit, polygons, and label placement', (t) => {
    const calls = [];
    const airspace = {
        relativePoly: [[1, 2], [3, 4]],
        floor: 1234,
        ceiling: 5678,
        labelRelativePositions: [[9, 9]]
    };
    const viewport = {
        halfWidth: 50,
        halfHeight: 60,
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub()
    };
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([1, 2])).returns([10, 20]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([3, 4])).returns([30, 40]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([9, 9])).returns([90, 91]);
    const airportProvider = sinon.stub().returns({ airspace: [airspace] });
    const renderer = new AirportBackgroundRenderer(viewport, airportProvider, () => 'off');
    const context = buildRecordingContext(calls, [
        'save', 'translate', 'beginPath', 'lineTo', 'closePath', 'stroke', 'fillText', 'restore'
    ]);

    t.is(renderer.drawAirspaceShelvesAndLabels(context, false), undefined);
    t.deepEqual(calls, []);
    t.false(airportProvider.called);

    renderer.drawAirspaceShelvesAndLabels(context, true);

    t.true(airportProvider.calledOnce);
    t.deepEqual(calls, [
        'save:',
        'strokeStyle=rgba(224, 128, 128, 1.0)',
        'fillStyle=rgba(224, 128, 128, 1.0)',
        'font=12px monoOne, monospace',
        'textAlign=center',
        'textBaseline=middle',
        'save:',
        'translate:50,60',
        'beginPath:',
        'lineTo:10,20',
        'lineTo:30,40',
        'closePath:',
        'stroke:',
        'restore:',
        'save:',
        'translate:50,60',
        'fillText:012-057 (#0),90,91',
        'restore:',
        'restore:'
    ]);
});

ava('drawRestrictedAirspace() preserves short-circuit, outline, and two-line labels', (t) => {
    const calls = [];
    const viewport = {
        halfWidth: 40,
        halfHeight: 30,
        scale: 3,
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub()
    };
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([1, 2])).returns([10, 20]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([5, 6])).returns([50, 60]);
    const airportProvider = sinon.stub().returns({
        restricted_areas: [{
            poly: [[1, 2]],
            height: Infinity,
            name: 'R-123',
            labelRelativePositions: [[5, 6]]
        }]
    });
    const renderer = new AirportBackgroundRenderer(viewport, airportProvider, () => 'off');
    const context = buildRecordingContext(calls, [
        'save', 'translate', 'beginPath', 'lineTo', 'closePath', 'stroke', 'fillText', 'restore'
    ]);
    const theme = { SCOPE: { RESTRICTED_AIRSPACE: 'restricted' } };

    t.is(renderer.drawRestrictedAirspace(context, false, theme), undefined);
    t.deepEqual(calls, []);
    t.false(airportProvider.called);

    renderer.drawRestrictedAirspace(context, true, theme);

    t.true(airportProvider.calledOnce);
    t.deepEqual(calls, [
        'save:',
        'translate:40,30',
        'fillStyle=restricted',
        'strokeStyle=restricted',
        'lineWidth=2',
        'lineJoin=round',
        'font=10px monoOne, monospace',
        'textAlign=center',
        'textBaseline=top',
        'beginPath:',
        'lineTo:10,20',
        'closePath:',
        'stroke:',
        'fillText:R-123,50,54',
        'fillText:UNL,50,66',
        'restore:'
    ]);
});

ava('drawTerrain() preserves airport lookup, contour operations, and one-time warning state', (t) => {
    const calls = [];
    const terrain = {};
    const airport = { icao: 'kxyz', terrain };
    const airportProvider = sinon.stub().returns(airport);
    const viewport = {
        halfWidth: 70,
        halfHeight: 80,
        width: 140,
        height: 160,
        scale: 10,
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub()
    };
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([1, 2])).returns([10, 20]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(sinon.match([3, 4])).returns([30, 40]);
    const renderer = new AirportBackgroundRenderer(viewport, airportProvider, () => 'off');
    const context = buildRecordingContext(calls, [
        'save', 'translate', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'restore'
    ]);
    const theme = {
        SCOPE: { FIX_FILL: 'fix' },
        TERRAIN: {
            COLOR: { 0: '0, 1%, 2%', '-100': '3, 4%, 5%' },
            BORDER_OPACITY: 0.3,
            FILL_OPACITY: 0.2
        }
    };

    t.is(renderer.drawTerrain(context, false, theme), undefined);
    t.true(airportProvider.calledOnce);
    t.deepEqual(calls, []);

    terrain[0] = [[[[1, 2], [3, 4]]]];
    renderer.drawTerrain(context, true, theme);

    t.deepEqual(calls, [
        'save:',
        'translate:70,80',
        'strokeStyle=fix',
        'fillStyle=fix',
        'lineWidth=1',
        'lineJoin=round',
        'save:',
        'strokeStyle=hsla(0, 1%, 2%, 0.3)',
        'fillStyle=hsla(0, 1%, 2%, 0.2)',
        'beginPath:',
        'moveTo:10,20',
        'lineTo:30,40',
        'closePath:',
        'fill:',
        'stroke:',
        'restore:',
        'restore:'
    ]);

    delete terrain[0];
    terrain[-100] = [[[[1, 2]]]];
    calls.length = 0;
    const warning = sinon.stub(console, 'warn');

    try {
        renderer.drawTerrain(context, true, theme);
        renderer.drawTerrain(context, true, theme);

        t.true(warning.calledOnceWith(
            "kxyz.geojson contains 'terrain'  below sea level, which is not supported!"
        ));
        t.true(renderer._hasSeenTerrainWarning);
    } finally {
        warning.restore();
    }
});
