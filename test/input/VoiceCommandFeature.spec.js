import ava from 'ava';
import sinon from 'sinon';

import { createVoiceCommandFeature, VOICE_WORKER_URL } from '../../src/assets/scripts/client/input/VoiceCommandFeature';

const buildDom = () => {
    const { document } = global.window;
    const root = document.createElement('div');

    root.innerHTML = `
        <input id="command" />
        <button id="voice-command-enable" type="button">Enable voice</button>
        <button id="voice-command-push-to-talk" type="button" disabled></button>
        <p id="voice-command-status"></p>
        <div id="voice-command-preview" hidden>
            <p id="voice-command-message"></p>
            <p id="voice-command-transcript-line"><span id="voice-command-transcript"></span></p>
            <p id="voice-command-normalized-line"><span id="voice-command-normalized"></span></p>
        </div>`;

    return root;
};

const buildFeature = (overrides = {}) => {
    const rootElement = buildDom();
    const workerUrls = [];
    const workerOptions = [];
    const submit = sinon.spy();
    rootElement.querySelector('#command').addEventListener('submit', submit);

    class FakeWorker {
        constructor(url, options) {
            workerUrls.push(url);
            workerOptions.push(options);
        }
    }

    class FakeRecognitionClient {
        constructor(options) {
            this.options = options;
            this.load = sinon.stub().resolves();
            this.transcribe = sinon.stub().resolves('American twelve thirty four turn left heading two seven zero');
            this.cancel = sinon.spy();
            this.destroy = sinon.spy();
            FakeRecognitionClient.instance = this;
        }
    }

    class FakeMicrophoneCapture {
        constructor(options) {
            this.options = options;
            this.start = sinon.stub().resolves();
            this.stop = sinon.stub().resolves(new Float32Array([0.1]));
            this.cancel = sinon.spy();
            this.destroy = sinon.spy();
            FakeMicrophoneCapture.instance = this;
        }
    }

    const getUserMedia = sinon.stub().resolves({});
    const navigatorTarget = { mediaDevices: { getUserMedia } };
    const feature = createVoiceCommandFeature({
        rootElement,
        windowTarget: global.window,
        navigatorTarget,
        WorkerClass: overrides.WorkerClass || FakeWorker,
        MediaRecorderClass: class FakeMediaRecorder {},
        AudioContextClass: class FakeAudioContext {},
        aircraftController: {
            aircraft: {
                list: [{ callsign: 'AAL1234', airlineCallsign: 'American', flightNumber: '1234' }]
            }
        },
        navigationLibrary: { realFixes: [{ name: 'CAMRN' }] },
        airportController: { airport_get: () => ({ runways: [[{ name: '05' }, { name: '23' }]] }) },
        classes: {
            SpeechRecognitionClientClass: FakeRecognitionClient,
            MicrophoneCaptureClass: FakeMicrophoneCapture
        }
    });

    return {
        feature,
        rootElement,
        workerUrls,
        workerOptions,
        submit,
        getUserMedia,
        recognitionClient: FakeRecognitionClient.instance,
        microphoneCapture: FakeMicrophoneCapture.instance
    };
};

ava('composition creates the dedicated worker without loading a model or requesting the microphone', (t) => {
    const bundle = buildFeature();

    t.deepEqual(bundle.workerUrls, [VOICE_WORKER_URL]);
    t.deepEqual(bundle.workerOptions, [{ type: 'module' }]);
    t.is(bundle.recognitionClient.load.callCount, 0);
    t.is(bundle.microphoneCapture.start.callCount, 0);
    t.is(bundle.getUserMedia.callCount, 0);
    t.true(bundle.rootElement.querySelector('#voice-command-push-to-talk').disabled);

    bundle.feature.destroy();
});

ava('explicit opt-in loads the model but does not request microphone access', async (t) => {
    const bundle = buildFeature();

    bundle.rootElement.querySelector('#voice-command-enable').click();
    await Promise.resolve();
    await Promise.resolve();

    t.true(bundle.recognitionClient.load.calledOnce);
    t.is(bundle.microphoneCapture.start.callCount, 0);
    t.is(bundle.getUserMedia.callCount, 0);

    bundle.feature.destroy();
});

ava('accepted voice text only populates the existing command input and never submits it', async (t) => {
    const bundle = buildFeature();

    await bundle.feature.controller.enable();
    await bundle.feature.controller.beginPushToTalk();
    await bundle.feature.controller.endPushToTalk();

    t.is(bundle.rootElement.querySelector('#command').value, 'AAL1234 h left 270');
    t.is(bundle.submit.callCount, 0);
    t.is(bundle.rootElement.querySelector('#voice-command-transcript').textContent,
        'American twelve thirty four turn left heading two seven zero');
    t.is(bundle.rootElement.querySelector('#voice-command-normalized').textContent, 'AAL1234 h left 270');

    bundle.feature.destroy();
});

ava('recognition progress reaches the live status view through the initialized controller', (t) => {
    const bundle = buildFeature();

    bundle.recognitionClient.options.onProgress({ loaded: 1, total: 4 });

    t.true(bundle.rootElement.querySelector('#voice-command-status').textContent.includes('25%'));
    bundle.feature.destroy();
});

ava('cancel delegates to the controller and destroy cleans both boundaries exactly once', async (t) => {
    const bundle = buildFeature();

    await bundle.feature.controller.enable();
    await bundle.feature.controller.beginPushToTalk();
    bundle.feature.cancel();

    t.true(bundle.microphoneCapture.cancel.calledOnce);
    t.true(bundle.recognitionClient.cancel.calledOnce);

    bundle.feature.destroy();
    bundle.feature.destroy();

    t.true(bundle.microphoneCapture.destroy.calledOnce);
    t.true(bundle.recognitionClient.destroy.calledOnce);
});

ava('worker construction failure does not crash app setup or request microphone access', (t) => {
    class BrokenWorker {
        constructor() {
            throw new Error('workers blocked');
        }
    }

    const bundle = buildFeature({ WorkerClass: BrokenWorker });

    t.true(bundle.rootElement.querySelector('#voice-command-push-to-talk').disabled);
    t.true(bundle.rootElement.querySelector('#voice-command-message').textContent.includes('workers blocked'));
    t.is(bundle.getUserMedia.callCount, 0);
    t.notThrows(() => bundle.rootElement.querySelector('#voice-command-enable').click());
    t.notThrows(() => bundle.feature.destroy());
});

ava('missing optional voice markup degrades to an inert feature instead of crashing app setup', (t) => {
    const feature = createVoiceCommandFeature({ rootElement: global.window.document.createElement('div') });

    t.notThrows(() => feature.cancel());
    t.notThrows(() => feature.destroy());
    t.notThrows(() => feature.destroy());
});
