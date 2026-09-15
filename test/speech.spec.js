import ava from 'ava';
import sinon from 'sinon';
import {
    speech_init,
    speech_say,
    speech_toggle,
    randomizePilotVoice,
    randomizePilotVoice_init
} from '../src/assets/scripts/client/speech';
import EventTracker from '../src/assets/scripts/client/EventTracker';
import { STORAGE_KEY } from '../src/assets/scripts/client/constants/storageKeys';
import { SELECTORS } from '../src/assets/scripts/client/constants/selectors';
import { TRACKABLE_EVENT } from '../src/assets/scripts/client/constants/trackableEvents';
import { VOICES } from '../src/assets/scripts/client/constants/speechConstants';

// Build a random source stub exposing only the `fraction()` contract used by
// `randomizePilotVoice`, so the randomness boundary is exercised without a
// global `Math.random` backend and without touching speech synthesis.
const buildRandomSource = (...fractionValues) => {
    const fraction = sinon.stub();

    fractionValues.forEach((value, index) => {
        fraction.onCall(index).returns(value);
    });

    return {
        fraction,
        integer: sinon.stub(),
        real: sinon.stub()
    };
};

// Build a storage adapter stub exposing only the `get(key)`/`set(key, value)`
// contract, so the speech-preference boundary is exercised without a global
// `localStorage` backend.
const buildStorageAdapter = (options = {}) => ({
    get: sinon.stub().returns(Object.prototype.hasOwnProperty.call(options, 'storedValue')
        ? options.storedValue
        : null),
    set: sinon.stub()
});

// Build a speech synthesis adapter stub exposing only the
// `speak(text, pilotVoice)`/`cancel()` contract the module consumes, so the
// synthesis boundary is exercised without the raw `window.speechSynthesis` /
// `SpeechSynthesisUtterance` browser globals.
const buildSpeechSynthesisAdapter = () => ({
    speak: sinon.stub(),
    cancel: sinon.stub()
});

// Insert the toggle element jQuery targets so ACTIVE-class mutations are
// observable. jQuery remains deliberately unmigrated, so this is the minimum
// DOM fixture required.
const mountToggleElement = () => {
    window.document.body.innerHTML = `<div class="${SELECTORS.CLASSNAMES.TOGGLE_SPEECH}"></div>`;
};

const toggleElement = () => window.document
    .querySelector(SELECTORS.DOM_SELECTORS.TOGGLE_SPEECH);

const toggleHasActiveClass = () => toggleElement()
    .classList.contains(SELECTORS.CLASSNAMES.ACTIVE);

// Replace the browser speech globals with values that throw the moment they are
// read, proving the module never touches `window.speechSynthesis` or
// `SpeechSynthesisUtterance`. Returns a restore callable for teardown.
const installHostileSpeechGlobals = () => {
    const originalSynthesisDescriptor = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
    const originalUtteranceDescriptor = Object.getOwnPropertyDescriptor(window, 'SpeechSynthesisUtterance');

    Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        get() {
            throw new Error('speech_init/speech_say read window.speechSynthesis');
        }
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        configurable: true,
        get() {
            throw new Error('speech_say read window.SpeechSynthesisUtterance');
        }
    });

    return () => {
        if (originalSynthesisDescriptor) {
            Object.defineProperty(window, 'speechSynthesis', originalSynthesisDescriptor);
        } else {
            delete window.speechSynthesis;
        }

        if (originalUtteranceDescriptor) {
            Object.defineProperty(window, 'SpeechSynthesisUtterance', originalUtteranceDescriptor);
        } else {
            delete window.SpeechSynthesisUtterance;
        }
    };
};

ava.afterEach.always(() => {
    // Clear retained module adapter configuration so no test leaks into the next.
    speech_init();
    randomizePilotVoice_init();
    prop.speech = undefined;
    window.document.body.innerHTML = '';
});

ava.serial('randomizePilotVoice() draws fraction three times in voice/pitch/rate order through the source', (t) => {
    // floor(0.5 * 6) === 3 → VOICES[3]; pitch endpoint at fraction 0; rate at fraction 1
    const randomSource = buildRandomSource(0.5, 0, 1);
    randomizePilotVoice_init(randomSource);

    const result = randomizePilotVoice();

    t.is(randomSource.fraction.callCount, 3);
    t.deepEqual(result, {
        voice: VOICES[3],
        pitch: '1.1',
        rate: '1.000'
    });
});

