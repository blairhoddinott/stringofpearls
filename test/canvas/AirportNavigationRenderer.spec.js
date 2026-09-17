import ava from 'ava';
import sinon from 'sinon';
import AirportNavigationRenderer from '../../src/assets/scripts/client/canvas/AirportNavigationRenderer';
import { PROCEDURE_TYPE } from '../../src/assets/scripts/client/constants/routeConstants';

const buildRecordingContext = (calls, methodNames) => {
    const target = {};
    const context = new Proxy(target, {
        set(object, property, value) {
            calls.push(`set:${String(property)}:${value}`);
            object[property] = value;

            return true;
        }
    });

    for (const methodName of methodNames) {
        target[methodName] = (...args) => calls.push(`${methodName}:${args.join(',')}`);
    }

    return context;
};

ava('retains the exact viewport and navigation-library identities', (t) => {
    const viewport = {};
    const navigationLibrary = {};
    const renderer = new AirportNavigationRenderer(viewport, navigationLibrary);

    t.is(renderer._viewport, viewport);
    t.is(renderer._navigationLibrary, navigationLibrary);
});

ava('disabled navigation layers return before reading the context or navigation library', (t) => {
    const failOnRead = new Proxy({}, {
        get() {
            t.fail('disabled navigation rendering must not read a dependency');
        }
    });
    const renderer = new AirportNavigationRenderer(failOnRead, failOnRead);

    t.is(renderer.drawFixes(failOnRead, false, {}), undefined);
    t.is(renderer.drawSids(failOnRead, false, {}), undefined);
    t.is(renderer.drawStars(failOnRead, false, {}), undefined);
});

