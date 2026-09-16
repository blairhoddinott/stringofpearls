import ava from 'ava';
// import sinon from 'sinon';

import AircraftController from '../../src/assets/scripts/client/aircraft/AircraftController';
import AircraftCollection from '../../src/assets/scripts/client/aircraft/AircraftCollection';
import AirportController from '../../src/assets/scripts/client/airport/AirportController';
import { EventBusClass } from '../../src/assets/scripts/client/lib/EventBus';
import { NavigationLibraryClass } from '../../src/assets/scripts/client/navigationLibrary/NavigationLibrary';
import {
    AIRCRAFT_DEFINITION_LIST_MOCK,
    DEPARTURE_AIRCRAFT_INIT_PROPS_MOCK
} from './_mocks/aircraftMocks';
import { AIRPORT_JSON_KLAS_MOCK } from '../airport/_mocks/airportJsonMock';
import { airlineControllerFixture } from '../fixtures/airlineFixtures';
import { scopeModelFixture } from '../fixtures/scopeFixtures';
// import { spawnPatternModelArrivalFixture } from '../fixtures/trafficGeneratorFixtures';

ava('throws when called with missing parameters', (t) => {
    const expectedMessage = /Invalid parameter\(s\) passed to AircraftController constructor\. Expected aircraftTypeDefinitionList, airlineController and scopeModel to be defined, but received .*/;

    t.throws(() => new AircraftController(), {
        instanceOf: TypeError,
        message: expectedMessage
    });

    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(airlineControllerFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });

    t.throws(() => new AircraftController(airlineControllerFixture, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, airlineControllerFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });

    t.throws(() => new AircraftController(null, airlineControllerFixture, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, null, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, airlineControllerFixture, null), {
        instanceOf: TypeError,
        message: expectedMessage
    });
});

ava('throws when called with invalid aircraftTypeDefinitionList', (t) => {
    const expectedMessage = /Invalid aircraftTypeDefinitionList passed to AircraftController constructor\. Expected a non-empty array, but received .*/;

    t.throws(() => new AircraftController({}, airlineControllerFixture, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController([], airlineControllerFixture, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(42, airlineControllerFixture, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController('threeve', airlineControllerFixture, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(false, airlineControllerFixture, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
});

ava('throws when called with invalid airlineController', (t) => {
    const expectedMessage = /Invalid airlineController passed to AircraftController constructor\. Expected instance of AirlineController, but received .*/;

    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, {}, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, [], scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, 42, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, 'threeve', scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, false, scopeModelFixture), {
        instanceOf: TypeError,
        message: expectedMessage
    });
});

ava('throws when called with invalid scopeModel', (t) => {
    const expectedMessage = /Invalid scopeModel passed to AircraftController constructor\. Expected instance of ScopeModel, but received .*/;

    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, airlineControllerFixture, {}), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, airlineControllerFixture, []), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, airlineControllerFixture, 42), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, airlineControllerFixture, 'threeve'), {
        instanceOf: TypeError,
        message: expectedMessage
    });
    t.throws(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, airlineControllerFixture, false), {
        instanceOf: TypeError,
        message: expectedMessage
    });
});

ava('threads the randomSource by identity to StripViewController after the delay scheduler', (t) => {
    const delayScheduler = { schedule: () => {} };
    const randomSource = { integer: () => 1 };
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        delayScheduler,
        randomSource
    );

    t.is(controller._stripViewController._delayScheduler, delayScheduler);
    t.is(controller._stripViewController._randomSource, randomSource);
});

ava('retains an injected aircraft collection by exact identity', (t) => {
    const aircraftCollection = new AircraftCollection();
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        undefined,
        aircraftCollection
    );

    t.is(controller.aircraft, aircraftCollection);
});

ava('resets the legacy aircraft collection when an explicit null collection is supplied', (t) => {
    const firstController = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture
    );

    firstController.aircraft.list.push({ callsign: 'stale' });
    firstController.aircraft.auto.enabled = true;

    const secondController = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        undefined,
        null
    );

    t.deepEqual(secondController.aircraft.list, []);
    t.false(secondController.aircraft.auto.enabled);
});

