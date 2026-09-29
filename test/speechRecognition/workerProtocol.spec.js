import ava from 'ava';

import {
    MODEL_ID,
    CLIENT_MESSAGE_TYPE,
    WORKER_MESSAGE_TYPE,
    RECOGNITION_STATE,
    RECOGNITION_BACKEND,
    createLoadMessage,
    createTranscribeMessage,
    createCancelMessage,
    createDestroyMessage,
    createStateMessage,
    createProgressMessage,
    createResultMessage,
    createErrorMessage,
    parseClientMessage,
    parseWorkerMessage
} from '../../src/assets/scripts/client/speechRecognition/workerProtocol';

// -------------------------------------------------------------------------- //
// constants
// -------------------------------------------------------------------------- //

ava('exposes the local whisper-tiny.en model id', (t) => {
    t.is(MODEL_ID, 'onnx-community/whisper-tiny.en');
});

ava('exposes the client and worker message type vocabularies', (t) => {
    t.deepEqual(CLIENT_MESSAGE_TYPE, {
        LOAD: 'load',
        TRANSCRIBE: 'transcribe',
        CANCEL: 'cancel',
        DESTROY: 'destroy'
    });
    t.deepEqual(WORKER_MESSAGE_TYPE, {
        STATE: 'state',
        PROGRESS: 'progress',
        RESULT: 'result',
        ERROR: 'error'
    });
});

ava('exposes the recognition state and backend vocabularies', (t) => {
    t.deepEqual(RECOGNITION_STATE, {
        IDLE: 'idle',
        LOADING: 'loading',
        READY: 'ready',
        TRANSCRIBING: 'transcribing',
        ERROR: 'error',
        DESTROYED: 'destroyed'
    });
    t.deepEqual(RECOGNITION_BACKEND, {
        WEBGPU: 'webgpu',
        WASM: 'wasm'
    });
});

// -------------------------------------------------------------------------- //
// builders round-trip through the matching parser
// -------------------------------------------------------------------------- //

ava('client builders round-trip through parseClientMessage', (t) => {
    const audio = new Float32Array([1, 2, 3]).buffer;

    t.deepEqual(parseClientMessage(createLoadMessage()), { type: 'load' });
    t.deepEqual(
        parseClientMessage(createTranscribeMessage(7, audio, 16000, 0, 3)),
        { type: 'transcribe', requestId: 7, audio, sampleRate: 16000, byteOffset: 0, length: 3 }
    );
    t.deepEqual(parseClientMessage(createCancelMessage(7)), { type: 'cancel', requestId: 7 });
    t.deepEqual(parseClientMessage(createDestroyMessage()), { type: 'destroy' });
});

ava('worker builders round-trip through parseWorkerMessage', (t) => {
    t.deepEqual(
        parseWorkerMessage(createStateMessage(RECOGNITION_STATE.READY, RECOGNITION_BACKEND.WASM)),
        { type: 'state', state: 'ready', backend: 'wasm' }
    );
    t.deepEqual(
        parseWorkerMessage(createProgressMessage({ phase: 'download', requestId: 4, loaded: 10, total: 20, backend: 'webgpu' })),
        { type: 'progress', phase: 'download', requestId: 4, loaded: 10, total: 20, backend: 'webgpu' }
    );
    t.deepEqual(
        parseWorkerMessage(createResultMessage(4, 'turn left heading 090')),
        { type: 'result', requestId: 4, text: 'turn left heading 090' }
    );
    t.deepEqual(
        parseWorkerMessage(createErrorMessage('boom', { requestId: 4, state: RECOGNITION_STATE.ERROR })),
        { type: 'error', message: 'boom', requestId: 4, state: 'error' }
    );
});

ava('createStateMessage omits an absent backend', (t) => {
    t.deepEqual(createStateMessage(RECOGNITION_STATE.LOADING), { type: 'state', state: 'loading' });
});

// -------------------------------------------------------------------------- //
// parseClientMessage fails closed on malformed input
// -------------------------------------------------------------------------- //

