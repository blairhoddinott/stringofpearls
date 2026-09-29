/**
 * Deterministic aviation speech-to-command normalizer.
 *
 * Translates a plain-language radio transcript (already produced by some
 * speech-to-text layer) into the compact, callsign-first command text that the
 * authoritative `CommandParser` consumes, e.g.
 *
 * - `American twelve thirty four turn left heading two seven zero`
 *   => `AAL1234 h left 270`
 *
 * The module is intentionally conservative: it performs *exact* matching
 * against the supplied context (active aircraft, known fixes, known runways)
 * and never guesses. It is a pure translation + validation layer and has no
 * dependency on the parser itself; the parser remains the single source of
 * truth for command *semantics*, while this module owns *phraseology*. Any
 * transcript it cannot fully and unambiguously translate yields a structured
 * failure and never a partial command.
 *
 * Aviation spoken-digit forms (zero/oh, wun, tree, fife, niner, ...) and
 * grouped flight-number forms (`twelve thirty four` = 1234, `four twenty` =
 * 420) are understood, but only in numeric grammar positions. Homophones are
 * never rewritten globally: `to` means the digit 2 inside a flight number, but
 * the filler word `to` in `direct to BOACH`.
 *
 * @fileoverview
 */

/**
 * Result statuses returned from {@link normalize}.
 *
 * @property NORMALIZER_STATUS
 * @type {object}
 * @final
 */
export const NORMALIZER_STATUS = {
    ACCEPTED: 'accepted',
    AMBIGUOUS: 'ambiguous',
    INVALID: 'invalid'
};

/**
 * Single-digit spoken forms, including aviation variants.
 *
 * Only consulted in numeric grammar positions.
 *
 * @property DIGIT_WORDS
 * @type {object}
 * @final
 */
const DIGIT_WORDS = {
    zero: 0, oh: 0,
    one: 1, wun: 1,
    two: 2, to: 2,
    three: 3, tree: 3,
    four: 4, fower: 4, for: 4,
    five: 5, fife: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9, niner: 9
};

/**
 * Teen spoken forms (fixed two-digit values).
 *
 * @property TEEN_WORDS
 * @type {object}
 * @final
 */
const TEEN_WORDS = {
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19
};

/**
 * Tens spoken forms.
 *
 * @property TENS_WORDS
 * @type {object}
 * @final
 */
const TENS_WORDS = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

/**
 * Runway side words mapped to their identifier suffix.
 *
 * @property RUNWAY_SIDE_WORDS
 * @type {object}
 * @final
 */
const RUNWAY_SIDE_WORDS = {
    left: 'L',
    right: 'R',
    center: 'C',
    centre: 'C'
};

/**
 * Tokens that begin a supported command. Everything before the first of these
 * is treated as the radio callsign portion of the transcript.
 *
 * @property COMMAND_KEYWORDS
 * @type {array<string>}
 * @final
 */
const COMMAND_KEYWORDS = [
    'turn', 'climb', 'descend', 'reduce', 'maintain', 'proceed', 'direct', 'cleared', 'contact'
];

/**
 * Build an `invalid` result.
 *
 * @function invalid
 * @param reason {string}
 * @return {object}
 * @private
 */
const invalid = (reason) => ({ status: NORMALIZER_STATUS.INVALID, reason });

/**
 * Build an `ambiguous` result.
 *
 * @function ambiguous
 * @param reason {string}
 * @return {object}
 * @private
 */
const ambiguous = (reason) => ({ status: NORMALIZER_STATUS.AMBIGUOUS, reason });

/**
 * Normalize punctuation and case, returning a whitespace-delimited token list.
 *
 * Case is lowered and any non-alphanumeric character becomes a separator; we
 * never rewrite words here, only clean punctuation.
 *
 * @function tokenize
 * @param transcript {string}
 * @return {array<string>}
 * @private
 */
const tokenize = (transcript) => transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);

/**
 * Return true when `token` is a word (or literal integer) usable in a numeric
 * grammar position.
 *
 * @function isNumericToken
 * @param token {string}
 * @return {boolean}
 * @private
 */
