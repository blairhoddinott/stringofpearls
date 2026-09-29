import ava from 'ava';
import sinon from 'sinon';

import VoiceCommandController, {
    VOICE_CONTROLLER_STATE
} from '../../src/assets/scripts/client/input/VoiceCommandController';
import { NORMALIZER_STATUS } from '../../src/assets/scripts/client/input/AviationCommandNormalizer';

// -------------------------------------------------------------------------- //
// test doubles
//
// The controller is a *pure orchestrator*: every collaborator is injected and
// every collaborator here is a narrow fake shaped like the real module's public
// surface only (verified against the committed modules):
//   - SpeechRecognitionClient: load()/transcribe(pcm)/cancel()/destroy()
//   - MicrophoneCapture:        start()/stop()/destroy()  (no cancel())
//   - AviationCommandNormalizer: normalize(transcript, context) -> { status, ... }
//   - VoiceCommandContextProvider: getContext()
//   - view adapter / command-input adapter (DOM-free, resolved in a later pass)
// -------------------------------------------------------------------------- //

const PCM = new Float32Array([0.1, -0.2, 0.3]);
const TRANSCRIPT = 'American twelve thirty four turn left heading two seven zero';
const COMMAND_TEXT = 'AAL1234 h left 270';

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
};

const buildRecognitionClient = () => ({
    load: sinon.stub().resolves(),
    transcribe: sinon.stub().resolves(TRANSCRIPT),
    cancel: sinon.spy(),
    destroy: sinon.spy()
});

const buildCapture = () => ({
    start: sinon.stub().resolves(),
    stop: sinon.stub().resolves(PCM),
    cancel: sinon.spy(),
    destroy: sinon.spy()
});

const buildView = () => ({
    renderState: sinon.spy(),
    renderProgress: sinon.spy(),
    renderTranscript: sinon.spy(),
    renderRejection: sinon.spy(),
    renderError: sinon.spy()
});

const buildCommandInput = (initial = '') => {
    let value = initial;

    return {
        getValue: sinon.spy(() => value),
        setValue: sinon.spy((next) => {
            value = next;
        })
    };
};

const buildController = (overrides = {}) => {
    const recognitionClient = overrides.recognitionClient || buildRecognitionClient();
    const microphoneCapture = overrides.microphoneCapture || buildCapture();
    const contextProvider = overrides.contextProvider || { getContext: sinon.stub().returns({ activeAircraft: [], fixes: [], runways: [] }) };
    const normalize = overrides.normalize
        || sinon.stub().returns({ status: NORMALIZER_STATUS.ACCEPTED, commandText: COMMAND_TEXT });
    const view = overrides.view || buildView();
    const commandInput = overrides.commandInput || buildCommandInput();

    const controller = new VoiceCommandController({
        recognitionClient,
        microphoneCapture,
        contextProvider,
        normalize,
        view,
        commandInput
    });

    return { controller, recognitionClient, microphoneCapture, contextProvider, normalize, view, commandInput };
};

// Drive an enabled controller all the way to READY.
const enabled = async (overrides = {}) => {
    const bundle = buildController(overrides);
    await bundle.controller.enable();

    return bundle;
};

// -------------------------------------------------------------------------- //
// import safety
// -------------------------------------------------------------------------- //

ava('constructs without touching any browser global or collaborator', (t) => {
    const { recognitionClient, microphoneCapture, view } = buildController();

    t.is(recognitionClient.load.callCount, 0);
    t.is(microphoneCapture.start.callCount, 0);
    t.is(view.renderState.callCount, 0);
});

ava('starts disabled', (t) => {
    const { controller } = buildController();

    t.is(controller.state, VOICE_CONTROLLER_STATE.DISABLED);
});

// -------------------------------------------------------------------------- //
// explicit opt-in: enable() is the only path that loads the model
// -------------------------------------------------------------------------- //

ava('enable() is the only path that loads the recognition model, and never opens the microphone', async (t) => {
    const { controller, recognitionClient, microphoneCapture, view } = buildController();

    // nothing loads until the user explicitly opts in
    t.is(recognitionClient.load.callCount, 0);

    await controller.enable();

    t.is(recognitionClient.load.callCount, 1);
    t.is(controller.state, VOICE_CONTROLLER_STATE.READY);
    // enabling must never request the microphone
    t.is(microphoneCapture.start.callCount, 0);
    t.true(view.renderState.calledWith(VOICE_CONTROLLER_STATE.LOADING));
    t.true(view.renderState.calledWith(VOICE_CONTROLLER_STATE.READY));
});

