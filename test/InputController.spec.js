import ava from 'ava';
import sinon from 'sinon';
import InputController from '../src/assets/scripts/client/InputController';
import InputEventBindings from '../src/assets/scripts/client/input/InputEventBindings';
import MeasurementInteraction from '../src/assets/scripts/client/input/MeasurementInteraction';
import AircraftSelectionInteraction from '../src/assets/scripts/client/input/AircraftSelectionInteraction';
import CommandInteraction from '../src/assets/scripts/client/input/CommandInteraction';
import ViewportGestureInteraction from '../src/assets/scripts/client/input/ViewportGestureInteraction';
import KeyboardInteraction from '../src/assets/scripts/client/input/KeyboardInteraction';
import AutocompleteController from '../src/assets/scripts/client/ui/autocomplete/AutocompleteController';
import CanvasStageModel from '../src/assets/scripts/client/canvas/CanvasStageModel';
import MeasureTool from '../src/assets/scripts/client/measurement/MeasureTool';
import FixCollection from '../src/assets/scripts/client/navigationLibrary/FixCollection';
import UiController from '../src/assets/scripts/client/ui/UiController';
import EventTracker from '../src/assets/scripts/client/EventTracker';
import GameController from '../src/assets/scripts/client/game/GameController';
import AirportController from '../src/assets/scripts/client/airport/AirportController';
import CommandParser from '../src/assets/scripts/client/commands/parsers/CommandParser';
import ScopeCommandModel from '../src/assets/scripts/client/commands/scopeCommand/ScopeCommandModel';
import { EVENT } from '../src/assets/scripts/client/constants/eventNames';
import { GAME_OPTION_NAMES } from '../src/assets/scripts/client/constants/gameOptionConstants';
import { COMMAND_CONTEXT, MOUSE_EVENT_CODE } from '../src/assets/scripts/client/constants/inputConstants';

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

ava.serial('constructor composes the default measurement interaction from exact dependencies', (t) => {
    const inputInit = sinon.stub(InputController.prototype, '_init');
    const autocompleteInit = sinon.stub(AutocompleteController.prototype, '_init');
    const aircraftController = {};

    try {
        const controller = new InputController({}, aircraftController, {}, {}, null, null, null, {});

        t.true(controller._measurementInteraction instanceof MeasurementInteraction);
        t.is(controller._measurementInteraction._viewport, CanvasStageModel);
        t.is(controller._measurementInteraction._measureTool, MeasureTool);
        t.is(controller._measurementInteraction._eventBus, controller._eventBus);
        t.is(controller._measurementInteraction._aircraftController, aircraftController);
        t.is(controller._measurementInteraction._fixCollection, FixCollection);
        t.true(inputInit.calledOnceWithExactly());
        t.true(autocompleteInit.calledOnceWithExactly());
    } finally {
        inputInit.restore();
        autocompleteInit.restore();
    }
});

ava.serial('constructor retains an explicitly supplied trailing measurement interaction', (t) => {
    const inputInit = sinon.stub(InputController.prototype, '_init');
    const autocompleteInit = sinon.stub(AutocompleteController.prototype, '_init');
    const interaction = {};

    try {
        const controller = new InputController(
            {}, {}, {}, {}, null, null, null, {}, interaction
        );

        t.is(controller._measurementInteraction, interaction);
    } finally {
        inputInit.restore();
        autocompleteInit.restore();
    }
});

ava('mouse measurement routes use the exact interaction and preserve returns', (t) => {
    const event = {};
    const calls = [];
    const controller = Object.create(InputController.prototype);
    controller._measurementInteraction = {
        hasStarted: true,
        isMeasuring: true,
        addPoint: (...args) => calls.push(['addPoint', ...args]),
        removePreviousPoint: (...args) => calls.push(['removePreviousPoint', ...args])
    };

    t.is(controller._onMouseClickAndDrag(event), controller);
    t.is(controller._onRightMousePress(event), undefined);
    t.is(controller._onLeftMouseButtonPress(event), undefined);
    t.deepEqual(calls, [
        ['addPoint', event, true],
        ['removePreviousPoint'],
        ['addPoint', event]
    ]);
});

