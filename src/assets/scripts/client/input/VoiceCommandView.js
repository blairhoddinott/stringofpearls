import { VOICE_CONTROLLER_STATE } from './VoiceCommandController';

/**
 * Human-readable status text for each {@link VOICE_CONTROLLER_STATE}, surfaced
 * verbatim in the aria-live status region.
 *
 * @property VOICE_STATUS_MESSAGES
 * @type {object}
 * @final
 */
export const VOICE_STATUS_MESSAGES = {
    [VOICE_CONTROLLER_STATE.DISABLED]: 'Voice commands are off',
    [VOICE_CONTROLLER_STATE.LOADING]: 'Loading the voice model…',
    [VOICE_CONTROLLER_STATE.READY]: 'Ready — hold the button and speak',
    [VOICE_CONTROLLER_STATE.LISTENING]: 'Listening…',
    [VOICE_CONTROLLER_STATE.TRANSCRIBING]: 'Working out what you said…',
    [VOICE_CONTROLLER_STATE.ERROR]: 'Voice commands are unavailable',
    [VOICE_CONTROLLER_STATE.DESTROYED]: 'Voice commands are off'
};

const PUSH_TO_TALK_LABEL = 'Hold to talk';
const PUSH_TO_TALK_LISTENING_LABEL = 'Listening…';
const ACCEPTED_MESSAGE = 'Recognized — review it, then press enter to send';
const GENERIC_REJECTION_MESSAGE = 'That command was not understood';
const GENERIC_ERROR_MESSAGE = 'Something went wrong with voice commands';

// the microphone may be held only in these states; the button is disabled otherwise
const PUSH_TO_TALK_ENABLED_STATES = new Set([
    VOICE_CONTROLLER_STATE.READY,
    VOICE_CONTROLLER_STATE.LISTENING
]);

// the opt-in offer is meaningful only before loading and after a recoverable error
const OPT_IN_ENABLED_STATES = new Set([
    VOICE_CONTROLLER_STATE.DISABLED,
    VOICE_CONTROLLER_STATE.ERROR
]);

// states that clear the last result: a fresh capture or a return to a resting
// state that carries no result of its own. READY/ERROR/TRANSCRIBING are omitted
// so that a result rendered *before* the controller settles is not clobbered by
// the state transition that immediately follows it.
const PREVIEW_HIDING_STATES = new Set([
    VOICE_CONTROLLER_STATE.DISABLED,
    VOICE_CONTROLLER_STATE.LOADING,
    VOICE_CONTROLLER_STATE.LISTENING,
    VOICE_CONTROLLER_STATE.DESTROYED
]);

/**
 * The DOM-facing view for push-to-talk voice command entry.
 *
 * It is a thin, injected presentation adapter over already-resolved footer
 * elements and implements exactly the surface the {@link VoiceCommandController}
 * drives: `renderState`/`renderProgress`/`renderTranscript`/`renderRejection`/
 * `renderError`. It references no browser globals on import or construction, so
 * it is fully testable against real or faked element references.
 *
 * All user-supplied text — transcripts, normalized commands, rejection reasons,
 * and error messages — is written with `textContent` only. Markup in a
 * transcript is therefore always shown literally and never interpreted.
 *
 * @class VoiceCommandView
 */
export default class VoiceCommandView {
    /**
     * @constructor
     * @param elements {object}
     * @param elements.optInButton {Element}        explicit voice opt-in button
     * @param elements.pushToTalkButton {Element}   native push-to-talk button
     * @param elements.statusElement {Element}      aria-live atomic status region
     * @param elements.previewElement {Element}     preview container (hidden when empty)
     * @param elements.messageElement {Element}     outcome/error line within the preview
     * @param elements.transcriptLine {Element}     wrapper for the raw transcript line
     * @param elements.transcriptElement {Element}  raw transcript text node
     * @param elements.normalizedLine {Element}     wrapper for the normalized command line
     * @param elements.normalizedElement {Element}  normalized command text node
     */
    constructor({
        optInButton,
        pushToTalkButton,
        statusElement,
        previewElement,
        messageElement,
        transcriptLine,
        transcriptElement,
        normalizedLine,
        normalizedElement
    } = {}) {
        this._optInButton = optInButton;
        this._pushToTalkButton = pushToTalkButton;
        this._statusElement = statusElement;
        this._previewElement = previewElement;
        this._messageElement = messageElement;
        this._transcriptLine = transcriptLine;
        this._transcriptElement = transcriptElement;
        this._normalizedLine = normalizedLine;
        this._normalizedElement = normalizedElement;
    }

