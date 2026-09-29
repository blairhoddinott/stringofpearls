import ava from 'ava';

import {
    TARGET_SAMPLE_RATE,
    downmixToMono,
    resampleLinear,
    decodeAudioBufferToMono16k
} from '../../src/assets/scripts/client/speechRecognition/pcm';

const f32 = (values) => Float32Array.from(values);
const toArray = (typed) => Array.from(typed);

// -------------------------------------------------------------------------- //
// constants
// -------------------------------------------------------------------------- //

ava('TARGET_SAMPLE_RATE is 16 kHz', (t) => {
    t.is(TARGET_SAMPLE_RATE, 16000);
});

// -------------------------------------------------------------------------- //
// downmixToMono
// -------------------------------------------------------------------------- //

ava('downmixToMono returns an independent copy of a single channel', (t) => {
    const source = f32([1, 2, 3]);
    const mono = downmixToMono([source]);

    t.true(mono instanceof Float32Array);
    t.deepEqual(toArray(mono), [1, 2, 3]);
    t.not(mono, source, 'must not alias the input channel');

    mono[0] = 99;
    t.is(source[0], 1, 'mutating the result must not affect the input');
});

ava('downmixToMono averages two channels sample-by-sample', (t) => {
    const mono = downmixToMono([f32([0, 10]), f32([10, 20])]);

    t.deepEqual(toArray(mono), [5, 15]);
});

ava('downmixToMono averages three channels', (t) => {
    const mono = downmixToMono([f32([0, 3]), f32([3, 6]), f32([6, 9])]);

    t.deepEqual(toArray(mono), [3, 6]);
});

ava('downmixToMono preserves a zero-length boundary as empty mono', (t) => {
    const mono = downmixToMono([f32([]), f32([])]);

    t.true(mono instanceof Float32Array);
    t.is(mono.length, 0);
});

ava('downmixToMono rejects a non-array argument', (t) => {
    t.throws(() => downmixToMono(f32([1, 2])), { message: /channels must be a non-empty array/ });
    t.throws(() => downmixToMono(null), { message: /channels must be a non-empty array/ });
});

ava('downmixToMono rejects an empty channel list', (t) => {
    t.throws(() => downmixToMono([]), { message: /channels must be a non-empty array/ });
});

ava('downmixToMono rejects a non-Float32Array channel', (t) => {
    t.throws(() => downmixToMono([[1, 2, 3]]), { message: /each channel must be a Float32Array/ });
});

ava('downmixToMono rejects channels of differing lengths', (t) => {
    t.throws(() => downmixToMono([f32([1, 2]), f32([1, 2, 3])]), { message: /every channel must have the same length/ });
});

// -------------------------------------------------------------------------- //
// resampleLinear
// -------------------------------------------------------------------------- //

ava('resampleLinear returns an independent copy when rates match', (t) => {
    const source = f32([1, 2, 3]);
    const result = resampleLinear(source, 16000, 16000);

    t.deepEqual(toArray(result), [1, 2, 3]);
    t.not(result, source);
    t.not(result.buffer, source.buffer, 'copy must not share the input buffer');
});

ava('resampleLinear upsamples 8 kHz to 16 kHz with linear interpolation', (t) => {
    const result = resampleLinear(f32([0, 10]), 8000, 16000);

    t.deepEqual(toArray(result), [0, 5, 10, 10]);
});

ava('resampleLinear downsamples 16 kHz to 8 kHz', (t) => {
    const result = resampleLinear(f32([0, 5, 10, 10]), 16000, 8000);

    t.deepEqual(toArray(result), [0, 10]);
});

ava('resampleLinear holds a single sample across an upsample', (t) => {
    const result = resampleLinear(f32([7]), 8000, 16000);

    t.deepEqual(toArray(result), [7, 7]);
});

ava('resampleLinear preserves an empty input as empty output', (t) => {
    const result = resampleLinear(f32([]), 8000, 16000);

    t.is(result.length, 0);
});

ava('resampleLinear rejects a non-Float32Array input', (t) => {
    t.throws(() => resampleLinear([1, 2, 3], 8000, 16000), { message: /samples must be a Float32Array/ });
});

ava('resampleLinear rejects non-positive or non-finite sample rates', (t) => {
    const samples = f32([1, 2, 3]);

    t.throws(() => resampleLinear(samples, 0, 16000), { message: /sample rates must be positive finite numbers/ });
    t.throws(() => resampleLinear(samples, 8000, -1), { message: /sample rates must be positive finite numbers/ });
    t.throws(() => resampleLinear(samples, Number.NaN, 16000), { message: /sample rates must be positive finite numbers/ });
    t.throws(() => resampleLinear(samples, 8000, Number.POSITIVE_INFINITY), { message: /sample rates must be positive finite numbers/ });
});

// -------------------------------------------------------------------------- //
// decodeAudioBufferToMono16k
// -------------------------------------------------------------------------- //

const fakeAudioBuffer = (channels, sampleRate) => ({
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData: (index) => channels[index]
});

ava('decodeAudioBufferToMono16k downmixes then resamples to 16 kHz', (t) => {
    const buffer = fakeAudioBuffer([f32([0, 10]), f32([10, 20])], 8000);
    const result = decodeAudioBufferToMono16k(buffer);

    // mono = [5, 15]; upsampled 8k->16k = [5, 10, 15, 15]
    t.deepEqual(toArray(result), [5, 10, 15, 15]);
});

ava('decodeAudioBufferToMono16k returns a downmixed copy when already 16 kHz', (t) => {
    const source = f32([1, 2, 3]);
    const buffer = fakeAudioBuffer([source], 16000);
    const result = decodeAudioBufferToMono16k(buffer);

    t.deepEqual(toArray(result), [1, 2, 3]);
    t.not(result.buffer, source.buffer);
});

ava('decodeAudioBufferToMono16k rejects an invalid AudioBuffer', (t) => {
    t.throws(() => decodeAudioBufferToMono16k(null), { message: /audioBuffer is not a decoded AudioBuffer/ });
    t.throws(() => decodeAudioBufferToMono16k({ numberOfChannels: 0, sampleRate: 16000, getChannelData: () => f32([]) }), { message: /audioBuffer is not a decoded AudioBuffer/ });
    t.throws(() => decodeAudioBufferToMono16k({ numberOfChannels: 1, sampleRate: 0, getChannelData: () => f32([1]) }), { message: /audioBuffer is not a decoded AudioBuffer/ });
    t.throws(() => decodeAudioBufferToMono16k({ numberOfChannels: 1, sampleRate: 16000 }), { message: /audioBuffer is not a decoded AudioBuffer/ });
});
