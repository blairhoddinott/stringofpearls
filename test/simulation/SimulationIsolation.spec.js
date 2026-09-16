import ava from 'ava';
import AircraftCollection from '../../src/assets/scripts/client/aircraft/AircraftCollection';
import AircraftController from '../../src/assets/scripts/client/aircraft/AircraftController';
import { AirportControllerClass } from '../../src/assets/scripts/client/airport/AirportController';
import { EventBusClass } from '../../src/assets/scripts/client/lib/EventBus';
import { NavigationLibraryClass } from '../../src/assets/scripts/client/navigationLibrary/NavigationLibrary';
import RandomSource from '../../src/assets/scripts/client/platform/RandomSource';
import SimulationClock from '../../src/assets/scripts/client/simulation/SimulationClock';
import SimulationContext from '../../src/assets/scripts/client/simulation/SimulationContext';
import SimulationGameState from '../../src/assets/scripts/client/simulation/SimulationGameState';
import { FLIGHT_PHASE } from '../../src/assets/scripts/client/constants/aircraftConstants';
import { GAME_EVENTS } from '../../src/assets/scripts/client/game/gameEventConstants';
import {
    AIRCRAFT_DEFINITION_LIST_MOCK,
    DEPARTURE_AIRCRAFT_INIT_PROPS_MOCK
} from '../aircraft/_mocks/aircraftMocks';
import { AIRPORT_JSON_KLAS_MOCK } from '../airport/_mocks/airportJsonMock';
import { airlineControllerFixture } from '../fixtures/airlineFixtures';
import { scopeModelFixture } from '../fixtures/scopeFixtures';

function createSeededRandomSource(seed) {
    let state = seed >>> 0;
    const fraction = () => {
        state = ((state * 1664525) + 1013904223) >>> 0;

        return state / 0x100000000;
    };

    return new RandomSource(
        fraction,
        (lower, upper) => lower + Math.floor(fraction() * ((upper - lower) + 1)),
        (lower, upper) => lower + (fraction() * (upper - lower))
    );
}

function createSimulation(seed) {
    const clock = new SimulationClock();
    const randomSource = createSeededRandomSource(seed);
    const eventBus = new EventBusClass();
    const gameState = new SimulationGameState();
    const navigationLibrary = new NavigationLibraryClass();
    navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    const airportController = new AirportControllerClass(eventBus, clock, gameState);
    airportController.airport_load({
        icao: 'klas',
        level: 'medium',
        name: 'McCarran International Airport'
    });
    airportController.airport_get('klas').load(AIRPORT_JSON_KLAS_MOCK);
    airportController.current = airportController.airport_get('klas');
    const aircraftCollection = new AircraftCollection();
    const aircraftController = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        randomSource,
        aircraftCollection,
        eventBus,
        airportController,
        navigationLibrary,
        clock,
        gameState
    );
    const context = new SimulationContext({
        clock,
        randomSource,
        eventBus,
        airportController,
        navigationLibrary,
        aircraftCollection,
        aircraftController,
        gameState
    });

    aircraftController._createAircraftWithInitializationProps(DEPARTURE_AIRCRAFT_INIT_PROPS_MOCK);
    const [aircraft] = aircraftCollection.list;
    aircraft.setFlightPhase(FLIGHT_PHASE.CRUISE);
    aircraft.altitude = 10000;
    aircraft.speed = 250;
    aircraft.heading = 0;
    aircraft.targetHeading = Math.PI / 2;

    return { context, aircraftController, aircraft };
}

function snapshot({ context, aircraft }) {
    return {
        elapsedTime: context.clock.elapsedTime,
        deltaTime: context.clock.deltaTime,
        score: context.gameState.score,
        events: { ...context.gameState.events },
        towerController: context.gameState.getGameOption('towerController'),
        aircraft: {
            cid: aircraft.cid,
            pilotVoice: { ...aircraft.pilotVoice },
            altitude: aircraft.altitude,
            speed: aircraft.speed,
            heading: aircraft.heading,
            relativePosition: [...aircraft.relativePosition],
            flightPhase: aircraft.flightPhase
        }
    };
}

ava.serial('identical seeds and inputs stay deterministic while sibling state remains isolated', (t) => {
    const first = createSimulation(0x5eed);
    const second = createSimulation(0x5eed);
    let firstEventCount = 0;
    let secondEventCount = 0;
    first.context.eventBus.on('isolation-proof', () => { firstEventCount++; });
    second.context.eventBus.on('isolation-proof', () => { secondEventCount++; });

    first.context.gameState.events_recordNew(GAME_EVENTS.ARRIVAL);
    second.context.gameState.events_recordNew(GAME_EVENTS.ARRIVAL);

    for (const delta of [0.5, 1, 2]) {
        first.context.tick(delta);
        second.context.tick(delta);
    }

    t.deepEqual(snapshot(first), snapshot(second));
    t.not(first.context.clock, second.context.clock);
    t.not(first.context.randomSource, second.context.randomSource);
    t.not(first.context.eventBus, second.context.eventBus);
    t.not(first.context.airportController, second.context.airportController);
    t.not(first.context.navigationLibrary, second.context.navigationLibrary);
    t.not(first.context.aircraftCollection, second.context.aircraftCollection);
    t.not(first.context.gameState, second.context.gameState);
    t.not(first.aircraftController, second.aircraftController);
    t.not(first.aircraft, second.aircraft);

    first.context.eventBus.trigger('isolation-proof');
    first.context.gameState.events_recordNew(GAME_EVENTS.COLLISION);
    first.context.gameState.setGameOption('towerController', 'USER');
    first.context.tick(4);

    t.is(firstEventCount, 1);
    t.is(secondEventCount, 0);
    t.is(second.context.clock.elapsedTime, 3.5);
    t.is(second.context.gameState.score, 10);
    t.is(second.context.gameState.events[GAME_EVENTS.COLLISION], 0);
    t.is(second.context.gameState.getGameOption('towerController'), 'SYSTEM');
    t.is(second.context.aircraftCollection.list.length, 1);

    first.context.destroy();

    t.is(second.context.aircraftCollection.list.length, 1);
    t.is(second.context.gameState.score, 10);
    t.is(second.context.clock.elapsedTime, 3.5);

    second.context.destroy();
});
