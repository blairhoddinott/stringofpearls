import ava from 'ava';
import sinon from 'sinon';

import { createWorkerRuntime } from '../../src/assets/scripts/client/speechRecognition/speechRecognitionWorkerCore';
import {
    RECOGNITION_STATE,
    RECOGNITION_BACKEND,
    createLoadMessage,
    createTranscribeMessage,
    createCancelMessage,
    createDestroyMessage
} from '../../src/assets/scripts/client/speechRecognition/workerProtocol';

const flush = () => new Promise((resolve) => setImmediate(resolve));

const pcmMessage = (requestId, values) => {
    const pcm = Float32Array.from(values);

    return createTranscribeMessage(requestId, pcm.buffer, 16000, pcm.byteOffset, pcm.length);
};

// Build a runtime with controllable dependencies. `asr` is the transcriber the
// injected pipeline factory resolves to; `pipelineBehavior` lets a test fail a
// specific backend to exercise the fallback seam.
const buildRuntime = ({ hasWebGpu = false, asr, pipelineBehavior } = {}) => {
    const posts = [];
    const postMessage = (message) => posts.push(message);
    const transcriber = asr || sinon.stub().resolves({ text: 'default transcript' });
    const createPipeline = sinon.spy(async (backend, { onProgress }) => {
        if (pipelineBehavior) {
            return pipelineBehavior(backend, { onProgress, transcriber });
        }

        return transcriber;
    });
    const runtime = createWorkerRuntime({
        createPipeline,
        postMessage,
        hasWebGpu: () => hasWebGpu
    });

    const postsOfType = (type) => posts.filter((message) => message.type === type);

    return { runtime, posts, postsOfType, createPipeline, transcriber };
};

// -------------------------------------------------------------------------- //
// load + backend selection
// -------------------------------------------------------------------------- //

ava('load reports loading then ready on the wasm backend when WebGPU is absent', async (t) => {
    const { runtime, posts, createPipeline } = buildRuntime({ hasWebGpu: false });

    runtime.handleMessage(createLoadMessage());
    await flush();

    t.true(createPipeline.calledOnceWith(RECOGNITION_BACKEND.WASM));
    t.deepEqual(posts[0], { type: 'state', state: RECOGNITION_STATE.LOADING });
    t.deepEqual(posts[posts.length - 1], { type: 'state', state: RECOGNITION_STATE.READY, backend: RECOGNITION_BACKEND.WASM });
});

ava('load prefers WebGPU when navigator.gpu exists', async (t) => {
    const { runtime, posts, createPipeline } = buildRuntime({ hasWebGpu: true });

    runtime.handleMessage(createLoadMessage());
    await flush();

    t.true(createPipeline.calledWith(RECOGNITION_BACKEND.WEBGPU));
    t.deepEqual(posts[posts.length - 1], { type: 'state', state: RECOGNITION_STATE.READY, backend: RECOGNITION_BACKEND.WEBGPU });
});

ava('a WebGPU load failure reports fallback progress and retries on WASM', async (t) => {
    const wasmAsr = sinon.stub().resolves({ text: 'ok' });
    const { runtime, posts, postsOfType, createPipeline } = buildRuntime({
        hasWebGpu: true,
        pipelineBehavior: (backend) => {
            if (backend === RECOGNITION_BACKEND.WEBGPU) {
                return Promise.reject(new Error('WebGPU adapter unavailable'));
            }

            return Promise.resolve(wasmAsr);
        }
    });

    runtime.handleMessage(createLoadMessage());
    await flush();

    t.true(createPipeline.calledWith(RECOGNITION_BACKEND.WEBGPU));
    t.true(createPipeline.calledWith(RECOGNITION_BACKEND.WASM));

    const fallbackProgress = postsOfType('progress').find((message) => message.phase === 'fallback');
    t.truthy(fallbackProgress, 'a fallback progress message is emitted');
    t.is(fallbackProgress.backend, RECOGNITION_BACKEND.WASM);

    t.deepEqual(posts[posts.length - 1], { type: 'state', state: RECOGNITION_STATE.READY, backend: RECOGNITION_BACKEND.WASM });
});

ava('load reports an error when every backend fails, never falling back to a remote API', async (t) => {
    const { runtime, postsOfType } = buildRuntime({
        hasWebGpu: true,
        pipelineBehavior: () => Promise.reject(new Error('no backend available'))
    });

    runtime.handleMessage(createLoadMessage());
    await flush();

    const errors = postsOfType('error');
    t.is(errors.length, 1);
    t.is(errors[0].state, RECOGNITION_STATE.ERROR);
    t.regex(errors[0].message, /no backend available/);
});

