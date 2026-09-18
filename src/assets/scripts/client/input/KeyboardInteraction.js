import _includes from 'lodash/includes';
import { EVENT } from '../constants/eventNames';
import {
    COMMAND_CONTEXT,
    KEY_CODES,
    LEGACY_KEY_CODES
} from '../constants/inputConstants';
import { SELECTORS, CLASSNAMES } from '../constants/selectors';

export default class KeyboardInteraction {
    constructor(dependencies) {
        Object.entries(dependencies).forEach(([name, dependency]) => {
            this[`_${name}`] = dependency;
        });
    }

    keydown(event) {
        let { code } = event.originalEvent;
        const isEscape = code === KEY_CODES.ESCAPE || code === LEGACY_KEY_CODES.ESCAPE;

        if (this._isDialog(event.target) && !isEscape) {
            return;
        }

        if (this._autocompleteController.active) {
            this._autocompleteController.onKeydownHandler(event);
            return;
        }

        const currentCommandInputValue = this._commandInput.val();

        if (code == null) {
            code = event.originalEvent.keyCode;
        }

        switch (code) {
            case KEY_CODES.CONTROL_LEFT:
            case KEY_CODES.CONTROL_RIGHT:
                this._measurementInteraction.start();

                break;
            case KEY_CODES.ENTER:
            case KEY_CODES.NUM_ENTER:
            case LEGACY_KEY_CODES.ENTER:
                this._processCommand();

                break;
            case KEY_CODES.PAGE_UP:
            case LEGACY_KEY_CODES.PAGE_UP:
                this._selectPreviousAircraft();
                event.preventDefault();

                break;
            case KEY_CODES.PAGE_DOWN:
            case LEGACY_KEY_CODES.PAGE_DOWN:
                this._selectNextAircraft();
                event.preventDefault();

                break;
            case KEY_CODES.LEFT_ARROW:
            case LEGACY_KEY_CODES.LEFT_ARROW:
                if (this._arrowControlProvider() && this._commandContextProvider() === COMMAND_CONTEXT.AIRCRAFT) {
                    this._commandInput.val(`${currentCommandInputValue} t l `);
                    event.preventDefault();
                }

                break;
            case KEY_CODES.RIGHT_ARROW:
            case LEGACY_KEY_CODES.RIGHT_ARROW:
                if (this._arrowControlProvider() && this._commandContextProvider() === COMMAND_CONTEXT.AIRCRAFT) {
                    this._commandInput.val(`${currentCommandInputValue} t r `);
                    event.preventDefault();
                }

                break;
            case KEY_CODES.UP_ARROW:
            case LEGACY_KEY_CODES.UP_ARROW:
                if (this._arrowControlProvider() && this._commandContextProvider() === COMMAND_CONTEXT.AIRCRAFT) {
                    this._commandInput.val(`${currentCommandInputValue} c `);
                    event.preventDefault();
                } else {
                    this._selectPreviousAircraft();
                    event.preventDefault();
                }

                break;
            case KEY_CODES.DOWN_ARROW:
            case LEGACY_KEY_CODES.DOWN_ARROW:
                if (this._arrowControlProvider() && this._commandContextProvider() === COMMAND_CONTEXT.AIRCRAFT) {
                    this._commandInput.val(`${currentCommandInputValue} d `);
                    event.preventDefault();
                } else {
                    this._selectNextAircraft();
                    event.preventDefault();
                }

                break;
            case KEY_CODES.NUM_DIVIDE:
            case LEGACY_KEY_CODES.NUM_DIVIDE:
                if (this._commandContextProvider() === COMMAND_CONTEXT.AIRCRAFT) {
                    this._commandInput.val(`${currentCommandInputValue} / `);
                    event.preventDefault();
                }

                break;
            case KEY_CODES.NUM_MULTIPLY:
            case LEGACY_KEY_CODES.NUM_MULTIPLY:
                if (this._commandContextProvider() === COMMAND_CONTEXT.AIRCRAFT) {
                    this._commandInput.val(`${currentCommandInputValue} * `);
                    event.preventDefault();
                }

                break;
            case KEY_CODES.NUM_ADD:
            case LEGACY_KEY_CODES.NUM_ADD:
                if (this._commandContextProvider() === COMMAND_CONTEXT.AIRCRAFT) {
                    this._commandInput.val(`${currentCommandInputValue} + `);
                    event.preventDefault();
                }

                break;
            case KEY_CODES.NUM_SUBTRACT:
            case LEGACY_KEY_CODES.NUM_SUBTRACT:
                if (this._commandContextProvider() === COMMAND_CONTEXT.AIRCRAFT) {
                    this._commandInput.val(`${currentCommandInputValue} - `);
                    event.preventDefault();
                }

                break;
            case KEY_CODES.F1:
            case LEGACY_KEY_CODES.F1:
                event.preventDefault();
                this._scopeModel.decreasePtlLength();

                break;
            case KEY_CODES.F2:
            case LEGACY_KEY_CODES.F2:
                event.preventDefault();
                this._scopeModel.increasePtlLength();

                break;
            case KEY_CODES.F7:
            case LEGACY_KEY_CODES.F7:
                if (this._commandContextProvider() !== COMMAND_CONTEXT.SCOPE) {
                    return;
                }

                this._commandInput.val('QP_J ');
                event.preventDefault();

                break;
            case KEY_CODES.BACKQUOTE:
            case LEGACY_KEY_CODES.BACKQUOTE:
                this._commandInput.val('');
                event.preventDefault();
                this._toggleCommandBarContext();

                break;
            case KEY_CODES.TAB:
            case LEGACY_KEY_CODES.TAB:
                event.preventDefault();

                if (this._commandContextProvider() === COMMAND_CONTEXT.AIRCRAFT) {
                    this._autocompleteController.activate();
                }

                break;
            case KEY_CODES.ESCAPE:
            case LEGACY_KEY_CODES.ESCAPE: {
                this._measurementInteraction.reset();

                this._uiController.closeAllDialogs();

                const hasCallsign = _includes(currentCommandInputValue, this._inputState.callsign);
                const hasOnlyCallsign = currentCommandInputValue.trim() === this._inputState.callsign;
                const hasSelectedCallsign = this._inputState.callsign !== '';

                if (!hasCallsign || hasOnlyCallsign || !hasSelectedCallsign) {
                    this._deselectAircraft();

                    return;
                }

                this._commandInput.val(`${this._inputState.callsign} `);

                break;
            }
            default:
                this._commandInput.focus();
        }
    }

