import { decodeAudioBufferToMono16k } from './pcm';

const CAPTURE_STATUS = {
    IDLE: 'idle',
    STARTING: 'starting',
    RECORDING: 'recording',
    STOPPING: 'stopping',
    ERRORED: 'errored',
    DESTROYED: 'destroyed'
};

const defaultChunksToArrayBuffer = async (chunks) => new Blob(chunks).arrayBuffer();

/**
 * A boundary around browser microphone capture.
 *
 * Every host capability is injected — `getUserMedia`, a MediaRecorder factory,
 * an AudioContext factory, and (optionally) a chunk-to-ArrayBuffer assembler —
 * so the module references no browser globals at import time and is fully
 * testable with fakes. `start()` is the *only* place that calls `getUserMedia`,
 * and it does so only when the caller explicitly invokes it, never on
 * construction.
 *
 * `stop()` resolves decoded mono 16 kHz PCM, then deterministically tears down:
 * every media track is stopped, the AudioContext is closed, and recorder
 * listeners are detached. Permission denial, a missing API, a recorder error, a
 * repeated `start()`, a `stop()` before `start()`, and `destroy()` while a
 * `stop()` is in flight all fail safely — preserving the original, useful error
 * and leaking no tracks or listeners.
 *
 * @class MicrophoneCapture
 */
export default class MicrophoneCapture {
    /**
     * @constructor
     * @param options {object}
     * @param options.getUserMedia {Function}  `(constraints) => Promise<MediaStream>`
     * @param options.createRecorder {Function}  `(stream) => MediaRecorder`
     * @param options.createAudioContext {Function}  `() => AudioContext`
     * @param options.chunksToArrayBuffer {Function} [optional]  `(chunks) => Promise<ArrayBuffer>`
     */
    constructor({ getUserMedia, createRecorder, createAudioContext, chunksToArrayBuffer } = {}) {
        this._getUserMedia = getUserMedia;
        this._createRecorder = createRecorder;
        this._createAudioContext = createAudioContext;
        this._chunksToArrayBuffer = typeof chunksToArrayBuffer === 'function'
            ? chunksToArrayBuffer
            : defaultChunksToArrayBuffer;

        this._status = CAPTURE_STATUS.IDLE;
        this._stream = null;
        this._recorder = null;
        this._context = null;
        this._chunks = [];
        this._pendingStop = null;
        this._recorderError = null;
        this._tracksStopped = false;
    }

    /**
     * The current capture status.
     *
     * @property status
     * @type {string}
     */
    get status() {
        return this._status;
    }

    /**
     * Begin capturing. Requests microphone access (the only `getUserMedia`
     * call), then starts recording. Rejects — without acquiring or leaking
     * anything — when the API is unavailable, permission is denied, the capture
     * has been destroyed, or a capture is already running.
     *
     * @for MicrophoneCapture
     * @method start
     * @return {Promise<void>}
     */
    async start() {
        if (this._status === CAPTURE_STATUS.DESTROYED) {
            throw new Error('microphone capture has been destroyed');
        }

        if (this._status !== CAPTURE_STATUS.IDLE) {
            throw new Error('microphone capture already started');
        }

        if (
            typeof this._getUserMedia !== 'function' ||
            typeof this._createRecorder !== 'function' ||
            typeof this._createAudioContext !== 'function'
        ) {
            throw new Error('microphone capture is not supported in this environment');
        }

        this._status = CAPTURE_STATUS.STARTING;

        let stream;

        try {
            stream = await this._getUserMedia({ audio: true });
        } catch (error) {
            if (this._status !== CAPTURE_STATUS.DESTROYED) {
                this._status = CAPTURE_STATUS.IDLE;
            }

            throw error;
        }

        this._stream = stream;
        this._tracksStopped = false;

        if (this._status === CAPTURE_STATUS.DESTROYED) {
            this._stopTracks();
            this._stream = null;

            throw new Error('microphone capture has been destroyed');
        }

        try {
            this._chunks = [];
            this._recorderError = null;
            this._recorder = this._createRecorder(stream);
            this._recorder.ondataavailable = (event) => {
                this._chunks.push(event.data);
            };
            this._recorder.onerror = (event) => this._handleRecorderError(event);
            this._recorder.start();
            this._status = CAPTURE_STATUS.RECORDING;
        } catch (error) {
            this._teardown();
            this._status = CAPTURE_STATUS.IDLE;

            throw error;
        }
    }

