import ava from 'ava';
import KeyboardInteraction from '../../src/assets/scripts/client/input/KeyboardInteraction';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';
import {
    COMMAND_CONTEXT,
    KEY_CODES,
    LEGACY_KEY_CODES
} from '../../src/assets/scripts/client/constants/inputConstants';
import { CLASSNAMES, SELECTORS } from '../../src/assets/scripts/client/constants/selectors';

function buildHarness(overrides = {}) {
    const calls = [];
    let value = overrides.value ?? '';
    let context = overrides.context ?? COMMAND_CONTEXT.AIRCRAFT;
    const dependencies = {
        inputState: { callsign: overrides.callsign ?? '' },
        commandInput: {
            val: (...args) => {
                if (args.length === 0) {
                    calls.push('val.get');
                    return value;
                }

                calls.push(['val.set', args[0]]);
                value = args[0];
            },
            attr: (...args) => calls.push(['attr', ...args]),
            toggleClass: (...args) => calls.push(['toggleClass', ...args]),
            focus: () => calls.push('focus')
        },
        autocompleteController: {
            active: overrides.autocompleteActive ?? false,
            onKeydownHandler: (event) => calls.push(['autocomplete', event]),
            activate: () => calls.push('autocomplete.activate')
        },
        measurementInteraction: {
            start: () => calls.push('measurement.start'),
            stop: () => calls.push('measurement.stop'),
            reset: () => calls.push('measurement.reset')
        },
        scopeModel: {
            decreasePtlLength: () => calls.push('scope.decreasePtlLength'),
            increasePtlLength: () => calls.push('scope.increasePtlLength')
        },
        uiController: { closeAllDialogs: () => calls.push('ui.closeAllDialogs') },
        eventBus: { trigger: (...args) => calls.push(['eventBus.trigger', ...args]) },
        arrowControlProvider: () => {
            calls.push('arrowControlProvider');
            return overrides.arrowControl ?? false;
        },
        commandContextProvider: () => {
            calls.push('commandContextProvider');
            return context;
        },
        commandContextSetter: (nextContext) => {
            calls.push(['commandContextSetter', nextContext]);
            context = nextContext;
        },
        processCommand: () => calls.push('processCommand'),
        selectPreviousAircraft: () => calls.push('selectPreviousAircraft'),
        selectNextAircraft: () => calls.push('selectNextAircraft'),
        deselectAircraft: () => calls.push('deselectAircraft'),
        ...overrides.dependencies
    };

    return {
        calls,
        dependencies,
        interaction: new KeyboardInteraction(dependencies),
        get value() {
            return value;
        },
        get context() {
            return context;
        }
    };
}

function keyboardEvent(code, calls = []) {
    return {
        originalEvent: { code },
        target: { classList: { contains: () => false }, parentElement: null },
        preventDefault: () => calls.push('preventDefault')
    };
}

ava('retains every exact keyboard dependency and provider identity', (t) => {
    const dependencies = {
        inputState: {},
        commandInput: {},
        autocompleteController: {},
        measurementInteraction: {},
        scopeModel: {},
        uiController: {},
        eventBus: {},
        arrowControlProvider: () => {},
        commandContextProvider: () => {},
        commandContextSetter: () => {},
        processCommand: () => {},
        selectPreviousAircraft: () => {},
        selectNextAircraft: () => {},
        deselectAircraft: () => {}
    };
    const interaction = new KeyboardInteraction(dependencies);

    for (const [name, dependency] of Object.entries(dependencies)) {
        t.is(interaction[`_${name}`], dependency);
    }
});

ava('keydown() ignores non-Escape and legacy Escape events inside dialogs before other reads', (t) => {
    const harness = buildHarness({ autocompleteActive: true });
    const dialog = { classList: { contains: (name) => name === CLASSNAMES.DIALOG }, parentElement: null };

    harness.interaction.keydown({ ...keyboardEvent(KEY_CODES.ENTER), target: dialog });
    harness.interaction.keydown({
        ...keyboardEvent(null),
        originalEvent: { code: null, keyCode: LEGACY_KEY_CODES.ESCAPE },
        target: dialog
    });

    t.deepEqual(harness.calls, []);
});

ava('keydown() allows modern Escape inside dialogs and preserves cancellation order', (t) => {
    const harness = buildHarness({ value: '', callsign: '' });
    const dialog = { classList: { contains: (name) => name === CLASSNAMES.DIALOG }, parentElement: null };

    harness.interaction.keydown({ ...keyboardEvent(KEY_CODES.ESCAPE), target: dialog });

    t.deepEqual(harness.calls, [
        'val.get',
        'measurement.reset',
        'ui.closeAllDialogs',
        'deselectAircraft'
    ]);
});

ava('keydown() delegates active autocomplete with the exact event before command input reads', (t) => {
    const harness = buildHarness({ autocompleteActive: true });
    const event = keyboardEvent(KEY_CODES.ENTER);

    harness.interaction.keydown(event);

    t.deepEqual(harness.calls, [['autocomplete', event]]);
});