ava('drawFixes() preserves fix iteration and exact canvas operation order', (t) => {
    const calls = [];
    const context = buildRecordingContext(calls, [
        'save', 'restore', 'translate', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'fillText'
    ]);
    const fixes = [
        { name: 'ALPHA', relativePosition: [1, 2] },
        { name: 'BRAVO', relativePosition: [3, 4] }
    ];
    const viewport = {
        halfWidth: 320.4,
        halfHeight: 240.6,
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub()
    };

    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(fixes[0].relativePosition).returns([11, 22]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition
        .withArgs(fixes[1].relativePosition).returns([33, 44]);

    const renderer = new AirportNavigationRenderer(viewport, { realFixes: fixes });
    const theme = { SCOPE: { FIX_FILL: 'fix-fill', FIX_TEXT: 'fix-text' } };

    const result = renderer.drawFixes(context, true, theme);

    t.is(result, undefined);
    t.deepEqual(calls, [
        'save:',
        'translate:320,241',
        'set:lineJoin:round',
        'set:font:10px monoOne, monospace',
        'save:',
        'translate:11,22',
        'set:fillStyle:fix-fill',
        'set:globalCompositeOperation:source-over',
        'set:lineWidth:1',
        'beginPath:',
        'moveTo:0,-5',
        'lineTo:4,3',
        'lineTo:-4,3',
        'closePath:',
        'fill:',
        'set:fillStyle:fix-text',
        'set:textAlign:center',
        'set:textBaseline:top',
        'fillText:ALPHA,0,6',
        'restore:',
        'save:',
        'translate:33,44',
        'set:fillStyle:fix-fill',
        'set:globalCompositeOperation:source-over',
        'set:lineWidth:1',
        'beginPath:',
        'moveTo:0,-5',
        'lineTo:4,3',
        'lineTo:-4,3',
        'closePath:',
        'fill:',
        'set:fillStyle:fix-text',
        'set:textAlign:center',
        'set:textBaseline:top',
        'fillText:BRAVO,0,6',
        'restore:',
        'restore:'
    ]);
});

ava('drawSids() preserves polyline filtering, first-point repetition, and exit/fallback labels', (t) => {
    const calls = [];
    const context = buildRecordingContext(calls, [
        'save', 'restore', 'translate', 'setLineDash', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fillText'
    ]);
    const shortLine = [[9, 9]];
    const validLine = [[1, 2], [3, 4]];
    const sidLines = [
        {
            identifier: 'ALPHA1',
            lines: [shortLine, validLine],
            exits: ['EXIT'],
            lastFixName: 'IGNORED'
        },
        {
            identifier: 'BRAVO2',
            lines: [],
            exits: [],
            lastFixName: 'LAST'
        }
    ];
    const viewport = {
        halfWidth: 320,
        halfHeight: 240,
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub()
    };

    viewport.calculateRoundedCanvasPositionFromRelativePosition.withArgs(validLine[0]).returns([11, 22]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition.withArgs(validLine[1]).returns([33, 44]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition.withArgs([5, 6]).returns([55, 66]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition.withArgs([7, 8]).returns([77, 88]);

    const navigationLibrary = {
        getProcedureLines: sinon.stub().withArgs(PROCEDURE_TYPE.SID).returns(sidLines),
        getFixRelativePosition: sinon.stub()
    };

    navigationLibrary.getFixRelativePosition.withArgs('EXIT').returns([5, 6]);
    navigationLibrary.getFixRelativePosition.withArgs('LAST').returns([7, 8]);

    const renderer = new AirportNavigationRenderer(viewport, navigationLibrary);
    const theme = { SCOPE: { SID: 'sid' } };

    const result = renderer.drawSids(context, true, theme);

    t.is(result, undefined);
    t.true(navigationLibrary.getProcedureLines.calledOnceWithExactly(PROCEDURE_TYPE.SID));
    t.deepEqual(navigationLibrary.getFixRelativePosition.args, [['EXIT'], ['LAST']]);
    t.deepEqual(calls, [
        'save:',
        'translate:320,240',
        'set:strokeStyle:sid',
        'set:fillStyle:sid',
        'setLineDash:1,10',
        'set:font:italic 14px monoOne, monospace',
        'beginPath:',
        'moveTo:11,22',
        'lineTo:11,22',
        'lineTo:33,44',
        'stroke:',
        'fillText:ALPHA1.EXIT,65,66',
        'fillText:BRAVO2,87,88',
        'restore:'
    ]);
});

ava('drawStars() preserves right-aligned first-fix label aggregation and polyline order', (t) => {
    const calls = [];
    const context = buildRecordingContext(calls, [
        'save', 'restore', 'translate', 'setLineDash', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fillText'
    ]);
    const validLine = [[1, 2], [3, 4]];
    const starLines = [
        { identifier: 'ALPHA1', lines: [validLine], firstFixName: 'FIRST' },
        { identifier: 'BRAVO2', lines: [], firstFixName: 'FIRST' }
    ];
    const viewport = {
        halfWidth: 320,
        halfHeight: 240,
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub()
    };

    viewport.calculateRoundedCanvasPositionFromRelativePosition.withArgs(validLine[0]).returns([11, 22]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition.withArgs(validLine[1]).returns([33, 44]);
    viewport.calculateRoundedCanvasPositionFromRelativePosition.withArgs([5, 6]).returns([55, 66]);

    const navigationLibrary = {
        getProcedureLines: sinon.stub().withArgs(PROCEDURE_TYPE.STAR).returns(starLines),
        getFixRelativePosition: sinon.stub().withArgs('FIRST').returns([5, 6])
    };
    const renderer = new AirportNavigationRenderer(viewport, navigationLibrary);
    const theme = { SCOPE: { STAR: 'star' } };

    const result = renderer.drawStars(context, true, theme);

    t.is(result, undefined);
    t.true(navigationLibrary.getProcedureLines.calledOnceWithExactly(PROCEDURE_TYPE.STAR));
    t.true(navigationLibrary.getFixRelativePosition.calledOnceWithExactly('FIRST'));
    t.deepEqual(calls, [
        'save:',
        'translate:320,240',
        'set:strokeStyle:star',
        'set:fillStyle:star',
        'setLineDash:1,10',
        'set:font:italic 14px monoOne, monospace',
        'set:textAlign:right',
        'beginPath:',
        'moveTo:11,22',
        'lineTo:11,22',
        'lineTo:33,44',
        'stroke:',
        'fillText:ALPHA1,45,66',
        'fillText:BRAVO2,45,81',
        'restore:'
    ]);
});
