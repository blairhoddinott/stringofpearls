import ava from 'ava';
import sinon from 'sinon';

import SpeechRecognitionClient from '../../src/assets/scripts/client/speechRecognition/SpeechRecognitionClient';
import {
    RECOGNITION_STATE,
    RECOGNITION_BACKEND,
    parseClientMessage,
    createStateMessage,
    createProgressMessage,
    createResultMessage,
    createErrorMessage
} from '../../src/assets/scripts/client/speechRecognition/workerProtocol';

// A narrow fake of the browser Worker contract the client is built around: it
// records posted messages (and their transferables) and lets a test drive the
// worker side by emitting message/error events.
class FakeWorker {
    constructor() {
        this.onmessage = null;
        this.onerror = null;
        this.posted = [];
        this.terminated = false;
    }

    postMessage(message, transfer) {
        this.posted.push({ message, transfer });
    }

    terminate() {
        this.terminated = true;
    }

    emit(data) {
        if (this.onmessage) {
            this.onmessage({ data });
        }
    }

    emitError(error) {
        if (this.onerror) {
            this.onerror(error);
        }
    }

    lastOfType(type) {
        return [...this.posted].reverse().find(({ message }) => message && message.type === type);
    }
}

const newClient = (overrides = {}) => {
    const worker = new FakeWorker();
    const onProgress = sinon.spy();
    const onStateChange = sinon.spy();
    const client = new SpeechRecognitionClient({ worker, onProgress, onStateChange, ...overrides });

    return { client, worker, onProgress, onStateChange };
};

// Drive the client to the ready state.
const loadToReady = async (client, worker, backend = RECOGNITION_BACKEND.WASM) => {
    const loaded = client.load();
    worker.emit(createStateMessage(RECOGNITION_STATE.READY, backend));
    await loaded;
};

// -------------------------------------------------------------------------- //
// lifecycle
// -------------------------------------------------------------------------- //

ava('starts idle and posts a load message that resolves when the worker reports ready', async (t) => {
    const { client, worker, onStateChange } = newClient();

    t.is(client.state, RECOGNITION_STATE.IDLE);

    const loaded = client.load();

    t.is(client.state, RECOGNITION_STATE.LOADING);
    t.deepEqual(parseClientMessage(worker.lastOfType('load').message), { type: 'load' });

    worker.emit(createStateMessage(RECOGNITION_STATE.READY, RECOGNITION_BACKEND.WASM));
    await loaded;

    t.is(client.state, RECOGNITION_STATE.READY);
    t.true(onStateChange.calledWith(RECOGNITION_STATE.LOADING));
    t.true(onStateChange.calledWith(RECOGNITION_STATE.READY));
});

ava('load rejects and enters the error state when the worker reports a load error', async (t) => {
    const { client, worker } = newClient();
    const loaded = client.load();

    worker.emit(createErrorMessage('model download failed', { state: RECOGNITION_STATE.ERROR }));

    await t.throwsAsync(loaded, { message: /model download failed/ });
    t.is(client.state, RECOGNITION_STATE.ERROR);
});

ava('transcribe before load rejects without posting a transcribe message', async (t) => {
    const { client, worker } = newClient();

    await t.throwsAsync(client.transcribe(new Float32Array([1, 2, 3])), { message: /not ready/ });
    t.is(worker.lastOfType('transcribe'), undefined);
});

ava('transcribe rejects empty PCM without posting work that can never resolve', async (t) => {
    const { client, worker } = newClient();
    await loadToReady(client, worker);

    await t.throwsAsync(client.transcribe(new Float32Array(0)), { message: /empty|samples/ });
    t.is(worker.lastOfType('transcribe'), undefined);
});

ava('transcribe transfers the exact PCM ArrayBuffer and resolves the worker transcript', async (t) => {
    const { client, worker } = newClient();
    await loadToReady(client, worker);

    const pcm = new Float32Array([0.1, 0.2, 0.3]);
    const { buffer } = pcm;
    const pending = client.transcribe(pcm);

    t.is(client.state, RECOGNITION_STATE.TRANSCRIBING);

    const posted = worker.lastOfType('transcribe');
    const parsed = parseClientMessage(posted.message);
    t.is(parsed.audio, buffer, 'the exact PCM buffer is sent (ownership transfers to the worker)');
    t.is(parsed.sampleRate, 16000);
    t.is(parsed.length, 3);
    t.deepEqual(posted.transfer, [buffer], 'the buffer is listed as transferable');

    worker.emit(createResultMessage(parsed.requestId, 'american 123 turn left'));

    t.is(await pending, 'american 123 turn left');
    t.is(client.state, RECOGNITION_STATE.READY);
});

ava('only one transcription runs at a time', async (t) => {
    const { client, worker } = newClient();
    await loadToReady(client, worker);

    const first = client.transcribe(new Float32Array([1]));
    const second = client.transcribe(new Float32Array([2]));

    await t.throwsAsync(second, { message: /already transcribing/ });

    const firstRequest = parseClientMessage(worker.lastOfType('transcribe').message).requestId;
    worker.emit(createResultMessage(firstRequest, 'ok'));

    t.is(await first, 'ok');
});

ava('forwards worker progress to the progress callback', async (t) => {
    const { client, worker, onProgress } = newClient();
    const loaded = client.load();

    worker.emit(createProgressMessage({ phase: 'download', loaded: 5, total: 10 }));
    worker.emit(createStateMessage(RECOGNITION_STATE.READY, RECOGNITION_BACKEND.WASM));
    await loaded;

    t.true(onProgress.calledOnce);
    t.deepEqual(onProgress.firstCall.args[0], { type: 'progress', phase: 'download', loaded: 5, total: 10 });
});

