import ava from 'ava';
import sinon from 'sinon';
import SpeechSynthesisAdapter from '../../src/assets/scripts/client/platform/SpeechSynthesisAdapter';

// Build a mutable utterance target so property assignments are observable, plus
// a factory spy that returns it. No browser `SpeechSynthesisUtterance` global is
// touched.
const buildUtterance = () => ({});
const buildUtteranceFactory = (utterance) => sinon.stub().returns(utterance);

// Build a speech synthesis backend stub exposing only the `getVoices()`,
// `speak(utterance)`, and `cancel()` contract used by the adapter, so no browser
// `speechSynthesis` global is touched.
const buildSynthesis = (options = {}) => ({
    getVoices: sinon.stub().returns(options.voices || []),
    speak: sinon.stub().returns(options.speakResult),
    cancel: sinon.stub().returns(options.cancelResult)
});

const buildPilotVoice = (overrides = {}) => ({
    voice: 'Alice',
    rate: '1.100',
    pitch: '0.9',
    ...overrides
});

ava('.speak() sets utterance properties to the exact observable state', (t) => {
    const utterance = buildUtterance();
    const utteranceFactory = buildUtteranceFactory(utterance);
    const matchedVoice = { name: 'Alice' };
    const synthesis = buildSynthesis({ voices: [{ name: 'Bob' }, matchedVoice] });
    const adapter = new SpeechSynthesisAdapter(synthesis, utteranceFactory);

    adapter.speak('hello there', buildPilotVoice());

    t.true(utteranceFactory.calledOnceWithExactly('hello there'));
    t.is(utterance.lang, 'en-US');
    t.is(utterance.voice, matchedVoice);
    t.is(utterance.rate, '1.100');
    t.is(utterance.pitch, '0.9');
});

ava('.speak() performs voice selection, rate, then pitch before speaking with the utterance', (t) => {
    const setOrder = [];
    const utterance = {};

    ['lang', 'voice', 'rate', 'pitch'].forEach((propName) => {
        Object.defineProperty(utterance, propName, {
            set(value) {
                setOrder.push(propName);
                Object.defineProperty(this, `_${propName}`, { value, writable: true });
            },
            get() {
                return this[`_${propName}`];
            }
        });
    });

    const utteranceFactory = buildUtteranceFactory(utterance);
    const synthesis = buildSynthesis({ voices: [{ name: 'Alice' }] });
    const adapter = new SpeechSynthesisAdapter(synthesis, utteranceFactory);

    adapter.speak('words', buildPilotVoice());

    t.deepEqual(setOrder, ['lang', 'voice', 'rate', 'pitch']);
    t.true(synthesis.getVoices.calledBefore(synthesis.speak));
    t.true(synthesis.speak.calledOnceWithExactly(utterance));
});

ava('.speak() selects the first backend voice whose name matches pilotVoice.voice', (t) => {
    const utterance = buildUtterance();
    const firstMatch = { name: 'Alice', id: 1 };
    const secondMatch = { name: 'Alice', id: 2 };
    const synthesis = buildSynthesis({ voices: [{ name: 'Bob' }, firstMatch, secondMatch] });
    const adapter = new SpeechSynthesisAdapter(synthesis, buildUtteranceFactory(utterance));

    adapter.speak('words', buildPilotVoice({ voice: 'Alice' }));

    t.is(utterance.voice, firstMatch);
});

ava('.speak() assigns undefined voice when no backend voice name matches', (t) => {
    const utterance = buildUtterance();
    const synthesis = buildSynthesis({ voices: [{ name: 'Bob' }, { name: 'Carol' }] });
    const adapter = new SpeechSynthesisAdapter(synthesis, buildUtteranceFactory(utterance));

    adapter.speak('words', buildPilotVoice({ voice: 'Nobody' }));

    t.is(utterance.voice, undefined);
});

ava('.speak() returns the backend speak() result verbatim', (t) => {
    const result = { spoken: true };
    const synthesis = buildSynthesis({ voices: [], speakResult: result });
    const adapter = new SpeechSynthesisAdapter(synthesis, buildUtteranceFactory(buildUtterance()));

    t.is(adapter.speak('words', buildPilotVoice()), result);
});

ava('.speak() lets a backend speak() error propagate with the exact error identity', (t) => {
    const failure = new Error('speak unavailable');
    const synthesis = buildSynthesis({ voices: [] });
    synthesis.speak.throws(failure);
    const adapter = new SpeechSynthesisAdapter(synthesis, buildUtteranceFactory(buildUtterance()));

    const thrown = t.throws(() => adapter.speak('words', buildPilotVoice()));

    t.is(thrown, failure);
});

ava('.speak() recovers its queue after a synchronous backend error', (t) => {
    const failure = new Error('speak unavailable');
    const firstUtterance = buildUtterance();
    const secondUtterance = buildUtterance();
    const utteranceFactory = sinon.stub();
    utteranceFactory.onFirstCall().returns(firstUtterance);
    utteranceFactory.onSecondCall().returns(secondUtterance);
    const synthesis = buildSynthesis({ voices: [] });
    synthesis.speak.onFirstCall().throws(failure);
    const adapter = new SpeechSynthesisAdapter(synthesis, utteranceFactory);

    t.throws(() => adapter.speak('failed', buildPilotVoice()), { is: failure });
    adapter.speak('next', buildPilotVoice());

    t.true(synthesis.speak.calledTwice);
    t.true(synthesis.speak.secondCall.calledWithExactly(secondUtterance));
});