    /**
     * Reflect a lifecycle transition: status text, button disabled/pressed
     * state and labels, and preview visibility.
     *
     * @for VoiceCommandView
     * @method renderState
     * @param state {string}  a {@link VOICE_CONTROLLER_STATE} value
     */
    renderState(state) {
        const isListening = state === VOICE_CONTROLLER_STATE.LISTENING;

        this._statusElement.textContent = VOICE_STATUS_MESSAGES[state] || '';

        this._pushToTalkButton.disabled = !PUSH_TO_TALK_ENABLED_STATES.has(state);
        this._pushToTalkButton.setAttribute('aria-pressed', isListening ? 'true' : 'false');
        this._pushToTalkButton.textContent = isListening ? PUSH_TO_TALK_LISTENING_LABEL : PUSH_TO_TALK_LABEL;

        this._optInButton.disabled = !OPT_IN_ENABLED_STATES.has(state);

        if (PREVIEW_HIDING_STATES.has(state)) {
            this._hidePreview();
        }
    }

    /**
     * Reflect recognition-model download/init progress in the status region.
     *
     * @for VoiceCommandView
     * @method renderProgress
     * @param progress {object}  `{ phase, loaded, total, backend }`
     */
    renderProgress({ loaded, total } = {}) {
        const base = VOICE_STATUS_MESSAGES[VOICE_CONTROLLER_STATE.LOADING];

        if (typeof loaded === 'number' && typeof total === 'number' && total > 0) {
            const percent = Math.round((loaded / total) * 100);

            this._statusElement.textContent = `${base} ${percent}%`;

            return;
        }

        this._statusElement.textContent = base;
    }

    /**
     * Show an accepted transcript and the normalized command it produced.
     *
     * @for VoiceCommandView
     * @method renderTranscript
     * @param result {object}  `{ transcript, commandText }`
     */
    renderTranscript({ transcript, commandText }) {
        this._messageElement.textContent = ACCEPTED_MESSAGE;
        this._transcriptElement.textContent = transcript;
        this._normalizedElement.textContent = commandText;
        this._transcriptLine.hidden = false;
        this._normalizedLine.hidden = false;
        this._showPreview();
    }

    /**
     * Show a rejected transcript alongside the reason it could not be used. The
     * normalized-command line is hidden because there is no command to preview.
     *
     * @for VoiceCommandView
     * @method renderRejection
     * @param rejection {object}  `{ status, transcript, reason }`
     */
    renderRejection({ transcript, reason }) {
        this._messageElement.textContent = reason || GENERIC_REJECTION_MESSAGE;
        this._transcriptElement.textContent = transcript;
        this._transcriptLine.hidden = false;
        this._normalizedElement.textContent = '';
        this._normalizedLine.hidden = true;
        this._showPreview();
    }

    /**
     * Show a recoverable error. Both transcript and command lines are hidden
     * because no recognition result exists.
     *
     * @for VoiceCommandView
     * @method renderError
     * @param error {Error|object}
     */
    renderError(error) {
        this._messageElement.textContent = (error && error.message) || GENERIC_ERROR_MESSAGE;
        this._transcriptElement.textContent = '';
        this._normalizedElement.textContent = '';
        this._transcriptLine.hidden = true;
        this._normalizedLine.hidden = true;
        this._showPreview();
    }

    /**
     * @for VoiceCommandView
     * @method _showPreview
     * @private
     */
    _showPreview() {
        this._previewElement.hidden = false;
    }

    /**
     * @for VoiceCommandView
     * @method _hidePreview
     * @private
     */
    _hidePreview() {
        this._previewElement.hidden = true;
        this._messageElement.textContent = '';
        this._transcriptElement.textContent = '';
        this._normalizedElement.textContent = '';
    }
}