ava.serial('control and escape keyboard routes delegate measurement lifecycle in inherited order', (t) => {
    const calls = [];
    const controller = Object.create(InputController.prototype);
    controller._measurementInteraction = {
        start: () => calls.push('start'),
        stop: () => calls.push('stop'),
        reset: () => calls.push('reset')
    };
    controller._eventBus = {
        trigger: (...args) => calls.push(['trigger', ...args])
    };
    controller._autocompleteController = { active: false };
    controller.$commandInput = { val: () => '' };
    controller.input = { callsign: '' };
    controller._scopeModel = {};
    controller.commandBarContext = COMMAND_CONTEXT.AIRCRAFT;
    controller._isArrowControlMethod = () => false;
    controller.processCommand = () => {};
    controller.selectPreviousAircraft = () => {};
    controller.selectNextAircraft = () => {};
    controller.deselectAircraft = () => calls.push('deselect');
    sinon.stub(UiController, 'closeAllDialogs').callsFake(() => calls.push('closeAllDialogs'));
    controller._keyboardInteraction = controller._createKeyboardInteraction();
    const target = { classList: { contains: () => false }, parentElement: null };

    controller._onKeydown({ originalEvent: { code: 'ControlLeft' }, target });
    controller._onKeyup({ originalEvent: { code: 'ControlLeft' } });
    controller._onKeydown({ originalEvent: { code: 'Escape' }, target });

    t.deepEqual(calls, [
        'start',
        'stop',
        ['trigger', EVENT.MARK_SHALLOW_RENDER],
        'reset',
        'closeAllDialogs',
        'deselect'
    ]);
});

ava('._createAircraftSelectionInteraction() composes exact controller-owned dependencies', (t) => {
    const controller = Object.create(InputController.prototype);
    controller.input = {};
    controller.$commandInput = {};
    controller._eventBus = {};
    controller._aircraftController = {};
    const aircraftModel = { isControllable: false };
    controller._scopeModel = {
        canSelectAircraft: (candidate) => candidate === aircraftModel
    };

    const interaction = controller._createAircraftSelectionInteraction();

    t.true(interaction instanceof AircraftSelectionInteraction);
    t.is(interaction._inputState, controller.input);
    t.is(interaction._commandInput, controller.$commandInput);
    t.is(interaction._eventBus, controller._eventBus);
    t.is(interaction._aircraftController, controller._aircraftController);
    t.is(typeof interaction._legacyInputProvider, 'function');
    t.true(interaction._canSelectAircraft(aircraftModel));
});

ava.serial('constructor retains an explicitly supplied trailing aircraft-selection interaction', (t) => {
    const inputInit = sinon.stub(InputController.prototype, '_init');
    const autocompleteInit = sinon.stub(AutocompleteController.prototype, '_init');
    const selectionInteraction = {};

    try {
        const controller = new InputController(
            {}, {}, {}, {}, null, null, null, {}, {}, selectionInteraction
        );

        t.is(controller._selectionInteraction, selectionInteraction);
    } finally {
        inputInit.restore();
        autocompleteInit.restore();
    }
});

ava.serial('selectAircraft() accepts an offered handoff before selecting it', (t) => {
    const inputInit = sinon.stub(InputController.prototype, '_init');
    const autocompleteInit = sinon.stub(AutocompleteController.prototype, '_init');
    const calls = [];
    const aircraftModel = {};
    const scopeModel = {
        acceptHandoffIfOffered: (aircraft) => calls.push(['accept', aircraft])
    };
    const selectionInteraction = {
        select: (...args) => calls.push(['select', ...args])
    };

    try {
        const controller = new InputController(
            {}, {}, scopeModel, {}, null, null, null, {}, {}, selectionInteraction
        );

        controller.selectAircraft(aircraftModel);

        t.deepEqual(calls.map(([name]) => name), ['accept', 'select']);
        t.is(calls[0][1], aircraftModel);
        t.is(calls[1][1], aircraftModel);
    } finally {
        inputInit.restore();
        autocompleteInit.restore();
    }
});

