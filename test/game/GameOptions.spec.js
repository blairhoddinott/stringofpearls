import ava from 'ava';
import sinon from 'sinon';
import _isNil from 'lodash/isNil';
import GameOptions from '../../src/assets/scripts/client/game/GameOptions';
import EventTracker from '../../src/assets/scripts/client/EventTracker';
import { GAME_OPTION_LIST_MOCK } from './_mocks/gameOptionMocks';

// Build a storage adapter stub exposing only the `get(key)`/`set(key, value)`
// contract, so the option-persistence boundary is exercised without a global
// `localStorage` backend.
const buildStorageAdapter = ({ storedValue = null } = {}) => ({
    get: sinon.stub().returns(storedValue),
    set: sinon.stub()
});

ava('constructs without an adapter and initializes options from defaults', (t) => {
    const model = new GameOptions();

    t.is(model._storageAdapter, null);
    t.is(model.theme, 'DEFAULT');
});

ava('sets #_options on instantiation', (t) => {
    const expectedResult = [
        'theme',
        'towerController',
        'controlMethod',
        'drawIlsDistanceSeparator',
        'ptlLengths',
        'drawProjectedPaths',
        'softCeiling',
        'mouseClickDrag',
        'rangeRings',
        'measureToolPath',
        'chatLogDuration'
    ];

    const model = new GameOptions();
    const result = Object.keys(model._options);

    t.deepEqual(result, expectedResult);
});

ava('initializes representative mixed-type options from declared defaults with no adapter configured', (t) => {
    const model = new GameOptions();

    t.is(model._storageAdapter, null);
    t.is(model.theme, 'DEFAULT');
    t.is(model.measureToolPath, '0');
    t.is(model.chatLogDuration, '3');
});

ava('.addGameOptions() calls .addOption() for each available option', (t) => {
    const model = new GameOptions();
    const expectedResult = Object.keys(model._options).length;
    const addOptionSpy = sinon.spy(model, 'addOption');

    model.addGameOptions();

    t.true(addOptionSpy.callCount === expectedResult);
});

ava('.addOption() adds option to #_options and creates new property from option.name', (t) => {
    const optionKeyMock = 'threeve';
    const optionValueMock = '$texas';
    const model = new GameOptions();
    model._options = {};
    model.addOption(GAME_OPTION_LIST_MOCK[0]);

    t.false(_isNil(model._options[optionKeyMock]));
    t.false(_isNil(model[optionKeyMock]));
    t.true(model[optionKeyMock] === optionValueMock);
});

ava('.addOption() uses the declared default and performs no storage/global access when unconfigured', (t) => {
    const model = new GameOptions();
    model._options = {};

    model.addOption(GAME_OPTION_LIST_MOCK[0]);

    t.is(model.threeve, '$texas');
});

ava('.initStorage() retains the exact adapter identity and rehydrates every known option', (t) => {
    const storageAdapter = buildStorageAdapter();
    const model = new GameOptions();

    model.initStorage(storageAdapter);

    t.is(model._storageAdapter, storageAdapter);
    // one `get()` per known option, each with its exact dynamic key
    t.is(storageAdapter.get.callCount, Object.keys(model._options).length);
    t.true(storageAdapter.get.calledWithExactly('zlsa.atc.option.theme'));
    t.true(storageAdapter.get.calledWithExactly('zlsa.atc.option.measureToolPath'));
});

ava('.initStorage() normalizes an omitted adapter to canonical null', (t) => {
    const model = new GameOptions();

    t.notThrows(() => model.initStorage());

    t.is(model._storageAdapter, null);
});

ava('.initStorage() normalizes a null adapter to canonical null', (t) => {
    const model = new GameOptions();

    model.initStorage(null);

    t.is(model._storageAdapter, null);
});

ava('.initStorage() normalizes an undefined adapter to canonical null', (t) => {
    const model = new GameOptions();

    model.initStorage(undefined);

    t.is(model._storageAdapter, null);
});

ava('.addOption() calls get() exactly once with the exact dynamic key when configured', (t) => {
    const storageAdapter = buildStorageAdapter();
    const model = new GameOptions();
    model._storageAdapter = storageAdapter;
    model._options = {};

    model.addOption(GAME_OPTION_LIST_MOCK[0]);

    t.true(storageAdapter.get.calledOnceWithExactly('zlsa.atc.option.threeve'));
});

ava('.addOption() falls back to the declared default when the adapter returns null', (t) => {
    const model = new GameOptions();
    model._storageAdapter = buildStorageAdapter({ storedValue: null });
    model._options = {};

    model.addOption(GAME_OPTION_LIST_MOCK[0]);

    t.is(model.threeve, '$texas');
});

