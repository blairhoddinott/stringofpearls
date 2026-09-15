/**
 * A pure adapter around an injected Web Speech synthesis backend and utterance
 * factory.
 *
 * The backend is anything exposing the standard `SpeechSynthesis` contract used
 * here — `getVoices()`, `speak(utterance)`, and `cancel()` (for example
 * `window.speechSynthesis`). The utterance factory is a callable that returns a
 * fresh, mutable utterance for a given text (for example
 * `(text) => new SpeechSynthesisUtterance(text)`). This adapter intentionally
 * references no browser globals so it stays trivially testable with fakes, and
 * it is safe to construct with either capability omitted: a nullish backend or
 * factory is normalized to `null` and the dependent method becomes a no-op that
 * returns `undefined` with no ambient fallback. When the required capability is
 * present the backend is driven with the exact operation order and argument
 * shapes the legacy inline speech code used, its return value is forwarded
 * verbatim, and any thrown error propagates unchanged.
 *
 * @class SpeechSynthesisAdapter
 */
export default class SpeechSynthesisAdapter {
    /**
     * @constructor
     * @param synthesis {SpeechSynthesis|null} [optional]  backend exposing `getVoices()`, `speak(utterance)`, and `cancel()`, or nullish for a disabled backend
     * @param utteranceFactory {Function|null} [optional]  callable returning a fresh utterance for `(text)`, or nullish when no factory is available
     */
    constructor(synthesis = null, utteranceFactory = null) {
        /**
         * Injected speech synthesis backend, or `null` when unavailable.
         *
         * @property _synthesis
         * @type {SpeechSynthesis|null}
         * @private
         */
        this._synthesis = synthesis == null ? null : synthesis;

        /**
         * Injected utterance factory callable, or `null` when unavailable.
         *
         * @property _utteranceFactory
         * @type {Function|null}
         * @private
         */
        this._utteranceFactory = utteranceFactory == null ? null : utteranceFactory;
    }

    /**
     * Speak `text` with the voice/rate/pitch described by `pilotVoice`.
     *
     * Returns `undefined` without side effects when either the backend or the
     * utterance factory is missing. Otherwise reproduces the legacy inline
     * behavior exactly: build an utterance from the text, set `lang` to
     * `'en-US'`, set `voice` to the first backend voice whose `name` matches
     * `pilotVoice.voice`, set `rate` then `pitch`, call `backend.speak(utterance)`,
     * and return the backend result verbatim. Any thrown error propagates
     * unchanged.
     *
     * @for SpeechSynthesisAdapter
     * @method speak
     * @param text {string}
     * @param pilotVoice {object}  `{ voice, rate, pitch }`
     * @return {*}
     */
    speak(text, pilotVoice) {
        if (this._synthesis === null || this._utteranceFactory === null) {
            return undefined;
        }

        const utterance = this._utteranceFactory(text);

        utterance.lang = 'en-US';
        utterance.voice = this._synthesis.getVoices().filter((voice) => {
            return voice.name === pilotVoice.voice;
        })[0];
        utterance.rate = pilotVoice.rate;
        utterance.pitch = pilotVoice.pitch;

        return this._synthesis.speak(utterance);
    }

    /**
     * Cancel any queued or in-progress speech through the backend.
     *
     * Returns `undefined` without side effects when no backend is configured.
     * Otherwise delegates exactly to `backend.cancel()` and returns its value
     * verbatim, letting any thrown error propagate unchanged.
     *
     * @for SpeechSynthesisAdapter
     * @method cancel
     * @return {*}
     */
    cancel() {
        if (this._synthesis === null) {
            return undefined;
        }

        return this._synthesis.cancel();
    }
}
