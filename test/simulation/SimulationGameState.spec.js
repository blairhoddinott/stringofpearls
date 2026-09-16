import ava from 'ava';
import SimulationGameState from '../../src/assets/scripts/client/simulation/SimulationGameState';
import { GAME_EVENTS } from '../../src/assets/scripts/client/game/gameEventConstants';
import { GAME_OPTION_NAMES } from '../../src/assets/scripts/client/constants/gameOptionConstants';

ava('starts with isolated zeroed score, event counts, and inherited tower mode', (t) => {
    const first = new SimulationGameState();
    const second = new SimulationGameState();

    t.is(first.score, 0);
    t.deepEqual(first.events, Object.fromEntries(Object.values(GAME_EVENTS).map((eventName) => [eventName, 0])));
    t.is(first.getGameOption(GAME_OPTION_NAMES.TOWER_CONTROLLER), 'SYSTEM');

    first.events_recordNew(GAME_EVENTS.ARRIVAL);
    first.setGameOption(GAME_OPTION_NAMES.TOWER_CONTROLLER, 'USER');

    t.is(first.score, 10);
    t.is(first.events[GAME_EVENTS.ARRIVAL], 1);
    t.is(first.getGameOption(GAME_OPTION_NAMES.TOWER_CONTROLLER), 'USER');
    t.is(second.score, 0);
    t.is(second.events[GAME_EVENTS.ARRIVAL], 0);
    t.is(second.getGameOption(GAME_OPTION_NAMES.TOWER_CONTROLLER), 'SYSTEM');
});

ava('records inherited event points and rejects unknown events without mutation', (t) => {
    const gameState = new SimulationGameState();

    gameState.events_recordNew(GAME_EVENTS.COLLISION);

    t.is(gameState.score, -1000);
    t.is(gameState.events[GAME_EVENTS.COLLISION], 1);

    const error = t.throws(() => gameState.events_recordNew('NOT_A_GAME_EVENT'), {
        instanceOf: TypeError
    });

    t.is(error.message, 'Expected a game event listed in GAME_EVENTS, but instead received NOT_A_GAME_EVENT');
    t.is(gameState.score, -1000);
    t.false(Object.hasOwn(gameState.events, 'NOT_A_GAME_EVENT'));
});

ava('reset clears score and events and restores the configured initial tower mode', (t) => {
    const gameState = new SimulationGameState({ towerController: 'USER' });

    gameState.events_recordNew(GAME_EVENTS.ARRIVAL);
    gameState.setGameOption(GAME_OPTION_NAMES.TOWER_CONTROLLER, 'SYSTEM');
    gameState.reset();

    t.is(gameState.score, 0);
    t.is(gameState.events[GAME_EVENTS.ARRIVAL], 0);
    t.is(gameState.getGameOption(GAME_OPTION_NAMES.TOWER_CONTROLLER), 'USER');
});
