import ava from 'ava';

import {
    configureWorkerEnvironment,
    hasUsableWebGpu
} from '../../src/assets/scripts/client/speechRecognition/workerEnvironment';

ava('configures model and ONNX runtime loading for local worker assets', (t) => {
    const transformersEnvironment = {
        allowLocalModels: true,
        backends: { onnx: { wasm: {} } }
    };

    configureWorkerEnvironment(
        transformersEnvironment,
        'http://localhost:3003/assets/scripts/client/speech-recognition-worker.min.js'
    );

    t.false(transformersEnvironment.allowLocalModels);
    t.deepEqual(transformersEnvironment.backends.onnx.wasm.wasmPaths, {
        mjs: 'http://localhost:3003/assets/scripts/client/ort-wasm-simd-threaded.asyncify.mjs',
        wasm: 'http://localhost:3003/assets/scripts/client/ort-wasm-simd-threaded.asyncify.wasm'
    });
});

ava('rejects an unavailable ONNX WASM environment instead of silently using a runtime CDN', (t) => {
    const error = t.throws(() => configureWorkerEnvironment({ backends: {} }, 'http://localhost/worker.js'));

    t.regex(error.message, /ONNX WASM environment/);
});

ava('WebGPU is usable only when an adapter can actually be acquired', async (t) => {
    t.false(await hasUsableWebGpu({}));
    t.false(await hasUsableWebGpu({ gpu: { requestAdapter: async () => null } }));
    t.true(await hasUsableWebGpu({ gpu: { requestAdapter: async () => ({}) } }));
});

ava('a rejected WebGPU adapter probe fails closed to WASM', async (t) => {
    const navigatorTarget = { gpu: { requestAdapter: async () => { throw new Error('adapter failed'); } } };

    t.false(await hasUsableWebGpu(navigatorTarget));
});
