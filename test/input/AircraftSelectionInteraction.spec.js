import ava from 'ava';
import AircraftSelectionInteraction from '../../src/assets/scripts/client/input/AircraftSelectionInteraction';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';

ava('retains exact input state, command input, event bus, aircraft owner, and legacy provider identities', (t) => {
    const inputState = {};
    const commandInput = {};
    const eventBus = {};
    const aircraftController = {};
    const legacyInputProvider = () => {};
    const interaction = new AircraftSelectionInteraction(
        inputState,
        commandInput,
        eventBus,
        aircraftController,
        legacyInputProvider
    );

    t.is(interaction._inputState, inputState);
    t.is(interaction._commandInput, commandInput);
    t.is(interaction._eventBus, eventBus);
    t.is(interaction._aircraftController, aircraftController);
    t.is(interaction._legacyInputProvider, legacyInputProvider);
});

ava('deselect() clears legacy and current state before command input and event publication', (t) => {
    const calls = [];
    const legacyInput = {};
    const inputState = { callsign: 'AAL1' };
    const interaction = new AircraftSelectionInteraction(
        inputState,
        { val: (value) => calls.push(['val', value, inputState.callsign, legacyInput.callsign]) },
        { trigger: (...args) => calls.push(['trigger', ...args, inputState.callsign, legacyInput.callsign]) },
        {},
        () => {
            calls.push('legacyProvider');

            return legacyInput;
        }
    );

    t.is(interaction.deselect(), undefined);
    t.deepEqual(calls, [
        'legacyProvider',
        ['val', '', '', ''],
        ['trigger', EVENT.DESELECT_AIRCRAFT, {}, '', '']
    ]);
});

ava('select() invokes the exact deselect callback for missing or uncontrollable aircraft', (t) => {
    const calls = [];
    const deselect = (...args) => calls.push(['deselect', ...args]);
    const interaction = new AircraftSelectionInteraction({}, {}, {}, {}, () => ({}));

    t.is(interaction.select(null, deselect), undefined);
    t.is(interaction.select({ isControllable: false }, deselect), undefined);
    t.deepEqual(calls, [
        ['deselect'],
        ['deselect']
    ]);
});

ava('select() allows an ownership-authorized aircraft outside the airspace', (t) => {
    const calls = [];
    const aircraft = { callsign: 'AAL1', isControllable: false };
    const interaction = new AircraftSelectionInteraction(
        {},
        { val: (value) => calls.push(['val', value]), is: () => true },
        { trigger: (...args) => calls.push(['trigger', ...args]) },
        {},
        () => ({}),
        (candidate) => {
            calls.push(['canSelect', candidate]);

            return true;
        }
    );

    interaction.select(aircraft, () => calls.push(['deselect']));

    t.deepEqual(calls, [
        ['canSelect', aircraft],
        ['val', 'AAL1 '],
        ['trigger', EVENT.SELECT_AIRCRAFT, aircraft]
    ]);
});

ava('select() writes state, command value, focus, then publishes the exact aircraft', (t) => {
    const calls = [];
    const legacyInput = {};
    const inputState = {};
    const aircraft = { callsign: 'AAL1', isControllable: true };
    const commandInput = {
        val: (value) => calls.push(['val', value, inputState.callsign, legacyInput.callsign]),
        is: (selector) => {
            calls.push(['is', selector]);

            return false;
        },
        focus: () => calls.push('focus')
    };
    const interaction = new AircraftSelectionInteraction(
        inputState,
        commandInput,
        { trigger: (...args) => calls.push(['trigger', ...args]) },
        {},
        () => {
            calls.push('legacyProvider');

            return legacyInput;
        }
    );

    t.is(interaction.select(aircraft, () => calls.push('unexpected deselect')), undefined);
    t.deepEqual(calls, [
        'legacyProvider',
        ['val', 'AAL1 ', 'AAL1', 'AAL1'],
        ['is', ':focus'],
        'focus',
        ['trigger', EVENT.SELECT_AIRCRAFT, aircraft]
    ]);
});

ava('select() skips focus when command input is already focused', (t) => {
    let focused = false;
    const interaction = new AircraftSelectionInteraction(
        {},
        { val: () => {}, is: () => true, focus: () => { focused = true; } },
        { trigger: () => {} },
        {},
        () => ({})
    );

    interaction.select({ callsign: 'AAL1', isControllable: true }, () => {});
    t.false(focused);
});