const isNumericToken = (token) => typeof token === 'string' && (
    /^[0-9]+$/.test(token) ||
    token in DIGIT_WORDS ||
    token in TEEN_WORDS ||
    token in TENS_WORDS
);

/**
 * Parse a run of numeric tokens into a digit string, honouring grouped forms.
 *
 * Each token contributes a "chunk" that is concatenated left to right:
 * - a single digit contributes one character (`four` => `4`)
 * - a teen contributes its two digits (`twelve` => `12`)
 * - a tens word contributes two digits, optionally absorbing a following digit
 *   (`thirty` `four` => `34`, `fifty` => `50`)
 * - a literal integer token contributes verbatim (`270` => `270`)
 *
 * So `twelve thirty four` => `1234`, `four twenty` => `420`, `five fifty` =>
 * `550`, `eighty one` => `81`, and digit-by-digit `two seven zero` => `270`.
 *
 * @function parseNumericTokens
 * @param tokens {array<string>}
 * @return {string|null}  the digit string, or null when a token is not numeric
 * @private
 */
const parseNumericTokens = (tokens) => {
    if (tokens.length === 0) {
        return null;
    }

    const chunks = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (/^[0-9]+$/.test(token)) {
            chunks.push(token);
        } else if (token in TENS_WORDS) {
            const next = tokens[i + 1];

            if (typeof next !== 'undefined' && next in DIGIT_WORDS && DIGIT_WORDS[next] >= 1) {
                chunks.push(String(TENS_WORDS[token] + DIGIT_WORDS[next]));
                i += 1;
            } else {
                chunks.push(String(TENS_WORDS[token]));
            }
        } else if (token in TEEN_WORDS) {
            chunks.push(String(TEEN_WORDS[token]));
        } else if (token in DIGIT_WORDS) {
            chunks.push(String(DIGIT_WORDS[token]));
        } else {
            return null;
        }
    }

    return chunks.join('');
};

/**
 * Consume a maximal run of numeric tokens starting at `index`.
 *
 * @function collectNumericRun
 * @param tokens {array<string>}
 * @param index {number}
 * @return {{ digits: string|null, nextIndex: number }}
 * @private
 */
const collectNumericRun = (tokens, index) => {
    let end = index;

    while (end < tokens.length && isNumericToken(tokens[end])) {
        end += 1;
    }

    return {
        digits: parseNumericTokens(tokens.slice(index, end)),
        nextIndex: end
    };
};

/**
 * Find the index of the first command keyword, i.e. where the callsign ends.
 *
 * @function findFirstCommandIndex
 * @param tokens {array<string>}
 * @return {number}  index, or -1 when no command keyword is present
 * @private
 */
const findFirstCommandIndex = (tokens) => tokens.findIndex((token) => COMMAND_KEYWORDS.indexOf(token) !== -1);

/**
 * Match the spoken callsign tokens against the active aircraft.
 *
 * An aircraft matches when the callsign tokens begin with its (space-split)
 * `airlineCallsign` and the remaining tokens parse to a flight number equal to
 * its `flightNumber`. Matching is exact; callsigns are never fuzzy-matched.
 *
 * @function matchAircraft
 * @param callsignTokens {array<string>}
 * @param activeAircraft {array<object>}
 * @return {array<object>}  every aircraft that matched
 * @private
 */
const matchAircraft = (callsignTokens, activeAircraft) => {
    return activeAircraft.filter((aircraft) => {
        if (
            aircraft === null ||
            typeof aircraft !== 'object' ||
            typeof aircraft.commandCallsign !== 'string' ||
            aircraft.commandCallsign.length === 0 ||
            typeof aircraft.airlineCallsign !== 'string' ||
            typeof aircraft.flightNumber !== 'string'
        ) {
            return false;
        }

        const airlineTokens = aircraft.airlineCallsign.toLowerCase().split(/\s+/).filter((t) => t);
        const startsWithAirline = airlineTokens.every((token, i) => callsignTokens[i] === token);

        if (!startsWithAirline || callsignTokens.length <= airlineTokens.length) {
            return false;
        }

        const flightDigits = parseNumericTokens(callsignTokens.slice(airlineTokens.length));

        if (flightDigits === null) {
            return false;
        }

        return flightDigits === aircraft.flightNumber;
    });
};

