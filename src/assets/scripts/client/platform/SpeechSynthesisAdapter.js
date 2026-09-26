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
 * present, this adapter serializes utterances itself so eligibility can be
 * rechecked immediately before playback and stale aircraft transmissions can
 * be removed without allowing later queued speech to leak through.
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
        this._queue = [];
        this._current = null;
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
     * @param isEligible {Function} callback rechecked immediately before playback
     * @return {*}
     */
    speak(text, pilotVoice, isEligible = () => true) {
        if (this._synthesis === null || this._utteranceFactory === null) {
            return undefined;
        }

        if (!isEligible()) {
            return undefined;
        }

        this._queue.push({ text, pilotVoice, isEligible });

        return this._speakNext();
    }

    _speakNext() {
        if (this._current !== null) {
            return undefined;
        }

        let item = this._queue.shift();

        while (item && !item.isEligible()) {
            item = this._queue.shift();
        }

        if (!item) {
            return undefined;
        }

        const utterance = this._utteranceFactory(item.text);

        utterance.lang = 'en-US';
        utterance.voice = this._synthesis.getVoices().filter((voice) => {
            return voice.name === item.pilotVoice.voice;
        })[0];
        utterance.rate = item.pilotVoice.rate;
        utterance.pitch = item.pilotVoice.pitch;
        item.utterance = utterance;
        utterance.onend = () => this._finish(item);
        utterance.onerror = () => this._finish(item);
        this._current = item;

        try {
            return this._synthesis.speak(utterance);
        } catch (error) {
            if (this._current === item) {
                this._current = null;
            }

            try {
                this._speakNext();
            } catch {
                // Nested failures perform the same queue recovery. Preserve
                // this operation's original backend error for its caller.
            }

            throw error;
        }
    }

    _finish(item) {
        if (this._current !== item) {
            return;
        }

        this._current = null;
        this._speakNext();
    }

    /**
     * Remove queued speech whose eligibility has expired. If the active
     * utterance is no longer eligible, stop it and continue with the next
     * eligible item.
     *
     * @return {*}
     */
    discardIneligible() {
        this._queue = this._queue.filter((item) => item.isEligible());

        if (this._current === null || this._current.isEligible()) {
            return undefined;
        }

        this._current = null;
        const result = this._synthesis.cancel();
        this._speakNext();

        return result;
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

        this._queue = [];
        this._current = null;

        return this._synthesis.cancel();
    }
}