ava.serial('public aircraft-selection methods delegate through current controller callbacks', (t) => {
    const inputInit = sinon.stub(InputController.prototype, '_init');
    const autocompleteInit = sinon.stub(AutocompleteController.prototype, '_init');
    const calls = [];
    const aircraft = {};
    const nextAircraft = {};
    const selectionInteraction = {
        deselect: (...args) => calls.push(['deselect', ...args]),
        select: (...args) => calls.push(['select', ...args]),
        selectByCallsign: (...args) => calls.push(['selectByCallsign', ...args]),
        selectPrevious: (...args) => calls.push(['selectPrevious', ...args]),
        selectNext: (...args) => calls.push(['selectNext', ...args])
    };

    try {
        const controller = new InputController(
            {}, {}, {}, {}, null, null, null, {}, {}, selectionInteraction
        );

        t.is(controller.deselectAircraft(), undefined);
        t.is(controller.selectAircraft(aircraft), undefined);
        t.is(controller.selectAircraftByCallsign('AAL1'), undefined);
        t.is(controller.selectPreviousAircraft(), undefined);
        t.is(controller.selectNextAircraft(), undefined);
        t.deepEqual(calls.map(([name]) => name), [
            'deselect',
            'select',
            'selectByCallsign',
            'selectPrevious',
            'selectNext'
        ]);
        t.is(calls[1][1], aircraft);
        t.is(typeof calls[1][2], 'function');
        t.is(calls[2][1], 'AAL1');
        t.is(typeof calls[2][2], 'function');
        t.is(typeof calls[3][1], 'function');
        t.is(typeof calls[4][1], 'function');

        calls[1][2]();
        t.deepEqual(calls.at(-1), ['deselect']);

        for (const callback of [calls[2][2], calls[3][1], calls[4][1]]) {
            callback(nextAircraft);
            t.is(calls.at(-1)[0], 'select');
            t.is(calls.at(-1)[1], nextAircraft);
            t.is(typeof calls.at(-1)[2], 'function');
        }
    } finally {
        inputInit.restore();
        autocompleteInit.restore();
    }
});

ava('._createCommandInteraction() composes exact controller and application dependencies', (t) => {
    const controller = Object.create(InputController.prototype);
    controller.input = {};
    controller.$commandInput = {};
    controller._aircraftController = {};
    controller._scopeModel = {};
    controller._clearStorageAndReload = {};

    const interaction = controller._createCommandInteraction();

    t.true(interaction instanceof CommandInteraction);
    t.is(interaction._inputState, controller.input);
    t.is(interaction._commandInput, controller.$commandInput);
    t.is(interaction._aircraftController, controller._aircraftController);
    t.is(interaction._scopeModel, controller._scopeModel);
    t.is(interaction._clearStorageAndReload, controller._clearStorageAndReload);
    t.is(interaction._uiController, UiController);
    t.is(interaction._gameController, GameController);
    t.is(interaction._eventTracker, EventTracker);
    t.is(interaction._airportController, AirportController);
    t.is(interaction._CommandParserClass, CommandParser);
    t.is(interaction._ScopeCommandModelClass, ScopeCommandModel);
});

ava.serial('constructor retains an explicitly supplied trailing command interaction', (t) => {
    const inputInit = sinon.stub(InputController.prototype, '_init');
    const autocompleteInit = sinon.stub(AutocompleteController.prototype, '_init');
    const commandInteraction = {};

    try {
        const controller = new InputController(
            {}, {}, {}, {}, null, null, null, {}, {}, {}, commandInteraction
        );

        t.is(controller._commandInteraction, commandInteraction);
    } finally {
        inputInit.restore();
        autocompleteInit.restore();
    }
});

