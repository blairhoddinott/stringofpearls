import ava from 'ava';
import CommandInteraction from '../../src/assets/scripts/client/input/CommandInteraction';
import {
    COMMAND_CONTEXT,
    PARSED_COMMAND_NAME
} from '../../src/assets/scripts/client/constants/inputConstants';
import { TRACKABLE_EVENT } from '../../src/assets/scripts/client/constants/trackableEvents';

ava('retains every exact command dependency identity', (t) => {
    const dependencies = {
        inputState: {},
        commandInput: {},
        aircraftController: {},
        scopeModel: {},
        clearStorageAndReload: {},
        uiController: {},
        gameController: {},
        eventTracker: {},
        airportController: {},
        CommandParserClass: class {},
        ScopeCommandModelClass: class {}
    };
    const interaction = new CommandInteraction(dependencies);

    for (const [name, dependency] of Object.entries(dependencies)) {
        t.is(interaction[`_${name}`], dependency);
    }
});

ava('process() routes aircraft commands, then deselects, and returns the exact response', (t) => {
    const calls = [];
    const response = {};
    const interaction = new CommandInteraction({});

    const result = interaction.process(COMMAND_CONTEXT.AIRCRAFT, {
        processAircraft: () => {
            calls.push('aircraft');

            return response;
        },
        processScope: () => { throw new Error('unexpected scope'); },
        deselect: () => calls.push('deselect')
    });

    t.is(result, response);
    t.deepEqual(calls, ['aircraft', 'deselect']);
});

ava('process() routes scope commands before deselecting', (t) => {
    const calls = [];
    const response = {};
    const interaction = new CommandInteraction({});

    const result = interaction.process(COMMAND_CONTEXT.SCOPE, {
        processAircraft: () => { throw new Error('unexpected aircraft'); },
        processScope: () => {
            calls.push('scope');

            return response;
        },
        deselect: () => calls.push('deselect')
    });

    t.is(result, response);
    t.deepEqual(calls, ['scope', 'deselect']);
});

ava('process() returns a new empty response and deselects for an unknown context', (t) => {
    const calls = [];
    const interaction = new CommandInteraction({});

    const result = interaction.process('unknown', {
        processAircraft: () => { throw new Error('unexpected aircraft'); },
        processScope: () => { throw new Error('unexpected scope'); },
        deselect: () => calls.push('deselect')
    });

    t.deepEqual(result, []);
    t.deepEqual(calls, ['deselect']);
});

ava('process() propagates handler errors before deselection', (t) => {
    const error = new Error('command failed');
    const interaction = new CommandInteraction({});

    const thrown = t.throws(() => interaction.process(COMMAND_CONTEXT.AIRCRAFT, {
        processAircraft: () => { throw error; },
        processScope: () => {},
        deselect: () => { throw new Error('unexpected deselect'); }
    }));

    t.is(thrown, error);
});

ava('processAircraft() logs before propagating the exact parser error', (t) => {
    const calls = [];
    const error = new Error('invalid command');
    class ThrowingParser {
        constructor(command) {
            calls.push(['construct', command]);
        }

        parse() {
            calls.push('parse');
            throw error;
        }
    }
    const interaction = new CommandInteraction({
        commandInput: { val: () => { calls.push('val'); return '  BaD Command  '; } },
        CommandParserClass: ThrowingParser,
        uiController: { ui_log: (...args) => calls.push(['log', ...args]) }
    });

    const thrown = t.throws(() => interaction.processAircraft({
        processSystem: () => { throw new Error('unexpected system'); },
        processTransmit: () => { throw new Error('unexpected transmit'); }
    }));

    t.is(thrown, error);
    t.deepEqual(calls, [
        'val',
        ['construct', 'bad command'],
        'parse',
        ['log', 'Command not understood', true]
    ]);
});

ava('processAircraft() returns system delegation without changing history', (t) => {
    const calls = [];
    const parsedCommand = { command: PARSED_COMMAND_NAME.PAUSE };
    const response = {};
    const inputState = { callsign: 'AAL1', history: ['OLD'], history_item: 2 };
    class Parser {
        constructor(command) {
            calls.push(['construct', command]);
        }

        parse() {
            calls.push('parse');
            return parsedCommand;
        }
    }
    const interaction = new CommandInteraction({
        inputState,
        commandInput: { val: () => ' PaUsE ' },
        CommandParserClass: Parser,
        uiController: {}
    });

    const result = interaction.processAircraft({
        processSystem: (command) => { calls.push(['system', command]); return response; },
        processTransmit: () => { throw new Error('unexpected transmit'); }
    });

    t.is(result, response);
    t.deepEqual(inputState, { callsign: 'AAL1', history: ['OLD'], history_item: 2 });
    t.deepEqual(calls, [
        ['construct', 'pause'],
        'parse',
        ['system', parsedCommand]
    ]);
});

