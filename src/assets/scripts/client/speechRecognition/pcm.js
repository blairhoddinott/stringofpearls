/**
 * Pure PCM helpers for turning decoded browser audio into the mono, 16 kHz
 * Float32 stream that the local Whisper worker expects.
 *
 * Every function here is deliberately free of browser globals: the caller
 * passes plain `Float32Array` channel data (or an AudioBuffer-shaped object
 * exposing `numberOfChannels`, `sampleRate`, and `getChannelData(index)`), so
 * the module stays trivially unit-testable and safe to import on the main
 * thread. Nothing here performs I/O or references `window`, `AudioContext`, or
 * any other host capability.
 *
 * @fileoverview
 */

/**
 * The sample rate Whisper models operate at.
 *
 * @property TARGET_SAMPLE_RATE
 * @type {number}
 * @final
 */
export const TARGET_SAMPLE_RATE = 16000;

/**
 * Average one or more equal-length channels into a single mono channel.
 *
 * The result is always a freshly allocated `Float32Array`, so a single-channel
 * input is returned as an independent copy rather than the caller's buffer.
 *
 * @function downmixToMono
 * @param channels {array<Float32Array>}  one entry per channel, all equal length
 * @return {Float32Array}  the mono average
 */
export const downmixToMono = (channels) => {
    if (!Array.isArray(channels) || channels.length === 0) {
        throw new TypeError('channels must be a non-empty array of Float32Array');
    }

    for (const channel of channels) {
        if (!(channel instanceof Float32Array)) {
            throw new TypeError('each channel must be a Float32Array');
        }

        if (channel.length !== channels[0].length) {
            throw new RangeError('every channel must have the same length');
        }
    }

    const frames = channels[0].length;
    const channelCount = channels.length;
    const mono = new Float32Array(frames);

    for (let frame = 0; frame < frames; frame += 1) {
        let sum = 0;

        for (let channel = 0; channel < channelCount; channel += 1) {
            sum += channels[channel][frame];
        }

        mono[frame] = sum / channelCount;
    }

    return mono;
};

/**
 * Resample a mono signal to a new sample rate using linear interpolation.
 *
 * The output length is `round(input.length * outputRate / inputRate)`. Positions
 * that fall between input samples are linearly interpolated; positions at or
 * past the final sample clamp to it. Matching rates yield an exact, independent
 * copy. An empty input yields an empty output.
 *
 * @function resampleLinear
 * @param samples {Float32Array}
 * @param inputSampleRate {number}
 * @param outputSampleRate {number}
 * @return {Float32Array}
 */
export const resampleLinear = (samples, inputSampleRate, outputSampleRate) => {
    if (!(samples instanceof Float32Array)) {
        throw new TypeError('samples must be a Float32Array');
    }

    if (
        !Number.isFinite(inputSampleRate) || inputSampleRate <= 0 ||
        !Number.isFinite(outputSampleRate) || outputSampleRate <= 0
    ) {
        throw new RangeError('sample rates must be positive finite numbers');
    }

    if (samples.length === 0) {
        return new Float32Array(0);
    }

    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.round(samples.length * outputSampleRate / inputSampleRate);
    const output = new Float32Array(outputLength);
    const lastIndex = samples.length - 1;

    for (let i = 0; i < outputLength; i += 1) {
        const position = i * ratio;
        const lowerIndex = Math.min(Math.floor(position), lastIndex);
        const upperIndex = Math.min(lowerIndex + 1, lastIndex);
        const fraction = position - lowerIndex;

        output[i] = samples[lowerIndex] * (1 - fraction) + samples[upperIndex] * fraction;
    }

    return output;
};

/**
 * Convert a decoded AudioBuffer into mono 16 kHz PCM.
 *
 * Accepts anything exposing the read-only slice of the `AudioBuffer` contract
 * used here (`numberOfChannels`, `sampleRate`, `getChannelData(index)`), so it
 * can be driven with plain fakes in tests.
 *
 * @function decodeAudioBufferToMono16k
 * @param audioBuffer {AudioBuffer}
 * @return {Float32Array}
 */
export const decodeAudioBufferToMono16k = (audioBuffer) => {
    if (
        audioBuffer === null ||
        typeof audioBuffer !== 'object' ||
        !Number.isInteger(audioBuffer.numberOfChannels) ||
        audioBuffer.numberOfChannels < 1 ||
        !Number.isFinite(audioBuffer.sampleRate) ||
        audioBuffer.sampleRate <= 0 ||
        typeof audioBuffer.getChannelData !== 'function'
    ) {
        throw new TypeError('audioBuffer is not a decoded AudioBuffer');
    }

    const channels = [];

    for (let index = 0; index < audioBuffer.numberOfChannels; index += 1) {
        channels.push(audioBuffer.getChannelData(index));
    }

    return resampleLinear(downmixToMono(channels), audioBuffer.sampleRate, TARGET_SAMPLE_RATE);
};