// -------------------------------------------------------------------------- //
// cancel / stale results
// -------------------------------------------------------------------------- //

ava('cancel rejects the active transcription and ignores its late result', async (t) => {
    const { client, worker } = newClient();
    await loadToReady(client, worker);

    const pcm = new Float32Array([1, 2, 3]);
    const pending = client.transcribe(pcm);
    const staleRequestId = parseClientMessage(worker.lastOfType('transcribe').message).requestId;

    client.cancel();

    t.deepEqual(parseClientMessage(worker.lastOfType('cancel').message), { type: 'cancel', requestId: staleRequestId });
    await t.throwsAsync(pending, { message: /cancelled/ });
    t.is(client.state, RECOGNITION_STATE.READY);

    // The canceled request's result must never surface.
    worker.emit(createResultMessage(staleRequestId, 'stale transcript'));

    // A fresh transcription still works and gets a distinct request id.
    const next = client.transcribe(new Float32Array([4, 5, 6]));
    const freshRequestId = parseClientMessage(worker.lastOfType('transcribe').message).requestId;
    t.not(freshRequestId, staleRequestId);

    worker.emit(createResultMessage(freshRequestId, 'fresh transcript'));
    t.is(await next, 'fresh transcript');
});

ava('a stale result for a superseded request id is ignored', async (t) => {
    const { client, worker } = newClient();
    await loadToReady(client, worker);

    const pending = client.transcribe(new Float32Array([1]));
    const requestId = parseClientMessage(worker.lastOfType('transcribe').message).requestId;

    // A result for an unrelated/older id must not resolve the active request.
    worker.emit(createResultMessage(requestId - 1, 'wrong'));
    worker.emit(createResultMessage(requestId, 'right'));

    t.is(await pending, 'right');
});

ava('stale ready and error messages cannot disturb an active transcription', async (t) => {
    const { client, worker } = newClient();
    await loadToReady(client, worker);

    const pending = client.transcribe(new Float32Array([1]));
    const requestId = parseClientMessage(worker.lastOfType('transcribe').message).requestId;

    worker.emit(createStateMessage(RECOGNITION_STATE.READY, RECOGNITION_BACKEND.WASM));
    t.is(client.state, RECOGNITION_STATE.TRANSCRIBING);

    worker.emit(createErrorMessage('stale failure', {
        requestId: requestId - 1,
        state: RECOGNITION_STATE.READY
    }));
    t.is(client.state, RECOGNITION_STATE.TRANSCRIBING);

    worker.emit(createResultMessage(requestId, 'current result'));
    t.is(await pending, 'current result');
});

// -------------------------------------------------------------------------- //
// destroy
// -------------------------------------------------------------------------- //

ava('destroy terminates the worker, rejects pending work, and ignores later messages', async (t) => {
    const { client, worker } = newClient();
    await loadToReady(client, worker);

    const pending = client.transcribe(new Float32Array([1]));
    const requestId = parseClientMessage(worker.lastOfType('transcribe').message).requestId;

    client.destroy();

    t.true(worker.terminated);
    t.is(client.state, RECOGNITION_STATE.DESTROYED);
    await t.throwsAsync(pending, { message: /destroyed/ });

    // Late messages after destroy are ignored.
    worker.emit(createResultMessage(requestId, 'too late'));
    t.is(client.state, RECOGNITION_STATE.DESTROYED);

    await t.throwsAsync(client.transcribe(new Float32Array([2])), { message: /destroyed/ });
});

// -------------------------------------------------------------------------- //
// worker error + malformed messages fail closed
// -------------------------------------------------------------------------- //

ava('a worker error rejects the active transcription and restores a safe state', async (t) => {
    const { client, worker } = newClient();
    await loadToReady(client, worker);

    const pending = client.transcribe(new Float32Array([1]));

    worker.emitError(new Error('worker crashed'));

    await t.throwsAsync(pending, { message: /worker crashed|worker error/ });
    t.is(client.state, RECOGNITION_STATE.ERROR);
});

ava('malformed worker messages are ignored (fail closed)', async (t) => {
    const { client, worker } = newClient();
    await loadToReady(client, worker);

    const pending = client.transcribe(new Float32Array([1]));
    const requestId = parseClientMessage(worker.lastOfType('transcribe').message).requestId;

    worker.emit(null);
    worker.emit('garbage');
    worker.emit({ type: 'bogus' });
    worker.emit({});

    t.is(client.state, RECOGNITION_STATE.TRANSCRIBING, 'junk messages do not change state');

    worker.emit(createResultMessage(requestId, 'still works'));
    t.is(await pending, 'still works');
});

// -------------------------------------------------------------------------- //
// contract test: real worker result payload through the real client
// -------------------------------------------------------------------------- //

ava('contract: the exact worker RESULT payload flows through the real client', async (t) => {
    const { client, worker } = newClient();
    await loadToReady(client, worker);

    const pending = client.transcribe(new Float32Array([0.5]));
    const requestId = parseClientMessage(worker.lastOfType('transcribe').message).requestId;

    // Build the payload with the real protocol builder, exactly as the worker
    // would, and hand it to the client unchanged.
    const payload = createResultMessage(requestId, 'cleared ils runway one six left');
    worker.emit(payload);

    t.is(await pending, 'cleared ils runway one six left');
});