/**
 * Case-insensitively resolve `spoken` against a list of known identifiers,
 * returning the original identifier (preserved exactly) or null.
 *
 * @function resolveKnownIdentifier
 * @param spoken {string}
 * @param known {array<string>}
 * @return {string|null}
 * @private
 */
const resolveKnownIdentifier = (spoken, known) => {
    const match = known.find((identifier) => String(identifier).toLowerCase() === spoken.toLowerCase());

    return typeof match === 'undefined' ? null : match;
};

/**
 * A command failed to translate. Thrown internally and converted to a
 * structured `invalid` result by {@link normalize}.
 *
 * @class CommandTranslationError
 * @private
 */
class CommandTranslationError extends Error {
    constructor(reason) {
        super(reason);
        this.reason = reason;
    }
}

const fail = (reason) => {
    throw new CommandTranslationError(reason);
};

/**
 * Translate a `turn left|right heading <number>` phrase into `h left|right N`.
 *
 * The heading is emitted as an absolute three-digit course so the parser never
 * mistakes it for an incremental turn. Values must be a valid 001-360 course.
 *
 * @function translateHeading
 * @param tokens {array<string>}
 * @param index {number}  index of the `turn` keyword
 * @return {{ segment: string, nextIndex: number }}
 * @private
 */
const translateHeading = (tokens, index) => {
    const direction = tokens[index + 1];

    if (direction !== 'left' && direction !== 'right') {
        fail('Expected "left" or "right" after "turn"');
    }

    if (tokens[index + 2] !== 'heading') {
        fail('Expected "heading" in turn command');
    }

    const { digits, nextIndex } = collectNumericRun(tokens, index + 3);

    if (digits === null) {
        fail('Malformed heading value');
    }

    const course = parseInt(digits, 10);

    if (course < 1 || course > 360) {
        fail('Heading must be between 001 and 360');
    }

    return {
        segment: `h ${direction} ${String(course).padStart(3, '0')}`,
        nextIndex
    };
};

/**
 * Parse an altitude phrase into its flight-level form (hundreds of feet).
 *
 * Accepts `flight level <number>` (the number is the flight level directly) or
 * `<number> thousand` (feet, converted to flight-level form via x10).
 *
 * @function parseAltitudeArgument
 * @param tokens {array<string>}
 * @param index {number}  index of the first altitude token
 * @return {{ value: number, nextIndex: number }}
 * @private
 */
const parseAltitudeArgument = (tokens, index) => {
    if (tokens[index] === 'flight' && tokens[index + 1] === 'level') {
        const { digits, nextIndex } = collectNumericRun(tokens, index + 2);

        if (digits === null) {
            fail('Malformed flight level');
        }

        return { value: parseInt(digits, 10), nextIndex };
    }

    const { digits, nextIndex } = collectNumericRun(tokens, index);

    if (digits === null) {
        fail('Malformed altitude');
    }

    if (tokens[nextIndex] === 'thousand') {
        return { value: parseInt(digits, 10) * 10, nextIndex: nextIndex + 1 };
    }

    // Whisper commonly formats spoken altitudes as `5000`, `5,000`, or even
    // `1-2000`. Tokenization strips punctuation, and the numeric collector
    // rejoins those pieces. Accept an unambiguous feet value only when it is at
    // least 1,000 feet and exactly representable in the parser's hundreds-of-
    // feet format. Smaller bare numbers require the explicit `flight level`
    // phrase rather than guessing at the controller's intent.
    const feet = parseInt(digits, 10);

    if (feet < 1000 || feet % 100 !== 0) {
        fail('Malformed altitude');
    }

    return { value: feet / 100, nextIndex };
};

/**
 * Translate `climb|descend and maintain <altitude>` into `c|d N`.
 *
 * @function translateAltitude
 * @param tokens {array<string>}
 * @param index {number}  index of the `climb`/`descend` keyword
 * @return {{ segment: string, nextIndex: number }}
 * @private
 */
