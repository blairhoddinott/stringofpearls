import ava from 'ava';
import ViewportGestureInteraction from '../../src/assets/scripts/client/input/ViewportGestureInteraction';

ava('retains exact input state, viewport, and drag-button provider identities', (t) => {
    const inputState = {};
    const viewport = {};
    const dragButtonProvider = () => {};
    const interaction = new ViewportGestureInteraction(inputState, viewport, dragButtonProvider);

    t.is(interaction._inputState, inputState);
    t.is(interaction._viewport, viewport);
    t.is(interaction._dragButtonProvider, dragButtonProvider);
    t.deepEqual(interaction._mouseDownScreenPosition, [0, 0]);
});

ava('zoom() zooms in and short-circuits detail after positive wheelDelta', (t) => {
    const calls = [];
    const interaction = new ViewportGestureInteraction({}, {
        zoomIn: () => calls.push('in'),
        zoomOut: () => calls.push('out')
    }, () => {});
    const originalEvent = {
        wheelDelta: 1,
        get detail() {
            throw new Error('unexpected detail read');
        }
    };

    const result = interaction.zoom({ originalEvent });

    t.is(result, undefined);
    t.deepEqual(calls, ['in']);
});

ava('zoom() zooms in for negative detail and otherwise zooms out', (t) => {
    const calls = [];
    const interaction = new ViewportGestureInteraction({}, {
        zoomIn: () => calls.push('in'),
        zoomOut: () => calls.push('out')
    }, () => {});

    interaction.zoom({ originalEvent: { wheelDelta: 0, detail: -1 } });
    interaction.zoom({ originalEvent: { wheelDelta: 0, detail: 0 } });

    t.deepEqual(calls, ['in', 'out']);
});

ava('markPressed() short-circuits non-drag buttons before event or viewport reads', (t) => {
    const calls = [];
    const inputState = { isMouseDown: false };
    const event = {
        get pageX() { throw new Error('unexpected pageX read'); },
        get pageY() { throw new Error('unexpected pageY read'); }
    };
    const viewport = {
        get _panX() { throw new Error('unexpected panX read'); },
        get _panY() { throw new Error('unexpected panY read'); }
    };
    const interaction = new ViewportGestureInteraction(inputState, viewport, () => {
        calls.push('provider');
        return 'right';
    });

    const result = interaction.markPressed(event, 'left');

    t.is(result, undefined);
    t.deepEqual(calls, ['provider']);
    t.false(inputState.isMouseDown);
    t.deepEqual(interaction._mouseDownScreenPosition, [0, 0]);
});

ava('markPressed() records pan-adjusted anchor before marking the mouse down', (t) => {
    const calls = [];
    let interaction;
    const inputState = {};
    Object.defineProperty(inputState, 'isMouseDown', {
        set: (value) => {
            calls.push(['isMouseDown', value, interaction._mouseDownScreenPosition]);
        }
    });
    const event = {
        get pageX() { calls.push('pageX'); return 30; },
        get pageY() { calls.push('pageY'); return 50; }
    };
    const viewport = {
        get _panX() { calls.push('panX'); return 7; },
        get _panY() { calls.push('panY'); return 11; }
    };
    interaction = new ViewportGestureInteraction(inputState, viewport, () => {
        calls.push('provider');
        return 'left';
    });

    interaction.markPressed(event, 'left');

    t.deepEqual(calls, [
        'provider',
        'pageX',
        'panX',
        'pageY',
        'panY',
        ['isMouseDown', true, [23, 39]]
    ]);
});

ava('release() clears mouse-down state and resetZoom() delegates with undefined returns', (t) => {
    const calls = [];
    const inputState = { isMouseDown: true };
    const interaction = new ViewportGestureInteraction(inputState, {
        zoomReset: () => { calls.push('reset'); return 'ignored'; }
    }, () => {});

    t.is(interaction.release(), undefined);
    t.false(inputState.isMouseDown);
    t.is(interaction.resetZoom(), undefined);
    t.deepEqual(calls, ['reset']);
});

ava('drag() returns false before event and viewport reads when the mouse is up', (t) => {
    const interaction = new ViewportGestureInteraction({ isMouseDown: false }, {
        updatePan: () => { throw new Error('unexpected pan'); }
    }, () => {});
    const event = {
        get pageX() { throw new Error('unexpected pageX read'); },
        get pageY() { throw new Error('unexpected pageY read'); }
    };

    t.false(interaction.drag(event));
});

ava('drag() updates pan once from page coordinates minus the stored anchor', (t) => {
    const calls = [];
    const interaction = new ViewportGestureInteraction({ isMouseDown: true }, {
        updatePan: (...args) => { calls.push(['pan', ...args]); return 'ignored'; }
    }, () => {});
    interaction._mouseDownScreenPosition = [10, 20];
    const event = {
        get pageX() { calls.push('pageX'); return 35; },
        get pageY() { calls.push('pageY'); return 55; }
    };

    t.true(interaction.drag(event));
    t.deepEqual(calls, [
        'pageX',
        'pageY',
        ['pan', 25, 35]
    ]);
});

ava('drag() propagates the exact viewport update error', (t) => {
    const error = new Error('pan failed');
    const interaction = new ViewportGestureInteraction({ isMouseDown: true }, {
        updatePan: () => { throw error; }
    }, () => {});

    const thrown = t.throws(() => interaction.drag({ pageX: 1, pageY: 2 }));

    t.is(thrown, error);
});
