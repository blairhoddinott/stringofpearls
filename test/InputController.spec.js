import ava from 'ava';
import sinon from 'sinon';
import InputController from '../src/assets/scripts/client/InputController';
import InputEventBindings from '../src/assets/scripts/client/input/InputEventBindings';
import AutocompleteController from '../src/assets/scripts/client/ui/autocomplete/AutocompleteController';
import UiController from '../src/assets/scripts/client/ui/UiController';
import { EVENT } from '../src/assets/scripts/client/constants/eventNames';

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

ava('._createInputEventBindings() composes exact targets and handler identities', (t) => {
    const controller = Object.create(InputController.prototype);
    controller.$window = {};
    controller.$canvases = {};
    controller.$body = {};
    controller._eventBus = {};
    controller.onKeydownHandler = () => {};
    controller.onKeyupHandler = () => {};
    controller.onMouseScrollHandler = () => {};
    controller.onMouseClickAndDragHandler = () => {};
    controller.onMouseUpHandler = () => {};
    controller.onMouseDownHandler = () => {};
    controller.onMouseDblclickHandler = () => {};
    controller.selectAircraftByCallsign = () => {};

    const bindings = controller._createInputEventBindings();

    t.true(bindings instanceof InputEventBindings);
    t.is(bindings._windowTarget, controller.$window);
    t.is(bindings._canvasTarget, controller.$canvases);
    t.is(bindings._bodyTarget, controller.$body);
    t.is(bindings._eventBus, controller._eventBus);
    t.is(bindings._stripClickEvent, EVENT.STRIP_CLICK);
    t.is(typeof bindings._handlers, 'function');
    t.deepEqual(bindings._handlers(), {
        keydown: controller.onKeydownHandler,
        keyup: controller.onKeyupHandler,
        mouseScroll: controller.onMouseScrollHandler,
        mouseMove: controller.onMouseClickAndDragHandler,
        mouseUp: controller.onMouseUpHandler,
        mouseDown: controller.onMouseDownHandler,
        doubleClick: controller.onMouseDblclickHandler,
        stripClick: controller.selectAircraftByCallsign
    });
});

ava('.enable() delegates to exact input-event bindings and returns the controller', (t) => {
    const bindings = { enable: sinon.spy() };
    const controller = Object.create(InputController.prototype);
    controller._inputEventBindings = bindings;

    t.is(controller.enable(), controller);
    t.true(bindings.enable.calledOnceWithExactly());
});

ava('.disable() delegates before destroy and returns the destroy result', (t) => {
    const calls = [];
    const result = {};
    const controller = Object.create(InputController.prototype);
    controller._inputEventBindings = { disable: () => calls.push('disable') };
    controller.destroy = () => {
        calls.push('destroy');

        return result;
    };

    t.is(controller.disable(), result);
    t.deepEqual(calls, ['disable', 'destroy']);
});

ava('.setupHandlers() refreshes callbacks used by an already-created default boundary', (t) => {
    const registrations = [];
    const controller = Object.create(InputController.prototype);
    controller.$window = {
        on: (...args) => registrations.push(['window.on', ...args])
    };
    controller.$canvases = {
        bind: (...args) => registrations.push(['canvas.bind', ...args]),
        on: (...args) => registrations.push(['canvas.on', ...args])
    };
    controller.$body = {
        addEventListener: (...args) => registrations.push(['body.addEventListener', ...args])
    };
    controller._eventBus = {
        on: (...args) => registrations.push(['eventBus.on', ...args])
    };
    controller._onKeydown = () => {};
    controller._onKeyup = () => {};
    controller._onMouseScroll = () => {};
    controller._onMouseClickAndDrag = () => {};
    controller._onMouseUp = () => {};
    controller._onMouseDown = () => {};
    controller._onMouseDblclick = () => {};
    controller.selectAircraftByCallsign = () => {};

    controller.setupHandlers();
    controller._inputEventBindings = controller._createInputEventBindings();
    const originalKeydown = controller.onKeydownHandler;
    controller.setupHandlers();

    t.not(controller.onKeydownHandler, originalKeydown);
    controller._inputEventBindings.enable();
    t.deepEqual(registrations[0], ['window.on', 'keydown', controller.onKeydownHandler]);
});

ava.serial('constructor retains an explicitly supplied trailing input-event boundary', (t) => {
    const inputInit = sinon.stub(InputController.prototype, '_init');
    const autocompleteInit = sinon.stub(AutocompleteController.prototype, '_init');
    const bindings = {};
    const element = {};

    try {
        const controller = new InputController(
            element,
            {},
            {},
            {},
            null,
            null,
            null,
            bindings
        );

        t.is(controller._inputEventBindings, bindings);
        t.true(inputInit.calledOnceWithExactly());
        t.true(autocompleteInit.calledOnceWithExactly());
    } finally {
        inputInit.restore();
        autocompleteInit.restore();
    }
});
