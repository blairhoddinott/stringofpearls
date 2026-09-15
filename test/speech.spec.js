import ava from 'ava';
import sinon from 'sinon';
import { speech_init, speech_toggle } from '../src/assets/scripts/client/speech';
import EventTracker from '../src/assets/scripts/client/EventTracker';
import { STORAGE_KEY } from '../src/assets/scripts/client/constants/storageKeys';
import { SELECTORS } from '../src/assets/scripts/client/constants/selectors';
import { TRACKABLE_EVENT } from '../src/assets/scripts/client/constants/trackableEvents';

// Build a storage adapter stub exposing only the `get(key)`/`set(key, value)`
// contract, so the speech-preference boundary is exercised without a global
// `localStorage` backend.
const buildStorageAdapter = (options = {}) => ({
    get: sinon.stub().returns(Object.prototype.hasOwnProperty.call(options, 'storedValue')
        ? options.storedValue
        : null),
    set: sinon.stub()
});

// Insert the toggle element jQuery targets so ACTIVE-class mutations are
// observable. Speech synthesis and jQuery remain deliberately unmigrated, so
// this is the minimum DOM fixture required.
const mountToggleElement = () => {
    window.document.body.innerHTML = `<div class="${SELECTORS.CLASSNAMES.TOGGLE_SPEECH}"></div>`;
};

const toggleElement = () => window.document
    .querySelector(SELECTORS.DOM_SELECTORS.TOGGLE_SPEECH);

const toggleHasActiveClass = () => toggleElement()
    .classList.contains(SELECTORS.CLASSNAMES.ACTIVE);

// Give `prop.speech.synthesis` a cancel spy so disabling toggles do not touch
// the unmigrated `window.speechSynthesis` global.
const stubSynthesis = () => {
    const cancel = sinon.stub();

    prop.speech.synthesis = { cancel };

    return cancel;
};

ava.afterEach.always(() => {
    // Clear retained module adapter configuration so no test leaks into the next.
    speech_init();
    prop.speech = undefined;
    window.document.body.innerHTML = '';
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

ava.serial('speech_init() without an adapter performs no storage read and leaves speech disabled', (t) => {
    mountToggleElement();

    speech_init();

    t.false(prop.speech.enabled);
    t.false(toggleHasActiveClass());
    t.is(prop.speech.synthesis, window.speechSynthesis);
});

ava.serial('speech_init() retains the exact adapter so speech_toggle persists through it', (t) => {
    const storageAdapter = buildStorageAdapter();

    speech_init(storageAdapter);
    stubSynthesis();
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.true(storageAdapter.set.calledOnceWithExactly(STORAGE_KEY.ATC_SPEECH_ENABLED, true));
});

ava.serial('speech_init() with a nullish reinitialization clears the retained adapter', (t) => {
    const storageAdapter = buildStorageAdapter();

    speech_init(storageAdapter);
    speech_init();
    stubSynthesis();
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.false(storageAdapter.set.called);
});

ava.serial('speech_toggle() persists the raw boolean true when enabling speech', (t) => {
    mountToggleElement();
    const storageAdapter = buildStorageAdapter({ storedValue: null });
    speech_init(storageAdapter);
    stubSynthesis();
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.true(prop.speech.enabled);
    t.true(storageAdapter.set.calledOnceWithExactly(STORAGE_KEY.ATC_SPEECH_ENABLED, true));
});

ava.serial('speech_toggle() persists the raw boolean false and cancels synthesis when disabling', (t) => {
    mountToggleElement();
    const storageAdapter = buildStorageAdapter({ storedValue: true });
    speech_init(storageAdapter);
    const cancel = stubSynthesis();
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.false(prop.speech.enabled);
    t.true(cancel.calledOnce);
    t.false(toggleHasActiveClass());
    t.true(storageAdapter.set.calledOnceWithExactly(STORAGE_KEY.ATC_SPEECH_ENABLED, false));
});

ava.serial('speech_toggle() persists after the class mutation and before recording analytics', (t) => {
    mountToggleElement();
    const storageAdapter = buildStorageAdapter({ storedValue: null });
    speech_init(storageAdapter);
    stubSynthesis();
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.true(toggleHasActiveClass());
    t.true(storageAdapter.set.calledBefore(recordEventStub));
});

ava.serial('speech_toggle() records the OPTIONS/speech analytics event with the hasClass label', (t) => {
    mountToggleElement();
    const storageAdapter = buildStorageAdapter({ storedValue: null });
    speech_init(storageAdapter);
    stubSynthesis();
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.true(recordEventStub.calledOnceWithExactly(TRACKABLE_EVENT.OPTIONS, 'speech', 'true'));
});

ava.serial('speech_toggle() without an adapter preserves flip, cancel, class toggle, and analytics', (t) => {
    mountToggleElement();
    speech_init();
    // Simulate an already-enabled session so the toggle exercises the disabling path.
    prop.speech.enabled = true;
    toggleElement().classList.add(SELECTORS.CLASSNAMES.ACTIVE);
    const cancel = stubSynthesis();
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    speech_toggle();

    t.false(prop.speech.enabled);
    t.true(cancel.calledOnce);
    t.false(toggleHasActiveClass());
    t.true(recordEventStub.calledOnceWithExactly(TRACKABLE_EVENT.OPTIONS, 'speech', 'false'));
});

ava.serial('speech_toggle() returns undefined', (t) => {
    const storageAdapter = buildStorageAdapter({ storedValue: null });
    speech_init(storageAdapter);
    stubSynthesis();
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());

    const result = speech_toggle();

    t.is(result, undefined);
});