ava('retains an injected event bus by exact identity', (t) => {
    const eventBus = new EventBusClass();
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        undefined,
        new AircraftCollection(),
        eventBus
    );

    t.is(controller._eventBus, eventBus);
});

ava('retains an injected airport controller by exact identity', (t) => {
    const airportController = {};
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        undefined,
        new AircraftCollection(),
        new EventBusClass(),
        airportController
    );

    t.is(controller._airportController, airportController);
});

ava('retains an injected navigation library by exact identity', (t) => {
    const navigationLibrary = new NavigationLibraryClass();
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        undefined,
        new AircraftCollection(),
        new EventBusClass(),
        undefined,
        navigationLibrary
    );

    t.is(controller._navigationLibrary, navigationLibrary);
});

ava('retains an injected clock by exact identity', (t) => {
    const clock = {};
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        undefined,
        new AircraftCollection(),
        new EventBusClass(),
        undefined,
        undefined,
        clock
    );

    t.is(controller._clock, clock);
});

ava.serial('creates aircraft and conflicts with the exact injected service owners', (t) => {
    const navigationLibrary = new NavigationLibraryClass();
    navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    const clock = {
        accumulatedDeltaTime: 0
    };
    const eventBus = new EventBusClass();
    const airportController = {
        current: AirportController.current,
        airport_get: (...args) => AirportController.airport_get(...args)
    };
    const aircraftCollection = new AircraftCollection();
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        undefined,
        aircraftCollection,
        eventBus,
        airportController,
        navigationLibrary,
        clock
    );
    const previousAircraftController = window.aircraftController;
    window.aircraftController = controller;
    t.teardown(() => {
        window.aircraftController = previousAircraftController;
    });

    controller._createAircraftWithInitializationProps(DEPARTURE_AIRCRAFT_INIT_PROPS_MOCK);
    controller._createAircraftWithInitializationProps(DEPARTURE_AIRCRAFT_INIT_PROPS_MOCK);
    controller.addConflict(aircraftCollection.list[0], aircraftCollection.list[1]);

    t.is(aircraftCollection.list.length, 2);
    t.is(aircraftCollection.list[0].fms._navigationLibrary, navigationLibrary);
    t.is(aircraftCollection.list[0].fms._airportController, airportController);
    t.is(aircraftCollection.list[0]._clock, clock);
    t.is(aircraftCollection.list[0]._eventBus, eventBus);
    t.is(controller.conflicts.length, 1);
    t.is(controller.conflicts[0]._clock, clock);
    t.is(controller.conflicts[0]._eventBus, eventBus);
    t.is(controller.conflicts[0]._airportController, airportController);
});

ava('generates distinct deterministic CIDs when randomSource is omitted', (t) => {
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture
    );
    const stripViewController = controller._stripViewController;

    t.is(stripViewController._generateCidNumber(), 1);
    t.is(stripViewController._generateCidNumber(), 2);
});

ava('does not throw when passed valid parameters', (t) => {
    t.notThrows(() => new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, airlineControllerFixture, scopeModelFixture));
});

// ava('.createAircraftWithSpawnPatternModel() calls ._buildAircraftProps()', (t) => {
//     const controller = new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, airlineControllerFixture, scopeModelFixture);
//     const _buildAircraftPropsSpy = sinon.spy(controller, '_buildAircraftProps');
//     const _createAircraftWithInitializationPropsStub = sinon.stub(controller, '_createAircraftWithInitializationProps');
//
//     controller.createAircraftWithSpawnPatternModel(spawnPatternModelArrivalFixture);
//
//     t.true(_buildAircraftPropsSpy.calledWithExactly(spawnPatternModelArrivalFixture));
//
//     _createAircraftWithInitializationPropsStub.restore();
// });
//
// ava('.removeFlightNumberFromList() calls _airlineController.removeFlightNumberFromList() with an airlineId and a flightNumber', (t) => {
//     const controller = new AircraftController(AIRCRAFT_DEFINITION_LIST_MOCK, airlineControllerFixture, scopeModelFixture);
//     const removeFlightNumberFromListSpy = sinon.spy(controller._airlineController, 'removeFlightNumberFromList');
//
//     controller.removeFlightNumberFromList({ airlineId: 'aal', callsign: '123' });
//
//     t.true(removeFlightNumberFromListSpy.calledOnce);
// });
