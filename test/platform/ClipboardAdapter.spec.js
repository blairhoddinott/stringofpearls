import ava from 'ava';
import sinon from 'sinon';
import ClipboardAdapter from '../../src/assets/scripts/client/platform/ClipboardAdapter';

ava('.writeText() delegates the exact text to the injected callable', (t) => {
    const writeText = sinon.stub().returns(undefined);
    const clipboardAdapter = new ClipboardAdapter(writeText);

    clipboardAdapter.writeText('42.000000000, -71.000000000');

    t.true(writeText.calledOnceWithExactly('42.000000000, -71.000000000'));
});

ava('.writeText() returns the callable result verbatim', (t) => {
    const result = Promise.resolve('written');
    const writeText = sinon.stub().returns(result);
    const clipboardAdapter = new ClipboardAdapter(writeText);

    t.is(clipboardAdapter.writeText('text'), result);
});

ava('.writeText() lets a synchronous thrown error propagate with the exact error identity', (t) => {
    const failure = new Error('clipboard unavailable');
    const writeText = sinon.stub().throws(failure);
    const clipboardAdapter = new ClipboardAdapter(writeText);

    const thrown = t.throws(() => clipboardAdapter.writeText('text'));

    t.is(thrown, failure);
});

ava('.writeText() returns undefined without side effects when no callable is provided', (t) => {
    const clipboardAdapter = new ClipboardAdapter();

    t.is(clipboardAdapter.writeText('text'), undefined);
});

ava('.writeText() returns undefined without side effects when the callable is explicitly null', (t) => {
    const clipboardAdapter = new ClipboardAdapter(null);

    t.is(clipboardAdapter.writeText('text'), undefined);
});

ava('.writeText() treats an undefined callable as a disabled no-op', (t) => {
    const clipboardAdapter = new ClipboardAdapter(undefined);

    t.is(clipboardAdapter.writeText('text'), undefined);
});
