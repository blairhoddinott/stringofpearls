export const HANDOFF_STATE = Object.freeze({
    CENTER_OWNED: 'CENTER_OWNED',
    CENTER_TO_PLAYER: 'CENTER_TO_PLAYER',
    PLAYER_OWNED: 'PLAYER_OWNED',
    PLAYER_TO_TOWER: 'PLAYER_TO_TOWER',
    TOWER_OWNED: 'TOWER_OWNED'
});

export default class HandoffModel {
    constructor(initialState = HANDOFF_STATE.PLAYER_OWNED) {
        if (!Object.values(HANDOFF_STATE).includes(initialState)) {
            throw new Error(`Unknown handoff state: ${initialState}`);
        }

        this._state = initialState;
        this._towerHandoffRequestedAtSeconds = null;
    }

    get state() {
        return this._state;
    }

    get towerHandoffRequestedAtSeconds() {
        return this._towerHandoffRequestedAtSeconds;
    }

    get isPlayerControlled() {
        return this._state === HANDOFF_STATE.PLAYER_OWNED ||
            this._state === HANDOFF_STATE.PLAYER_TO_TOWER;
    }

    get controllerIdentifier() {
        if (this._state === HANDOFF_STATE.CENTER_OWNED ||
            this._state === HANDOFF_STATE.CENTER_TO_PLAYER) {
            return 'C';
        }

        if (this._state === HANDOFF_STATE.PLAYER_TO_TOWER ||
            this._state === HANDOFF_STATE.TOWER_OWNED) {
            return 'T';
        }

        return '';
    }

    get shouldFlashDataBlock() {
        return this._state === HANDOFF_STATE.CENTER_TO_PLAYER;
    }

    get isInboundHandoffPending() {
        return this._state === HANDOFF_STATE.CENTER_TO_PLAYER;
    }

    get shouldFlashControllerIdentifier() {
        return this._state === HANDOFF_STATE.PLAYER_TO_TOWER;
    }

    offerFromCenter() {
        if (this._state !== HANDOFF_STATE.CENTER_OWNED) {
            return false;
        }

        this._state = HANDOFF_STATE.CENTER_TO_PLAYER;

        return true;
    }

    acceptFromCenter() {
        if (this._state !== HANDOFF_STATE.CENTER_TO_PLAYER) {
            return false;
        }

        this._state = HANDOFF_STATE.PLAYER_OWNED;

        return true;
    }

    expireCenterOffer() {
        if (this._state !== HANDOFF_STATE.CENTER_TO_PLAYER) {
            return false;
        }

        this._state = HANDOFF_STATE.CENTER_OWNED;

        return true;
    }

    requestTowerHandoff(requestedAtSeconds = 0) {
        if (this._state !== HANDOFF_STATE.PLAYER_OWNED) {
            return false;
        }

        this._state = HANDOFF_STATE.PLAYER_TO_TOWER;
        this._towerHandoffRequestedAtSeconds = requestedAtSeconds;

        return true;
    }

    acceptByTower() {
        if (this._state !== HANDOFF_STATE.PLAYER_TO_TOWER) {
            return false;
        }

        this._state = HANDOFF_STATE.TOWER_OWNED;
        this._towerHandoffRequestedAtSeconds = null;

        return true;
    }

    cancelTowerHandoff() {
        if (this._state !== HANDOFF_STATE.PLAYER_TO_TOWER) {
            return false;
        }

        this._state = HANDOFF_STATE.PLAYER_OWNED;
        this._towerHandoffRequestedAtSeconds = null;

        return true;
    }
}
