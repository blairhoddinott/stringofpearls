import ava from 'ava';
import sinon from 'sinon';
import InputController from '../src/assets/scripts/client/InputController';
import UiController from '../src/assets/scripts/client/ui/UiController';

// The copy-coordinates command is exercised directly through the prototype
// method with a minimal `this`, so the clipboard boundary and success-log
// behavior are validated without constructing the full (DOM/jQuery-bound)
// `InputController` or touching a real clipboard/global.
const invokeLogAndCopy = (clipboardAdapter, latLonCoordinates) =>
    InputController.prototype._logAndCopyCoordinates.call({ _clipboardAdapter: clipboardAdapter }, latLonCoordinates);

ava.afterEach.always(() => {
    sinon.restore();
});

ava.serial('._logAndCopyCoordinates() delegates the exact 9-decimal formatted text to the clipboard adapter', async (t) => {
    const writeResult = Promise.resolve();
    const clipboardAdapter = { writeText: sinon.stub().returns(writeResult) };
    sinon.stub(console, 'log');
    sinon.stub(UiController, 'ui_log');

    invokeLogAndCopy(clipboardAdapter, [42.123456789, -71.98765432]);

    t.true(clipboardAdapter.writeText.calledOnceWithExactly('42.123456789, -71.987654320'));

    // Let the success `.then` settle so nothing rejects after the test ends.
    await writeResult;
});

ava.serial('._logAndCopyCoordinates() logs to console before the exact UiController message after the write resolves', async (t) => {
    const writeResult = Promise.resolve();
    const clipboardAdapter = { writeText: sinon.stub().returns(writeResult) };
    const consoleLog = sinon.stub(console, 'log');
    const uiLog = sinon.stub(UiController, 'ui_log');

    invokeLogAndCopy(clipboardAdapter, [42.123456789, -71.98765432]);

    // Nothing logs until the clipboard write promise resolves.
    t.false(consoleLog.called);
    t.false(uiLog.called);

    await writeResult;

    t.true(consoleLog.calledOnceWithExactly('42.123456789, -71.987654320'));
    t.true(uiLog.calledOnceWithExactly(
        'Clicked coordinates: 42.123456789, -71.987654320 (logged to console and copied to clipboard!)',
        true
    ));
    t.true(consoleLog.calledBefore(uiLog));
});

ava.serial('._logAndCopyCoordinates() returns undefined and never logs the promise result', async (t) => {
    const writeResult = Promise.resolve();
    const clipboardAdapter = { writeText: sinon.stub().returns(writeResult) };
    sinon.stub(console, 'log');
    sinon.stub(UiController, 'ui_log');

    t.is(invokeLogAndCopy(clipboardAdapter, [1, 2]), undefined);

    // Let the success `.then` settle so nothing rejects after the test ends.
    await writeResult;
});

ava.serial('._logAndCopyCoordinates() is a no-op with no logs when the clipboard adapter is omitted', (t) => {
    const consoleLog = sinon.stub(console, 'log');
    const uiLog = sinon.stub(UiController, 'ui_log');

    const result = invokeLogAndCopy(null, [42.123456789, -71.98765432]);

    t.is(result, undefined);
    t.false(consoleLog.called);
    t.false(uiLog.called);
});

ava.serial('._logAndCopyCoordinates() is a no-op when the configured adapter has no backend', (t) => {
    const clipboardAdapter = { writeText: sinon.stub().returns(undefined) };
    const consoleLog = sinon.stub(console, 'log');
    const uiLog = sinon.stub(UiController, 'ui_log');

    const result = invokeLogAndCopy(clipboardAdapter, [42.123456789, -71.98765432]);

    t.is(result, undefined);
    t.true(clipboardAdapter.writeText.calledOnceWithExactly('42.123456789, -71.987654320'));
    t.false(consoleLog.called);
    t.false(uiLog.called);
});

ava.serial('._logAndCopyCoordinates() lets a synchronous clipboard write error propagate with the exact identity', (t) => {
    const failure = new Error('clipboard blocked');
    const clipboardAdapter = { writeText: sinon.stub().throws(failure) };

    const thrown = t.throws(() => invokeLogAndCopy(clipboardAdapter, [1, 2]));

    t.is(thrown, failure);
});
