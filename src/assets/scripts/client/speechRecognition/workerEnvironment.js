const WASM_FACTORY_FILENAME = 'ort-wasm-simd-threaded.asyncify.mjs';
const WASM_BINARY_FILENAME = 'ort-wasm-simd-threaded.asyncify.wasm';

/**
 * Keep model discovery explicit and bind ONNX Runtime to the WASM artifacts
 * shipped beside the generated speech worker. This prevents ONNX Runtime from
 * silently importing executable runtime code from its default CDN.
 *
 * @param {object} transformersEnvironment Transformers.js `env`
 * @param {string} workerUrl absolute URL of the generated worker
 * @return {object} the configured environment
 */
export const configureWorkerEnvironment = (transformersEnvironment, workerUrl) => {
    const wasmEnvironment = transformersEnvironment
        && transformersEnvironment.backends
        && transformersEnvironment.backends.onnx
        && transformersEnvironment.backends.onnx.wasm;

    if (wasmEnvironment === null || typeof wasmEnvironment !== 'object') {
        throw new Error('Transformers.js ONNX WASM environment is unavailable');
    }

    const assetBaseUrl = new URL('.', workerUrl);

    transformersEnvironment.allowLocalModels = false;
    wasmEnvironment.wasmPaths = {
        mjs: new URL(WASM_FACTORY_FILENAME, assetBaseUrl).href,
        wasm: new URL(WASM_BINARY_FILENAME, assetBaseUrl).href
    };

    return transformersEnvironment;
};

/**
 * `navigator.gpu` existing does not mean a usable adapter exists. Chromium can
 * expose the API while GPU access is unavailable; attempting ONNX WebGPU in
 * that state poisons its serialized session-initialization chain and prevents
 * the intended WASM retry.
 */
export const hasUsableWebGpu = async (navigatorTarget) => {
    if (!navigatorTarget || !navigatorTarget.gpu || typeof navigatorTarget.gpu.requestAdapter !== 'function') {
        return false;
    }

    try {
        return Boolean(await navigatorTarget.gpu.requestAdapter());
    } catch {
        return false;
    }
};