ava('renders the loading state before load resolves and ready state after', async (t) => {
    const load = deferred();
    const recognitionClient = buildRecognitionClient();
    recognitionClient.load = sinon.stub().returns(load.promise);
    const { controller, view } = buildController({ recognitionClient });

    const enabling = controller.enable();

    t.is(controller.state, VOICE_CONTROLLER_STATE.LOADING);
    t.true(view.renderState.calledWith(VOICE_CONTROLLER_STATE.LOADING));

    load.resolve();
    await enabling;

    t.is(controller.state, VOICE_CONTROLLER_STATE.READY);
});

ava('repeated enable() calls load the model only once', async (t) => {
    const { controller, recognitionClient } = await enabled();

    await controller.enable();
    await controller.enable();

    t.is(recognitionClient.load.callCount, 1);
});

// -------------------------------------------------------------------------- //
// model download progress rendered through the view
// -------------------------------------------------------------------------- //

ava('forwards recognition model progress to the view', (t) => {
    const { controller, view } = buildController();
    const progress = { phase: 'download', loaded: 4, total: 10, backend: 'wasm' };

    controller.handleModelProgress(progress);

    t.true(view.renderProgress.calledOnceWithExactly(progress));
});

// -------------------------------------------------------------------------- //
// push-to-talk: only when ready; capture.start() is the only mic call
// -------------------------------------------------------------------------- //

ava('begin push-to-talk does nothing until recognition is ready', async (t) => {
    const { controller, microphoneCapture } = buildController();

    await controller.beginPushToTalk();

    t.is(microphoneCapture.start.callCount, 0);
    t.is(controller.state, VOICE_CONTROLLER_STATE.DISABLED);
});

ava('begin push-to-talk starts the microphone once ready (capture.start is the only mic call)', async (t) => {
    const { controller, microphoneCapture } = await enabled();

    await controller.beginPushToTalk();

    t.is(microphoneCapture.start.callCount, 1);
    t.is(controller.state, VOICE_CONTROLLER_STATE.LISTENING);
});

ava('repeated begin push-to-talk while listening starts the microphone only once', async (t) => {
    const { controller, microphoneCapture } = await enabled();

    await controller.beginPushToTalk();
    await controller.beginPushToTalk();

    t.is(microphoneCapture.start.callCount, 1);
});

ava('release while microphone permission is pending waits for capture to start before stopping', async (t) => {
    const started = deferred();
    const microphoneCapture = buildCapture();
    microphoneCapture.start = sinon.stub().returns(started.promise);
    const { controller } = await enabled({ microphoneCapture });

    const beginning = controller.beginPushToTalk();
    const ending = controller.endPushToTalk();

    t.is(microphoneCapture.stop.callCount, 0);
    started.resolve();
    await beginning;
    await ending;

    t.true(microphoneCapture.stop.calledOnce);
});

ava('a pending microphone rejection is rendered once when release is already waiting', async (t) => {
    const started = deferred();
    const failure = new Error('permission denied');
    const microphoneCapture = buildCapture();
    microphoneCapture.start = sinon.stub().returns(started.promise);
    const { controller, view, recognitionClient } = await enabled({ microphoneCapture });

    const beginning = controller.beginPushToTalk();
    const ending = controller.endPushToTalk();
    started.reject(failure);
    await beginning;
    await ending;

    t.true(view.renderError.calledOnceWithExactly(failure));
    t.is(recognitionClient.transcribe.callCount, 0);
    t.is(controller.state, VOICE_CONTROLLER_STATE.READY);
});

// -------------------------------------------------------------------------- //
// end push-to-talk: stop -> transcribe -> live context -> normalize
// -------------------------------------------------------------------------- //

ava('end push-to-talk stops, transcribes, reads live context at completion time, then normalizes', async (t) => {
    const { controller, microphoneCapture, recognitionClient, contextProvider, normalize } = await enabled();

    await controller.beginPushToTalk();
    await controller.endPushToTalk();

    // exact ordering: capture stops, then transcription, then the *live* context
    // is read at transcript-completion time, then normalization runs
    sinon.assert.callOrder(
        microphoneCapture.stop,
        recognitionClient.transcribe,
        contextProvider.getContext,
        normalize
    );
    t.true(recognitionClient.transcribe.calledOnceWithExactly(PCM));
    t.true(normalize.calledOnceWithExactly(TRANSCRIPT, contextProvider.getContext.returnValues[0]));
});

ava('does not read the context until the transcript has actually completed', async (t) => {
    const transcribe = deferred();
    const recognitionClient = buildRecognitionClient();
    recognitionClient.transcribe = sinon.stub().returns(transcribe.promise);
    const { controller, contextProvider } = await enabled({ recognitionClient });

    await controller.beginPushToTalk();
    const ending = controller.endPushToTalk();

    // transcription is still in flight: the live context must not be sampled yet
    t.is(contextProvider.getContext.callCount, 0);

    transcribe.resolve(TRANSCRIPT);
    await ending;

    t.is(contextProvider.getContext.callCount, 1);
});

