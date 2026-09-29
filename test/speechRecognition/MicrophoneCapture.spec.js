import ava from 'ava';
import sinon from 'sinon';

import MicrophoneCapture from '../../src/assets/scripts/client/speechRecognition/MicrophoneCapture';

const fakeTrack = () => ({ readyState: 'live', stop: sinon.spy() });

const fakeStream = (tracks) => ({ getTracks: () => tracks });

// A controllable MediaRecorder fake. `stop()` synchronously delivers a data
// chunk then fires `onstop`, unless `autoStop` is false (used to hold a stop
// pending so destroy/error paths can be exercised).
class FakeRecorder {
    constructor(stream, { autoStop = true } = {}) {
        this.stream = stream;
        this.state = 'inactive';
        this.autoStop = autoStop;
        this.ondataavailable = null;
        this.onstop = null;
        this.onerror = null;
        this.startCount = 0;
    }

    start() {
        this.state = 'recording';
        this.startCount += 1;
    }

    stop() {
        this.state = 'inactive';

        if (!this.autoStop) {
            return;
        }

        if (this.ondataavailable) {
            this.ondataavailable({ data: 'chunk-1' });
        }

        if (this.onstop) {
            this.onstop();
        }
    }

    fireError(error) {
        if (this.onerror) {
            this.onerror({ error });
        }
    }
}

// A decoded buffer at 8 kHz mono so stop() must run the real resample to 16 kHz.
const decodedBuffer = {
    numberOfChannels: 1,
    sampleRate: 8000,
    getChannelData: () => Float32Array.from([0, 10])
};

const buildHarness = (overrides = {}) => {
    const tracks = [fakeTrack(), fakeTrack()];
    const stream = fakeStream(tracks);
    let recorder;
    const audioContext = {
        decodeAudioData: sinon.stub().resolves(decodedBuffer),
        close: sinon.spy(async () => {})
    };
    const getUserMedia = 'getUserMedia' in overrides ? overrides.getUserMedia : sinon.stub().resolves(stream);
    const createRecorder = overrides.createRecorder || ((incomingStream) => {
        recorder = new FakeRecorder(incomingStream, { autoStop: overrides.autoStop !== false });
        return recorder;
    });
    const createAudioContext = overrides.createAudioContext || (() => audioContext);
    const chunksToArrayBuffer = overrides.chunksToArrayBuffer || sinon.stub().resolves(new ArrayBuffer(8));

    const capture = new MicrophoneCapture({
        getUserMedia,
        createRecorder,
        createAudioContext,
        chunksToArrayBuffer
    });

    return {
        capture,
        getRecorder: () => recorder,
        audioContext,
        getUserMedia,
        chunksToArrayBuffer,
        stream,
        tracks
    };
};

// -------------------------------------------------------------------------- //
// start
// -------------------------------------------------------------------------- //

ava('does not touch getUserMedia until start() is called', (t) => {
    const { getUserMedia } = buildHarness();

    t.true(getUserMedia.notCalled);
});

ava('start requests audio-only once and starts the recorder', async (t) => {
    const { capture, getUserMedia, getRecorder } = buildHarness();

    await capture.start();

    t.true(getUserMedia.calledOnceWithExactly({ audio: true }));
    t.is(getRecorder().startCount, 1);
});

ava('start rejects and leaks no tracks when permission is denied', async (t) => {
    const denial = new Error('Permission denied');
    const { capture, getUserMedia } = buildHarness({ getUserMedia: sinon.stub().rejects(denial) });

    await t.throwsAsync(capture.start(), { is: denial }, 'the original error is preserved');
    t.true(getUserMedia.calledOnce);

    // Nothing was acquired, so stop() has no active capture.
    await t.throwsAsync(capture.stop(), { message: /not (started|capturing)/ });
});

ava('start rejects when the microphone API is unavailable', async (t) => {
    const { capture } = buildHarness({ getUserMedia: null });

    await t.throwsAsync(capture.start(), { message: /not supported|unavailable/ });
});

ava('starting twice rejects the second attempt', async (t) => {
    const { capture } = buildHarness();

    await capture.start();
    await t.throwsAsync(capture.start(), { message: /already (started|capturing)/ });
});

ava('a second start is rejected while microphone permission is still pending', async (t) => {
    let resolveMedia;
    const getUserMedia = sinon.stub().returns(new Promise((resolve) => { resolveMedia = resolve; }));
    const { capture, stream } = buildHarness({ getUserMedia });

    const first = capture.start();
    await Promise.resolve();
    await t.throwsAsync(capture.start(), { message: /already (started|capturing)/ });
    t.true(getUserMedia.calledOnce, 'only one permission request is made');

    resolveMedia(stream);
    await first;
    capture.destroy();
});

ava('destroy during pending permission stops a late stream and does not resurrect capture', async (t) => {
    let resolveMedia;
    const getUserMedia = sinon.stub().returns(new Promise((resolve) => { resolveMedia = resolve; }));
    const { capture, stream, tracks } = buildHarness({ getUserMedia });

    const pending = capture.start();
    await Promise.resolve();
    capture.destroy();
    resolveMedia(stream);

    await t.throwsAsync(pending, { message: /destroyed/ });
    tracks.forEach((track) => t.true(track.stop.calledOnce));
    t.is(capture.status, 'destroyed');
});

