import $ from 'jquery';
import EventTracker from './EventTracker';
import { radio_heading, radio_altitude } from './utilities/radioUtilities';
import { STORAGE_KEY } from './constants/storageKeys';
import { SELECTORS } from './constants/selectors';
import {
    VOICES,
    LOWER_PITCH,
    HIGHER_PITCH,
    NORMAL_SPEED,
    FASTER_SPEED
} from './constants/speechConstants';
import { TRACKABLE_EVENT } from './constants/trackableEvents';

/**
 * Shared storage boundary retained across `speech_init()`/`speech_toggle()`.
 *
 * Normalized to canonical `null` when no adapter is configured so persistence
 * becomes a deliberate no-op rather than a global `localStorage` access.
 *
 * @property _storageAdapter
 * @type {StorageAdapter|null}
 */
let _storageAdapter = null;

/**
 * Shared randomness boundary retained for `randomizePilotVoice()`.
 *
 * Kept separate from `speech_init()` so voice randomization never couples to
 * speech synthesis configuration. Remains `null` until a composition root
 * configures it through `randomizePilotVoice_init()`, so importing this module
 * never touches a global `Math.random`. While unconfigured, `fraction()` reads
 * resolve to a deterministic `0`, selecting the first voice and the pitch/rate
 * formula endpoints.
 *
 * @property _randomSource
 * @type {RandomSource|null}
 */
let _randomSource = null;

/**
 * Shared speech-synthesis boundary retained across `speech_init()`,
 * `speech_say()`, and `speech_toggle()`.
 *
 * Normalized to canonical `null` when no adapter is configured so speaking and
 * cancelling become deliberate no-ops rather than global `speechSynthesis` /
 * `SpeechSynthesisUtterance` access. Configured only through `speech_init()` at
 * the composition root, so importing this module never touches a browser speech
 * global.
 *
 * @property _speechSynthesisAdapter
 * @type {SpeechSynthesisAdapter|null}
 */
let _speechSynthesisAdapter = null;

/**
 * Configure the randomness boundary used by `randomizePilotVoice()`.
 *
 * Called by `App` at the composition root before any consumer runs. Storing the
 * source is the only way voice randomization reaches real randomness; before
 * this runs it stays global-free and fraction reads resolve to `0`.
 *
 * @function randomizePilotVoice_init
 * @param randomSource {RandomSource} [optional]  boundary exposing `fraction()`
 */
export const randomizePilotVoice_init = (randomSource = null) => {
    _randomSource = randomSource == null ? null : randomSource;
};

/**
 * Read a fractional value in `[0, 1)` from the configured boundary.
 *
 * Resolves to a deterministic `0` while unconfigured so callers never touch a
 * global `Math.random`.
 *
 * @function _fraction
 * @return {number}
 * @private
 */
const _fraction = () => (_randomSource === null ? 0 : _randomSource.fraction());

/**
 *
 * @function speech_init
 * @param storageAdapter {StorageAdapter} [optional]  boundary exposing `get(key)`/`set(key, value)`
 * @param speechSynthesisAdapter {SpeechSynthesisAdapter} [optional]  boundary exposing `speak(text, pilotVoice)`/`cancel()`
 */
export const speech_init = (storageAdapter = null, speechSynthesisAdapter = null) => {
    _storageAdapter = storageAdapter == null ? null : storageAdapter;
    _speechSynthesisAdapter = speechSynthesisAdapter == null ? null : speechSynthesisAdapter;

    prop.speech = {};
    prop.speech.synthesis = _speechSynthesisAdapter;
    prop.speech.enabled = false;

    if (_storageAdapter !== null && _storageAdapter.get(STORAGE_KEY.ATC_SPEECH_ENABLED) === true) {
        prop.speech.enabled = true;
        $(SELECTORS.DOM_SELECTORS.TOGGLE_SPEECH).addClass(SELECTORS.CLASSNAMES.ACTIVE);
    }
};

/**
 *
 * @function randomizePilotVoice
 */
export const randomizePilotVoice = () => {
    const voice = VOICES[Math.floor(_fraction() * VOICES.length)];
    const pitch = (_fraction() * (LOWER_PITCH - HIGHER_PITCH) + HIGHER_PITCH).toFixed(1);
    const rate = (_fraction() * (NORMAL_SPEED - FASTER_SPEED) + FASTER_SPEED).toFixed(3);

    return {
        voice,
        pitch,
        rate
    };
};

/**
 *
 * @function speech_say
 * @param sentence
 */
export const speech_say = (sentence, pilotVoice) => {
    if (_speechSynthesisAdapter !== null && prop.speech.enabled) {
        let textToSay = '';

        for (let i = 0; i < sentence.length; i++) {
            const singleSentence = sentence[i];

            switch (singleSentence.type) {
                case 'callsign':
                    textToSay += ` ${singleSentence.content.getRadioCallsign()} `;
                    break;
                case 'altitude':
                    textToSay += ` ${radio_altitude(singleSentence.content)} `;
                    break;
                case 'speed': case 'heading':
                    textToSay += ` ${radio_heading(singleSentence.content)} `;
                    break;
                case 'text':
                    textToSay += ` ${singleSentence.content} `;
                    break;
                default:
                    break;
            }
        }

        // Delegate utterance construction, voice selection, and speaking to the
        // synthesis boundary so no browser speech global is touched here.
        _speechSynthesisAdapter.speak(textToSay, pilotVoice);
    }
};

/**
 *
 * @function speech_toggle
 */
export const speech_toggle = () => {
    const $speechToggleElement = $(SELECTORS.DOM_SELECTORS.TOGGLE_SPEECH);
    prop.speech.enabled = !prop.speech.enabled;

    if (!prop.speech.enabled && _speechSynthesisAdapter !== null) {
        _speechSynthesisAdapter.cancel();
    }

    $speechToggleElement.toggleClass(SELECTORS.CLASSNAMES.ACTIVE);

    if (_storageAdapter !== null) {
        _storageAdapter.set(STORAGE_KEY.ATC_SPEECH_ENABLED, prop.speech.enabled);
    }

    const hasClass = $speechToggleElement.hasClass(SELECTORS.CLASSNAMES.ACTIVE);

    EventTracker.recordEvent(TRACKABLE_EVENT.OPTIONS, 'speech', `${hasClass}`);
};