ava.serial('randomizePilotVoice() without a configured source returns the first voice and formula endpoints', (t) => {
    const result = randomizePilotVoice();

    t.deepEqual(result, {
        voice: VOICES[0],
        pitch: '1.1',
        rate: '1.125'
    });
});

ava.serial('speech_init() reads exactly STORAGE_KEY.ATC_SPEECH_ENABLED once through the adapter', (t) => {
    const storageAdapter = buildStorageAdapter();

    speech_init(storageAdapter);

    t.true(storageAdapter.get.calledOnceWithExactly(STORAGE_KEY.ATC_SPEECH_ENABLED));
});

ava.serial('speech_init() enables speech and adds the ACTIVE class only for a raw boolean true', (t) => {
    mountToggleElement();
    const storageAdapter = buildStorageAdapter({ storedValue: true });

    speech_init(storageAdapter);

    t.true(prop.speech.enabled);
    t.true(toggleHasActiveClass());
});

ava.serial('speech_init() leaves speech disabled for the string "true" (inherited strict comparison)', (t) => {
    mountToggleElement();
    const storageAdapter = buildStorageAdapter({ storedValue: 'true' });

    speech_init(storageAdapter);

    t.false(prop.speech.enabled);
    t.false(toggleHasActiveClass());
});

ava.serial('speech_init() leaves speech disabled and unmarked for non-true raw values', (t) => {
    const nonTrueValues = [null, undefined, false, 'false', 1];

    nonTrueValues.forEach((storedValue) => {
        mountToggleElement();
        speech_init(buildStorageAdapter({ storedValue }));

        t.false(prop.speech.enabled, `expected disabled for ${String(storedValue)}`);
        t.false(toggleHasActiveClass(), `expected no ACTIVE class for ${String(storedValue)}`);
    });
});

ava.serial('speech_init() retains the exact speech synthesis adapter identity on prop.speech.synthesis', (t) => {
    const speechSynthesisAdapter = buildSpeechSynthesisAdapter();

    speech_init(buildStorageAdapter(), speechSynthesisAdapter);

    t.is(prop.speech.synthesis, speechSynthesisAdapter);
});

ava.serial('speech_init() normalizes an omitted speech synthesis adapter to canonical null', (t) => {
    speech_init(buildStorageAdapter());

    t.is(prop.speech.synthesis, null);
});

ava.serial('speech_init() without an adapter performs no storage read and leaves speech disabled', (t) => {
    mountToggleElement();

    speech_init();

    t.false(prop.speech.enabled);
    t.false(toggleHasActiveClass());
    t.is(prop.speech.synthesis, null);
});

ava.serial('speech_init() does not read the window speech synthesis globals', (t) => {
    const restore = installHostileSpeechGlobals();
    t.teardown(restore);

    t.notThrows(() => speech_init(buildStorageAdapter({ storedValue: true }), buildSpeechSynthesisAdapter()));
});

ava.serial('speech_init() retains the exact adapter so speech_toggle persists through it', (t) => {
    const storageAdapter = buildStorageAdapter();
    const speechSynthesisAdapter = buildSpeechSynthesisAdapter();

    speech_init(storageAdapter, speechSynthesisAdapter);
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.true(storageAdapter.set.calledOnceWithExactly(STORAGE_KEY.ATC_SPEECH_ENABLED, true));
});

ava.serial('speech_init() with a nullish reinitialization clears the retained adapter', (t) => {
    const storageAdapter = buildStorageAdapter();

    speech_init(storageAdapter, buildSpeechSynthesisAdapter());
    speech_init();
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.false(storageAdapter.set.called);
});

ava.serial('speech_say() forwards the exact assembled text and pilotVoice to the adapter once when enabled and configured', (t) => {
    const speechSynthesisAdapter = buildSpeechSynthesisAdapter();
    speech_init(buildStorageAdapter({ storedValue: true }), speechSynthesisAdapter);
    const sentence = [
        { type: 'text', content: 'descend' },
        { type: 'callsign', content: { getRadioCallsign: () => 'united one' } }
    ];
    const pilotVoice = { voice: 'Alice', rate: '1.100', pitch: '0.9' };

    speech_say(sentence, pilotVoice);

    t.true(speechSynthesisAdapter.speak.calledOnceWithExactly(' descend  united one ', pilotVoice));
});

