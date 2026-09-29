/**
 * Worker entry for local, on-device speech recognition.
 *
 * This module runs *only* inside a Web Worker: it is the sole place that
 * references `self`, `navigator`, and Transformers.js, and it is never imported
 * by the main thread or the unit tests. All lifecycle logic lives in the
 * browser-free {@link createWorkerRuntime} core; this file just wires the real
 * dependencies to it.
 *
 * The pipeline is created lazily on the first `load` message. WebGPU is
 * preferred only when `navigator.gpu` exists; the core retries on WASM if the
 * WebGPU pipeline fails to load. Audio is always processed locally — there is
 * no remote speech API fallback. Model weights are not bundled; Transformers.js
 * downloads them from the hub, which happens only after the client is driven by
 * an explicit (future) user opt-in.
 *
 * @fileoverview
 */

import { pipeline, env } from '@huggingface/transformers';

import { MODEL_ID, RECOGNITION_BACKEND } from './workerProtocol';
import { createWorkerRuntime } from './speechRecognitionWorkerCore';

// Never probe a local `/models` path (which would 404 when served); the hub is
// the only weight source, and only after the user opts in upstream.
env.allowLocalModels = false;

const createPipeline = (backend, { onProgress }) => pipeline(
    'automatic-speech-recognition',
    MODEL_ID,
    {
        device: backend === RECOGNITION_BACKEND.WEBGPU ? 'webgpu' : 'wasm',
        progress_callback: onProgress
    }
);

const hasWebGpu = () => typeof navigator !== 'undefined' && Boolean(navigator.gpu);

const runtime = createWorkerRuntime({
    createPipeline,
    postMessage: (message) => self.postMessage(message),
    hasWebGpu
});

self.onmessage = (event) => runtime.handleMessage(event.data);