ava('parseClientMessage returns null for non-object or unknown input', (t) => {
    t.is(parseClientMessage(null), null);
    t.is(parseClientMessage(undefined), null);
    t.is(parseClientMessage('load'), null);
    t.is(parseClientMessage(42), null);
    t.is(parseClientMessage({}), null);
    t.is(parseClientMessage({ type: 'nope' }), null);
});

ava('parseClientMessage rejects a malformed transcribe message', (t) => {
    const audio = new Float32Array([1]).buffer;

    t.is(parseClientMessage({ type: 'transcribe' }), null, 'missing fields');
    t.is(parseClientMessage({ type: 'transcribe', requestId: '1', audio, sampleRate: 16000, byteOffset: 0, length: 1 }), null, 'requestId not a number');
    t.is(parseClientMessage({ type: 'transcribe', requestId: 1, audio: [1, 2], sampleRate: 16000, byteOffset: 0, length: 1 }), null, 'audio not an ArrayBuffer');
    t.is(parseClientMessage({ type: 'transcribe', requestId: 1, audio, sampleRate: 0, byteOffset: 0, length: 1 }), null, 'non-positive sample rate');
});

ava('parseClientMessage rejects a transcribe buffer outside the exact PCM contract', (t) => {
    const audio = new Float32Array([1, 2]).buffer;

    t.is(parseClientMessage(createTranscribeMessage(1, audio, 8000, 0, 2)), null, 'sample rate must be 16 kHz');
    t.is(parseClientMessage(createTranscribeMessage(1, audio, 16000, 1, 1)), null, 'byte offset must be float-aligned');
    t.is(parseClientMessage(createTranscribeMessage(1, audio, 16000, 4, 2)), null, 'view must fit inside the buffer');
    t.is(parseClientMessage(createTranscribeMessage(1.5, audio, 16000, 0, 2)), null, 'request id must be an integer');
});

ava('parseClientMessage rejects a malformed cancel message', (t) => {
    t.is(parseClientMessage({ type: 'cancel' }), null);
    t.is(parseClientMessage({ type: 'cancel', requestId: 'x' }), null);
    t.is(parseClientMessage({ type: 'cancel', requestId: 1.5 }), null);
});

// -------------------------------------------------------------------------- //
// parseWorkerMessage fails closed on malformed input
// -------------------------------------------------------------------------- //

ava('parseWorkerMessage returns null for non-object or unknown input', (t) => {
    t.is(parseWorkerMessage(null), null);
    t.is(parseWorkerMessage('result'), null);
    t.is(parseWorkerMessage({}), null);
    t.is(parseWorkerMessage({ type: 'unknown' }), null);
});

ava('parseWorkerMessage rejects a malformed state message', (t) => {
    t.is(parseWorkerMessage({ type: 'state' }), null, 'missing state');
    t.is(parseWorkerMessage({ type: 'state', state: 'flying' }), null, 'unknown state');
    t.is(parseWorkerMessage({ type: 'state', state: 'ready', backend: 'quantum' }), null, 'unknown backend');
});

ava('parseWorkerMessage rejects a malformed result message', (t) => {
    t.is(parseWorkerMessage({ type: 'result', requestId: 1 }), null, 'missing text');
    t.is(parseWorkerMessage({ type: 'result', requestId: 1, text: 42 }), null, 'text not a string');
    t.is(parseWorkerMessage({ type: 'result', text: 'hi' }), null, 'missing requestId');
});

ava('parseWorkerMessage rejects a malformed error message', (t) => {
    t.is(parseWorkerMessage({ type: 'error' }), null, 'missing message');
    t.is(parseWorkerMessage({ type: 'error', message: 5 }), null, 'message not a string');
});

ava('parseWorkerMessage rejects a malformed progress message', (t) => {
    t.is(parseWorkerMessage({ type: 'progress' }), null, 'missing phase');
    t.is(parseWorkerMessage({ type: 'progress', phase: 7 }), null, 'phase not a string');
});
