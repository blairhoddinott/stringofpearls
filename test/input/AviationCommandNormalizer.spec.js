import ava from 'ava';

import { normalize, NORMALIZER_STATUS } from '../../src/assets/scripts/client/input/AviationCommandNormalizer';
import CommandParser from '../../src/assets/scripts/client/commands/parsers/CommandParser';
import { PARSED_COMMAND_NAME } from '../../src/assets/scripts/client/constants/inputConstants';

// A production-shaped context: `activeAircraft` entries carry the compact
// `commandCallsign` the parser consumes, plus the spoken `airlineCallsign` and
// `flightNumber` used to match radio phraseology. `fixes`/`runways` are the
// known identifiers we match against exactly (never fuzzily).
const CONTEXT_MOCK = {
    activeAircraft: [
        { commandCallsign: 'AAL1234', airlineCallsign: 'American', flightNumber: '1234' },
        { commandCallsign: 'ACA420', airlineCallsign: 'Air Canada', flightNumber: '420' }
    ],
    fixes: ['BOACH', 'DUMBA'],
    runways: ['16L', '07R']
};

// Convenience: parse an accepted result's `commandText` through the real
// CommandParser and return the ParsedCommand.
const parseCommandText = (commandText) => new CommandParser(commandText).parse();

// -------------------------------------------------------------------------- //
// happy-path phraseology
// -------------------------------------------------------------------------- //

