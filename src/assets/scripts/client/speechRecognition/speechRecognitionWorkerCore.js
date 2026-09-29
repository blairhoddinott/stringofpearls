import {
    CLIENT_MESSAGE_TYPE,
    RECOGNITION_STATE,
    RECOGNITION_BACKEND,
    parseClientMessage,
    createStateMessage,
    createProgressMessage,
    createResultMessage,
    createErrorMessage
} from './workerProtocol';

/**
 * The browser-free, dependency-injected core of the speech-recognition worker.
 *
 * All host coupling is injected — a `createPipeline(backend, { onProgress })`
 * factory (the only thing that touches Transformers.js), a `postMessage`
 * sink, and a `hasWebGpu()` probe — so the lifecycle, the WebGPU→WASM fallback
 * seam, progress forwarding, and stale-result suppression are all unit-testable
 * without a real worker, `self`, or a model download. The thin worker entry
 * (`speechRecognitionWorker.js`) wires the real dependencies to this core.
 *
 * The runtime never falls back to any remote speech API: if both local
 * backends fail to load, it reports an error. A pipeline is cached per backend.
 *
 * @function createWorkerRuntime
 * @param dependencies {object}
 * @param dependencies.createPipeline {Function}  `(backend, { onProgress }) => Promise<(pcm) => Promise<{ text }>>`
 * @param dependencies.postMessage {Function}  `(message) => void`
 * @param dependencies.hasWebGpu {Function}  `() => boolean|Promise<boolean>`
 * @return {{ handleMessage: (data: *) => void }}
 */
export const createWorkerRuntime = ({ createPipeline, postMessage, hasWebGpu }) => {
    const pipelinesByBackend = new Map();
    let currentBackend = null;
    let loadPromise = null;
    let activeTranscription = null;

    const post = (message) => postMessage(message);

    const forwardProgress = (progress, backend) => {
        post(createProgressMessage({
            phase: typeof progress.status === 'string' ? progress.status : 'download',
            loaded: progress.loaded,
            total: progress.total,
            backend
        }));
    };

    const createForBackend = async (backend) => {
        if (pipelinesByBackend.has(backend)) {
            currentBackend = backend;

            return pipelinesByBackend.get(backend);
        }

        const asr = await createPipeline(backend, {
            onProgress: (progress) => forwardProgress(progress || {}, backend)
        });

        pipelinesByBackend.set(backend, asr);
        currentBackend = backend;

        return asr;
    };

    const createWithFallback = async () => {
        const backends = await hasWebGpu()
            ? [RECOGNITION_BACKEND.WEBGPU, RECOGNITION_BACKEND.WASM]
            : [RECOGNITION_BACKEND.WASM];
        let lastError = null;

        for (let index = 0; index < backends.length; index += 1) {
            const backend = backends[index];

            try {
                return await createForBackend(backend);
            } catch (error) {
                lastError = error;

                const nextBackend = backends[index + 1];

                if (nextBackend !== undefined) {
                    // Report the fallback so the UI can explain the switch; the
                    // retry stays entirely local (no remote speech API).
                    post(createProgressMessage({ phase: 'fallback', backend: nextBackend }));
                }
            }
        }

        throw lastError || new Error('failed to load a local recognition pipeline');
    };

    const ensurePipeline = () => {
        if (currentBackend !== null && pipelinesByBackend.has(currentBackend)) {
            return Promise.resolve(pipelinesByBackend.get(currentBackend));
        }

        if (loadPromise === null) {
            loadPromise = createWithFallback().finally(() => {
                loadPromise = null;
            });
        }

        return loadPromise;
    };

    const load = async () => {
        post(createStateMessage(RECOGNITION_STATE.LOADING));

        try {
            await ensurePipeline();
            post(createStateMessage(RECOGNITION_STATE.READY, currentBackend));
        } catch (error) {
            post(createErrorMessage(error.message, { state: RECOGNITION_STATE.ERROR }));
        }
    };

    const extractText = (output) => {
        if (output && typeof output.text === 'string') {
            return output.text;
        }

        if (Array.isArray(output) && output[0] && typeof output[0].text === 'string') {
            return output[0].text;
        }

        return '';
    };

    const transcribe = async (message) => {
        const { requestId, audio, byteOffset, length } = message;
        const pcm = new Float32Array(audio, byteOffset, length);
        const record = { requestId, cancelled: false };
        activeTranscription = record;

        post(createStateMessage(RECOGNITION_STATE.TRANSCRIBING));

        try {
            const asr = await ensurePipeline();
            const output = await asr(pcm);

            if (record.cancelled || activeTranscription !== record) {
                return;
            }

            activeTranscription = null;
            post(createResultMessage(requestId, extractText(output)));
            post(createStateMessage(RECOGNITION_STATE.READY, currentBackend));
        } catch (error) {
            if (record.cancelled || activeTranscription !== record) {
                return;
            }

            activeTranscription = null;
            post(createErrorMessage(error.message, { requestId, state: RECOGNITION_STATE.READY }));
        }
    };

    const cancel = (message) => {
        if (activeTranscription && activeTranscription.requestId === message.requestId) {
            activeTranscription.cancelled = true;
            activeTranscription = null;
            post(createStateMessage(RECOGNITION_STATE.READY, currentBackend));
        }
    };

    const destroy = () => {
        if (activeTranscription) {
            activeTranscription.cancelled = true;
            activeTranscription = null;
        }

        post(createStateMessage(RECOGNITION_STATE.DESTROYED));
    };

    const handleMessage = (data) => {
        const message = parseClientMessage(data);

        if (message === null) {
            return;
        }

        switch (message.type) {
            case CLIENT_MESSAGE_TYPE.LOAD:
                load();
                break;
            case CLIENT_MESSAGE_TYPE.TRANSCRIBE:
                transcribe(message);
                break;
            case CLIENT_MESSAGE_TYPE.CANCEL:
                cancel(message);
                break;
            case CLIENT_MESSAGE_TYPE.DESTROY:
                destroy();
                break;
            default:
                break;
        }
    };

    return { handleMessage };
};
