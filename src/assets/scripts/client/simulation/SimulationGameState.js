import { GAME_OPTION_NAMES } from '../constants/gameOptionConstants';
import { GAME_EVENTS, GAME_EVENTS_POINT_VALUES } from '../game/gameEventConstants';

/**
 * Browser-free score, event-count, and simulation-option state for one session.
 */
export default class SimulationGameState {
    constructor({ towerController = 'SYSTEM', softCeiling = 'yes' } = {}) {
        this._initialOptions = {
            [GAME_OPTION_NAMES.SOFT_CEILING]: softCeiling,
            [GAME_OPTION_NAMES.TOWER_CONTROLLER]: towerController
        };
        this._score = 0;
        this._events = Object.fromEntries(
            Object.values(GAME_EVENTS).map((eventName) => [eventName, 0])
        );
        this._options = { ...this._initialOptions };
    }

    get score() {
        return this._score;
    }

    get events() {
        return this._events;
    }

    events_recordNew(gameEvent) {
        if (!Object.hasOwn(GAME_EVENTS, gameEvent)) {
            throw new TypeError(`Expected a game event listed in GAME_EVENTS, but instead received ${gameEvent}`);
        }

        this._events[gameEvent] += 1;
        this._score += GAME_EVENTS_POINT_VALUES[gameEvent];
    }

    game_reset_score_and_events() {
        this.reset();
    }

    getGameOption(optionName) {
        return this._options[optionName];
    }

    setGameOption(optionName, value) {
        this._options[optionName] = value;

        return value;
    }

    reset() {
        this._score = 0;

        for (const eventName of Object.values(GAME_EVENTS)) {
            this._events[eventName] = 0;
        }

        this._options = { ...this._initialOptions };
    }
}
