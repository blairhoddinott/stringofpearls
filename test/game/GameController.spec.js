import ava from 'ava';
import sinon from 'sinon';
import GameController, { GameControllerClass } from '../../src/assets/scripts/client/game/GameController';
import SimulationContext from '../../src/assets/scripts/client/simulation/SimulationContext';
import { EventBusClass } from '../../src/assets/scripts/client/lib/EventBus';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';
import { GAME_EVENTS } from '../../src/assets/scripts/client/game/gameEventConstants';

// Build a storage adapter stub exposing only the `get(key)`/`set(key, value)`
// contract, so the option-persistence seam is exercised without a global
// `localStorage` backend.
const buildStorageAdapter = ({ storedValue = null } = {}) => ({
    get: sinon.stub().returns(storedValue),
    set: sinon.stub()
});

// Build a page focus/visibility boundary stub exposing only the
// `subscribe(onHidden, onVisible)` contract, so the registration seam is
// exercised without a global `window`/`document` backend.
const buildPageVisibilityAdapter = () => ({
    subscribe: sinon.stub()
});

// `GameController` is an import-time singleton, so each test restores it to the
// browser-global-free default configuration after mutating it.
ava.afterEach.always(() => {
    GameController.initStorage(null);
    GameController.initPageVisibility(null);
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
    GameController.game_timeout(() => {}, 1);
    const originalGameOptions = GameController.game.option;
    const originalTimers = GameController.game.timeouts;

    GameController.destroy();

    t.not(GameController.game.option, originalGameOptions);
    t.not(GameController.game.timeouts, originalTimers);
    t.is(GameController.game.timeouts, GameController._timerQueue.timers);
    t.deepEqual(GameController.game.timeouts, []);
    t.is(GameController._storageAdapter, storageAdapter);
    t.is(GameController.game.option._storageAdapter, storageAdapter);
    t.is(GameController.getGameOption('theme'), 'CELESTIAL');
});

ava.serial('.initPageVisibility() retains the exact adapter identity on the singleton', (t) => {
    const pageVisibilityAdapter = buildPageVisibilityAdapter();

    GameController.initPageVisibility(pageVisibilityAdapter);

    t.is(GameController._pageVisibilityAdapter, pageVisibilityAdapter);
});

ava.serial('.initPageVisibility() normalizes a nullish adapter to canonical null', (t) => {
    GameController.initPageVisibility(buildPageVisibilityAdapter());

    GameController.initPageVisibility(undefined);

    t.is(GameController._pageVisibilityAdapter, null);
});

ava.serial('.initPageVisibility() defaults an omitted adapter to canonical null', (t) => {
    GameController.initPageVisibility(buildPageVisibilityAdapter());

    GameController.initPageVisibility();

    t.is(GameController._pageVisibilityAdapter, null);
});

ava.serial('.destroy() retains the configured page-visibility adapter', (t) => {
    const pageVisibilityAdapter = buildPageVisibilityAdapter();

    GameController.initPageVisibility(pageVisibilityAdapter);
    GameController.destroy();

    t.is(GameController._pageVisibilityAdapter, pageVisibilityAdapter);
});

ava.serial('.enable() subscribes with the exact bound blur/focus handler identities', (t) => {
    const pageVisibilityAdapter = buildPageVisibilityAdapter();

    GameController.initPageVisibility(pageVisibilityAdapter);
    GameController.setupHandlers();
    GameController.enable();

    t.true(pageVisibilityAdapter.subscribe.calledOnceWithExactly(
        GameController._onWindowBlurHandler,
        GameController._onWindowFocusHandler
    ));
});

ava.serial('.enable() is a safe, browser-free no-op when no page-visibility adapter is configured', (t) => {
    GameController.initPageVisibility(null);
    GameController.setupHandlers();

    t.notThrows(() => GameController.enable());
});

ava('.events_recordNew() emits SCORE_EVENT_RECORDED through the controller event bus', (t) => {
    const eventBus = new EventBusClass();
    const controller = new GameControllerClass(undefined, eventBus);
    // Isolate the notification behavior from the DOM-bound score rendering.
    sinon.stub(controller, 'game_updateScore');
    sinon.stub(controller, 'updateScoreHistory');
    const observer = sinon.spy();
    eventBus.on(EVENT.SCORE_EVENT_RECORDED, observer);

    controller.events_recordNew(GAME_EVENTS.ARRIVAL);

    t.true(observer.calledOnceWithExactly(GAME_EVENTS.ARRIVAL));
});

ava('a constructible controller delegates legacy timeouts to a context-owned queue', (t) => {
    const context = new SimulationContext();
    const controller = new GameControllerClass(context.timerQueue);
    const receiver = {};
    const callback = sinon.spy();

    const timer = controller.game_timeout(callback, 1, receiver, 'payload');

    t.is(controller._timerQueue, context.timerQueue);
    t.is(controller.game.timeouts, context.timerQueue.timers);
    t.is(controller.game.timeouts[0], timer);

    context.tick(1.01);

    t.true(callback.calledOnceWithExactly('payload'));
    t.is(callback.firstCall.thisValue, receiver);
    t.deepEqual(controller.game.timeouts, []);
});