ava('selectByCallsign() resolves once then invokes the exact select callback', (t) => {
    const calls = [];
    const aircraft = {};
    const interaction = new AircraftSelectionInteraction(
        {},
        {},
        {},
        {
            findAircraftByCallsign: (callsign) => {
                calls.push(['find', callsign]);

                return aircraft;
            }
        },
        () => ({})
    );
    const select = (...args) => calls.push(['select', ...args]);

    t.is(interaction.selectByCallsign('AAL1', select), undefined);
    t.deepEqual(calls, [
        ['find', 'AAL1'],
        ['select', aircraft]
    ]);
});

ava('selectPrevious() short-circuits empty history before command or aircraft reads', (t) => {
    const interaction = new AircraftSelectionInteraction(
        { history: [], history_item: null },
        { val: () => { throw new Error('unexpected command read'); } },
        {},
        { findAircraftByCallsign: () => { throw new Error('unexpected aircraft read'); } },
        () => ({})
    );

    t.is(interaction.selectPrevious(() => {}), undefined);
});

ava('selectPrevious() inserts the current command, advances, clamps, resolves, then selects', (t) => {
    const calls = [];
    const aircraft = {};
    const inputState = { history: ['AAL1', 'DAL2'], history_item: null };
    const interaction = new AircraftSelectionInteraction(
        inputState,
        {
            val: () => {
                calls.push('val');

                return 'typed command';
            }
        },
        {},
        {
            findAircraftByCallsign: (callsign) => {
                calls.push(['find', callsign, inputState.history_item, [...inputState.history]]);

                return aircraft;
            }
        },
        () => ({})
    );
    const select = (...args) => calls.push(['select', ...args]);

    interaction.selectPrevious(select);

    t.deepEqual(calls, [
        'val',
        ['find', 'AAL1', 1, ['typed command', 'AAL1', 'DAL2']],
        ['select', aircraft]
    ]);
});

ava('selectPrevious() clamps an existing history index at the last entry', (t) => {
    const calls = [];
    const aircraft = {};
    const inputState = { history: ['AAL1', 'DAL2'], history_item: 1 };
    const interaction = new AircraftSelectionInteraction(
        inputState,
        {},
        {},
        { findAircraftByCallsign: (callsign) => {
            calls.push(['find', callsign]);

            return aircraft;
        } },
        () => ({})
    );

    interaction.selectPrevious((value) => calls.push(['select', value]));

    t.is(inputState.history_item, 1);
    t.deepEqual(calls, [
        ['find', 'DAL2'],
        ['select', aircraft]
    ]);
});

ava('selectNext() short-circuits empty history and zero or null history indexes', (t) => {
    for (const inputState of [
        { history: [], history_item: 2 },
        { history: ['AAL1'], history_item: 0 },
        { history: ['AAL1'], history_item: null }
    ]) {
        const interaction = new AircraftSelectionInteraction(
            inputState,
            { val: () => { throw new Error('unexpected command write'); } },
            {},
            { findAircraftByCallsign: () => { throw new Error('unexpected aircraft read'); } },
            () => ({})
        );

        t.is(interaction.selectNext(() => {}), undefined);
    }
});

ava('selectNext() restores and removes the temporary command at index one without selecting', (t) => {
    const calls = [];
    const inputState = { history: ['typed command', 'AAL1'], history_item: 1 };
    const interaction = new AircraftSelectionInteraction(
        inputState,
        { val: (value) => calls.push(['val', value, inputState.history_item, [...inputState.history]]) },
        {},
        { findAircraftByCallsign: () => { throw new Error('unexpected aircraft read'); } },
        () => ({})
    );

    t.is(interaction.selectNext(() => { throw new Error('unexpected select'); }), undefined);
    t.deepEqual(calls, [
        ['val', 'typed command', 0, ['typed command', 'AAL1']]
    ]);
    t.deepEqual(inputState.history, ['AAL1']);
    t.is(inputState.history_item, null);
});

ava('selectNext() decrements, clamps, resolves, and selects remaining history', (t) => {
    const calls = [];
    const aircraft = {};
    const inputState = { history: ['typed command', 'AAL1', 'DAL2'], history_item: 2 };
    const interaction = new AircraftSelectionInteraction(
        inputState,
        {},
        {},
        { findAircraftByCallsign: (callsign) => {
            calls.push(['find', callsign, inputState.history_item]);

            return aircraft;
        } },
        () => ({})
    );

    interaction.selectNext((value) => calls.push(['select', value]));

    t.deepEqual(calls, [
        ['find', 'AAL1', 1],
        ['select', aircraft]
    ]);
});
