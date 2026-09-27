import ava from 'ava';
import sinon from 'sinon';
import AircraftCollection from '../../../src/assets/scripts/client/aircraft/AircraftCollection';
import AircraftController from '../../../src/assets/scripts/client/aircraft/AircraftController';
import AirlineController from '../../../src/assets/scripts/client/airline/AirlineController';
import AirportController from '../../../src/assets/scripts/client/airport/AirportController';
import { EventBusClass } from '../../../src/assets/scripts/client/lib/EventBus';
import { NavigationLibraryClass } from '../../../src/assets/scripts/client/navigationLibrary/NavigationLibrary';
import SpawnPatternCollection from '../../../src/assets/scripts/client/trafficGenerator/SpawnPatternCollection';
import MappedScheduledSpawnPatternModel from '../../../src/assets/scripts/client/trafficGenerator/schedule/MappedScheduledSpawnPatternModel';
import { AIRCRAFT_DEFINITION_LIST_MOCK } from '../../aircraft/_mocks/aircraftMocks';
import { AIRPORT_JSON_KLAS_MOCK } from '../../airport/_mocks/airportJsonMock';
import { airlineControllerFixture } from '../../fixtures/airlineFixtures';
import {
    createAirportControllerFixture,
    resetAirportControllerFixture
} from '../../fixtures/airportFixtures';
import {
    createNavigationLibraryFixture,
    resetNavigationLibraryFixture
} from '../../fixtures/navigationLibraryFixtures';
import { AIRPORT_JSON_FOR_SPAWN_MOCK } from '../_mocks/spawnPatternMocks';
import { scopeModelFixture } from '../../fixtures/scopeFixtures';

const CONTEXT = { airportIcao: 'KLAS', timezone: 'America/Los_Angeles', zoneSecondsOfDayAtSimZero: 0 };

let ownedCollection;
let controller;
let navigationLibrary;

const buildMappingContext = () => ({
    candidatePatterns: SpawnPatternCollection.spawnPatternModels,
    isAirlineKnown: (icao) => typeof airlineControllerFixture.findAirlineById(icao) !== 'undefined',
    isAircraftTypeKnown: (icao) =>
        typeof controller.aircraftTypeDefinitionCollection.findAircraftTypeDefinitionModelByIcao(icao) !== 'undefined'
});

ava.beforeEach(() => {
    createNavigationLibraryFixture();
    createAirportControllerFixture();
    SpawnPatternCollection.init(AIRPORT_JSON_FOR_SPAWN_MOCK);

    navigationLibrary = new NavigationLibraryClass();
    navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    ownedCollection = new AircraftCollection();
    const airportController = {
        current: AirportController.current,
        airport_get: (...args) => AirportController.airport_get(...args)
    };
    controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        undefined,
        ownedCollection,
        new EventBusClass(),
        airportController,
        navigationLibrary
    );
    // The fixture airport carries no discrete transponder-code allocation, so the real
    // code generator would recurse forever; neutralise that unrelated collaborator.
    sinon.stub(controller, '_generateUniqueTransponderCode').returns('1234');
});

ava.afterEach.always(() => {
    sinon.restore();
    SpawnPatternCollection.reset();
    resetNavigationLibraryFixture();
    resetAirportControllerFixture();
    ownedCollection = null;
    controller = null;
    navigationLibrary = null;
});

ava('a mapped scheduled arrival spawns through the real AircraftController with its exact scheduled identity', (t) => {
    const flight = {
        id: 'arrival-aal1-kmia-klas',
        category: 'arrival',
        scheduledTime: '05:30',
        airlineIcao: 'aal',
        flightNumber: '1',
        originIcao: 'KMIA',
        destinationIcao: 'KLAS',
        aircraftTypeIcao: 'B737'
    };
    const model = new MappedScheduledSpawnPatternModel(flight, CONTEXT, buildMappingContext());

    controller.createAircraftWithSpawnPatternModel(model);

    t.is(ownedCollection.list.length, 1);
    const aircraft = ownedCollection.list[0];
    t.is(aircraft.category, 'arrival');
    t.is(aircraft.airlineId, 'aal');
    t.is(aircraft.flightNumber, '1');
    t.is(aircraft.getCallsign(), 'AAL1');
    t.is(aircraft.origin, 'KMIA');
    t.is(aircraft.destination, 'KLAS');
    // the exact scheduled aircraft type was honoured because it resolves to a known type
    t.is(aircraft.model.icao, 'B737');
});