ava('end push-to-talk does nothing when not listening', async (t) => {
    const { controller, recognitionClient } = await enabled();

    await controller.endPushToTalk();

    t.is(recognitionClient.transcribe.callCount, 0);
});

// -------------------------------------------------------------------------- //
// accepted: preview raw + normalized, populate input, never execute
// -------------------------------------------------------------------------- //

ava('accepted transcript is previewed and populates the command input but is never executed', async (t) => {
    const { controller, view, commandInput } = await enabled();

    await controller.beginPushToTalk();
    await controller.endPushToTalk();

    t.true(view.renderTranscript.calledOnceWithExactly({
        transcript: TRANSCRIPT,
        commandText: COMMAND_TEXT
    }));
    // the command bar is *populated*, never submitted/parsed/executed
    t.true(commandInput.setValue.calledOnceWithExactly(COMMAND_TEXT));
    t.is(controller.state, VOICE_CONTROLLER_STATE.READY);
});

// -------------------------------------------------------------------------- //
// invalid / ambiguous: show the outcome, leave the command input untouched
// -------------------------------------------------------------------------- //

ava('invalid transcript renders the rejection and leaves the command input unchanged', async (t) => {
    const normalize = sinon.stub().returns({ status: NORMALIZER_STATUS.INVALID, reason: 'No supported command found' });
    const commandInput = buildCommandInput('AAL1234 sp 210');
    const { controller, view } = await enabled({ normalize, commandInput });

    await controller.beginPushToTalk();
    await controller.endPushToTalk();

    t.true(view.renderRejection.calledOnceWithExactly({
        status: NORMALIZER_STATUS.INVALID,
        transcript: TRANSCRIPT,
        reason: 'No supported command found'
    }));
    t.is(commandInput.setValue.callCount, 0);
    t.is(commandInput.getValue(), 'AAL1234 sp 210');
});

ava('ambiguous transcript renders the rejection and leaves the command input unchanged', async (t) => {
    const normalize = sinon.stub().returns({ status: NORMALIZER_STATUS.AMBIGUOUS, reason: 'More than one active aircraft matches the callsign' });
    const commandInput = buildCommandInput('UAL5 h left 090');
    const { controller, view } = await enabled({ normalize, commandInput });

    await controller.beginPushToTalk();
    await controller.endPushToTalk();

    t.true(view.renderRejection.calledOnce);
    t.is(view.renderRejection.firstCall.args[0].status, NORMALIZER_STATUS.AMBIGUOUS);
    t.is(commandInput.setValue.callCount, 0);
    t.is(commandInput.getValue(), 'UAL5 h left 090');
});

// -------------------------------------------------------------------------- //
// errors: recoverable, input untouched, never auto-executed
// -------------------------------------------------------------------------- //

ava('a load failure renders the error and leaves the controller recoverable', async (t) => {
    const recognitionClient = buildRecognitionClient();
    const failure = new Error('model download failed');
    recognitionClient.load = sinon.stub().rejects(failure);
    const { controller, view } = buildController({ recognitionClient });

    await controller.enable();

    t.true(view.renderError.calledOnceWithExactly(failure));
    t.is(controller.state, VOICE_CONTROLLER_STATE.ERROR);

    // recoverable: a later enable can retry the load
    recognitionClient.load = sinon.stub().resolves();
    await controller.enable();
    t.is(controller.state, VOICE_CONTROLLER_STATE.READY);
});

ava('a microphone failure renders the error, opens nothing further, and returns to ready', async (t) => {
    const microphoneCapture = buildCapture();
    const failure = new Error('permission denied');
    microphoneCapture.start = sinon.stub().rejects(failure);
    const { controller, view, recognitionClient, commandInput } = await enabled({ microphoneCapture });

    await controller.beginPushToTalk();

    t.true(view.renderError.calledOnceWithExactly(failure));
    t.is(recognitionClient.transcribe.callCount, 0);
    t.is(commandInput.setValue.callCount, 0);
    t.is(controller.state, VOICE_CONTROLLER_STATE.READY);
});

ava('a transcription failure renders the error, leaves the input unchanged, and never executes', async (t) => {
    const recognitionClient = buildRecognitionClient();
    const failure = new Error('inference failed');
    recognitionClient.transcribe = sinon.stub().rejects(failure);
    const commandInput = buildCommandInput('AAL1 h left 010');
    const { controller, view, normalize } = await enabled({ recognitionClient, commandInput });

    await controller.beginPushToTalk();
    await controller.endPushToTalk();

    t.true(view.renderError.calledOnceWithExactly(failure));
    t.is(normalize.callCount, 0);
    t.is(commandInput.setValue.callCount, 0);
    t.is(commandInput.getValue(), 'AAL1 h left 010');
    t.is(controller.state, VOICE_CONTROLLER_STATE.READY);
});