ava('normalizes a turn heading command to compact parser text', (t) => {
    const result = normalize('American twelve thirty four turn left heading two seven zero', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 h left 270');
});

ava('zero-pads sub-100 headings to an absolute three-digit course', (t) => {
    const result = normalize('American twelve thirty four turn right heading ninety', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 h right 090');
});

ava('normalizes climb and maintain flight level', (t) => {
    const result = normalize('American twelve thirty four climb and maintain flight level two four zero', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 c 240');
});

ava('normalizes descend and maintain an altitude in thousands of feet', (t) => {
    const result = normalize('American twelve thirty four descend and maintain five thousand', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 d 50');
});

ava('normalizes reduce speed', (t) => {
    const result = normalize('American twelve thirty four reduce speed two one zero', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 sp 210');
});

ava('normalizes maintain speed using a grouped number', (t) => {
    const result = normalize('American twelve thirty four maintain speed two fifty', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 sp 250');
});

ava('normalizes proceed direct to a known fix, preserving its identifier exactly', (t) => {
    const result = normalize('American twelve thirty four proceed direct to boach', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 dct BOACH');
});

ava('normalizes direct without proceed or the filler "to"', (t) => {
    const result = normalize('American twelve thirty four direct dumba', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 dct DUMBA');
});

ava('normalizes cleared ILS runway, preserving the runway identifier exactly', (t) => {
    const result = normalize('American twelve thirty four cleared ils runway one six left approach', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 i 16L');
});

ava('normalizes contact tower and contact center', (t) => {
    const tower = normalize('American twelve thirty four contact tower', CONTEXT_MOCK);
    const center = normalize('American twelve thirty four contact center', CONTEXT_MOCK);

    t.is(tower.commandText, 'AAL1234 ct');
    t.is(center.commandText, 'AAL1234 cc');
});

// -------------------------------------------------------------------------- //
// callsign matching + number grammar
// -------------------------------------------------------------------------- //

ava('matches a multi-word airline callsign with a grouped flight number', (t) => {
    const result = normalize('Air Canada four twenty turn left heading three six zero', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'ACA420 h left 360');
});

ava('treats digit-by-digit and grouped flight numbers as equivalent', (t) => {
    const grouped = normalize('American twelve thirty four contact tower', CONTEXT_MOCK);
    const digitByDigit = normalize('American one two three four contact tower', CONTEXT_MOCK);

    t.is(grouped.commandText, digitByDigit.commandText);
    t.is(digitByDigit.commandText, 'AAL1234 ct');
});

ava('accepts aviation digit variants in numeric positions', (t) => {
    const result = normalize('American wun to tree fower reduce speed two fife zero', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 sp 250');
});

// -------------------------------------------------------------------------- //
// chained commands
// -------------------------------------------------------------------------- //

ava('normalizes a chain of commands in one transmission', (t) => {
    const result = normalize(
        'American twelve thirty four turn left heading two seven zero descend and maintain flight level two four zero reduce speed two one zero',
        CONTEXT_MOCK
    );

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 h left 270 d 240 sp 210');
});

ava('rejects the entire chain when any single command is unrecognized', (t) => {
    const result = normalize(
        'American twelve thirty four turn left heading two seven zero do a barrel roll',
        CONTEXT_MOCK
    );

    t.is(result.status, NORMALIZER_STATUS.INVALID);
    t.is(result.commandText, undefined);
});

// -------------------------------------------------------------------------- //
// vertical seam: accepted commandText must parse to expected semantics
// -------------------------------------------------------------------------- //

ava('accepted heading text parses to the expected CommandParser semantics', (t) => {
    const result = normalize('American twelve thirty four turn left heading two seven zero', CONTEXT_MOCK);
    const parsed = parseCommandText(result.commandText);

    t.is(parsed.command, PARSED_COMMAND_NAME.TRANSMIT);
    t.is(parsed.callsign, 'aal1234');
    t.is(parsed.commandList.length, 1);
    t.deepEqual(parsed.commandList[0].nameAndArgs, ['heading', 'left', 270, false]);
});

ava('accepted chained text parses to the expected CommandParser semantics', (t) => {
    const result = normalize(
        'American twelve thirty four descend and maintain flight level two four zero reduce speed two one zero',
        CONTEXT_MOCK
    );
    const parsed = parseCommandText(result.commandText);

    t.is(parsed.command, PARSED_COMMAND_NAME.TRANSMIT);
    t.is(parsed.callsign, 'aal1234');
    t.deepEqual(parsed.commandList[0].nameAndArgs, ['altitude', 24000, false]);
    t.deepEqual(parsed.commandList[1].nameAndArgs, ['speed', 210]);
});

ava('accepted ILS text parses to the expected CommandParser semantics', (t) => {
    const result = normalize('American twelve thirty four cleared ils runway one six left', CONTEXT_MOCK);
    const parsed = parseCommandText(result.commandText);

    t.deepEqual(parsed.commandList[0].nameAndArgs, ['ils', null, '16l']);
});

ava('accepted direct text parses to the expected CommandParser semantics', (t) => {
    const result = normalize('American twelve thirty four direct boach', CONTEXT_MOCK);
    const parsed = parseCommandText(result.commandText);

    t.deepEqual(parsed.commandList[0].nameAndArgs, ['direct', 'boach']);
});

// -------------------------------------------------------------------------- //
// adversarial: safety-critical rejections
// -------------------------------------------------------------------------- //

ava('rejects non-string transcripts', (t) => {
    [null, undefined, 42, {}, ['American'], NaN].forEach((value) => {
        const result = normalize(value, CONTEXT_MOCK);

        t.is(result.status, NORMALIZER_STATUS.INVALID);
        t.is(result.commandText, undefined);
    });
});

ava('rejects an empty or whitespace-only transcript', (t) => {
    t.is(normalize('', CONTEXT_MOCK).status, NORMALIZER_STATUS.INVALID);
    t.is(normalize('   ', CONTEXT_MOCK).status, NORMALIZER_STATUS.INVALID);
});

ava('rejects an unknown callsign without guessing', (t) => {
    const result = normalize('United five fifty contact tower', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.INVALID);
    t.is(result.commandText, undefined);
});

ava('rejects a matched airline with the wrong flight number', (t) => {
    const result = normalize('American nine nine nine contact tower', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.INVALID);
    t.is(result.commandText, undefined);
});

ava('reports ambiguous when more than one active aircraft matches', (t) => {
    const ambiguousContext = {
        ...CONTEXT_MOCK,
        activeAircraft: [
            { commandCallsign: 'AAL1234', airlineCallsign: 'American', flightNumber: '1234' },
            { commandCallsign: 'AAL1234H', airlineCallsign: 'American', flightNumber: '1234' }
        ]
    };
    const result = normalize('American twelve thirty four contact tower', ambiguousContext);

    t.is(result.status, NORMALIZER_STATUS.AMBIGUOUS);
    t.is(result.commandText, undefined);
});

ava('rejects an unknown fix without fuzzy matching', (t) => {
    const result = normalize('American twelve thirty four direct zzzzz', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.INVALID);
    t.is(result.commandText, undefined);
});

ava('rejects an unknown runway without fuzzy matching', (t) => {
    const result = normalize('American twelve thirty four cleared ils runway two seven left', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.INVALID);
    t.is(result.commandText, undefined);
});

ava('rejects an out-of-range heading', (t) => {
    const overRange = normalize('American twelve thirty four turn left heading three seven zero', CONTEXT_MOCK);
    const zeroHeading = normalize('American twelve thirty four turn left heading zero', CONTEXT_MOCK);

    t.is(overRange.status, NORMALIZER_STATUS.INVALID);
    t.is(zeroHeading.status, NORMALIZER_STATUS.INVALID);
});

ava('rejects trailing / unsupported text after an otherwise valid command', (t) => {
    const result = normalize('American twelve thirty four turn left heading two seven zero banana', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.INVALID);
    t.is(result.commandText, undefined);
});

ava('does not rewrite homophones outside numeric grammar positions', (t) => {
    // "for" is the spoken digit 4, but in a fix position it must be treated as a
    // literal (unknown) identifier, never rewritten to a number nor skipped.
    const result = normalize('American twelve thirty four direct for', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.INVALID);
    t.is(result.commandText, undefined);
});

ava('rejects a transcript that contains no supported command', (t) => {
    const result = normalize('American twelve thirty four good morning', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.INVALID);
    t.is(result.commandText, undefined);
});

ava('rejects a command with no leading callsign', (t) => {
    const result = normalize('turn left heading two seven zero', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.INVALID);
    t.is(result.commandText, undefined);
});

ava('normalizes numeric formatting emitted by speech recognizers', (t) => {
    const commaFormatted = normalize(
        'American 1234 descend and maintain 5,000 reduce speed 210',
        CONTEXT_MOCK
    );
    const hyphenFormatted = normalize(
        'Air Canada 452 climb and maintain 1-2000',
        {
            ...CONTEXT_MOCK,
            activeAircraft: [
                ...CONTEXT_MOCK.activeAircraft,
                { commandCallsign: 'ACA452', airlineCallsign: 'Air Canada', flightNumber: '452' }
            ]
        }
    );

    t.is(commaFormatted.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(commaFormatted.commandText, 'AAL1234 d 50 sp 210');
    t.is(hyphenFormatted.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(hyphenFormatted.commandText, 'ACA452 c 120');
});

ava('normalizes separately transcribed I L S initials', (t) => {
    const result = normalize('American 1234 cleared I L S runway zero seven right', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 i 07R');
});

ava('does not erase a leading zero when matching flight numbers', (t) => {
    const context = {
        ...CONTEXT_MOCK,
        activeAircraft: [
            { commandCallsign: 'AAL0123', airlineCallsign: 'American', flightNumber: '0123' }
        ]
    };
    const result = normalize('American one two three contact tower', context);

    t.is(result.status, NORMALIZER_STATUS.INVALID);
    t.is(result.commandText, undefined);
});

ava('rejects malformed context instead of throwing or emitting undefined callsigns', (t) => {
    const malformedCollection = normalize('American 1234 contact tower', { activeAircraft: {} });
    const incompleteAircraft = normalize('American 1234 contact tower', {
        activeAircraft: [{ airlineCallsign: 'American', flightNumber: '1234' }]
    });

    t.is(malformedCollection.status, NORMALIZER_STATUS.INVALID);
    t.is(incompleteAircraft.status, NORMALIZER_STATUS.INVALID);
    t.is(incompleteAircraft.commandText, undefined);
});

ava('normalizes punctuation and mixed case without altering identifiers', (t) => {
    const result = normalize('American, TWELVE thirty-four; turn LEFT heading two-seven-zero.', CONTEXT_MOCK);

    t.is(result.status, NORMALIZER_STATUS.ACCEPTED);
    t.is(result.commandText, 'AAL1234 h left 270');
});