ava('cancel during pending permission stops a late stream and leaves capture reusable', async (t) => {
    let resolveFirstMedia;
    const firstTracks = [fakeTrack()];
    const secondTracks = [fakeTrack()];
    const getUserMedia = sinon.stub();
    getUserMedia.onFirstCall().returns(new Promise((resolve) => { resolveFirstMedia = resolve; }));
    getUserMedia.onSecondCall().resolves(fakeStream(secondTracks));
    const { capture } = buildHarness({ getUserMedia });

    const pending = capture.start();
    await Promise.resolve();
    capture.cancel();
    resolveFirstMedia(fakeStream(firstTracks));

    await t.throwsAsync(pending, { message: /cancelled/ });
    t.true(firstTracks[0].stop.calledOnce);
    t.is(capture.status, 'idle');

    await capture.start();
    capture.cancel();
    t.true(secondTracks[0].stop.calledOnce);
    t.is(capture.status, 'idle');
});

ava('cancel during pending permission does not let a late first request corrupt an immediate restart', async (t) => {
    let resolveFirstMedia;
    const firstTracks = [fakeTrack()];
    const secondTracks = [fakeTrack()];
    const firstStream = fakeStream(firstTracks);
    const secondStream = fakeStream(secondTracks);
    const getUserMedia = sinon.stub();
    getUserMedia.onFirstCall().returns(new Promise((resolve) => { resolveFirstMedia = resolve; }));
    getUserMedia.onSecondCall().resolves(secondStream);
    const { capture, getRecorder } = buildHarness({ getUserMedia });

    const firstStart = capture.start();
    await Promise.resolve();
    capture.cancel();
    const secondStart = capture.start();
    await secondStart;

    resolveFirstMedia(firstStream);
    await t.throwsAsync(firstStart, { message: /cancelled/ });

    t.true(firstTracks[0].stop.calledOnce);
    t.true(secondTracks[0].stop.notCalled);
    t.is(getRecorder().stream, secondStream);
    t.is(capture.status, 'recording');

    capture.cancel();
    t.true(secondTracks[0].stop.calledOnce);
});

ava('recorder construction failure stops every acquired track', async (t) => {
    const failure = new Error('recorder unavailable');
    const { capture, tracks } = buildHarness({ createRecorder: () => { throw failure; } });

    await t.throwsAsync(capture.start(), { is: failure });
    tracks.forEach((track) => t.true(track.stop.calledOnce));
});

// -------------------------------------------------------------------------- //
// stop
// -------------------------------------------------------------------------- //

ava('stop resolves 16 kHz mono PCM and tears everything down', async (t) => {
    const { capture, audioContext, chunksToArrayBuffer, tracks } = buildHarness();

    await capture.start();
    const pcm = await capture.stop();

    // decoded 8 kHz mono [0, 10] resampled to 16 kHz => [0, 5, 10, 10]
    t.true(pcm instanceof Float32Array);
    t.deepEqual(Array.from(pcm), [0, 5, 10, 10]);

    t.true(chunksToArrayBuffer.calledOnce);
    t.deepEqual(chunksToArrayBuffer.firstCall.args[0], ['chunk-1'], 'collected chunks are decoded');
    t.true(audioContext.decodeAudioData.calledOnce);
    t.true(audioContext.close.calledOnce, 'the AudioContext is closed');
    tracks.forEach((track) => t.true(track.stop.calledOnce, 'every track is stopped'));
});

ava('stop before start rejects', async (t) => {
    const { capture } = buildHarness();

    await t.throwsAsync(capture.stop(), { message: /not (started|capturing)/ });
});

ava('a recorder error surfaces on stop with cleanup and no leaked tracks', async (t) => {
    const boom = new Error('recorder boom');
    const { capture, getRecorder, tracks, audioContext } = buildHarness();

    await capture.start();
    getRecorder().fireError(boom);

    await t.throwsAsync(capture.stop(), { is: boom }, 'the original recorder error is preserved');
    tracks.forEach((track) => t.true(track.stop.calledOnce));
    t.true(audioContext.close.notCalled, 'no context is opened when decoding never starts');
});

ava('cancel while recording releases tracks without decoding and leaves capture reusable', async (t) => {
    const { capture, tracks, audioContext } = buildHarness();

    await capture.start();
    capture.cancel();

    tracks.forEach((track) => t.true(track.stop.calledOnce));
    t.true(audioContext.decodeAudioData.notCalled);
    t.is(capture.status, 'idle');
});

// -------------------------------------------------------------------------- //
// destroy
// -------------------------------------------------------------------------- //

ava('destroy stops tracks, detaches listeners, and blocks restart', async (t) => {
    const { capture, getRecorder, tracks } = buildHarness();

    await capture.start();
    const recorder = getRecorder();
    capture.destroy();

    tracks.forEach((track) => t.true(track.stop.calledOnce));
    t.is(recorder.ondataavailable, null, 'listeners are detached');
    t.is(recorder.onstop, null);
    t.is(recorder.onerror, null);

    await t.throwsAsync(capture.start(), { message: /destroyed/ });
});

ava('destroy rejects a stop that is still in flight', async (t) => {
    const { capture, tracks } = buildHarness({ autoStop: false });

    await capture.start();
    const pending = capture.stop();

    capture.destroy();

    await t.throwsAsync(pending, { message: /destroyed|cancelled/ });
    tracks.forEach((track) => t.true(track.stop.calledOnce));
});