ava.serial('public command methods delegate through current controller callbacks', (t) => {
    const inputInit = sinon.stub(InputController.prototype, '_init');
    const autocompleteInit = sinon.stub(AutocompleteController.prototype, '_init');
    const calls = [];
    const response = {};
    const parsedCommand = {};
    const interaction = {
        process: (...args) => { calls.push(['process', ...args]); return response; },
        processAircraft: (...args) => { calls.push(['processAircraft', ...args]); return response; },
        processScope: (...args) => { calls.push(['processScope', ...args]); return response; },
        processSystem: (...args) => { calls.push(['processSystem', ...args]); return response; },
        processTransmit: (...args) => { calls.push(['processTransmit', ...args]); return response; }
    };

    try {
        const controller = new InputController(
            {}, {}, {}, {}, null, null, null, {}, {}, {}, interaction
        );
        controller.deselectAircraft = () => calls.push(['deselect']);

        t.is(controller.processCommand(), response);
        t.is(controller.processAircraftCommand(), response);
        t.is(controller.processScopeCommand(), response);
        t.is(controller.processSystemCommand(parsedCommand), response);
        t.is(controller.processTransmitCommand(parsedCommand), response);
        t.deepEqual(calls.map(([name]) => name), [
            'process',
            'processAircraft',
            'processScope',
            'processSystem',
            'processTransmit'
        ]);
        t.is(calls[0][1], controller.commandBarContext);
        t.is(typeof calls[0][2].processAircraft, 'function');
        t.is(typeof calls[0][2].processScope, 'function');
        t.is(typeof calls[0][2].deselect, 'function');
        t.is(typeof calls[1][1].processSystem, 'function');
        t.is(typeof calls[1][1].processTransmit, 'function');
        t.is(calls[3][1], parsedCommand);
        t.is(calls[4][1], parsedCommand);

        calls[0][2].processAircraft();
        t.is(calls.at(-1)[0], 'processAircraft');
        calls[0][2].processScope();
        t.is(calls.at(-1)[0], 'processScope');
        calls[0][2].deselect();
        t.is(calls.at(-1)[0], 'deselect');
        calls[1][1].processSystem(parsedCommand);
        t.is(calls.at(-1)[0], 'processSystem');
        calls[1][1].processTransmit(parsedCommand);
        t.is(calls.at(-1)[0], 'processTransmit');
    } finally {
        inputInit.restore();
        autocompleteInit.restore();
    }
});

ava.serial('._createViewportGestureInteraction() composes exact state, viewport, and live drag option', (t) => {
    const dragButton = 'right';
    const option = sinon.stub(GameController, 'getGameOption').returns(dragButton);
    const controller = Object.create(InputController.prototype);
    controller.input = {};

    const interaction = controller._createViewportGestureInteraction();

    t.true(interaction instanceof ViewportGestureInteraction);
    t.is(interaction._inputState, controller.input);
    t.is(interaction._viewport, CanvasStageModel);
    t.is(interaction._dragButtonProvider(), dragButton);
    t.true(option.calledOnceWithExactly(GAME_OPTION_NAMES.MOUSE_CLICK_DRAG));
});

ava.serial('constructor retains an explicitly supplied trailing viewport gesture interaction', (t) => {
    const inputInit = sinon.stub(InputController.prototype, '_init');
    const autocompleteInit = sinon.stub(AutocompleteController.prototype, '_init');
    const viewportInteraction = {};

    try {
        const controller = new InputController(
            {}, {}, {}, {}, null, null, null, {}, {}, {}, {}, viewportInteraction
        );

        t.is(controller._viewportInteraction, viewportInteraction);
    } finally {
        inputInit.restore();
        autocompleteInit.restore();
    }
});

ava('viewport gesture routes preserve controller returns and operation order', (t) => {
    const calls = [];
    const event = { which: MOUSE_EVENT_CODE.MIDDLE_PRESS, preventDefault: () => calls.push('prevent') };
    const controller = Object.create(InputController.prototype);
    controller._measurementInteraction = { hasStarted: false };
    controller._viewportInteraction = {
        zoom: (value) => calls.push(['zoom', value]),
        drag: (value) => { calls.push(['drag', value]); return calls.filter(([name]) => name === 'drag').length > 1; },
        release: () => calls.push(['release']),
        resetZoom: () => calls.push(['reset']),
        markPressed: (...args) => calls.push(['mark', ...args])
    };

    t.is(controller._onMouseScroll(event), undefined);
    t.is(controller._onMouseClickAndDrag(event), controller);
    t.is(controller._onMouseClickAndDrag(event), undefined);
    t.is(controller._onMouseUp(event), undefined);
    t.is(controller._markMousePressed(event, 'left'), undefined);
    t.is(controller._onMouseDown(event), undefined);
    t.deepEqual(calls, [
        ['zoom', event],
        ['drag', event],
        ['drag', event],
        ['release'],
        ['mark', event, 'left'],
        'prevent',
        ['reset']
    ]);
});