ava('processAircraft() updates transmit history before returning dispatch result', (t) => {
    const calls = [];
    const parsedCommand = { command: PARSED_COMMAND_NAME.TRANSMIT };
    const response = {};
    const inputState = { callsign: 'AAL1', history: ['OLD'], history_item: 2 };
    class Parser {
        parse() {
            return parsedCommand;
        }
    }
    const interaction = new CommandInteraction({
        inputState,
        commandInput: { val: () => 'aal1 fh 180' },
        CommandParserClass: Parser,
        uiController: {}
    });

    const result = interaction.processAircraft({
        processSystem: () => { throw new Error('unexpected system'); },
        processTransmit: (command) => {
            calls.push(['transmit', command, [...inputState.history], inputState.history_item]);
            return response;
        }
    });

    t.is(result, response);
    t.deepEqual(calls, [
        ['transmit', parsedCommand, ['AAL1', 'OLD'], null]
    ]);
});

ava('processScope() logs before propagating the exact model-construction error', (t) => {
    const calls = [];
    const error = new Error('bad syntax');
    class ThrowingScopeCommandModel {
        constructor(command) {
            calls.push(['construct', command]);
            throw error;
        }
    }
    const interaction = new CommandInteraction({
        commandInput: { val: () => { calls.push('val'); return '  Ho 167 19  '; } },
        ScopeCommandModelClass: ThrowingScopeCommandModel,
        scopeModel: { runScopeCommand: () => { throw new Error('unexpected run'); } },
        uiController: { ui_log: (...args) => calls.push(['log', ...args]) }
    });

    const thrown = t.throws(() => interaction.processScope());

    t.is(thrown, error);
    t.deepEqual(calls, [
        'val',
        ['construct', 'ho 167 19'],
        ['log', 'ERROR: BAD SYNTAX', true]
    ]);
});

for (const [successful, expectedWarning] of [[true, false], [false, true]]) {
    ava(`processScope() runs the exact model and logs response with warning=${expectedWarning}`, (t) => {
        const calls = [];
        const response = {};
        let scopeCommandModel;
        class ScopeCommandModel {
            constructor(command) {
                calls.push(['construct', command]);
                scopeCommandModel = this;
            }
        }
        const interaction = new CommandInteraction({
            commandInput: { val: () => '  AC 167  ' },
            ScopeCommandModelClass: ScopeCommandModel,
            scopeModel: {
                runScopeCommand: (model) => {
                    calls.push(['run', model]);
                    return [successful, response];
                }
            },
            uiController: { ui_log: (...args) => calls.push(['log', ...args]) }
        });

        const result = interaction.processScope();

        t.is(result, undefined);
        t.deepEqual(calls, [
            ['construct', 'ac 167'],
            ['run', scopeCommandModel],
            ['log', response, expectedWarning]
        ]);
    });
}

ava('processSystem() toggles the tutorial and returns true', (t) => {
    const calls = [];
    const interaction = new CommandInteraction({
        uiController: { onToggleTutorial: () => calls.push('tutorial') }
    });

    const result = interaction.processSystem({ command: PARSED_COMMAND_NAME.TUTORIAL });

    t.true(result);
    t.deepEqual(calls, ['tutorial']);
});

ava('processSystem() toggles pause and returns true', (t) => {
    const calls = [];
    const interaction = new CommandInteraction({
        gameController: { game_pause_toggle: () => calls.push('pause') }
    });

    const result = interaction.processSystem({ command: PARSED_COMMAND_NAME.PAUSE });

    t.true(result);
    t.deepEqual(calls, ['pause']);
});

for (const command of [PARSED_COMMAND_NAME.AUTO, 'unknown']) {
    ava(`processSystem() returns true without dependency reads for ${command}`, (t) => {
        const interaction = new CommandInteraction({});

        t.true(interaction.processSystem({ command }));
    });
}

for (const [args, expectedValue] of [[undefined, 0], [[5], 5]]) {
    ava(`processSystem() applies and records timewarp ${expectedValue}`, (t) => {
        const calls = [];
        const interaction = new CommandInteraction({
            gameController: { updateTimescale: (value) => calls.push(['timescale', value]) },
            eventTracker: { recordEvent: (...values) => calls.push(['event', ...values]) }
        });

        const result = interaction.processSystem({ command: PARSED_COMMAND_NAME.TIMEWARP, args });

        t.true(result);
        t.deepEqual(calls, [
            ['timescale', expectedValue],
            ['event', TRACKABLE_EVENT.OPTIONS, 'timewarp-maunal-entry', `${expectedValue}`]
        ]);
    });
}

