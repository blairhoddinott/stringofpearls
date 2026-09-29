import { TARGET_SAMPLE_RATE } from './pcm';
import {
    RECOGNITION_STATE,
    createLoadMessage,
    createTranscribeMessage,
    createCancelMessage,
    createDestroyMessage,
    parseWorkerMessage,
    WORKER_MESSAGE_TYPE
} from './workerProtocol';

/**
 * Main-thread client for the speech-recognition worker.
 *
 * The worker is *injected* (any object exposing the `postMessage`, `terminate`,
 * `onmessage`, and `onerror` slice of the `Worker` contract), so the client is
 * fully unit-testable with a fake and references no browser globals. It exposes
 * a small, explicit lifecycle — `load()`, `transcribe()`, `cancel()`,
 * `destroy()` — over deterministic, observable {@link RECOGNITION_STATE} states
 * and forwards worker progress to an optional callback.
 *
 * ### Ownership of the PCM buffer
 *
 * `transcribe(pcm)` **takes ownership of `pcm.buffer`**: the exact
 * `ArrayBuffer` is listed as a transferable and moved to the worker, which
 * detaches it in the caller (zero-copy, no silent duplication). Callers must
 * treat the passed `Float32Array` as consumed and must not read or reuse it
 * after the call. This is a documented transfer, not accidental mutation of
 * caller-visible audio; a caller that needs to keep the audio should pass a
 * copy (for example `capturedPcm.slice()`).
 *
 * ### Stale results
 *
 * Every transcription is tagged with a monotonically increasing request id.
 * Only a result whose id matches the in-flight request is delivered; results
 * that arrive after a `cancel()` (or for a superseded id) are dropped, and no
 * message is acted on after `destroy()`.
 *
 * @class SpeechRecognitionClient
 */
export default class SpeechRecognitionClient {
    /**
     * @constructor
     * @param options {object}
     * @param options.worker {Worker}  injected worker exposing postMessage/terminate/onmessage/onerror
     * @param options.onProgress {Function} [optional]  invoked with each validated progress message
     * @param options.onStateChange {Function} [optional]  invoked with the new state on every transition
     */
    constructor({ worker, onProgress = null, onStateChange = null } = {}) {
        if (worker === null || typeof worker !== 'object' || typeof worker.postMessage !== 'function') {
            throw new TypeError('SpeechRecognitionClient requires an injected worker');
        }

        this._worker = worker;
        this._onProgress = typeof onProgress === 'function' ? onProgress : null;
        this._onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
        this._state = RECOGNITION_STATE.IDLE;
        this._backend = null;
        this._requestCounter = 0;
        this._activeRequestId = null;
        this._pending = null;
        this._loadPromise = null;

        this._worker.onmessage = (event) => this._handleMessage(event ? event.data : undefined);
        this._worker.onerror = (error) => this._handleWorkerError(error);
    }

    /**
     * The current lifecycle state.
     *
     * @property state
     * @type {string}
     */
    get state() {
        return this._state;
    }

    /**
     * The backend the worker reported it loaded on (`webgpu`/`wasm`), or null.
     *
     * @property backend
     * @type {string|null}
     */
    get backend() {
        return this._backend;
    }

    /**
     * Ask the worker to create the recognition pipeline. Resolves when the
     * worker reports `ready`; rejects if the worker reports an error. Calling
     * `load()` when already loading returns the in-flight promise, and calling
     * it once ready resolves immediately.
     *
     * @for SpeechRecognitionClient
     * @method load
     * @return {Promise<void>}
     */
    load() {
        if (this._state === RECOGNITION_STATE.DESTROYED) {
            return Promise.reject(new Error('SpeechRecognitionClient has been destroyed'));
        }

        if (this._state === RECOGNITION_STATE.READY) {
            return Promise.resolve();
        }

        if (this._state === RECOGNITION_STATE.LOADING && this._loadPromise) {
            return this._loadPromise;
        }

        this._loadPromise = new Promise((resolve, reject) => {
            this._pending = { kind: 'load', requestId: null, resolve, reject };
        });
        this._setState(RECOGNITION_STATE.LOADING);
        this._worker.postMessage(createLoadMessage());

        return this._loadPromise;
    }