    /**
     * Stop capturing and resolve the decoded mono 16 kHz PCM. Always tears the
     * capture down. Rejects with the original error when there is no active
     * capture, when a recorder error occurred, or when decoding fails.
     *
     * @for MicrophoneCapture
     * @method stop
     * @return {Promise<Float32Array>}
     */
    stop() {
        if (this._status === CAPTURE_STATUS.ERRORED) {
            const error = this._recorderError || new Error('microphone capture failed');
            this._recorderError = null;

            return Promise.reject(error);
        }

        if (this._status !== CAPTURE_STATUS.RECORDING) {
            return Promise.reject(new Error('microphone capture not started'));
        }

        this._status = CAPTURE_STATUS.STOPPING;

        return new Promise((resolve, reject) => {
            this._pendingStop = { resolve, reject };
            this._recorder.onstop = () => this._finishStop();
            this._recorder.stop();
        });
    }

    /**
     * Permanently tear down the capture, stopping tracks and detaching
     * listeners. Rejects any in-flight `stop()`.
     *
     * @for MicrophoneCapture
     * @method destroy
     * @return {void}
     */
    destroy() {
        if (this._status === CAPTURE_STATUS.DESTROYED) {
            return;
        }

        this._teardown();
        this._closeContext();
        this._settlePendingStop(null, new Error('microphone capture destroyed'));
        this._status = CAPTURE_STATUS.DESTROYED;
    }

    async _finishStop() {
        try {
            const arrayBuffer = await this._chunksToArrayBuffer(this._chunks);
            this._context = this._createAudioContext();
            const audioBuffer = await this._context.decodeAudioData(arrayBuffer);
            const pcm = decodeAudioBufferToMono16k(audioBuffer);

            await this._closeContext();
            this._teardown();

            if (this._status !== CAPTURE_STATUS.DESTROYED) {
                this._status = CAPTURE_STATUS.IDLE;
            }

            this._settlePendingStop(pcm, null);
        } catch (error) {
            await this._closeContext();
            this._teardown();

            if (this._status !== CAPTURE_STATUS.DESTROYED) {
                this._status = CAPTURE_STATUS.IDLE;
            }

            this._settlePendingStop(null, error);
        }
    }

    _handleRecorderError(event) {
        const error = (event && event.error) || new Error('microphone recorder error');

        this._teardown();

        if (this._pendingStop) {
            if (this._status !== CAPTURE_STATUS.DESTROYED) {
                this._status = CAPTURE_STATUS.IDLE;
            }

            this._settlePendingStop(null, error);

            return;
        }

        this._recorderError = error;
        this._status = CAPTURE_STATUS.ERRORED;
    }

    _settlePendingStop(value, error) {
        if (!this._pendingStop) {
            return;
        }

        const { resolve, reject } = this._pendingStop;
        this._pendingStop = null;

        if (error) {
            reject(error);
        } else {
            resolve(value);
        }
    }

    _stopTracks() {
        if (this._tracksStopped || this._stream === null) {
            return;
        }

        this._tracksStopped = true;

        for (const track of this._stream.getTracks()) {
            track.stop();
        }
    }

    _detachRecorder() {
        if (this._recorder === null) {
            return;
        }

        this._recorder.ondataavailable = null;
        this._recorder.onstop = null;
        this._recorder.onerror = null;
    }

    _teardown() {
        this._stopTracks();
        this._detachRecorder();
        this._recorder = null;
        this._stream = null;
    }

    async _closeContext() {
        if (this._context === null) {
            return;
        }

        const context = this._context;
        this._context = null;

        try {
            await context.close();
        } catch {
            // Closing is best-effort during teardown; a close failure must not
            // mask the operation's original result or error.
        }
    }
}
