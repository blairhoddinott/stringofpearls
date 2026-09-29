import ava from 'ava';

import VoiceCommandView, {
    VOICE_STATUS_MESSAGES
} from '../../src/assets/scripts/client/input/VoiceCommandView';
import { VOICE_CONTROLLER_STATE } from '../../src/assets/scripts/client/input/VoiceCommandController';
import { NORMALIZER_STATUS } from '../../src/assets/scripts/client/input/AviationCommandNormalizer';

// -------------------------------------------------------------------------- //
// The view is a *pure DOM adapter*: it is handed already-resolved element
// references (composition resolves them from the footer in a later pass) and
// touches nothing global on import. These tests drive it against real jsdom
// elements so textContent escaping, `disabled`, `hidden`, and aria attributes
// behave exactly as they will in the browser.
// -------------------------------------------------------------------------- //

const buildDom = () => {
    const { document } = global.window;
    const make = (tag, attrs = {}) => {
        const el = document.createElement(tag);
        Object.entries(attrs).forEach(([name, value]) => el.setAttribute(name, value));

        return el;
    };

    const optInButton = make('button', { type: 'button' });
    const pushToTalkButton = make('button', { type: 'button', 'aria-pressed': 'false' });
    pushToTalkButton.disabled = true;

    const statusElement = make('p', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    const messageElement = make('p');
    const transcriptElement = make('span');
    const transcriptLine = make('p');
    transcriptLine.appendChild(transcriptElement);
    const normalizedElement = make('span');
    const normalizedLine = make('p');
    normalizedLine.appendChild(normalizedElement);

    const previewElement = make('div');
    previewElement.hidden = true;
    previewElement.appendChild(messageElement);
    previewElement.appendChild(transcriptLine);
    previewElement.appendChild(normalizedLine);

    return {
        optInButton,
        pushToTalkButton,
        statusElement,
        previewElement,
        messageElement,
        transcriptLine,
        transcriptElement,
        normalizedLine,
        normalizedElement
    };
};

const buildView = () => {
    const refs = buildDom();

    return { refs, view: new VoiceCommandView(refs) };
};

// -------------------------------------------------------------------------- //
// import safety
// -------------------------------------------------------------------------- //

ava('constructs from injected element references without touching a browser global', (t) => {
    // buildDom uses jsdom, but the module itself must not read window/document on
    // import or construction; simply constructing here proves it does not throw.
    const { view, refs } = buildView();

    t.is(view._pushToTalkButton, refs.pushToTalkButton);
    t.is(view._statusElement, refs.statusElement);
});

// -------------------------------------------------------------------------- //
// renderState: human-readable status + button disabled/pressed/labels
// -------------------------------------------------------------------------- //

ava('renders a human-readable status for every lifecycle state', (t) => {
    const { view, refs } = buildView();

    Object.values(VOICE_CONTROLLER_STATE).forEach((state) => {
        view.renderState(state);

        t.is(refs.statusElement.textContent, VOICE_STATUS_MESSAGES[state]);
        t.true(refs.statusElement.textContent.length > 0);
    });
});

ava('keeps the push-to-talk button disabled until ready and enabled only while usable', (t) => {
    const { view, refs } = buildView();

    view.renderState(VOICE_CONTROLLER_STATE.DISABLED);
    t.true(refs.pushToTalkButton.disabled);

    view.renderState(VOICE_CONTROLLER_STATE.LOADING);
    t.true(refs.pushToTalkButton.disabled);

    view.renderState(VOICE_CONTROLLER_STATE.READY);
    t.false(refs.pushToTalkButton.disabled);

    view.renderState(VOICE_CONTROLLER_STATE.LISTENING);
    t.false(refs.pushToTalkButton.disabled);

    view.renderState(VOICE_CONTROLLER_STATE.TRANSCRIBING);
    t.true(refs.pushToTalkButton.disabled);

    view.renderState(VOICE_CONTROLLER_STATE.ERROR);
    t.true(refs.pushToTalkButton.disabled);

    view.renderState(VOICE_CONTROLLER_STATE.DESTROYED);
    t.true(refs.pushToTalkButton.disabled);
});

ava('reflects the pressed state and label of the push-to-talk button', (t) => {
    const { view, refs } = buildView();

    view.renderState(VOICE_CONTROLLER_STATE.READY);
    t.is(refs.pushToTalkButton.getAttribute('aria-pressed'), 'false');
    t.is(refs.pushToTalkButton.textContent, 'Hold to talk');

    view.renderState(VOICE_CONTROLLER_STATE.LISTENING);
    t.is(refs.pushToTalkButton.getAttribute('aria-pressed'), 'true');
    t.is(refs.pushToTalkButton.textContent, 'Listening…');

    view.renderState(VOICE_CONTROLLER_STATE.READY);
    t.is(refs.pushToTalkButton.getAttribute('aria-pressed'), 'false');
    t.is(refs.pushToTalkButton.textContent, 'Hold to talk');
});

ava('only offers the opt-in button before opting in and after a recoverable error', (t) => {
    const { view, refs } = buildView();

    view.renderState(VOICE_CONTROLLER_STATE.DISABLED);
    t.false(refs.optInButton.disabled);

    view.renderState(VOICE_CONTROLLER_STATE.LOADING);
    t.true(refs.optInButton.disabled);

    view.renderState(VOICE_CONTROLLER_STATE.READY);
    t.true(refs.optInButton.disabled);

    view.renderState(VOICE_CONTROLLER_STATE.ERROR);
    t.false(refs.optInButton.disabled);
});

// -------------------------------------------------------------------------- //
// preview visibility driven by state
// -------------------------------------------------------------------------- //

ava('hides the preview when a new capture starts and while not showing a result', (t) => {
    const { view, refs } = buildView();

    // surface a result, then start a fresh capture
    view.renderTranscript({ transcript: 'x', commandText: 'AAL1 h 010' });
    t.false(refs.previewElement.hidden);

    view.renderState(VOICE_CONTROLLER_STATE.LISTENING);
    t.true(refs.previewElement.hidden);
});

ava('does not clobber a freshly rendered result when returning to ready', (t) => {
    const { view, refs } = buildView();

    view.renderTranscript({ transcript: 'x', commandText: 'AAL1 h 010' });
    // controller returns to READY immediately after presenting the result
    view.renderState(VOICE_CONTROLLER_STATE.READY);

    t.false(refs.previewElement.hidden);
    t.is(refs.normalizedElement.textContent, 'AAL1 h 010');
});

ava('does not hide an error message when the controller settles into the error state', (t) => {
    const { view, refs } = buildView();

    view.renderError(new Error('model download failed'));
    view.renderState(VOICE_CONTROLLER_STATE.ERROR);

    t.false(refs.previewElement.hidden);
    t.is(refs.messageElement.textContent, 'model download failed');
});

// -------------------------------------------------------------------------- //
// renderProgress
// -------------------------------------------------------------------------- //

ava('renders download progress as a percentage in the status region', (t) => {
    const { view, refs } = buildView();

    view.renderProgress({ phase: 'download', loaded: 4, total: 10, backend: 'wasm' });

    t.is(refs.statusElement.textContent, `${VOICE_STATUS_MESSAGES[VOICE_CONTROLLER_STATE.LOADING]} 40%`);
});

ava('renders indeterminate progress without a percentage when totals are unknown', (t) => {
    const { view, refs } = buildView();

    view.renderProgress({ phase: 'init', loaded: 0, total: 0 });

    t.is(refs.statusElement.textContent, VOICE_STATUS_MESSAGES[VOICE_CONTROLLER_STATE.LOADING]);
});

// -------------------------------------------------------------------------- //
// renderTranscript / renderRejection / renderError
// -------------------------------------------------------------------------- //

ava('renders an accepted transcript and its normalized command in the preview', (t) => {
    const { view, refs } = buildView();

    view.renderTranscript({ transcript: 'american one heading zero one zero', commandText: 'AAL1 h 010' });

    t.false(refs.previewElement.hidden);
    t.is(refs.transcriptElement.textContent, 'american one heading zero one zero');
    t.is(refs.normalizedElement.textContent, 'AAL1 h 010');
    t.false(refs.transcriptLine.hidden);
    t.false(refs.normalizedLine.hidden);
});

ava('renders a rejection with its reason and hides the (absent) normalized command', (t) => {
    const { view, refs } = buildView();

    view.renderRejection({
        status: NORMALIZER_STATUS.INVALID,
        transcript: 'random words',
        reason: 'No supported command found'
    });

    t.false(refs.previewElement.hidden);
    t.is(refs.transcriptElement.textContent, 'random words');
    t.is(refs.messageElement.textContent, 'No supported command found');
    t.false(refs.transcriptLine.hidden);
    t.true(refs.normalizedLine.hidden);
});

ava('renders an error message and hides both preview lines', (t) => {
    const { view, refs } = buildView();

    view.renderError(new Error('permission denied'));

    t.false(refs.previewElement.hidden);
    t.is(refs.messageElement.textContent, 'permission denied');
    t.true(refs.transcriptLine.hidden);
    t.true(refs.normalizedLine.hidden);
});

ava('renders a generic error message when the error carries no message', (t) => {
    const { view, refs } = buildView();

    view.renderError({});

    t.true(refs.messageElement.textContent.length > 0);
    t.false(refs.previewElement.hidden);
});

// -------------------------------------------------------------------------- //
// textContent safety: markup in a transcript is shown literally, never parsed
// -------------------------------------------------------------------------- //

ava('writes transcript/command text with textContent so markup is never interpreted', (t) => {
    const { view, refs } = buildView();
    const hostile = '<img src=x onerror="window.__pwned = true"> & <b>bold</b>';

    view.renderTranscript({ transcript: hostile, commandText: hostile });

    // the raw string is preserved verbatim and no child elements were injected
    t.is(refs.transcriptElement.textContent, hostile);
    t.is(refs.transcriptElement.children.length, 0);
    t.is(refs.normalizedElement.children.length, 0);
    t.not(refs.transcriptElement.innerHTML, hostile);
    t.true(refs.transcriptElement.innerHTML.includes('&lt;img'));
});

ava('writes rejection and error text with textContent so markup is never interpreted', (t) => {
    const { view, refs } = buildView();
    const hostile = '<script>window.__pwned = true</script>';

    view.renderRejection({ status: NORMALIZER_STATUS.INVALID, transcript: hostile, reason: hostile });
    t.is(refs.transcriptElement.textContent, hostile);
    t.is(refs.messageElement.children.length, 0);

    view.renderError(new Error(hostile));
    t.is(refs.messageElement.textContent, hostile);
    t.is(refs.messageElement.children.length, 0);
});
