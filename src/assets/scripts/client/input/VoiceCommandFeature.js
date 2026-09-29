import { normalize } from './AviationCommandNormalizer';
import VoiceCommandContextProvider from './VoiceCommandContextProvider';
import VoiceCommandController, { VOICE_CONTROLLER_STATE } from './VoiceCommandController';
import VoiceCommandEventBindings from './VoiceCommandEventBindings';
import VoiceCommandView from './VoiceCommandView';
import MicrophoneCapture from '../speechRecognition/MicrophoneCapture';
import SpeechRecognitionClient from '../speechRecognition/SpeechRecognitionClient';

export const VOICE_WORKER_URL = 'assets/scripts/client/speech-recognition-worker.min.js';

const ELEMENT_SELECTORS = {
    optInButton: '#voice-command-enable',
    pushToTalkButton: '#voice-command-push-to-talk',
    statusElement: '#voice-command-status',
    previewElement: '#voice-command-preview',
    messageElement: '#voice-command-message',
    transcriptLine: '#voice-command-transcript-line',
    transcriptElement: '#voice-command-transcript',
    normalizedLine: '#voice-command-normalized-line',
    normalizedElement: '#voice-command-normalized',
    commandInput: '#command'
};

const resolveElements = (rootElement) => Object.entries(ELEMENT_SELECTORS).reduce((elements, [name, selector]) => {
    elements[name] = rootElement.querySelector(selector);

    if (elements[name] === null) {
        throw new Error(`Voice command element not found: ${selector}`);
    }

    return elements;
}, {});

const createUnavailableController = (view, error) => ({
    enable: () => view.renderError(error),
    beginPushToTalk() {},
    endPushToTalk() {},
    cancel() {},
    destroy() {}
});

const createInertFeature = () => ({
    controller: null,
    cancel() {},
    destroy() {}
});

/**
 * Compose the local voice-command feature from injected browser capabilities.
 * Constructing the feature never loads a model or asks for microphone access;
 * those operations remain behind the explicit opt-in and push-to-talk controls.
 */
export const createVoiceCommandFeature = ({
    rootElement,
    windowTarget,
    navigatorTarget,
    WorkerClass,
    MediaRecorderClass,
    AudioContextClass,
    aircraftController,
    navigationLibrary,
    airportController,
    workerUrl = VOICE_WORKER_URL,
    classes = {}
} = {}) => {
    const {
        MicrophoneCaptureClass = MicrophoneCapture,
        SpeechRecognitionClientClass = SpeechRecognitionClient,
        VoiceCommandContextProviderClass = VoiceCommandContextProvider,
        VoiceCommandControllerClass = VoiceCommandController,
        VoiceCommandEventBindingsClass = VoiceCommandEventBindings,
        VoiceCommandViewClass = VoiceCommandView,
        normalizeCommand = normalize
    } = classes;
    let elements;

    try {
        elements = resolveElements(rootElement);
    } catch {
        return createInertFeature();
    }

    const view = new VoiceCommandViewClass(elements);
    let controller;

    try {
        if (typeof WorkerClass !== 'function') {
            throw new Error('Voice commands require Web Worker support');
        }

        const worker = new WorkerClass(workerUrl, { type: 'module' });
        const recognitionClient = new SpeechRecognitionClientClass({
            worker,
            onProgress: (progress) => controller?.handleModelProgress(progress)
        });
        const mediaDevices = navigatorTarget && navigatorTarget.mediaDevices;
        const getUserMedia = mediaDevices && typeof mediaDevices.getUserMedia === 'function'
            ? mediaDevices.getUserMedia.bind(mediaDevices)
            : null;
        const microphoneCapture = new MicrophoneCaptureClass({
            getUserMedia,
            createRecorder: typeof MediaRecorderClass === 'function'
                ? (stream) => new MediaRecorderClass(stream)
                : null,
            createAudioContext: typeof AudioContextClass === 'function'
                ? () => new AudioContextClass()
                : null
        });
        const contextProvider = new VoiceCommandContextProviderClass({
            aircraftController,
            navigationLibrary,
            airportController
        });
        const commandInput = {
            getValue: () => elements.commandInput.value,
            setValue: (value) => {
                elements.commandInput.value = value;
            }
        };

        controller = new VoiceCommandControllerClass({
            recognitionClient,
            microphoneCapture,
            contextProvider,
            normalize: normalizeCommand,
            view,
            commandInput
        });
    } catch (error) {
        controller = createUnavailableController(view, error);
        view.renderError(error);
        view.renderState(VOICE_CONTROLLER_STATE.ERROR);
    }

    const eventBindings = new VoiceCommandEventBindingsClass({
        optInButton: elements.optInButton,
        pushToTalkButton: elements.pushToTalkButton,
        windowTarget,
        controller
    });

    if (controller.state !== undefined) {
        view.renderState(VOICE_CONTROLLER_STATE.DISABLED);
    }

    eventBindings.enable();

    let destroyed = false;

    return {
        controller,
        cancel() {
            if (!destroyed) {
                controller.cancel();
            }
        },
        destroy() {
            if (destroyed) {
                return;
            }

            destroyed = true;
            eventBindings.disable();
            controller.destroy();
        }
    };
};