    keyup(event) {
        let { code } = event.originalEvent;

        if (code == null) {
            code = event.originalEvent.keyCode;
        }

        switch (code) {
            case KEY_CODES.CONTROL_LEFT:
            case KEY_CODES.CONTROL_RIGHT:
                this._measurementInteraction.stop();
                this._eventBus.trigger(EVENT.MARK_SHALLOW_RENDER);

                break;
            default:
        }
    }

    _isDialog(element) {
        if (
            element.classList.contains(CLASSNAMES.DIALOG) ||
            (typeof element.getAttribute === 'function' && element.getAttribute('role') === 'dialog')
        ) {
            return true;
        }

        const { parentElement } = element;

        return parentElement && this._isDialog(parentElement);
    }

    _toggleCommandBarContext() {
        switch (this._commandContextProvider()) {
            case COMMAND_CONTEXT.AIRCRAFT:
                this._commandContextSetter(COMMAND_CONTEXT.SCOPE);
                this._commandInput.attr('placeholder', 'enter scope command');
                this._commandInput.toggleClass(SELECTORS.CLASSNAMES.COMMAND_SCOPE_MODE);

                return;
            case COMMAND_CONTEXT.SCOPE:
                this._commandContextSetter(COMMAND_CONTEXT.AIRCRAFT);
                this._commandInput.attr('placeholder', 'enter aircraft command');
                this._commandInput.toggleClass(SELECTORS.CLASSNAMES.COMMAND_SCOPE_MODE);

                break;
            default:
        }
    }
}
