import { NORMALIZER_STATUS } from './AviationCommandNormalizer';

/**
 * Lifecycle states of the {@link VoiceCommandController}.
 *
 * @enum VOICE_CONTROLLER_STATE
 * @type {object}
 * @final
 */
export const VOICE_CONTROLLER_STATE = {
    /** constructed but nothing loaded; the only pre-`enable()` state */
    DISABLED: 'disabled',
    /** the recognition model is downloading/initialising */
    LOADING: 'loading',
    /** the model is loaded and the controller is idle, awaiting push-to-talk */
    READY: 'ready',
    /** the microphone is open and capturing */
    LISTENING: 'listening',
    /** the captured audio is being transcribed */
    TRANSCRIBING: 'transcribing',
    /** a recoverable failure occurred; a later `enable()` can retry */
    ERROR: 'error',
    /** torn down; every interaction is a permanent no-op */
    DESTROYED: 'destroyed'
};

/**
 * Orchestrates push-to-talk voice command entry.
 *
 * The controller owns none of the work: it is a pure orchestrator over injected
 * collaborators and drives the fixed pipeline
 *
 *   enable -> (push-to-talk) capture -> transcribe -> live context -> normalize
 *
 * and reflects every transition through the injected view. It references no
 * browser globals and holds only lifecycle state, so it is fully testable with
 * narrow fakes.
 *
 * Key invariants enforced here:
 *   - the recognition model loads only via `enable()` (explicit opt-in) and only
 *     once; `enable()` never opens the microphone
 *   - the microphone is opened only by `beginPushToTalk()` once `READY`
 *   - the normalization context is sampled *live*, at transcript-completion time
 *   - a normalized command only ever *populates* the command input; it is never
 *     submitted or executed
 *   - failures are recoverable and never touch the command input
 *   - `cancel()`/`destroy()` suppress any in-flight (now stale) transcription
 *
 * @class VoiceCommandController
 */
export default class VoiceCommandController {
    /**
     * @constructor
     * @param dependencies {object}
     * @param dependencies.recognitionClient {object}  load()/transcribe(pcm)/cancel()/destroy()
     * @param dependencies.microphoneCapture {object}  start()/stop()/destroy()
     * @param dependencies.contextProvider {object}    getContext()
     * @param dependencies.normalize {function}        normalize(transcript, context) -> { status, ... }
     * @param dependencies.view {object}               renderState/renderProgress/renderTranscript/renderRejection/renderError
     * @param dependencies.commandInput {object}       getValue()/setValue(next)
     */
    constructor({ recognitionClient, microphoneCapture, contextProvider, normalize, view, commandInput } = {}) {
        this._recognitionClient = recognitionClient;
        this._microphoneCapture = microphoneCapture;
        this._contextProvider = contextProvider;
        this._normalize = normalize;
        this._view = view;
        this._commandInput = commandInput;

        // monotonic generation token; bumped by cancel()/destroy() so that an
        // in-flight transcription that resolves afterwards is recognised as stale
        this._token = 0;
        this._pendingStart = null;

        // set directly (not via _setState) so construction never touches the view
        this._state = VOICE_CONTROLLER_STATE.DISABLED;
    }

    /**
     * Current lifecycle state.
     *
     * @for VoiceCommandController
     * @property state
     * @return {string}  a {@link VOICE_CONTROLLER_STATE} value
     */
    get state() {
        return this._state;
    }

    /**
     * Explicit opt-in: load the recognition model. This is the only path that
     * loads the model, it loads only once, and it never opens the microphone.
     *
     * @for VoiceCommandController
     * @method enable
     * @return {Promise<void>}
     */
    async enable() {
        // only DISABLED (first run) or ERROR (retry) may start a load
        if (this._state !== VOICE_CONTROLLER_STATE.DISABLED && this._state !== VOICE_CONTROLLER_STATE.ERROR) {
            return;
        }

        this._setState(VOICE_CONTROLLER_STATE.LOADING);

        try {
            await this._recognitionClient.load();

            if (this._state === VOICE_CONTROLLER_STATE.DESTROYED) {
                return;
            }

            this._setState(VOICE_CONTROLLER_STATE.READY);
        } catch (error) {
            if (this._state === VOICE_CONTROLLER_STATE.DESTROYED) {
                return;
            }

            this._view.renderError(error);
            this._setState(VOICE_CONTROLLER_STATE.ERROR);
        }
    }

    /**
     * Forward recognition-model download/init progress to the view.
     *
     * @for VoiceCommandController
     * @method handleModelProgress
     * @param progress {object}
     */
    handleModelProgress(progress) {
        if (this._state === VOICE_CONTROLLER_STATE.DESTROYED) {
            return;
        }

        this._view.renderProgress(progress);
    }