ava('processSystem() executes configured clear/reload and returns undefined', (t) => {
    const calls = [];
    const interaction = new CommandInteraction({
        clearStorageAndReload: { execute: () => { calls.push('clear'); return 'ignored'; } }
    });

    const result = interaction.processSystem({ command: PARSED_COMMAND_NAME.CLEAR });

    t.is(result, undefined);
    t.deepEqual(calls, ['clear']);
});

ava('processSystem() treats omitted clear/reload as an undefined no-op', (t) => {
    const interaction = new CommandInteraction({ clearStorageAndReload: null });

    t.is(interaction.processSystem({ command: PARSED_COMMAND_NAME.CLEAR }), undefined);
});

for (const [hasAirport, expectedCalls] of [
    [true, [['set', 'kpdx']]],
    [false, []]
]) {
    ava(`processSystem() gates airport selection when exists=${hasAirport}`, (t) => {
        const calls = [];
        const interaction = new CommandInteraction({
            airportController: {
                airports: hasAirport ? { kpdx: {} } : {},
                airport_set: (icao) => calls.push(['set', icao])
            }
        });

        const result = interaction.processSystem({
            command: PARSED_COMMAND_NAME.AIRPORT,
            args: ['kpdx']
        });

        t.true(result);
        t.deepEqual(calls, expectedCalls);
    });
}

for (const [cycle, expectedMessage] of [
    [null, 'KPDX AIRAC cycle: unknown'],
    ['2609', 'KPDX AIRAC cycle: 2609']
]) {
    ava(`processSystem() reports AIRAC cycle ${cycle}`, (t) => {
        const calls = [];
        const interaction = new CommandInteraction({
            airportController: {
                current: {
                    get icao() {
                        calls.push('icao');
                        return 'kpdx';
                    }
                },
                getAiracCycle: () => {
                    calls.push('cycle');
                    return cycle;
                }
            },
            uiController: { ui_log: (...args) => calls.push(['log', ...args]) }
        });

        const result = interaction.processSystem({ command: PARSED_COMMAND_NAME.AIRAC });

        t.true(result);
        t.deepEqual(calls, [
            'icao',
            'cycle',
            ['log', expectedMessage]
        ]);
    });
}

ava('processSystem() logs the deprecated RATE warning and returns true', (t) => {
    const calls = [];
    const interaction = new CommandInteraction({
        uiController: { ui_log: (...args) => calls.push(args) }
    });

    const result = interaction.processSystem({ command: PARSED_COMMAND_NAME.RATE });

    t.true(result);
    t.deepEqual(calls, [['this command has been deprecated', true]]);
});

ava('processTransmit() scans every aircraft and warns on multiple matches', (t) => {
    const calls = [];
    const aircraftList = [true, false, true].map((matches, index) => ({
        matchCallsign: (callsign) => { calls.push(['match', index, callsign]); return matches; }
    }));
    const interaction = new CommandInteraction({
        aircraftController: {
            aircraft: { list: aircraftList },
            aircraftCommander: { runCommands: () => { throw new Error('unexpected command'); } }
        },
        uiController: { ui_log: (...args) => calls.push(['log', ...args]) }
    });

    const result = interaction.processTransmit({ callsign: 'aal', args: [] });

    t.true(result);
    t.deepEqual(calls, [
        ['match', 0, 'aal'],
        ['match', 1, 'aal'],
        ['match', 2, 'aal'],
        ['log', 'multiple aircraft match the callsign, say again', true]
    ]);
});

ava('processTransmit() warns when no aircraft matches', (t) => {
    const calls = [];
    const interaction = new CommandInteraction({
        aircraftController: {
            aircraft: { list: [{ matchCallsign: (callsign) => { calls.push(['match', callsign]); return false; } }] },
            aircraftCommander: { runCommands: () => { throw new Error('unexpected command'); } }
        },
        uiController: { ui_log: (...args) => calls.push(['log', ...args]) }
    });

    const result = interaction.processTransmit({ callsign: 'missing', args: [] });

    t.true(result);
    t.deepEqual(calls, [
        ['match', 'missing'],
        ['log', 'no such aircraft, say again', true]
    ]);
});

ava('processTransmit() returns the exact commander result for the unique match', (t) => {
    const calls = [];
    const aircraft = { matchCallsign: () => true };
    const args = [{}];
    const response = {};
    const interaction = new CommandInteraction({
        aircraftController: {
            aircraft: { list: [aircraft] },
            aircraftCommander: {
                runCommands: (matchedAircraft, matchedArgs) => {
                    calls.push(['run', matchedAircraft, matchedArgs]);
                    return response;
                }
            }
        },
        uiController: {}
    });

    const result = interaction.processTransmit({ callsign: 'aal1', args });

    t.is(result, response);
    t.deepEqual(calls, [['run', aircraft, args]]);
});