const translateAltitude = (tokens, index) => {
    const command = tokens[index] === 'climb' ? 'c' : 'd';

    if (tokens[index + 1] !== 'and' || tokens[index + 2] !== 'maintain') {
        fail(`Expected "and maintain" after "${tokens[index]}"`);
    }

    const { value, nextIndex } = parseAltitudeArgument(tokens, index + 3);

    if (value <= 0) {
        fail('Altitude must be positive');
    }

    return { segment: `${command} ${value}`, nextIndex };
};

/**
 * Translate `reduce|maintain speed <number>` into `sp N`.
 *
 * @function translateSpeed
 * @param tokens {array<string>}
 * @param index {number}  index of the `reduce`/`maintain` keyword
 * @return {{ segment: string, nextIndex: number }}
 * @private
 */
const translateSpeed = (tokens, index) => {
    if (tokens[index + 1] !== 'speed') {
        fail(`Expected "speed" after "${tokens[index]}"`);
    }

    const { digits, nextIndex } = collectNumericRun(tokens, index + 2);

    if (digits === null) {
        fail('Malformed speed value');
    }

    const speed = parseInt(digits, 10);

    if (speed <= 0) {
        fail('Speed must be positive');
    }

    return { segment: `sp ${speed}`, nextIndex };
};

/**
 * Translate `proceed direct [to] <fix>` / `direct [to] <fix>` into `dct FIX`.
 *
 * @function translateDirect
 * @param tokens {array<string>}
 * @param index {number}  index of the `proceed`/`direct` keyword
 * @param fixes {array<string>}
 * @return {{ segment: string, nextIndex: number }}
 * @private
 */
const translateDirect = (tokens, index, fixes) => {
    let cursor = index;

    if (tokens[cursor] === 'proceed') {
        if (tokens[cursor + 1] !== 'direct') {
            fail('Expected "direct" after "proceed"');
        }

        cursor += 1;
    }

    // consume the optional filler `to`; this is not a numeric position
    cursor = tokens[cursor + 1] === 'to' ? cursor + 2 : cursor + 1;

    const spokenFix = tokens[cursor];

    if (typeof spokenFix === 'undefined') {
        fail('Missing fix name');
    }

    const fix = resolveKnownIdentifier(spokenFix, fixes);

    if (fix === null) {
        fail(`Unknown fix "${spokenFix}"`);
    }

    return { segment: `dct ${fix}`, nextIndex: cursor + 1 };
};

/**
 * Translate `cleared ils runway <runway> [approach]` into `i RUNWAY`.
 *
 * @function translateIls
 * @param tokens {array<string>}
 * @param index {number}  index of the `cleared` keyword
 * @param runways {array<string>}
 * @return {{ segment: string, nextIndex: number }}
 * @private
 */
const translateIls = (tokens, index, runways) => {
    const compactIls = tokens[index + 1] === 'ils';
    const separatedIls = tokens[index + 1] === 'i' && tokens[index + 2] === 'l' && tokens[index + 3] === 's';
    const runwayIndex = compactIls ? index + 2 : index + 4;

    if ((!compactIls && !separatedIls) || tokens[runwayIndex] !== 'runway') {
        fail('Expected "ils runway" after "cleared"');
    }

    const { digits, nextIndex } = collectNumericRun(tokens, runwayIndex + 1);

    if (digits === null) {
        fail('Malformed runway');
    }

    let cursor = nextIndex;
    let spokenRunway = digits;

    if (typeof tokens[cursor] !== 'undefined' && tokens[cursor] in RUNWAY_SIDE_WORDS) {
        spokenRunway += RUNWAY_SIDE_WORDS[tokens[cursor]];
        cursor += 1;
    }

    // `approach` is an optional trailing courtesy word
    if (tokens[cursor] === 'approach') {
        cursor += 1;
    }

    const runway = resolveKnownIdentifier(spokenRunway, runways);

    if (runway === null) {
        fail(`Unknown runway "${spokenRunway}"`);
    }

    return { segment: `i ${runway}`, nextIndex: cursor };
};

