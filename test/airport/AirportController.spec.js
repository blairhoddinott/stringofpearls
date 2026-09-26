import ava from 'ava';
import sinon from 'sinon';
import AirportController, {
    AirportControllerClass
} from '../../src/assets/scripts/client/airport/AirportController';
import { EventBusClass } from '../../src/assets/scripts/client/lib/EventBus';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';
import { STORAGE_KEY } from '../../src/assets/scripts/client/constants/storageKeys';
import { AIRPORT_JSON_KLAS_MOCK } from '../airport/_mocks/airportJsonMock';
import { AIRPORT_LOAD_LIST_MOCK } from '../airport/_mocks/airportLoadListMocks';

ava('throws when called to instantiate', (t) => {
    t.throws(() => new AirportController());
});

ava('constructible controllers isolate airport selection and event dispatch', (t) => {
    const firstEventBus = new EventBusClass();
    const secondEventBus = new EventBusClass();
    const first = new AirportControllerClass(firstEventBus);
    const second = new AirportControllerClass(secondEventBus);
    const firstAirport = {
        icao: 'kaaa',
        loaded: true,
        data: { icao: 'kaaa' },
        set: sinon.stub()
    };
    let firstEventCount = 0;
    let secondEventCount = 0;

    firstEventBus.on(EVENT.AIRPORT_CHANGE, () => { firstEventCount++; });
    secondEventBus.on(EVENT.AIRPORT_CHANGE, () => { secondEventCount++; });
    first.airport_add(firstAirport);
    first.airport_set('kaaa');

    t.is(first.current, firstAirport);
    t.is(second.current, null);
    t.is(firstEventCount, 1);
    t.is(secondEventCount, 0);
    t.true(firstAirport.set.calledOnceWithExactly(null));
});

ava('.airport_set() rejects a guarded change before mutating or loading state', (t) => {
    const eventBus = new EventBusClass();
    const controller = new AirportControllerClass(eventBus);
    const currentAirport = { icao: 'kaaa' };
    const nextAirport = { icao: 'kbbb', loaded: false, set: sinon.stub() };
    controller.airport_add(currentAirport);
    controller.airport_add(nextAirport);
    controller.current = currentAirport;
    controller.setAirportSelectionGuard(() => false);
    const eventObserver = sinon.stub();
    eventBus.on(EVENT.AIRPORT_CHANGE, eventObserver);

    controller.airport_set('kbbb');

    t.is(controller.current, currentAirport);
    t.true(nextAirport.set.notCalled);
    t.true(eventObserver.notCalled);
});

ava('.airport_set() accepts a change when the selection guard allows it', (t) => {
    const controller = new AirportControllerClass(new EventBusClass());
    const airport = { icao: 'kaaa', loaded: false, set: sinon.stub() };
    controller.airport_add(airport);
    controller.setAirportSelectionGuard(() => true);

    controller.airport_set('kaaa');

    t.is(controller.current, airport);
    t.true(airport.set.calledOnceWithExactly(null));
});

ava('reset retains a constructible controller event bus for subsequent selections', (t) => {
    const eventBus = new EventBusClass();
    const controller = new AirportControllerClass(eventBus);
    const airport = { icao: 'kaaa', loaded: true, data: {}, set: sinon.stub() };
    const eventObserver = sinon.stub();

    eventBus.on(EVENT.AIRPORT_CHANGE, eventObserver);
    controller.reset();
    controller.airport_add(airport);
    controller.airport_set('kaaa');

    t.true(eventObserver.calledOnceWithExactly(airport.data));
});

ava('constructible controllers give created airport models their exact service owners', (t) => {
    const eventBus = new EventBusClass();
    const clock = {};
    const gameState = {};
    const controller = new AirportControllerClass(eventBus, clock, gameState);
    const airportDefinition = AIRPORT_LOAD_LIST_MOCK[0];

    controller.airport_load(airportDefinition);

    const airportModel = controller.airport_get(airportDefinition.icao);

    t.is(airportModel.eventBus, eventBus);
    t.is(airportModel._clock, clock);
    t.is(airportModel._gameState, gameState);
});

