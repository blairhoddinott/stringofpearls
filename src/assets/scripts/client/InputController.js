import $ from 'jquery';

import AirportController from './airport/AirportController';
import AutocompleteController from './ui/autocomplete/AutocompleteController';
import CanvasStageModel from './canvas/CanvasStageModel';
import DynamicPositionModel from './base/DynamicPositionModel';
import EventBus from './lib/EventBus';
import GameController from './game/GameController';
import UiController from './ui/UiController';
import CommandParser from './commands/parsers/CommandParser';
import ScopeCommandModel from './commands/scopeCommand/ScopeCommandModel';
import EventTracker from './EventTracker';
import InputEventBindings from './input/InputEventBindings';
import MeasurementInteraction from './input/MeasurementInteraction';
import AircraftSelectionInteraction from './input/AircraftSelectionInteraction';
import CommandInteraction from './input/CommandInteraction';
import ViewportGestureInteraction from './input/ViewportGestureInteraction';
import KeyboardInteraction from './input/KeyboardInteraction';
import MeasureTool from './measurement/MeasureTool';
import FixCollection from './navigationLibrary/FixCollection';
import { EVENT } from './constants/eventNames';
import { GAME_OPTION_NAMES } from './constants/gameOptionConstants';
import { COMMAND_CONTEXT, MOUSE_BUTTON_NAMES, MOUSE_EVENT_CODE } from './constants/inputConstants';
import { SELECTORS } from './constants/selectors';

// Temporary const declaration here to attach to the window AND use as internal propert
const input = {};

/**
 * @class InputController
 */
export default class InputController {
    /**
     * @constructor
     * @param $element {JQuery|HTML Element}
     * @param aircraftController {AircraftController}
     * @param scopeModel {ScopeModel}
     * @param assetLoader {AssetLoader} composition-root JSON transport, injected into AutocompleteController
     * @param clearStorageAndReload {ClearStorageAndReload} clear/reload service invoked by the CLEAR system command; optional
     * @param reportError {Function} async error reporter forwarded to AutocompleteController
     * @param clipboardAdapter {ClipboardAdapter} clipboard boundary used by the copy-coordinates command; optional
     * @param inputEventBindings {InputEventBindings} browser event-registration boundary; optional
     * @param measurementInteraction {MeasurementInteraction} measurement-input behavior; optional
     * @param selectionInteraction {AircraftSelectionInteraction} aircraft selection/history behavior; optional
     * @param commandInteraction {CommandInteraction} command parsing and dispatch behavior; optional
     * @param viewportInteraction {ViewportGestureInteraction} viewport zoom/pan gesture behavior; optional
     * @param keyboardInteraction {KeyboardInteraction} keyboard interpretation behavior; optional
     */
    constructor($element, aircraftController, scopeModel, assetLoader, clearStorageAndReload, reportError, clipboardAdapter, inputEventBindings = null, measurementInteraction = null, selectionInteraction = null, commandInteraction = null, viewportInteraction = null, keyboardInteraction = null) {
        this.$element = $element;
        this.$body = null;
        this.$window = null;
        this.$commandInput = null;
        this.$canvases = null;

        this._eventBus = EventBus;
        this._aircraftController = aircraftController;
        this._scopeModel = scopeModel;
        this._assetLoader = assetLoader;

        /**
         * Clear/reload service forwarded from the composition root and used only
         * by the CLEAR system command. Nullish when omitted so older/shorter
         * constructor calls stay free of browser globals for this capability.
         *
         * @property _clearStorageAndReload
         * @type {ClearStorageAndReload|null}
         */
        this._clearStorageAndReload = clearStorageAndReload ?? null;

        /**
         * Clipboard boundary forwarded from the composition root and used only by
         * the copy-coordinates command. Nullish when omitted so older/shorter
         * constructor calls stay free of browser globals for this capability.
         *
         * @property _clipboardAdapter
         * @type {ClipboardAdapter|null}
         */
        this._clipboardAdapter = clipboardAdapter ?? null;
        this._inputEventBindings = inputEventBindings;
        this._measurementInteraction = measurementInteraction ?? new MeasurementInteraction(
            CanvasStageModel,
            MeasureTool,
            this._eventBus,
            this._aircraftController,
            FixCollection
        );
        this._selectionInteraction = selectionInteraction;
        this._commandInteraction = commandInteraction;
        this._viewportInteraction = viewportInteraction;
        this._keyboardInteraction = keyboardInteraction;
        this._autocompleteController = new AutocompleteController(
            this.$element,
            this,
            this._aircraftController,
            this._assetLoader,
            reportError
        );

        prop.input = input;
        this.input = input;
        this.input.callsign = '';
        this.input.history = [];
        this.input.history_item = null;
        this.input.isMouseDown = false;
        this.commandBarContext = COMMAND_CONTEXT.AIRCRAFT;

        this._init();
    }

