/**
 * The message protocol shared by {@link SpeechRecognitionClient} (main thread)
 * and the speech-recognition worker.
 *
 * Both ends build messages with the `create*` helpers and validate incoming
 * messages with {@link parseClientMessage} / {@link parseWorkerMessage}. The
 * parsers are strict and *fail closed*: any message with an unknown type or a
 * field of the wrong shape returns `null` rather than a partially-trusted
 * object, so a corrupt or hostile message can never drive a state transition.
 *
 * This module references no browser globals and is safe to import anywhere.
 *
 * @fileoverview
 */

import { TARGET_SAMPLE_RATE } from './pcm';

/**
 * The Transformers.js model id for the local, English-only tiny Whisper model.
 * Weights are never bundled; they are downloaded at runtime only after an
 * explicit user opt-in.
 *
 * @property MODEL_ID
 * @type {string}
 * @final
 */
export const MODEL_ID = 'onnx-community/whisper-tiny.en';

/**
 * Message types sent from the client to the worker.
 *
 * @property CLIENT_MESSAGE_TYPE
 * @type {object}
 * @final
 */
export const CLIENT_MESSAGE_TYPE = {
    LOAD: 'load',
    TRANSCRIBE: 'transcribe',
    CANCEL: 'cancel',
    DESTROY: 'destroy'
};

/**
 * Message types sent from the worker to the client.
 *
 * @property WORKER_MESSAGE_TYPE
 * @type {object}
 * @final
 */
export const WORKER_MESSAGE_TYPE = {
    STATE: 'state',
    PROGRESS: 'progress',
    RESULT: 'result',
    ERROR: 'error'
};

/**
 * The observable lifecycle states of the recognition pipeline.
 *
 * @property RECOGNITION_STATE
 * @type {object}
 * @final
 */
export const RECOGNITION_STATE = {
    IDLE: 'idle',
    LOADING: 'loading',
    READY: 'ready',
    TRANSCRIBING: 'transcribing',
    ERROR: 'error',
    DESTROYED: 'destroyed'
};

/**
 * The inference backends the worker can run the pipeline on.
 *
 * @property RECOGNITION_BACKEND
 * @type {object}
 * @final
 */
export const RECOGNITION_BACKEND = {
    WEBGPU: 'webgpu',
    WASM: 'wasm'
};

const isPlainMessage = (data) => data !== null && typeof data === 'object' && !Array.isArray(data);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isIndex = (value) => Number.isInteger(value) && value >= 0;
const isKnown = (vocabulary, value) => Object.values(vocabulary).includes(value);

// -------------------------------------------------------------------------- //
// client -> worker builders
// -------------------------------------------------------------------------- //

export const createLoadMessage = () => ({ type: CLIENT_MESSAGE_TYPE.LOAD });

export const createTranscribeMessage = (requestId, audio, sampleRate, byteOffset, length) => ({
    type: CLIENT_MESSAGE_TYPE.TRANSCRIBE,
    requestId,
    audio,
    sampleRate,
    byteOffset,
    length
});

export const createCancelMessage = (requestId) => ({ type: CLIENT_MESSAGE_TYPE.CANCEL, requestId });

export const createDestroyMessage = () => ({ type: CLIENT_MESSAGE_TYPE.DESTROY });

// -------------------------------------------------------------------------- //
// worker -> client builders
// -------------------------------------------------------------------------- //

export const createStateMessage = (state, backend) => {
    const message = { type: WORKER_MESSAGE_TYPE.STATE, state };

    if (backend !== undefined) {
        message.backend = backend;
    }

    return message;
};

export const createProgressMessage = ({ phase, requestId, loaded, total, backend } = {}) => {
    const message = { type: WORKER_MESSAGE_TYPE.PROGRESS, phase };

    if (requestId !== undefined) {
        message.requestId = requestId;
    }

    if (loaded !== undefined) {
        message.loaded = loaded;
    }

    if (total !== undefined) {
        message.total = total;
    }

    if (backend !== undefined) {
        message.backend = backend;
    }

    return message;
};

export const createResultMessage = (requestId, text) => ({
    type: WORKER_MESSAGE_TYPE.RESULT,
    requestId,
    text
});