ava('.speak() advances past a synchronous failure to an item already waiting in the queue', (t) => {
    const failure = new Error('queued speak unavailable');
    const activeUtterance = buildUtterance();
    const failedUtterance = buildUtterance();
    const waitingUtterance = buildUtterance();
    const utteranceFactory = sinon.stub();
    utteranceFactory.onFirstCall().returns(activeUtterance);
    utteranceFactory.onSecondCall().returns(failedUtterance);
    utteranceFactory.onThirdCall().returns(waitingUtterance);
    const synthesis = buildSynthesis({ voices: [] });
    synthesis.speak.onSecondCall().throws(failure);
    const adapter = new SpeechSynthesisAdapter(synthesis, utteranceFactory);

    adapter.speak('active', buildPilotVoice());
    adapter.speak('fails', buildPilotVoice());
    adapter.speak('waiting', buildPilotVoice());
    t.throws(() => activeUtterance.onend(), { is: failure });

    t.true(synthesis.speak.calledThrice);
    t.true(synthesis.speak.thirdCall.calledWithExactly(waitingUtterance));
    t.is(adapter._current.text, 'waiting');
    t.deepEqual(adapter._queue, []);
});

ava('.speak() drops queued speech that becomes ineligible before playback', (t) => {
    const firstUtterance = buildUtterance();
    const secondUtterance = buildUtterance();
    const utteranceFactory = sinon.stub();
    utteranceFactory.onFirstCall().returns(firstUtterance);
    utteranceFactory.onSecondCall().returns(secondUtterance);
    const synthesis = buildSynthesis({ voices: [{ name: 'Alice' }] });
    const adapter = new SpeechSynthesisAdapter(synthesis, utteranceFactory);
    let secondIsEligible = true;

    adapter.speak('first', buildPilotVoice(), () => true);
    adapter.speak('second', buildPilotVoice(), () => secondIsEligible);
    secondIsEligible = false;
    firstUtterance.onend();

    t.true(synthesis.speak.calledOnceWithExactly(firstUtterance));
    t.true(utteranceFactory.calledOnceWithExactly('first'));
});

ava('.discardIneligible() stops ineligible active speech and continues with eligible queued speech', (t) => {
    const firstUtterance = buildUtterance();
    const secondUtterance = buildUtterance();
    const utteranceFactory = sinon.stub();
    utteranceFactory.onFirstCall().returns(firstUtterance);
    utteranceFactory.onSecondCall().returns(secondUtterance);
    const synthesis = buildSynthesis({ voices: [{ name: 'Alice' }] });
    const adapter = new SpeechSynthesisAdapter(synthesis, utteranceFactory);
    let firstIsEligible = true;

    adapter.speak('first', buildPilotVoice(), () => firstIsEligible);
    adapter.speak('second', buildPilotVoice(), () => true);
    firstIsEligible = false;
    adapter.discardIneligible();

    t.true(synthesis.cancel.calledOnceWithExactly());
    t.true(synthesis.speak.calledTwice);
    t.true(synthesis.speak.secondCall.calledWithExactly(secondUtterance));
});

ava('.speak() returns undefined without side effects when the backend is omitted', (t) => {
    const utteranceFactory = buildUtteranceFactory(buildUtterance());
    const adapter = new SpeechSynthesisAdapter(null, utteranceFactory);

    t.is(adapter.speak('words', buildPilotVoice()), undefined);
    t.false(utteranceFactory.called);
});

ava('.speak() returns undefined without side effects when the utterance factory is omitted', (t) => {
    const synthesis = buildSynthesis();
    const adapter = new SpeechSynthesisAdapter(synthesis, null);

    t.is(adapter.speak('words', buildPilotVoice()), undefined);
    t.false(synthesis.getVoices.called);
    t.false(synthesis.speak.called);
});

ava('.speak() returns undefined when both capabilities are omitted (no args)', (t) => {
    const adapter = new SpeechSynthesisAdapter();

    t.is(adapter.speak('words', buildPilotVoice()), undefined);
});

ava('.speak() treats explicit undefined/null capabilities as disabled no-ops', (t) => {
    t.is(new SpeechSynthesisAdapter(undefined, undefined).speak('w', buildPilotVoice()), undefined);
    t.is(new SpeechSynthesisAdapter(null, null).speak('w', buildPilotVoice()), undefined);
    t.is(new SpeechSynthesisAdapter(buildSynthesis(), null).speak('w', buildPilotVoice()), undefined);
    t.is(new SpeechSynthesisAdapter(null, buildUtteranceFactory(buildUtterance())).speak('w', buildPilotVoice()), undefined);
});

ava('.cancel() delegates exactly to the backend and returns its result verbatim', (t) => {
    const result = { cancelled: true };
    const synthesis = buildSynthesis({ cancelResult: result });
    const adapter = new SpeechSynthesisAdapter(synthesis, buildUtteranceFactory(buildUtterance()));

    t.is(adapter.cancel(), result);
    t.true(synthesis.cancel.calledOnceWithExactly());
});

ava('.cancel() lets a backend cancel() error propagate with the exact error identity', (t) => {
    const failure = new Error('cancel unavailable');
    const synthesis = buildSynthesis();
    synthesis.cancel.throws(failure);
    const adapter = new SpeechSynthesisAdapter(synthesis, null);

    const thrown = t.throws(() => adapter.cancel());

    t.is(thrown, failure);
});

ava('.cancel() returns undefined without side effects when the backend is omitted', (t) => {
    t.is(new SpeechSynthesisAdapter().cancel(), undefined);
    t.is(new SpeechSynthesisAdapter(null, buildUtteranceFactory(buildUtterance())).cancel(), undefined);
    t.is(new SpeechSynthesisAdapter(undefined, undefined).cancel(), undefined);
});