    /**
     * @for InputController
     * @method _init
     */
    _init() {
        this.$body = this.$element[0];
        this.$window = $(window);
        this.$commandInput = this.$element.find(SELECTORS.DOM_SELECTORS.COMMAND);
        this.$canvases = this.$element.find(SELECTORS.DOM_SELECTORS.CANVASES);

        if (this._selectionInteraction === null) {
            this._selectionInteraction = this._createAircraftSelectionInteraction();
        }

        if (this._commandInteraction === null) {
            this._commandInteraction = this._createCommandInteraction();
        }

        if (this._viewportInteraction === null) {
            this._viewportInteraction = this._createViewportGestureInteraction();
        }

        if (this._keyboardInteraction === null) {
            this._keyboardInteraction = this._createKeyboardInteraction();
        }

        this.setupHandlers();

        if (this._inputEventBindings === null) {
            this._inputEventBindings = this._createInputEventBindings();
        }

        return this.enable();
    }

    /**
     * @for InputController
     * @method setupHandlers
     */
    setupHandlers() {
        this.onKeydownHandler = this._onKeydown.bind(this);
        this.onKeyupHandler = this._onKeyup.bind(this);
        this.onMouseScrollHandler = this._onMouseScroll.bind(this);
        this.onMouseClickAndDragHandler = this._onMouseClickAndDrag.bind(this);
        this.onMouseUpHandler = this._onMouseUp.bind(this);
        this.onMouseDownHandler = this._onMouseDown.bind(this);
        this.onMouseDblclickHandler = this._onMouseDblclick.bind(this);

        return this;
    }

    /**
     * Enable all event handlers
     *
     * @for InputController
     * @method enable
     */
    enable() {
        this._inputEventBindings.enable();

        return this;
    }

    _createInputEventBindings() {
        return new InputEventBindings(
            this.$window,
            this.$canvases,
            this.$body,
            this._eventBus,
            EVENT.STRIP_CLICK,
            () => ({
                keydown: this.onKeydownHandler,
                keyup: this.onKeyupHandler,
                mouseScroll: this.onMouseScrollHandler,
                mouseMove: this.onMouseClickAndDragHandler,
                mouseUp: this.onMouseUpHandler,
                mouseDown: this.onMouseDownHandler,
                doubleClick: this.onMouseDblclickHandler,
                stripClick: this.selectAircraftByCallsign
            })
        );
    }

    _createAircraftSelectionInteraction() {
        return new AircraftSelectionInteraction(
            this.input,
            this.$commandInput,
            this._eventBus,
            this._aircraftController,
            () => prop.input,
            this._scopeModel.canSelectAircraft.bind(this._scopeModel)
        );
    }

    _createCommandInteraction() {
        return new CommandInteraction({
            inputState: this.input,
            commandInput: this.$commandInput,
            aircraftController: this._aircraftController,
            scopeModel: this._scopeModel,
            clearStorageAndReload: this._clearStorageAndReload,
            uiController: UiController,
            gameController: GameController,
            eventTracker: EventTracker,
            airportController: AirportController,
            CommandParserClass: CommandParser,
            ScopeCommandModelClass: ScopeCommandModel
        });
    }

    _createViewportGestureInteraction() {
        return new ViewportGestureInteraction(
            this.input,
            CanvasStageModel,
            () => GameController.getGameOption(GAME_OPTION_NAMES.MOUSE_CLICK_DRAG)
        );
    }