ava('_isDialog() walks parents and recognizes only the inherited dialog class', (t) => {
    const harness = buildHarness();
    const dialog = { classList: { contains: (name) => name === CLASSNAMES.DIALOG }, parentElement: null };
    const child = { classList: { contains: () => false }, parentElement: dialog };
    const outside = { classList: { contains: () => false }, parentElement: null };

    t.true(harness.interaction._isDialog(dialog));
    t.true(harness.interaction._isDialog(child));
    t.falsy(harness.interaction._isDialog(outside));
});

ava('control, Enter, page navigation, and keyup preserve operation order and legacy fallback', (t) => {
    const harness = buildHarness();
    const pageUp = keyboardEvent(null, harness.calls);
    pageUp.originalEvent.keyCode = LEGACY_KEY_CODES.PAGE_UP;
    const pageDown = keyboardEvent(KEY_CODES.PAGE_DOWN, harness.calls);

    harness.interaction.keydown(keyboardEvent(KEY_CODES.CONTROL_LEFT, harness.calls));
    harness.interaction.keydown(keyboardEvent(KEY_CODES.ENTER, harness.calls));
    harness.interaction.keydown(pageUp);
    harness.interaction.keydown(pageDown);
    harness.interaction.keyup({ originalEvent: { code: KEY_CODES.CONTROL_RIGHT } });

    t.deepEqual(harness.calls, [
        'val.get',
        'measurement.start',
        'val.get',
        'processCommand',
        'val.get',
        'selectPreviousAircraft',
        'preventDefault',
        'val.get',
        'selectNextAircraft',
        'preventDefault',
        'measurement.stop',
        ['eventBus.trigger', EVENT.MARK_SHALLOW_RENDER]
    ]);
});

ava('aircraft arrow mode appends every inherited directional command fragment', (t) => {
    const cases = [
        [KEY_CODES.LEFT_ARROW, 'cmd t l '],
        [KEY_CODES.RIGHT_ARROW, 'cmd t r '],
        [KEY_CODES.UP_ARROW, 'cmd c '],
        [KEY_CODES.DOWN_ARROW, 'cmd d ']
    ];

    for (const [code, expected] of cases) {
        const harness = buildHarness({ value: 'cmd', arrowControl: true });
        harness.interaction.keydown(keyboardEvent(code, harness.calls));
        t.deepEqual(harness.calls, [
            'val.get',
            'arrowControlProvider',
            'commandContextProvider',
            ['val.set', expected],
            'preventDefault'
        ]);
    }
});

ava('non-arrow mode keeps horizontal arrows inert and routes vertical arrows through history', (t) => {
    const left = buildHarness({ arrowControl: false });
    left.interaction.keydown(keyboardEvent(KEY_CODES.LEFT_ARROW, left.calls));
    t.deepEqual(left.calls, ['val.get', 'arrowControlProvider']);

    const up = buildHarness({ arrowControl: false });
    up.interaction.keydown(keyboardEvent(KEY_CODES.UP_ARROW, up.calls));
    t.deepEqual(up.calls, [
        'val.get',
        'arrowControlProvider',
        'selectPreviousAircraft',
        'preventDefault'
    ]);

    const scope = buildHarness({ arrowControl: true, context: COMMAND_CONTEXT.SCOPE });
    scope.interaction.keydown(keyboardEvent(KEY_CODES.DOWN_ARROW, scope.calls));
    t.deepEqual(scope.calls, [
        'val.get',
        'arrowControlProvider',
        'commandContextProvider',
        'selectNextAircraft',
        'preventDefault'
    ]);
});

ava('aircraft numeric shortcuts append exact fragments and scope context leaves them inert', (t) => {
    const cases = [
        [KEY_CODES.NUM_DIVIDE, 'cmd / '],
        [KEY_CODES.NUM_MULTIPLY, 'cmd * '],
        [KEY_CODES.NUM_ADD, 'cmd + '],
        [KEY_CODES.NUM_SUBTRACT, 'cmd - ']
    ];

    for (const [code, expected] of cases) {
        const harness = buildHarness({ value: 'cmd' });
        harness.interaction.keydown(keyboardEvent(code, harness.calls));
        t.deepEqual(harness.calls, [
            'val.get',
            'commandContextProvider',
            ['val.set', expected],
            'preventDefault'
        ]);

        const scopeHarness = buildHarness({ value: 'cmd', context: COMMAND_CONTEXT.SCOPE });
        scopeHarness.interaction.keydown(keyboardEvent(code, scopeHarness.calls));
        t.deepEqual(scopeHarness.calls, ['val.get', 'commandContextProvider']);
    }
});

