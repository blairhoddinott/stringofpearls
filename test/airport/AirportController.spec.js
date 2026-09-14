import ava from 'ava';
import sinon from 'sinon';
import AirportController from '../../src/assets/scripts/client/airport/AirportController';
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