    _createKeyboardInteraction() {
        return new KeyboardInteraction({
            inputState: this.input,
            commandInput: this.$commandInput,
            autocompleteController: this._autocompleteController,
            measurementInteraction: this._measurementInteraction,
            scopeModel: this._scopeModel,
            uiController: UiController,
            eventBus: this._eventBus,
            arrowControlProvider: () => this._isArrowControlMethod(),
            commandContextProvider: () => this.commandBarContext,
            commandContextSetter: (commandContext) => {
                this.commandBarContext = commandContext;
            },
            processCommand: () => this.processCommand(),
            selectPreviousAircraft: () => this.selectPreviousAircraft(),
            selectNextAircraft: () => this.selectNextAircraft(),
            deselectAircraft: () => this.deselectAircraft()
        });
    }

    /**
     * Disable all event handlers and destroy the instance
     *
     * @for InputController
     * @method disable
     */
    disable() {
        this._inputEventBindings.disable();

        return this.destroy();
    }

    /**
     * @for InputController
     * @method destroy
     */
    destroy() {
        this._inputEventBindings = null;
        this._measurementInteraction = null;
        this._selectionInteraction = null;
        this._commandInteraction = null;
        this._viewportInteraction = null;
        this._keyboardInteraction = null;
        this.$element = null;
        this.$body = null;
        this.$window = null;
        this.$commandInput = null;
        this.$canvases = null;

        this._autocompleteController = null;

        this.input = input;
        this.input.callsign = '';
        this.input.history = [];
        this.input.history_item = null;
        this.input.isMouseDown = false;

        return this;
    }

    /**
     * @for InputController
     * @method input_init_pre
     */
    input_init_pre() {
        // TODO: these prop properties can be removed except for `this.input`
        this.input = input;
        this.input.callsign = '';
        this.input.history = [];
        this.input.history_item = null;
        this.input.isMouseDown = false;
    }

    /**
     * De-selects any selected aircraft
     *
     * This clears the current aircraft callsign from the command input
     * and de-selects an active aircraft's:
     * - flight strip
     * - radar target
     *
     * @for InputController
     * @method deselectAircraft
     */
    deselectAircraft() {
        this._selectionInteraction.deselect();
    }


    /**
     * @for InputController
     * @method _onMouseScroll
     * @param event {jquery Event}
     */
    _onMouseScroll(event) {
        this._viewportInteraction.zoom(event);
    }

    /**
     * @for InputController
     * @method _onMouseClickAndDrag
     * @param event {jquery Event}
     */
    _onMouseClickAndDrag(event) {
        if (this._measurementInteraction.hasStarted) {
            this._measurementInteraction.addPoint(event, true);

            return this;
        }

        if (!this._viewportInteraction.drag(event)) {
            return this;
        }
    }

    /**
     * @for InputController
     * @method _onMouseUp
     * @param event {jquery Event}
     */
    _onMouseUp(event) {
        this._viewportInteraction.release();
    }

    /**
     * @for InputController
     * @method _onMouseDown
     * @param event {jquery Event}
     */
    _onMouseDown(event) {
        event.preventDefault();

        switch (event.which) {
            case MOUSE_EVENT_CODE.LEFT_PRESS:
                this._onLeftMouseButtonPress(event);

                break;
            case MOUSE_EVENT_CODE.MIDDLE_PRESS:
                this._viewportInteraction.resetZoom();

                break;
            case MOUSE_EVENT_CODE.RIGHT_PRESS:
                this._onRightMousePress(event);

                break;
            default:
                break;
        }
    }

    /**
     * @for InputController
     * @method _onMouseDblclick
     * @param event {jquery Event}
     */
    _onMouseDblclick(event) {
        // HACK: for "when an aircraft's radar return is double clicked"
        // caveat: double click is series of mousedown-mouseup-mousedown-mouseup events in rapid succession
        // there is no guarantee that pointer is stationary throughout the process!
        // event handler is for entire canvas, not for things drawn on it; need to resolve which aircraft
        // _onLeftMouseButtonPress identifies and selects nearest aircraft within 50px of mousedown events
        // so we can just piggyback off the aircraft (if any) already selected by the second mousedown
        if (!this.input.callsign) {
            return;
        }

        this._eventBus.trigger(
            EVENT.SCROLL_TO_AIRCRAFT,
            this._aircraftController.findAircraftByCallsign(this.input.callsign)
        );
    }