    /**
     * Begin push-to-talk: open the microphone. Does nothing unless `READY`, and
     * `capture.start()` is the only call that ever opens the microphone.
     *
     * @for VoiceCommandController
     * @method beginPushToTalk
     * @return {Promise<void>}
     */
    async beginPushToTalk() {
        if (this._state !== VOICE_CONTROLLER_STATE.READY) {
            return;
        }

        const token = this._token;

        this._setState(VOICE_CONTROLLER_STATE.LISTENING);
        this._pendingStart = this._microphoneCapture.start();

        try {
            await this._pendingStart;
        } catch (error) {
            if (this._isStale(token)) {
                return;
            }

            this._view.renderError(error);
            this._setState(VOICE_CONTROLLER_STATE.READY);
        } finally {
            this._pendingStart = null;
        }
    }

    /**
     * End push-to-talk: stop capture, transcribe, sample the *live* context at
     * transcript-completion time, then normalize and surface the outcome. Does
     * nothing unless currently `LISTENING`.
     *
     * @for VoiceCommandController
     * @method endPushToTalk
     * @return {Promise<void>}
     */
    async endPushToTalk() {
        if (this._state !== VOICE_CONTROLLER_STATE.LISTENING) {
            return;
        }

        const token = this._token;

        this._setState(VOICE_CONTROLLER_STATE.TRANSCRIBING);

        try {
            if (this._pendingStart) {
                await this._pendingStart;
            }

            if (this._isStale(token)) {
                return;
            }

            const pcm = await this._microphoneCapture.stop();
            const transcript = await this._recognitionClient.transcribe(pcm);

            // suppress a result that was cancelled/destroyed while in flight
            if (this._isStale(token)) {
                return;
            }

            // the context is read only now, at transcript-completion time
            const context = this._contextProvider.getContext();
            const result = this._normalize(transcript, context);

            this._presentResult(transcript, result);
            this._setState(VOICE_CONTROLLER_STATE.READY);
        } catch (error) {
            if (this._isStale(token) || this._state !== VOICE_CONTROLLER_STATE.TRANSCRIBING) {
                return;
            }

            this._view.renderError(error);
            this._setState(VOICE_CONTROLLER_STATE.READY);
        }
    }

    /**
     * Abort the current capture/transcription and return to `READY`, keeping the
     * controller usable. Suppresses any in-flight transcription result.
     *
     * @for VoiceCommandController
     * @method cancel
     */
    cancel() {
        if (this._state !== VOICE_CONTROLLER_STATE.LISTENING && this._state !== VOICE_CONTROLLER_STATE.TRANSCRIBING) {
            return;
        }

        this._token += 1;
        this._recognitionClient.cancel();
        this._microphoneCapture.cancel();
        this._setState(VOICE_CONTROLLER_STATE.READY);
    }

    /**
     * Tear down both collaborators. Idempotent; every later interaction becomes a
     * permanent no-op, and any in-flight transcription is suppressed.
     *
     * @for VoiceCommandController
     * @method destroy
     */
    destroy() {
        if (this._state === VOICE_CONTROLLER_STATE.DESTROYED) {
            return;
        }

        this._token += 1;
        this._microphoneCapture.destroy();
        this._recognitionClient.destroy();
        this._setState(VOICE_CONTROLLER_STATE.DESTROYED);
    }

    /**
     * Surface a normalization outcome. Accepted commands preview *and* populate
     * the command input; rejections only report and never touch the input.
     *
     * @for VoiceCommandController
     * @method _presentResult
     * @param transcript {string}
     * @param result {object}
     * @private
     */
    _presentResult(transcript, result) {
        if (result.status === NORMALIZER_STATUS.ACCEPTED) {
            this._view.renderTranscript({ transcript, commandText: result.commandText });
            // populate only: never submitted, parsed, or executed
            this._commandInput.setValue(result.commandText);

            return;
        }

        this._view.renderRejection({ status: result.status, transcript, reason: result.reason });
    }

    /**
     * Whether the generation token captured at the start of a transcription has
     * been superseded by a `cancel()`/`destroy()`.
     *
     * @for VoiceCommandController
     * @method _isStale
     * @param token {number}
     * @return {boolean}
     * @private
     */
    _isStale(token) {
        return token !== this._token || this._state === VOICE_CONTROLLER_STATE.DESTROYED;
    }

    /**
     * Transition state and reflect it through the view.
     *
     * @for VoiceCommandController
     * @method _setState
     * @param nextState {string}
     * @private
     */
    _setState(nextState) {
        this._state = nextState;
        this._view.renderState(nextState);
    }
}