export const createErrorMessage = (message, { requestId, state } = {}) => {
    const errorMessage = { type: WORKER_MESSAGE_TYPE.ERROR, message };

    if (requestId !== undefined) {
        errorMessage.requestId = requestId;
    }

    if (state !== undefined) {
        errorMessage.state = state;
    }

    return errorMessage;
};

// -------------------------------------------------------------------------- //
// parsers (fail closed)
// -------------------------------------------------------------------------- //

/**
 * Validate a message received by the worker. Returns a normalized copy of the
 * message on success or `null` when the message is malformed.
 *
 * @function parseClientMessage
 * @param data {*}
 * @return {object|null}
 */
export const parseClientMessage = (data) => {
    if (!isPlainMessage(data)) {
        return null;
    }

    switch (data.type) {
        case CLIENT_MESSAGE_TYPE.LOAD:
            return { type: CLIENT_MESSAGE_TYPE.LOAD };
        case CLIENT_MESSAGE_TYPE.TRANSCRIBE:
            if (
                !isIndex(data.requestId) ||
                !(data.audio instanceof ArrayBuffer) ||
                data.sampleRate !== TARGET_SAMPLE_RATE ||
                !isIndex(data.byteOffset) ||
                data.byteOffset % Float32Array.BYTES_PER_ELEMENT !== 0 ||
                !isIndex(data.length) || data.length === 0 ||
                data.byteOffset + data.length * Float32Array.BYTES_PER_ELEMENT > data.audio.byteLength
            ) {
                return null;
            }

            return {
                type: CLIENT_MESSAGE_TYPE.TRANSCRIBE,
                requestId: data.requestId,
                audio: data.audio,
                sampleRate: data.sampleRate,
                byteOffset: data.byteOffset,
                length: data.length
            };
        case CLIENT_MESSAGE_TYPE.CANCEL:
            if (!isIndex(data.requestId)) {
                return null;
            }

            return { type: CLIENT_MESSAGE_TYPE.CANCEL, requestId: data.requestId };
        case CLIENT_MESSAGE_TYPE.DESTROY:
            return { type: CLIENT_MESSAGE_TYPE.DESTROY };
        default:
            return null;
    }
};

/**
 * Validate a message received by the client. Returns a normalized copy of the
 * message on success or `null` when the message is malformed.
 *
 * @function parseWorkerMessage
 * @param data {*}
 * @return {object|null}
 */
export const parseWorkerMessage = (data) => {
    if (!isPlainMessage(data)) {
        return null;
    }

    switch (data.type) {
        case WORKER_MESSAGE_TYPE.STATE: {
            if (!isKnown(RECOGNITION_STATE, data.state)) {
                return null;
            }

            if (data.backend !== undefined && !isKnown(RECOGNITION_BACKEND, data.backend)) {
                return null;
            }

            return createStateMessage(data.state, data.backend);
        }
        case WORKER_MESSAGE_TYPE.PROGRESS: {
            if (typeof data.phase !== 'string') {
                return null;
            }

            if (
                (data.requestId !== undefined && !isIndex(data.requestId)) ||
                (data.loaded !== undefined && !isFiniteNumber(data.loaded)) ||
                (data.total !== undefined && !isFiniteNumber(data.total)) ||
                (data.backend !== undefined && !isKnown(RECOGNITION_BACKEND, data.backend))
            ) {
                return null;
            }

            return createProgressMessage({
                phase: data.phase,
                requestId: data.requestId,
                loaded: data.loaded,
                total: data.total,
                backend: data.backend
            });
        }
        case WORKER_MESSAGE_TYPE.RESULT:
            if (!isIndex(data.requestId) || typeof data.text !== 'string') {
                return null;
            }

            return createResultMessage(data.requestId, data.text);
        case WORKER_MESSAGE_TYPE.ERROR: {
            if (typeof data.message !== 'string') {
                return null;
            }

            if (
                (data.requestId !== undefined && !isIndex(data.requestId)) ||
                (data.state !== undefined && !isKnown(RECOGNITION_STATE, data.state))
            ) {
                return null;
            }

            return createErrorMessage(data.message, { requestId: data.requestId, state: data.state });
        }
        default:
            return null;
    }
};