    /**
     * @for InputController
     * @method selectAircraft
     * @param aircraftModel {AircraftModel}
     */
    selectAircraft = (aircraftModel) => {
        this._scopeModel.acceptHandoffIfOffered?.(aircraftModel);
        this._selectionInteraction.select(aircraftModel, () => this.deselectAircraft());
    };

    /**
     * Select aircraft by callsign
     *
     * @for InputController
     * @method selectAircraftByCallsign
     * @param callsign {string}
     */
    selectAircraftByCallsign = (callsign) => {
        this._selectionInteraction.selectByCallsign(callsign, (aircraftModel) => this.selectAircraft(aircraftModel));
    }

    /**
     * @for InputController
     * @method _onKeydown
     * @param event {jquery Event}
     * @private
     */
    _onKeydown(event) {
        this._keyboardInteraction.keydown(event);
    }

    /**
     * @for InputController
     * @method _onKeydown
     * @param event {jquery Event}
     * @private
     */
    _onKeyup(event) {
        this._keyboardInteraction.keyup(event);
    }

    /**
     * @for InputController
     * @method selectPreviousAircraft
     */
    selectPreviousAircraft() {
        this._selectionInteraction.selectPrevious((aircraftModel) => this.selectAircraft(aircraftModel));
    }

    /**
     * @for InputController
     * @method selectNextAircraft
     */
    selectNextAircraft() {
        this._selectionInteraction.selectNext((aircraftModel) => this.selectAircraft(aircraftModel));
    }

    /**
     * Encapsulation of repeated boolean logic
     *
     * @for InputController
     * @method _isArrowControlMethod
     * @return {boolean}
     */
    _isArrowControlMethod() {
        return GameController.game.option.getOptionByName(GAME_OPTION_NAMES.CONTROL_METHOD) === 'arrows';
    }

    /**
     * Process user command to be applied to an aircraft
     *
     * @for InputController
     * @method processAircraftCommand
     */
    processAircraftCommand() {
        return this._commandInteraction.processAircraft({
            processSystem: (parsedCommand) => this.processSystemCommand(parsedCommand),
            processTransmit: (parsedCommand) => this.processTransmitCommand(parsedCommand)
        });
    }

    /**
     * Process the command currently in the command bar
     *
     * @for InputController
     * @method processCommand
     * @return {array} [success of operation, response]
     */
    processCommand() {
        return this._commandInteraction.process(this.commandBarContext, {
            processAircraft: () => this.processAircraftCommand(),
            processScope: () => this.processScopeCommand(),
            deselect: () => this.deselectAircraft()
        });
    }

    /**
     * Process user command to be applied to the user's scope
     *
     * @for InputController
     * @method processScopeCommand
     */
    processScopeCommand() {
        return this._commandInteraction.processScope();
    }

    /**
     * @for InputController
     * @method processSystemCommand
     * @param parsedCommand {ParsedCommand}
     * @return {boolean}
     */
    processSystemCommand(parsedCommand) {
        return this._commandInteraction.processSystem(parsedCommand);
    }

    /**
     * @for InputController
     * @method processTransmitCommand
     * @param parsedCommand {ParsedCommand}
     * @return {boolean}
     */
    processTransmitCommand(parsedCommand) {
        return this._commandInteraction.processTransmit(parsedCommand);
    }

    /**
     * Given a mouse click event, retrieve and return the [x, y] offset from the airport center, in km
     *
     * @for InputController
     * @method _calculateRelativePositionFromEvent
     * @param event {jQuery Event}
     * @return {array<number>}
     */
    _calculateRelativePositionFromEvent(event) {
        const canvasPosition = CanvasStageModel.calculateCanvasPositionFromPagePosition(event.pageX, event.pageY);
        const relativePosition = CanvasStageModel.calculateRelativePositionFromCanvasPosition(...canvasPosition);

        return relativePosition;
    }