ava('forwards model-download progress with the active backend', async (t) => {
    const { runtime, postsOfType } = buildRuntime({
        hasWebGpu: false,
        pipelineBehavior: (backend, { onProgress, transcriber }) => {
            onProgress({ status: 'download', loaded: 3, total: 12 });
            return Promise.resolve(transcriber);
        }
    });

    runtime.handleMessage(createLoadMessage());
    await flush();

    const download = postsOfType('progress').find((message) => message.phase === 'download');
    t.truthy(download);
    t.is(download.loaded, 3);
    t.is(download.total, 12);
    t.is(download.backend, RECOGNITION_BACKEND.WASM);
});

ava('the pipeline is cached per backend across loads', async (t) => {
    const { runtime, createPipeline } = buildRuntime({ hasWebGpu: false });

    runtime.handleMessage(createLoadMessage());
    await flush();
    runtime.handleMessage(createLoadMessage());
    await flush();

    t.is(createPipeline.callCount, 1, 'the cached pipeline is reused');
});

// -------------------------------------------------------------------------- //
// transcribe
// -------------------------------------------------------------------------- //

ava('transcribe runs the pipeline and posts the local transcript text only', async (t) => {
    const transcriber = sinon.stub().resolves({ text: 'american 123 turn left', chunks: ['sensitive-internal'] });
    const { runtime, posts, postsOfType } = buildRuntime({ hasWebGpu: false, asr: transcriber });

    runtime.handleMessage(createLoadMessage());
    await flush();
    runtime.handleMessage(pcmMessage(9, [0.1, 0.2, 0.3]));
    await flush();

    t.deepEqual(Array.from(transcriber.firstCall.args[0]), [0.1, 0.2, 0.3].map((v) => Math.fround(v)));

    const result = postsOfType('result')[0];
    t.deepEqual(result, { type: 'result', requestId: 9, text: 'american 123 turn left' });
    t.deepEqual(posts[posts.length - 1], { type: 'state', state: RECOGNITION_STATE.READY, backend: RECOGNITION_BACKEND.WASM });
});

ava('a cancelled transcription never publishes its result', async (t) => {
    let resolveAsr;
    const transcriber = sinon.stub().returns(new Promise((resolve) => { resolveAsr = resolve; }));
    const { runtime, postsOfType } = buildRuntime({ hasWebGpu: false, asr: transcriber });

    runtime.handleMessage(createLoadMessage());
    await flush();
    runtime.handleMessage(pcmMessage(5, [1, 2, 3]));
    await flush();

    runtime.handleMessage(createCancelMessage(5));
    resolveAsr({ text: 'stale transcript' });
    await flush();

    t.is(postsOfType('result').length, 0, 'no result is published for the cancelled request');
    const lastState = postsOfType('state').pop();
    t.is(lastState.state, RECOGNITION_STATE.READY);
});

ava('a transcribe failure reports an error and restores the ready state', async (t) => {
    const transcriber = sinon.stub().rejects(new Error('inference failed'));
    const { runtime, postsOfType } = buildRuntime({ hasWebGpu: false, asr: transcriber });

    runtime.handleMessage(createLoadMessage());
    await flush();
    runtime.handleMessage(pcmMessage(2, [1, 2]));
    await flush();

    const error = postsOfType('error')[0];
    t.is(error.requestId, 2);
    t.regex(error.message, /inference failed/);
    t.is(error.state, RECOGNITION_STATE.READY, 'the pipeline stays usable after a transcription error');
});

// -------------------------------------------------------------------------- //
// destroy + malformed input
// -------------------------------------------------------------------------- //

ava('destroy cancels active work and reports the destroyed state', async (t) => {
    let resolveAsr;
    const transcriber = sinon.stub().returns(new Promise((resolve) => { resolveAsr = resolve; }));
    const { runtime, postsOfType } = buildRuntime({ hasWebGpu: false, asr: transcriber });

    runtime.handleMessage(createLoadMessage());
    await flush();
    runtime.handleMessage(pcmMessage(1, [1]));
    await flush();

    runtime.handleMessage(createDestroyMessage());
    resolveAsr({ text: 'too late' });
    await flush();

    t.is(postsOfType('result').length, 0);
    t.is(postsOfType('state').pop().state, RECOGNITION_STATE.DESTROYED);
});

ava('malformed client messages are ignored (fail closed)', async (t) => {
    const { runtime, posts } = buildRuntime({ hasWebGpu: false });

    runtime.handleMessage(null);
    runtime.handleMessage('garbage');
    runtime.handleMessage({ type: 'nope' });
    runtime.handleMessage({});
    await flush();

    t.is(posts.length, 0, 'no message produces any output');
});