ava.serial('speech_say() is a no-op when speech is disabled', (t) => {
    const speechSynthesisAdapter = buildSpeechSynthesisAdapter();
    speech_init(buildStorageAdapter({ storedValue: null }), speechSynthesisAdapter);

    speech_say([{ type: 'text', content: 'ignored' }], { voice: 'Alice' });

    t.false(speechSynthesisAdapter.speak.called);
});

ava.serial('speech_say() is a no-op when no synthesis adapter is configured', (t) => {
    speech_init(buildStorageAdapter({ storedValue: true }));

    t.notThrows(() => speech_say([{ type: 'text', content: 'ignored' }], { voice: 'Alice' }));
});

ava.serial('speech_say() returns undefined', (t) => {
    const speechSynthesisAdapter = buildSpeechSynthesisAdapter();
    speech_init(buildStorageAdapter({ storedValue: true }), speechSynthesisAdapter);

    const result = speech_say([{ type: 'text', content: 'words' }], { voice: 'Alice' });

    t.is(result, undefined);
});

ava.serial('speech_say() does not read the window speech synthesis globals', (t) => {
    const speechSynthesisAdapter = buildSpeechSynthesisAdapter();
    speech_init(buildStorageAdapter({ storedValue: true }), speechSynthesisAdapter);
    const restore = installHostileSpeechGlobals();
    t.teardown(restore);

    t.notThrows(() => speech_say([{ type: 'text', content: 'words' }], { voice: 'Alice' }));
    t.true(speechSynthesisAdapter.speak.calledOnce);
});

ava.serial('speech_toggle() persists the raw boolean true when enabling speech', (t) => {
    mountToggleElement();
    const storageAdapter = buildStorageAdapter({ storedValue: null });
    speech_init(storageAdapter, buildSpeechSynthesisAdapter());
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.true(prop.speech.enabled);
    t.true(storageAdapter.set.calledOnceWithExactly(STORAGE_KEY.ATC_SPEECH_ENABLED, true));
});

ava.serial('speech_toggle() persists the raw boolean false and cancels synthesis when disabling', (t) => {
    mountToggleElement();
    const storageAdapter = buildStorageAdapter({ storedValue: true });
    const speechSynthesisAdapter = buildSpeechSynthesisAdapter();
    speech_init(storageAdapter, speechSynthesisAdapter);
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.false(prop.speech.enabled);
    t.true(speechSynthesisAdapter.cancel.calledOnceWithExactly());
    t.false(toggleHasActiveClass());
    t.true(storageAdapter.set.calledOnceWithExactly(STORAGE_KEY.ATC_SPEECH_ENABLED, false));
});

ava.serial('speech_toggle() persists after the class mutation and before recording analytics', (t) => {
    mountToggleElement();
    const storageAdapter = buildStorageAdapter({ storedValue: null });
    speech_init(storageAdapter, buildSpeechSynthesisAdapter());
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.true(toggleHasActiveClass());
    t.true(storageAdapter.set.calledBefore(recordEventStub));
});

ava.serial('speech_toggle() records the OPTIONS/speech analytics event with the hasClass label', (t) => {
    mountToggleElement();
    const storageAdapter = buildStorageAdapter({ storedValue: null });
    speech_init(storageAdapter, buildSpeechSynthesisAdapter());
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.true(recordEventStub.calledOnceWithExactly(TRACKABLE_EVENT.OPTIONS, 'speech', 'true'));
});

ava.serial('speech_toggle() without a synthesis adapter preserves flip, class toggle, and analytics', (t) => {
    mountToggleElement();
    speech_init(buildStorageAdapter({ storedValue: null }));
    // Simulate an already-enabled session so the toggle exercises the disabling path.
    prop.speech.enabled = true;
    toggleElement().classList.add(SELECTORS.CLASSNAMES.ACTIVE);
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    // The disabling path reaches the conditional cancel with no adapter configured,
    // so it must be a safe no-op rather than a global access.
    t.notThrows(() => speech_toggle());

    t.false(prop.speech.enabled);
    t.false(toggleHasActiveClass());
    t.true(recordEventStub.calledOnceWithExactly(TRACKABLE_EVENT.OPTIONS, 'speech', 'false'));
});

ava.serial('speech_toggle() returns undefined', (t) => {
    const storageAdapter = buildStorageAdapter({ storedValue: null });
    speech_init(storageAdapter, buildSpeechSynthesisAdapter());
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    const result = speech_toggle();

    t.is(result, undefined);
});