    /**
     * Facade for `_aircraftController.aircraft_get_nearest()`
     *
     * Accepts current mouse position in canvas coordinates x, y
     *
     * @for InputController
     * @method _findClosestAircraftAndDistanceToCanvasPosition
     * @param x {number}
     * @param y {number}
     * @returns [aircraftModel, number]
     * @private
     */
    _findClosestAircraftAndDistanceToCanvasPosition(x, y) {
        return this._aircraftController.aircraft_get_nearest(
            CanvasStageModel.calculateRelativePositionFromCanvasPosition(x, y)
        );
    }

    /**
     * Log the provided lat/lon coordinates to the console, display in command log, and copy to clipboard
     *
     * @for InputController
     * @method _logAndCopyCoordinates
     * @param latLonCoordinates {array<number>} [lat, lon]
     * @returns undefined
     * @private
     */
    _logAndCopyCoordinates(latLonCoordinates) {
        const coordinateText = latLonCoordinates.map((coord) => coord.toFixed(9)).join(', ');

        if (this._clipboardAdapter === null) {
            return undefined;
        }

        const writeResult = this._clipboardAdapter.writeText(coordinateText);

        if (writeResult == null) {
            return undefined;
        }

        writeResult.then(() => {
            console.log(coordinateText);
            UiController.ui_log(`Clicked coordinates: ${coordinateText} (logged to console and copied to clipboard!)`, true);
        });
    }

    /**
     * Triggered when a user clicks on the `right` mouse button and
     * records the position of the `right click` event.
     *
     * @for InputController
     * @method _onRightMousePress
     * @param event {jquery Event}
     * @returns undefined
     * @private
     */
    _onRightMousePress(event) {
        if (this._measurementInteraction.isMeasuring) {
            this._measurementInteraction.removePreviousPoint();

            return;
        }

        // copy mouse click position to clipboard on shift+alt+rightclick
        if (event.originalEvent.shiftKey && event.originalEvent.altKey) {
            const relativePosition = this._calculateRelativePositionFromEvent(event);
            const referencePosition = AirportController.current.positionModel;
            const latLonCoordinates = DynamicPositionModel.calculateGpsCoordinatesFromRelativePosition(
                relativePosition, referencePosition
            );

            return this._logAndCopyCoordinates(latLonCoordinates);
        }

        this._markMousePressed(event, MOUSE_BUTTON_NAMES.RIGHT);
    }

    /**
     * Logic that happens when a user clicks on the `left` mouse button
     *
     * TODO: this method is a first step at simplification. there is still
     * more work to do here, but this at least gets us moving in
     * the right direction
     *
     * @for InputController
     * @method _onLeftMouseButtonPress
     * @param event {jquery Event}
     * @private
     */
    _onLeftMouseButtonPress(event) {
        if (this._measurementInteraction.isMeasuring) {
            this._measurementInteraction.addPoint(event);

            return;
        }

        const mouseCanvasPos = CanvasStageModel.calculateCanvasPositionFromPagePosition(event.pageX, event.pageY);
        const [aircraftModel, distanceFromPosition] = this._findClosestAircraftAndDistanceToCanvasPosition(...mouseCanvasPos);

        if (distanceFromPosition > CanvasStageModel.translatePixelsToKilometers(50)) {
            this.deselectAircraft();
            this._markMousePressed(event, MOUSE_BUTTON_NAMES.LEFT);
        } else if (this.commandBarContext === COMMAND_CONTEXT.SCOPE) {
            this.$commandInput.val(`${this.$commandInput.val()} ${aircraftModel.callsign}`);
            this.processCommand();
        } else if (aircraftModel) {
            this.selectAircraft(aircraftModel);
        }
    }

    /**
     * Method to initiate a mouse click and drag. Checks whether or not
     * the correct button is pressed, records the position, and marks the
     * mouse as down.
     *
     * @for InputController
     * @method _markMousePressed
     * @param {String} mouseButton
     */
    _markMousePressed(event, mouseButton) {
        this._viewportInteraction.markPressed(event, mouseButton);
    }
}
