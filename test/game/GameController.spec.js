import ava from 'ava';
import sinon from 'sinon';
import GameController from '../../src/assets/scripts/client/game/GameController';

// Build a storage adapter stub exposing only the `get(key)`/`set(key, value)`
// contract, so the option-persistence seam is exercised without a global
// `localStorage` backend.
const buildStorageAdapter = ({ storedValue = null } = {}) => ({
    get: sinon.stub().returns(storedValue),
    set: sinon.stub()
});

// `GameController` is an import-time singleton, so each test restores it to the
// browser-global-free default configuration after mutating it.
ava.afterEach.always(() => {
    GameController.initStorage(null);
});

ava.serial('.initStorage() retains the exact adapter identity on the singleton', (t) => {
    const storageAdapter = buildStorageAdapter();

    GameController.initStorage(storageAdapter);

    t.is(GameController._storageAdapter, storageAdapter);
});

ava.serial('.initStorage() normalizes a nullish adapter to canonical null', (t) => {
    GameController.initStorage(buildStorageAdapter());

    GameController.initStorage(undefined);

    t.is(GameController._storageAdapter, null);
});

ava.serial('.initStorage() forwards the exact adapter to the existing GameOptions instance', (t) => {
    const storageAdapter = buildStorageAdapter();
    const gameOptions = GameController.game.option;

    GameController.initStorage(storageAdapter);

    t.is(GameController.game.option, gameOptions);
    t.is(gameOptions._storageAdapter, storageAdapter);
});

ava.serial('.initStorage() rehydrates persisted option values through the adapter', (t) => {
    const storageAdapter = buildStorageAdapter({ storedValue: 'CELESTIAL' });

    GameController.initStorage(storageAdapter);

    t.true(storageAdapter.get.calledWithExactly('zlsa.atc.option.theme'));
    t.is(GameController.getGameOption('theme'), 'CELESTIAL');
});

ava.serial('.destroy() rebuilds GameOptions while retaining the configured adapter', (t) => {
    const storageAdapter = buildStorageAdapter({ storedValue: 'CELESTIAL' });

    GameController.initStorage(storageAdapter);
    const originalGameOptions = GameController.game.option;

    GameController.destroy();

    t.not(GameController.game.option, originalGameOptions);
    t.is(GameController._storageAdapter, storageAdapter);
    t.is(GameController.game.option._storageAdapter, storageAdapter);
    t.is(GameController.getGameOption('theme'), 'CELESTIAL');
});