// -------------------------------------------------------------------------- //
// stale suppression on cancel / destroy
// -------------------------------------------------------------------------- //

ava('destroy during an in-flight transcription suppresses the stale result', async (t) => {
    const transcribe = deferred();
    const recognitionClient = buildRecognitionClient();
    recognitionClient.transcribe = sinon.stub().returns(transcribe.promise);
    const { controller, view, commandInput, microphoneCapture } = await enabled({ recognitionClient });

    await controller.beginPushToTalk();
    const ending = controller.endPushToTalk();

    controller.destroy();

    // the transcript arrives *after* teardown; it must never reach view or input
    transcribe.resolve(TRANSCRIPT);
    await ending;

    t.is(view.renderTranscript.callCount, 0);
    t.is(commandInput.setValue.callCount, 0);
    t.true(microphoneCapture.destroy.called);
    t.true(recognitionClient.destroy.called);
    t.is(controller.state, VOICE_CONTROLLER_STATE.DESTROYED);
});

ava('cancel during an in-flight transcription suppresses the stale result and stays usable', async (t) => {
    const transcribe = deferred();
    const recognitionClient = buildRecognitionClient();
    recognitionClient.transcribe = sinon.stub().returns(transcribe.promise);
    const { controller, view, commandInput } = await enabled({ recognitionClient });

    await controller.beginPushToTalk();
    const ending = controller.endPushToTalk();

    controller.cancel();

    t.true(recognitionClient.cancel.called);

    transcribe.resolve(TRANSCRIPT);
    await ending;

    t.is(view.renderTranscript.callCount, 0);
    t.is(commandInput.setValue.callCount, 0);
    t.is(controller.state, VOICE_CONTROLLER_STATE.READY);
});

ava('cancel while listening releases the microphone and returns to ready', async (t) => {
    const { controller, microphoneCapture, recognitionClient } = await enabled();

    await controller.beginPushToTalk();
    controller.cancel();

    t.true(recognitionClient.cancel.called);
    t.true(microphoneCapture.cancel.called);
    t.is(controller.state, VOICE_CONTROLLER_STATE.READY);
});

// -------------------------------------------------------------------------- //
// cleanup / destroy
// -------------------------------------------------------------------------- //

ava('destroy tears down both collaborators and is idempotent', (t) => {
    const { controller, microphoneCapture, recognitionClient, view } = buildController();

    controller.destroy();
    controller.destroy();

    t.is(microphoneCapture.destroy.callCount, 1);
    t.is(recognitionClient.destroy.callCount, 1);
    t.is(controller.state, VOICE_CONTROLLER_STATE.DESTROYED);
    t.true(view.renderState.calledWith(VOICE_CONTROLLER_STATE.DESTROYED));
});

ava('every interaction is a safe no-op after destroy', async (t) => {
    const { controller, recognitionClient, microphoneCapture } = await enabled();

    controller.destroy();
    recognitionClient.load.resetHistory();
    microphoneCapture.start.resetHistory();

    await controller.enable();
    await controller.beginPushToTalk();
    await controller.endPushToTalk();

    t.is(recognitionClient.load.callCount, 0);
    t.is(microphoneCapture.start.callCount, 0);
    t.is(controller.state, VOICE_CONTROLLER_STATE.DESTROYED);
});

ava('handleModelProgress is a no-op after destroy', (t) => {
    const { controller, view } = buildController();

    controller.destroy();
    controller.handleModelProgress({ phase: 'download', loaded: 1, total: 2 });

    t.is(view.renderProgress.callCount, 0);
});

// -------------------------------------------------------------------------- //
// repeated interaction across full cycles
// -------------------------------------------------------------------------- //

ava('supports repeated push-to-talk cycles with the same collaborators', async (t) => {
    const { controller, microphoneCapture, recognitionClient, commandInput } = await enabled();

    await controller.beginPushToTalk();
    await controller.endPushToTalk();

    t.is(controller.state, VOICE_CONTROLLER_STATE.READY);

    await controller.beginPushToTalk();
    await controller.endPushToTalk();

    t.is(microphoneCapture.start.callCount, 2);
    t.is(microphoneCapture.stop.callCount, 2);
    t.is(recognitionClient.transcribe.callCount, 2);
    t.is(commandInput.setValue.callCount, 2);
    t.is(controller.state, VOICE_CONTROLLER_STATE.READY);
});