ava('function-key shortcuts preserve preventDefault and scope operation order', (t) => {
    const harness = buildHarness();

    harness.interaction.keydown(keyboardEvent(KEY_CODES.F1, harness.calls));
    harness.interaction.keydown(keyboardEvent(KEY_CODES.F2, harness.calls));

    t.deepEqual(harness.calls, [
        'val.get',
        'preventDefault',
        'scope.decreasePtlLength',
        'val.get',
        'preventDefault',
        'scope.increasePtlLength'
    ]);
});

ava('F7 returns early outside scope and writes before preventing default in scope', (t) => {
    const aircraft = buildHarness();
    aircraft.interaction.keydown(keyboardEvent(KEY_CODES.F7, aircraft.calls));
    t.deepEqual(aircraft.calls, ['val.get', 'commandContextProvider']);

    const scope = buildHarness({ context: COMMAND_CONTEXT.SCOPE });
    scope.interaction.keydown(keyboardEvent(KEY_CODES.F7, scope.calls));
    t.deepEqual(scope.calls, [
        'val.get',
        'commandContextProvider',
        ['val.set', 'QP_J '],
        'preventDefault'
    ]);
});

ava('backquote clears before prevention and toggles both command contexts in inherited order', (t) => {
    const aircraft = buildHarness();
    aircraft.interaction.keydown(keyboardEvent(KEY_CODES.BACKQUOTE, aircraft.calls));
    t.deepEqual(aircraft.calls, [
        'val.get',
        ['val.set', ''],
        'preventDefault',
        'commandContextProvider',
        ['commandContextSetter', COMMAND_CONTEXT.SCOPE],
        ['attr', 'placeholder', 'enter scope command'],
        ['toggleClass', SELECTORS.CLASSNAMES.COMMAND_SCOPE_MODE]
    ]);
    t.is(aircraft.context, COMMAND_CONTEXT.SCOPE);

    const scope = buildHarness({ context: COMMAND_CONTEXT.SCOPE });
    scope.interaction.keydown(keyboardEvent(KEY_CODES.BACKQUOTE, scope.calls));
    t.deepEqual(scope.calls, [
        'val.get',
        ['val.set', ''],
        'preventDefault',
        'commandContextProvider',
        ['commandContextSetter', COMMAND_CONTEXT.AIRCRAFT],
        ['attr', 'placeholder', 'enter aircraft command'],
        ['toggleClass', SELECTORS.CLASSNAMES.COMMAND_SCOPE_MODE]
    ]);
});

ava('Tab prevents default before conditionally activating aircraft autocomplete', (t) => {
    const aircraft = buildHarness();
    aircraft.interaction.keydown(keyboardEvent(KEY_CODES.TAB, aircraft.calls));
    t.deepEqual(aircraft.calls, [
        'val.get',
        'preventDefault',
        'commandContextProvider',
        'autocomplete.activate'
    ]);

    const scope = buildHarness({ context: COMMAND_CONTEXT.SCOPE });
    scope.interaction.keydown(keyboardEvent(KEY_CODES.TAB, scope.calls));
    t.deepEqual(scope.calls, ['val.get', 'preventDefault', 'commandContextProvider']);
});

ava('Escape resets and closes dialogs before deselecting for inherited invalid command states', (t) => {
    const cases = [
        { value: 'other command', callsign: 'aal1' },
        { value: 'aal1', callsign: 'aal1' },
        { value: '', callsign: '' }
    ];

    for (const testCase of cases) {
        const harness = buildHarness(testCase);
        harness.interaction.keydown(keyboardEvent(KEY_CODES.ESCAPE, harness.calls));
        t.deepEqual(harness.calls, [
            'val.get',
            'measurement.reset',
            'ui.closeAllDialogs',
            'deselectAircraft'
        ]);
    }
});

ava('Escape retains selected callsign prefix after reset and dialog close', (t) => {
    const harness = buildHarness({ value: 'aal1 t l', callsign: 'aal1' });

    harness.interaction.keydown(keyboardEvent(KEY_CODES.ESCAPE, harness.calls));

    t.deepEqual(harness.calls, [
        'val.get',
        'measurement.reset',
        'ui.closeAllDialogs',
        ['val.set', 'aal1 ']
    ]);
});

ava('unhandled keys focus command input after its single value read', (t) => {
    const harness = buildHarness();

    harness.interaction.keydown(keyboardEvent('KeyA', harness.calls));

    t.deepEqual(harness.calls, ['val.get', 'focus']);
});

ava('keyup() preserves the ineffective legacy fallback and handles modern Control only', (t) => {
    const harness = buildHarness();

    harness.interaction.keyup({ originalEvent: { code: null, keyCode: LEGACY_KEY_CODES.CONTROL_LEFT } });
    harness.interaction.keyup({ originalEvent: { code: 'KeyA' } });
    harness.interaction.keyup({ originalEvent: { code: KEY_CODES.CONTROL_LEFT } });

    t.deepEqual(harness.calls, [
        'measurement.stop',
        ['eventBus.trigger', EVENT.MARK_SHALLOW_RENDER]
    ]);
});