ava('._createKeyboardInteraction() composes exact dependencies and lazy current controller callbacks', (t) => {
    const calls = [];
    const controller = Object.create(InputController.prototype);
    controller.input = {};
    controller.$commandInput = {};
    controller._autocompleteController = {};
    controller._measurementInteraction = {};
    controller._scopeModel = {};
    controller._eventBus = {};
    controller.commandBarContext = COMMAND_CONTEXT.AIRCRAFT;
    controller._isArrowControlMethod = () => calls.push('staleArrow');
    controller.processCommand = () => calls.push('staleProcess');
    controller.selectPreviousAircraft = () => calls.push('stalePrevious');
    controller.selectNextAircraft = () => calls.push('staleNext');
    controller.deselectAircraft = () => calls.push('staleDeselect');

    const interaction = controller._createKeyboardInteraction();

    controller._isArrowControlMethod = () => {
        calls.push('arrow');
        return true;
    };
    controller.processCommand = () => calls.push('process');
    controller.selectPreviousAircraft = () => calls.push('previous');
    controller.selectNextAircraft = () => calls.push('next');
    controller.deselectAircraft = () => calls.push('deselect');

    t.true(interaction instanceof KeyboardInteraction);
    t.is(interaction._inputState, controller.input);
    t.is(interaction._commandInput, controller.$commandInput);
    t.is(interaction._autocompleteController, controller._autocompleteController);
    t.is(interaction._measurementInteraction, controller._measurementInteraction);
    t.is(interaction._scopeModel, controller._scopeModel);
    t.is(interaction._uiController, UiController);
    t.is(interaction._eventBus, controller._eventBus);
    t.true(interaction._arrowControlProvider());
    t.is(interaction._commandContextProvider(), COMMAND_CONTEXT.AIRCRAFT);
    interaction._commandContextSetter(COMMAND_CONTEXT.SCOPE);
    t.is(controller.commandBarContext, COMMAND_CONTEXT.SCOPE);
    interaction._processCommand();
    interaction._selectPreviousAircraft();
    interaction._selectNextAircraft();
    interaction._deselectAircraft();
    t.deepEqual(calls, ['arrow', 'process', 'previous', 'next', 'deselect']);
});

ava.serial('constructor retains an explicitly supplied trailing keyboard interaction and destroy clears it', (t) => {
    const inputInit = sinon.stub(InputController.prototype, '_init');
    const autocompleteInit = sinon.stub(AutocompleteController.prototype, '_init');
    const keyboardInteraction = {};

    try {
        const controller = new InputController(
            {}, {}, {}, {}, null, null, null, {}, {}, {}, {}, {}, keyboardInteraction
        );

        t.is(controller._keyboardInteraction, keyboardInteraction);
        controller.destroy();
        t.is(controller._keyboardInteraction, null);
    } finally {
        inputInit.restore();
        autocompleteInit.restore();
    }
});

ava('keyboard façades delegate exact events and discard collaborator returns', (t) => {
    const calls = [];
    const keydownEvent = {};
    const keyupEvent = {};
    const controller = Object.create(InputController.prototype);
    controller._keyboardInteraction = {
        keydown: (event) => { calls.push(['keydown', event]); return 'ignored'; },
        keyup: (event) => { calls.push(['keyup', event]); return 'ignored'; }
    };

    t.is(controller._onKeydown(keydownEvent), undefined);
    t.is(controller._onKeyup(keyupEvent), undefined);
    t.deepEqual(calls, [
        ['keydown', keydownEvent],
        ['keyup', keyupEvent]
    ]);
});