ava.serial('created airport models recover load failures through their owning controller', (t) => {
    const controller = new AirportControllerClass(new EventBusClass());
    const airportDefinition = AIRPORT_LOAD_LIST_MOCK[0];
    const retryCurrentAirport = { set: sinon.stub() };
    const consoleErrorStub = sinon.stub(console, 'error');

    t.teardown(() => consoleErrorStub.restore());

    controller.airport_load(airportDefinition);
    controller.current = retryCurrentAirport;
    controller.airport_get(airportDefinition.icao).onLoadAirportError(new Error('failed'));

    t.true(retryCurrentAirport.set.calledOnceWithExactly());
});

ava('does not throw when .init() is called with initialization props', (t) => {
    t.notThrows(() => AirportController.init('klas', AIRPORT_JSON_KLAS_MOCK, AIRPORT_LOAD_LIST_MOCK));

    AirportController.reset();
});

ava.serial('.init() injects the shared content queue instance into every created AirportModel', (t) => {
    // never-resolving promise keeps injected queue calls from settling into
    // downstream processing during this identity assertion
    const contentQueueMock = { addPromise: sinon.stub().returns(new Promise(() => {})) };

    t.teardown(() => AirportController.reset());

    AirportController.init('klas', AIRPORT_JSON_KLAS_MOCK, AIRPORT_LOAD_LIST_MOCK, contentQueueMock);

    const createdModels = Object.keys(AirportController.airports);

    t.true(createdModels.length === AIRPORT_LOAD_LIST_MOCK.length);

    createdModels.forEach((icao) => {
        t.is(AirportController.airports[icao]._contentQueue, contentQueueMock);
    });
});

ava.serial('.init() injects the shared storage adapter instance into every created AirportModel', (t) => {
    // never-resolving queue keeps injected calls from settling into downstream
    // processing during this identity assertion
    const contentQueueMock = { addPromise: sinon.stub().returns(new Promise(() => {})) };
    const storageAdapterMock = { get: sinon.stub().returns(null), set: sinon.stub() };

    t.teardown(() => AirportController.reset());

    AirportController.init('klas', AIRPORT_JSON_KLAS_MOCK, AIRPORT_LOAD_LIST_MOCK, contentQueueMock, storageAdapterMock);

    const createdModels = Object.keys(AirportController.airports);

    t.true(createdModels.length === AIRPORT_LOAD_LIST_MOCK.length);

    createdModels.forEach((icao) => {
        t.is(AirportController.airports[icao]._storageAdapter, storageAdapterMock);
    });
});

ava.serial('._resolveInitialIcao() returns the supplied icao without reading storage', (t) => {
    const getStub = sinon.stub();
    AirportController._storageAdapter = { get: getStub };

    t.teardown(() => AirportController.reset());

    const result = AirportController._resolveInitialIcao('KLAS');

    t.is(result, 'KLAS');
    t.false(getStub.called);
});

ava.serial('._resolveInitialIcao() substitutes the stored airport read from the exact key when no icao is supplied', (t) => {
    const getStub = sinon.stub().returns('ksea');
    AirportController._storageAdapter = { get: getStub };

    t.teardown(() => AirportController.reset());

    const result = AirportController._resolveInitialIcao();

    t.is(result, 'ksea');
    t.true(getStub.calledOnceWithExactly(STORAGE_KEY.ATC_LAST_AIRPORT));
});

ava.serial('._resolveInitialIcao() treats the missing storage sentinel as no stored airport without fabricating a value', (t) => {
    const getStub = sinon.stub().returns(null);
    AirportController._storageAdapter = { get: getStub };

    t.teardown(() => AirportController.reset());

    const nullSentinelResult = AirportController._resolveInitialIcao(undefined);

    t.is(nullSentinelResult, undefined);

    getStub.returns(undefined);

    const undefinedSentinelResult = AirportController._resolveInitialIcao(undefined);

    t.is(undefinedSentinelResult, undefined);
});