ava('an unmappable scheduled arrival still spawns a generated flight in the same slot', (t) => {
    // A bespoke airline corpus whose only fleet type exists in the aircraft-definition
    // mock, so the generated (non-scheduled) flight number and type resolve deterministically.
    const fallbackAirlineController = new AirlineController([
        { name: 'American', icao: 'aal', callsignFormats: ['###'], fleets: { default: [['B737', 1]] } }
    ]);
    const airportController = {
        current: AirportController.current,
        airport_get: (...args) => AirportController.airport_get(...args)
    };
    // A dedicated collection so this bespoke controller is asserted in isolation from
    // the beforeEach controller that also listens for ADD_AIRCRAFT.
    const fallbackOwnedCollection = new AircraftCollection();
    const fallbackController = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        fallbackAirlineController,
        scopeModelFixture,
        undefined,
        undefined,
        fallbackOwnedCollection,
        new EventBusClass(),
        airportController,
        navigationLibrary
    );
    sinon.stub(fallbackController, '_generateUniqueTransponderCode').returns('1234');
    const flight = {
        id: 'arrival-asa9-panc-klas',
        category: 'arrival',
        scheduledTime: '06:00',
        airlineIcao: 'asa',
        flightNumber: '9',
        originIcao: 'PANC',
        destinationIcao: 'KLAS'
    };
    const model = new MappedScheduledSpawnPatternModel(flight, CONTEXT, {
        candidatePatterns: SpawnPatternCollection.spawnPatternModels,
        isAirlineKnown: () => false,
        isAircraftTypeKnown: () => false
    });

    t.is(model.getScheduledIdentity(), null);

    fallbackController.createAircraftWithSpawnPatternModel(model);

    t.is(fallbackOwnedCollection.list.length, 1);
    const aircraft = fallbackOwnedCollection.list[0];
    t.is(aircraft.category, 'arrival');
    // the slot was preserved as a generated flight, not dropped, and did not use the
    // unknown scheduled airline or its scheduled flight number
    t.not(aircraft.airlineId, 'asa');
    t.not(aircraft.getCallsign(), 'ASA9');
});

ava('mapping is deterministic: the same scheduled id spawns from the same local route', (t) => {
    const flight = {
        id: 'arrival-aal1-kmia-klas',
        category: 'arrival',
        scheduledTime: '05:30',
        airlineIcao: 'aal',
        flightNumber: '1',
        originIcao: 'KMIA',
        destinationIcao: 'KLAS'
    };
    const first = new MappedScheduledSpawnPatternModel(flight, CONTEXT, buildMappingContext());
    const second = new MappedScheduledSpawnPatternModel(flight, CONTEXT, buildMappingContext());

    t.is(first.routeString, second.routeString);
});

ava('sector/category compatibility: an arrival slot maps to an arrival route and a departure slot to a departure route', (t) => {
    const arrival = new MappedScheduledSpawnPatternModel({
        id: 'arrival-aal1-kmia-klas',
        category: 'arrival',
        scheduledTime: '05:30',
        airlineIcao: 'aal',
        flightNumber: '1',
        originIcao: 'KMIA',
        destinationIcao: 'KLAS'
    }, CONTEXT, buildMappingContext());
    const departure = new MappedScheduledSpawnPatternModel({
        id: 'departure-aal2-klas-kmia',
        category: 'departure',
        scheduledTime: '05:45',
        airlineIcao: 'aal',
        flightNumber: '2',
        originIcao: 'KLAS',
        destinationIcao: 'KMIA'
    }, CONTEXT, buildMappingContext());

    const arrivalRoutes = SpawnPatternCollection.spawnPatternModels
        .filter((pattern) => pattern.category === 'arrival')
        .map((pattern) => pattern.routeString);
    const departureRoutes = SpawnPatternCollection.spawnPatternModels
        .filter((pattern) => pattern.category === 'departure')
        .map((pattern) => pattern.routeString);

    t.true(arrivalRoutes.includes(arrival.routeString));
    t.true(departureRoutes.includes(departure.routeString));
});