ava('.addOption() falls back to the declared default when the adapter returns undefined', (t) => {
    const model = new GameOptions();
    model._storageAdapter = buildStorageAdapter({ storedValue: undefined });
    model._options = {};

    model.addOption(GAME_OPTION_LIST_MOCK[0]);

    t.is(model.threeve, '$texas');
});

ava('.addOption() preserves a falsy-but-present empty string raw value verbatim', (t) => {
    const model = new GameOptions();
    model._storageAdapter = buildStorageAdapter({ storedValue: '' });
    model._options = {};

    model.addOption(GAME_OPTION_LIST_MOCK[0]);

    t.is(model.threeve, '');
});

ava('.addOption() preserves a falsy-but-present zero string raw value verbatim', (t) => {
    const model = new GameOptions();
    model._storageAdapter = buildStorageAdapter({ storedValue: '0' });
    model._options = {};

    model.addOption(GAME_OPTION_LIST_MOCK[0]);

    t.is(model.threeve, '0');
});

ava('.addOption() preserves an ordinary present raw value verbatim', (t) => {
    const expectedResult = 'ruff';
    const model = new GameOptions();
    model._storageAdapter = buildStorageAdapter({ storedValue: expectedResult });
    model._options = {};

    model.addOption(GAME_OPTION_LIST_MOCK[0]);

    t.is(model.threeve, expectedResult);
});

ava('.setOptionByName() writes the exact dynamic key and raw value through the adapter', (t) => {
    const expectedResult = 'bow wow';
    const optionNameMock = 'threeve';
    const storageKeyMock = 'zlsa.atc.option.threeve';
    const storageAdapter = buildStorageAdapter();
    const model = new GameOptions();
    model._storageAdapter = storageAdapter;

    model.addOption(GAME_OPTION_LIST_MOCK[0]);
    const result = model.setOptionByName(optionNameMock, expectedResult);

    t.true(storageAdapter.set.calledOnceWithExactly(storageKeyMock, expectedResult));
    t.is(model.threeve, expectedResult);
    t.is(result, expectedResult);
});

ava.serial('.setOptionByName() updates, records, triggers, and returns without persistence when unconfigured', (t) => {
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());
    const optionValueMock = 'bow wow';
    const optionNameMock = 'threeve';
    const model = new GameOptions();
    const triggerStub = sinon.stub(model._eventBus, 'trigger');
    t.teardown(() => triggerStub.restore());

    model.addOption(GAME_OPTION_LIST_MOCK[0]);
    const result = model.setOptionByName(optionNameMock, optionValueMock);

    t.is(model.threeve, optionValueMock);
    t.true(recordEventStub.calledOnce);
    t.true(triggerStub.calledOnce);
    t.is(result, optionValueMock);
});

ava.serial('.setOptionByName() persists before recording analytics and before triggering the event', (t) => {
    const recordEventStub = sinon.stub(EventTracker, 'recordEvent');
    t.teardown(() => recordEventStub.restore());
    const storageAdapter = buildStorageAdapter();
    const model = new GameOptions();
    model._storageAdapter = storageAdapter;
    const triggerStub = sinon.stub(model._eventBus, 'trigger');
    t.teardown(() => triggerStub.restore());

    model.addOption(GAME_OPTION_LIST_MOCK[0]);
    model.setOptionByName('threeve', 'bow wow');

    t.true(storageAdapter.set.calledBefore(recordEventStub));
    t.true(recordEventStub.calledBefore(triggerStub));
});

ava.serial('.setOptionByName() calls EventBus.trigger() when #onChangeEventHandler() is not null', (t) => {
    const optionValueMock = 'bow wow';
    const optionNameMock = 'threeve';
    const model = new GameOptions();
    const triggerStub = sinon.stub(model._eventBus, 'trigger');
    t.teardown(() => triggerStub.restore());

    model.addOption(GAME_OPTION_LIST_MOCK[0]);
    model.setOptionByName(optionNameMock, optionValueMock);

    t.true(triggerStub.callCount === 1);
    t.true(triggerStub.calledWithExactly(
        GAME_OPTION_LIST_MOCK[0].onChangeEventHandler,
        optionValueMock
    ));
});

ava.serial('.setOptionByName() does not call EventBus.trigger() when #onChangeEventHandler() is null', (t) => {
    const optionValueMock = 'bow wow';
    const optionNameMock = 'number';
    const model = new GameOptions();
    const triggerStub = sinon.stub(model._eventBus, 'trigger');
    t.teardown(() => triggerStub.restore());

    model.addOption(GAME_OPTION_LIST_MOCK[1]);
    model.setOptionByName(optionNameMock, optionValueMock);

    t.true(triggerStub.callCount === 0);
});

ava('.buildStorageName() returns a string used for storage keys', (t) => {
    const expectedResult = 'zlsa.atc.option.threeve';
    const model = new GameOptions();
    const result = model.buildStorageName('threeve');

    t.true(result === expectedResult);
});
