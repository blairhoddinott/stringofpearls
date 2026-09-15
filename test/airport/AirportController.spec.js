import ava from 'ava';
import sinon from 'sinon';
import AirportController from '../../src/assets/scripts/client/airport/AirportController';
import { STORAGE_KEY } from '../../src/assets/scripts/client/constants/storageKeys';
import { AIRPORT_JSON_KLAS_MOCK } from '../airport/_mocks/airportJsonMock';
import { AIRPORT_LOAD_LIST_MOCK } from '../airport/_mocks/airportLoadListMocks';

ava('throws when called to instantiate', (t) => {
    t.throws(() => new AirportController());
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
