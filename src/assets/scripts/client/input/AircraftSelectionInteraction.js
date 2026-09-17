import { EVENT } from '../constants/eventNames';
import { clamp } from '../math/core';

export default class AircraftSelectionInteraction {
    constructor(inputState, commandInput, eventBus, aircraftController, legacyInputProvider) {
        this._inputState = inputState;
        this._commandInput = commandInput;
        this._eventBus = eventBus;
        this._aircraftController = aircraftController;
        this._legacyInputProvider = legacyInputProvider;
    }

    deselect() {
        this._legacyInputProvider().callsign = '';
        this._inputState.callsign = '';
        this._commandInput.val('');
        this._eventBus.trigger(EVENT.DESELECT_AIRCRAFT, {});
    }

    select(aircraftModel, deselect) {
        if (!aircraftModel || !aircraftModel.isControllable) {
            deselect();

            return;
        }

        this._legacyInputProvider().callsign = aircraftModel.callsign;
        this._inputState.callsign = aircraftModel.callsign;
        this._commandInput.val(`${aircraftModel.callsign} `);

        if (!this._commandInput.is(':focus')) {
            this._commandInput.focus();
        }

        this._eventBus.trigger(EVENT.SELECT_AIRCRAFT, aircraftModel);
    }

    selectByCallsign(callsign, select) {
        const aircraftModel = this._aircraftController.findAircraftByCallsign(callsign);

        select(aircraftModel);
    }

    selectPrevious(select) {
        if (this._inputState.history.length === 0) {
            return;
        }

        if (this._inputState.history_item == null) {
            this._inputState.history.unshift(this._commandInput.val());
            this._inputState.history_item = 0;
        }

        this._inputState.history_item += 1;
        this._clampHistory();

        const callsign = this._inputState.history[this._inputState.history_item];
        const aircraftModel = this._aircraftController.findAircraftByCallsign(callsign);

        select(aircraftModel);
    }

    selectNext(select) {
        if (this._inputState.history.length === 0 || !this._inputState.history_item) {
            return;
        }

        this._inputState.history_item -= 1;

        if (this._inputState.history_item <= 0) {
            this._commandInput.val(this._inputState.history[0]);
            this._inputState.history.splice(0, 1);
            this._inputState.history_item = null;

            return;
        }

        this._clampHistory();

        const callsign = this._inputState.history[this._inputState.history_item];
        const aircraftModel = this._aircraftController.findAircraftByCallsign(callsign);

        select(aircraftModel);
    }

    _clampHistory() {
        this._inputState.history_item = clamp(
            0,
            this._inputState.history_item,
            this._inputState.history.length - 1
        );
    }
}