    /**
     * Transcribe a mono 16 kHz PCM buffer. Only one transcription may run at a
     * time. Takes ownership of `pcm.buffer` (see the class docs) and resolves
     * with the local transcript text.
     *
     * @for SpeechRecognitionClient
     * @method transcribe
     * @param pcm {Float32Array}
     * @return {Promise<string>}
     */
    transcribe(pcm) {
        if (this._state === RECOGNITION_STATE.DESTROYED) {
            return Promise.reject(new Error('SpeechRecognitionClient has been destroyed'));
        }

        if (this._state === RECOGNITION_STATE.TRANSCRIBING) {
            return Promise.reject(new Error('already transcribing; only one transcription runs at a time'));
        }

        if (this._state !== RECOGNITION_STATE.READY) {
            return Promise.reject(new Error('SpeechRecognitionClient is not ready; call load() first'));
        }

        if (!(pcm instanceof Float32Array)) {
            return Promise.reject(new TypeError('transcribe requires a Float32Array of PCM samples'));
        }

        if (pcm.length === 0) {
            return Promise.reject(new RangeError('transcribe requires non-empty PCM samples'));
        }

        const requestId = this._nextRequestId();
        this._activeRequestId = requestId;

        return new Promise((resolve, reject) => {
            this._pending = { kind: 'transcribe', requestId, resolve, reject };
            this._setState(RECOGNITION_STATE.TRANSCRIBING);
            this._worker.postMessage(
                createTranscribeMessage(requestId, pcm.buffer, TARGET_SAMPLE_RATE, pcm.byteOffset, pcm.length),
                [pcm.buffer]
            );
        });
    }

    /**
     * Cancel the in-flight transcription (if any). Rejects the pending promise,
     * tells the worker to abandon the request, and drops any result that later
     * arrives for it. A no-op when nothing is transcribing.
     *
     * @for SpeechRecognitionClient
     * @method cancel
     * @return {void}
     */
    cancel() {
        if (this._state !== RECOGNITION_STATE.TRANSCRIBING) {
            return;
        }

        const cancelledRequestId = this._activeRequestId;
        this._activeRequestId = null;
        this._rejectPending(new Error('transcription cancelled'));
        this._worker.postMessage(createCancelMessage(cancelledRequestId));
        this._setState(RECOGNITION_STATE.READY);
    }

    /**
     * Permanently tear down the client and terminate the worker. Rejects any
     * pending work and ignores every subsequent worker message.
     *
     * @for SpeechRecognitionClient
     * @method destroy
     * @return {void}
     */
    destroy() {
        if (this._state === RECOGNITION_STATE.DESTROYED) {
            return;
        }

        this._activeRequestId = null;
        this._worker.postMessage(createDestroyMessage());
        this._rejectPending(new Error('SpeechRecognitionClient has been destroyed'));
        this._worker.terminate();
        this._setState(RECOGNITION_STATE.DESTROYED);
    }

    _nextRequestId() {
        this._requestCounter += 1;

        return this._requestCounter;
    }

    _setState(state) {
        if (this._state === state) {
            return;
        }

        this._state = state;

        if (this._onStateChange) {
            this._onStateChange(state);
        }
    }

    _rejectPending(error) {
        if (!this._pending) {
            return;
        }

        const { reject } = this._pending;
        this._pending = null;
        reject(error);
    }

    _resolvePending(value) {
        if (!this._pending) {
            return;
        }

        const { resolve } = this._pending;
        this._pending = null;
        resolve(value);
    }

    _handleMessage(data) {
        if (this._state === RECOGNITION_STATE.DESTROYED) {
            return;
        }

        const message = parseWorkerMessage(data);

        if (message === null) {
            return;
        }

        switch (message.type) {
            case WORKER_MESSAGE_TYPE.STATE:
                this._handleStateMessage(message);
                break;
            case WORKER_MESSAGE_TYPE.PROGRESS:
                if (this._onProgress) {
                    this._onProgress(message);
                }

                break;
            case WORKER_MESSAGE_TYPE.RESULT:
                this._handleResultMessage(message);
                break;
            case WORKER_MESSAGE_TYPE.ERROR:
                this._handleErrorMessage(message);
                break;
            default:
                break;
        }
    }

    _handleStateMessage(message) {
        if (message.backend !== undefined) {
            this._backend = message.backend;
        }

        if (message.state === RECOGNITION_STATE.READY) {
            if (this._pending && this._pending.kind === 'load') {
                this._resolvePending();
                this._setState(RECOGNITION_STATE.READY);
            }
        }
    }

    _handleResultMessage(message) {
        if (message.requestId !== this._activeRequestId) {
            return;
        }

        this._activeRequestId = null;
        this._resolvePending(message.text);
        this._setState(RECOGNITION_STATE.READY);
    }

    _handleErrorMessage(message) {
        if (
            message.requestId !== undefined &&
            message.requestId !== this._activeRequestId
        ) {
            return;
        }

        this._activeRequestId = null;
        this._rejectPending(new Error(message.message));
        this._setState(message.state || RECOGNITION_STATE.ERROR);
    }

    _handleWorkerError(error) {
        if (this._state === RECOGNITION_STATE.DESTROYED) {
            return;
        }

        const detail = error && typeof error.message === 'string' ? error.message : 'worker error';
        this._activeRequestId = null;
        this._rejectPending(new Error(detail));
        this._setState(RECOGNITION_STATE.ERROR);
    }
}