/**
 * Translate `contact tower` / `contact center` into `ct` / `cc`.
 *
 * @function translateContact
 * @param tokens {array<string>}
 * @param index {number}  index of the `contact` keyword
 * @return {{ segment: string, nextIndex: number }}
 * @private
 */
const translateContact = (tokens, index) => {
    const facility = tokens[index + 1];

    if (facility === 'tower') {
        return { segment: 'ct', nextIndex: index + 2 };
    }

    if (facility === 'center' || facility === 'centre') {
        return { segment: 'cc', nextIndex: index + 2 };
    }

    fail('Expected "tower" or "center" after "contact"');
};

/**
 * Dispatch a single command starting at `index` to its translator.
 *
 * @function translateCommand
 * @param tokens {array<string>}
 * @param index {number}
 * @param context {object}
 * @return {{ segment: string, nextIndex: number }}
 * @private
 */
const translateCommand = (tokens, index, context) => {
    switch (tokens[index]) {
        case 'turn':
            return translateHeading(tokens, index);
        case 'climb':
        case 'descend':
            return translateAltitude(tokens, index);
        case 'reduce':
        case 'maintain':
            return translateSpeed(tokens, index);
        case 'proceed':
        case 'direct':
            return translateDirect(tokens, index, context.fixes || []);
        case 'cleared':
            return translateIls(tokens, index, context.runways || []);
        case 'contact':
            return translateContact(tokens, index);
        default:
            return fail(`Unsupported command "${tokens[index]}"`);
    }
};

/**
 * Translate the command portion (one or more chained commands) into compact
 * segments. Throws {@link CommandTranslationError} on any unrecognized or
 * trailing text so a partial command is never produced.
 *
 * @function translateCommandChain
 * @param tokens {array<string>}
 * @param context {object}
 * @return {array<string>}
 * @private
 */
const translateCommandChain = (tokens, context) => {
    const segments = [];
    let index = 0;

    while (index < tokens.length) {
        const { segment, nextIndex } = translateCommand(tokens, index, context);

        // a translator that fails to advance would loop forever; guard defensively
        if (nextIndex <= index) {
            fail('Unable to advance while parsing commands');
        }

        segments.push(segment);
        index = nextIndex;
    }

    return segments;
};

/**
 * Normalize a spoken aviation transcript into compact `CommandParser` text.
 *
 * @function normalize
 * @param transcript {string}  the plain-language radio transmission
 * @param context {object}  { activeAircraft, fixes, runways }
 * @return {object}  { status, commandText? , reason? }
 */
export const normalize = (transcript, context = {}) => {
    if (typeof transcript !== 'string') {
        return invalid('Transcript must be a string');
    }

    const tokens = tokenize(transcript);

    if (tokens.length === 0) {
        return invalid('Empty transcript');
    }

    if (context === null || typeof context !== 'object') {
        return invalid('Context must be an object');
    }

    if (!Array.isArray(context.activeAircraft)) {
        return invalid('Context activeAircraft must be an array');
    }

    if (
        (typeof context.fixes !== 'undefined' && !Array.isArray(context.fixes)) ||
        (typeof context.runways !== 'undefined' && !Array.isArray(context.runways))
    ) {
        return invalid('Context fixes and runways must be arrays');
    }

    const commandIndex = findFirstCommandIndex(tokens);

    if (commandIndex === -1) {
        return invalid('No supported command found');
    }

    if (commandIndex === 0) {
        return invalid('Missing callsign');
    }

    const callsignTokens = tokens.slice(0, commandIndex);
    const commandTokens = tokens.slice(commandIndex);
    const matches = matchAircraft(callsignTokens, context.activeAircraft);

    if (matches.length === 0) {
        return invalid('Unknown or unmatched callsign');
    }

    if (matches.length > 1) {
        return ambiguous('More than one active aircraft matches the callsign');
    }

    try {
        const segments = translateCommandChain(commandTokens, context);

        return {
            status: NORMALIZER_STATUS.ACCEPTED,
            commandText: `${matches[0].commandCallsign} ${segments.join(' ')}`
        };
    } catch (error) {
        if (error instanceof CommandTranslationError) {
            return invalid(error.reason);
        }

        // istanbul ignore next
        throw error;
    }
};
