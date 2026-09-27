import ava from 'ava';
import sinon from 'sinon';

import AircraftController from '../../src/assets/scripts/client/aircraft/AircraftController';
import AircraftCollection from '../../src/assets/scripts/client/aircraft/AircraftCollection';
import AirlineController from '../../src/assets/scripts/client/airline/AirlineController';
import AirportController from '../../src/assets/scripts/client/airport/AirportController';
import { EventBusClass } from '../../src/assets/scripts/client/lib/EventBus';
import { NavigationLibraryClass } from '../../src/assets/scripts/client/navigationLibrary/NavigationLibrary';
import SimulationGameState from '../../src/assets/scripts/client/simulation/SimulationGameState';
import ScopeModel from '../../src/assets/scripts/client/scope/ScopeModel';
import CenterHandoffCoordinator, {
    CENTER_HANDOFF_ACCEPTANCE_DELAY_SECONDS
} from '../../src/assets/scripts/client/scope/CenterHandoffCoordinator';
import TowerHandoffCoordinator, {
    TOWER_HANDOFF_ACCEPTANCE_DELAY_SECONDS
} from '../../src/assets/scripts/client/scope/TowerHandoffCoordinator';
import HandoffModel, { HANDOFF_STATE } from '../../src/assets/scripts/client/scope/HandoffModel';
import UiController from '../../src/assets/scripts/client/ui/UiController';
import SpeechSynthesisAdapter from '../../src/assets/scripts/client/platform/SpeechSynthesisAdapter';
import { speech_init, speech_say } from '../../src/assets/scripts/client/speech';
import {
    AIRCRAFT_DEFINITION_LIST_MOCK,
    DEPARTURE_AIRCRAFT_INIT_PROPS_MOCK
} from './_mocks/aircraftMocks';
import { AIRPORT_JSON_KLAS_MOCK } from '../airport/_mocks/airportJsonMock';
import { airlineControllerFixture } from '../fixtures/airlineFixtures';
import { scopeModelFixture } from '../fixtures/scopeFixtures';
import { spawnPatternModelArrivalFixture } from '../fixtures/trafficGeneratorFixtures';

ava('activeStripCount delegates to the owned strip controller', (t) => {
    const controller = Object.create(AircraftController.prototype);
    controller._stripViewController = { activeStripCount: 2 };

    t.is(controller.activeStripCount, 2);
});

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

ava('threads scope ownership policy to AircraftCommander', (t) => {
    const scopeModel = new ScopeModel();
    const canIssueCommandsToStub = sinon.stub(scopeModel, 'canIssueCommandsTo').returns(false);
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModel
    );
    const aircraftModel = {};

    t.false(controller._aircraftCommander._canIssueCommandsTo(aircraftModel));
    t.true(canIssueCommandsToStub.calledOnceWithExactly(aircraftModel));
});

ava('threads tower and center handoff commands to ScopeModel', (t) => {
    const scopeModel = new ScopeModel();
    const contactTowerStub = sinon.stub(scopeModel, 'contactTower').returns([true, 'contact tower']);
    const contactCenterStub = sinon.stub(scopeModel, 'contactCenter').returns([true, 'contact center']);
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModel
    );
    const aircraftModel = {};

    t.deepEqual(controller._aircraftCommander._initiateTowerHandoff(aircraftModel), [true, 'contact tower']);
    t.deepEqual(controller._aircraftCommander._initiateCenterHandoff(aircraftModel), [true, 'contact center']);
    t.true(contactTowerStub.calledOnceWithExactly(aircraftModel));
    t.true(contactCenterStub.calledOnceWithExactly(aircraftModel));
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

ava('updates the injected handoff coordinators for each aircraft', (t) => {
    const centerHandoffCoordinator = { update: sinon.stub() };
    const towerHandoffCoordinator = { update: sinon.stub() };
    const aircraftCollection = new AircraftCollection();
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        undefined,
        aircraftCollection,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        centerHandoffCoordinator,
        towerHandoffCoordinator
    );
    const aircraftModel = {
        isControllable: true,
        isTaxiing: () => true,
        update: sinon.stub(),
        updateWarning: sinon.stub()
    };

    aircraftCollection.list.push(aircraftModel);
    controller.update();

    t.true(centerHandoffCoordinator.update.calledOnceWithExactly(aircraftModel));
    t.true(towerHandoffCoordinator.update.calledOnceWithExactly(aircraftModel));
});

ava('does not remove a player-owned strip merely because the aircraft is outside geographic control', (t) => {
    const scopeModel = new ScopeModel();
    const canIssueCommandsToStub = sinon.stub(scopeModel, 'canIssueCommandsTo').returns(true);
    const aircraftCollection = new AircraftCollection();
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModel,
        undefined,
        undefined,
        aircraftCollection,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { update: sinon.stub() },
        { update: sinon.stub() }
    );
    const aircraftModel = {
        isControllable: false,
        isTaxiing: sinon.stub().returns(false),
        update: sinon.stub(),
        updateWarning: sinon.stub()
    };

    sinon.stub(controller, '_updateAircraftConflicts');
    sinon.stub(controller, '_updateAircraftVisibility');
    const removeStripViewStub = sinon.stub(controller, 'removeStripView');
    aircraftCollection.list.push(aircraftModel);

    controller.update();

    t.true(canIssueCommandsToStub.calledOnceWithExactly(aircraftModel));
    t.true(removeStripViewStub.notCalled);
});

ava.serial('does not transmit the ground-switch message after tower owns a landed arrival', (t) => {
    const synthesis = { speak: sinon.stub(), discardIneligible: sinon.stub() };
    speech_init({ get: sinon.stub().returns(true) }, synthesis);
    t.teardown(() => speech_init());
    const uiLogStub = sinon.stub(UiController, 'ui_log');
    t.teardown(() => uiLogStub.restore());
    const aircraftModel = {
        callsign: 'UAL123',
        pilotVoice: {},
        hit: false,
        fms: { arrivalRunwayModel: {} },
        getRadioCallsign: sinon.stub().returns('united one twenty three'),
        isArrival: sinon.stub().returns(true),
        isStopped: sinon.stub().returns(true)
    };
    const controller = Object.create(AircraftController.prototype);
    controller._scopeModel = { canIssueCommandsTo: sinon.stub().returns(false) };
    controller._eventBus = { trigger: sinon.stub() };
    controller._gameState = { events_recordNew: sinon.stub() };
    controller.aircraft_remove = sinon.stub();

    controller._updateAircraftVisibility(aircraftModel);

    t.false(synthesis.speak.called);
    t.false(uiLogStub.called);
    t.true(controller.aircraft_remove.calledOnceWithExactly(aircraftModel));
});

ava.serial('preserves an authorized ground-switch message after normal aircraft removal', (t) => {
    const firstUtterance = {};
    const groundUtterance = {};
    const utteranceFactory = sinon.stub();
    utteranceFactory.onFirstCall().returns(firstUtterance);
    utteranceFactory.onSecondCall().returns(groundUtterance);
    const synthesis = {
        getVoices: sinon.stub().returns([]),
        speak: sinon.stub(),
        cancel: sinon.stub()
    };
    const speechAdapter = new SpeechSynthesisAdapter(synthesis, utteranceFactory);
    speech_init({ get: sinon.stub().returns(true) }, speechAdapter);
    t.teardown(() => speech_init());
    const uiLogStub = sinon.stub(UiController, 'ui_log');
    t.teardown(() => uiLogStub.restore());
    const canIssueCommandsTo = sinon.stub().returns(true);
    const aircraftModel = {
        callsign: 'UAL123',
        pilotVoice: {},
        isRadioSilent: false,
        hit: false,
        fms: { arrivalRunwayModel: {} },
        getRadioCallsign: sinon.stub().returns('united one twenty three'),
        isArrival: sinon.stub().returns(true),
        isStopped: sinon.stub().returns(true)
    };
    const controller = Object.create(AircraftController.prototype);
    controller._scopeModel = { canIssueCommandsTo };
    controller._eventBus = { trigger: sinon.stub() };
    controller._gameState = { events_recordNew: sinon.stub() };
    controller.aircraft_remove = sinon.stub().callsFake(() => canIssueCommandsTo.returns(false));
    speech_say([{ type: 'text', content: 'other aircraft' }], {});

    controller._updateAircraftVisibility(aircraftModel);
    firstUtterance.onend();

    t.true(synthesis.speak.calledTwice);
    t.true(utteranceFactory.secondCall.args[0].includes('switching to ground'));
    t.false(synthesis.cancel.called);
});

ava.serial('real center and tower acceptance stop active and queued aircraft speech', (t) => {
    const cases = [
        {
            name: 'center',
            delay: CENTER_HANDOFF_ACCEPTANCE_DELAY_SECONDS,
            request: (handoffModel) => handoffModel.requestCenterHandoff(0),
            buildCoordinators: (scopeModel, clock) => [
                new CenterHandoffCoordinator(scopeModel, {}, clock, {}),
                new TowerHandoffCoordinator(scopeModel, clock)
            ],
            expectedState: HANDOFF_STATE.CENTER_OWNED
        },
        {
            name: 'tower',
            delay: TOWER_HANDOFF_ACCEPTANCE_DELAY_SECONDS,
            request: (handoffModel) => handoffModel.requestTowerHandoff(0),
            buildCoordinators: (scopeModel, clock) => [
                new CenterHandoffCoordinator(scopeModel, {}, clock, {}),
                new TowerHandoffCoordinator(scopeModel, clock)
            ],
            expectedState: HANDOFF_STATE.TOWER_OWNED
        }
    ];

    for (const testCase of cases) {
        const utterance = {};
        const synthesis = {
            getVoices: sinon.stub().returns([]),
            speak: sinon.stub(),
            cancel: sinon.stub()
        };
        speech_init(
            { get: sinon.stub().returns(true) },
            new SpeechSynthesisAdapter(synthesis, sinon.stub().returns(utterance))
        );
        const handoffModel = new HandoffModel();
        const aircraftModel = {
            isRadioSilent: false,
            isArrival: sinon.stub().returns(false),
            isTaxiing: sinon.stub().returns(true),
            update: sinon.stub(),
            updateWarning: sinon.stub()
        };
        const radarTargetModel = { aircraftModel, handoffModel };
        const scopeModel = {
            radarTargetCollection: {
                findRadarTargetModelForAircraftModel: sinon.stub().returns(radarTargetModel)
            }
        };
        const clock = { accumulatedDeltaTime: testCase.delay };
        const [centerCoordinator, towerCoordinator] = testCase.buildCoordinators(scopeModel, clock);
        const controller = Object.create(AircraftController.prototype);
        controller.aircraft = { list: [aircraftModel] };
        controller._centerHandoffCoordinator = centerCoordinator;
        controller._towerHandoffCoordinator = towerCoordinator;
        controller._scopeModel = scopeModel;
        testCase.request(handoffModel);
        speech_say(
            [{ type: 'text', content: `${testCase.name} active` }],
            {},
            () => aircraftModel.isRadioSilent !== true
        );
        speech_say(
            [{ type: 'text', content: `${testCase.name} queued` }],
            {},
            () => aircraftModel.isRadioSilent !== true
        );

        controller.update();

        t.is(handoffModel.state, testCase.expectedState, testCase.name);
        t.true(aircraftModel.isRadioSilent, testCase.name);
        t.true(synthesis.cancel.calledOnceWithExactly(), testCase.name);
        t.true(synthesis.speak.calledOnceWithExactly(utterance), testCase.name);
    }

    speech_init();
});

ava('retains an injected game state by exact identity', (t) => {
    const gameState = {};
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        undefined,
        undefined,
        new EventBusClass(),
        undefined,
        undefined,
        undefined,
        gameState
    );

    t.is(controller._gameState, gameState);
    t.is(controller._centerHandoffCoordinator._gameState, gameState);
});

ava.serial('creates aircraft and conflicts with the exact injected service owners', (t) => {
    const navigationLibrary = new NavigationLibraryClass();
    navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    const clock = {
        accumulatedDeltaTime: 0
    };
    const eventBus = new EventBusClass();
    const gameState = new SimulationGameState();
    const getGameOptionSpy = sinon.spy(gameState, 'getGameOption');
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
        clock,
        gameState
    );

    t.is(controller._aircraftCommander._eventBus, eventBus);
    t.is(controller._aircraftCommander._airportController, airportController);
    t.is(controller._aircraftCommander._navigationLibrary, navigationLibrary);
    t.is(controller._aircraftCommander._gameState, gameState);

    controller._createAircraftWithInitializationProps(DEPARTURE_AIRCRAFT_INIT_PROPS_MOCK);
    controller._createAircraftWithInitializationProps(DEPARTURE_AIRCRAFT_INIT_PROPS_MOCK);
    controller.addConflict(aircraftCollection.list[0], aircraftCollection.list[1]);

    t.is(aircraftCollection.list.length, 2);
    t.true(getGameOptionSpy.calledTwice);
    t.true(getGameOptionSpy.alwaysCalledWithExactly('towerController'));
    t.is(aircraftCollection.list[0].fms._navigationLibrary, navigationLibrary);
    t.is(aircraftCollection.list[0].fms._airportController, airportController);
    t.is(aircraftCollection.list[0]._clock, clock);
    t.is(aircraftCollection.list[0]._eventBus, eventBus);
    t.is(aircraftCollection.list[0]._gameState, gameState);
    t.true(aircraftCollection.list[0]._canTransmit(aircraftCollection.list[0]));
    t.true(controller._aircraftCommander._canTransmit(aircraftCollection.list[0]));
    aircraftCollection.list[0].isRadioSilent = true;
    t.false(aircraftCollection.list[0]._canTransmit(aircraftCollection.list[0]));
    t.false(controller._aircraftCommander._canTransmit(aircraftCollection.list[0]));
    t.is(controller.conflicts.length, 1);
    t.is(controller.conflicts[0]._clock, clock);
    t.is(controller.conflicts[0]._eventBus, eventBus);
    t.is(controller.conflicts[0]._airportController, airportController);
    t.is(controller.conflicts[0]._gameState, gameState);

    const conflictCollection = controller.conflicts;

    controller.removeConflict(controller.conflicts[0]);

    t.is(controller.conflicts, conflictCollection);
    t.is(controller.conflicts.length, 0);
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

ava('preserves the center handoff fix in aircraft initialization props', (t) => {
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineControllerFixture,
        scopeModelFixture,
        undefined,
        { integer: (lower) => lower, real: (lower) => lower }
    );
    sinon.stub(controller, '_generateUniqueTransponderCode').returns('1000');

    const aircraftProps = controller._buildAircraftProps(spawnPatternModelArrivalFixture);

    t.is(aircraftProps.centerHandoffFix, spawnPatternModelArrivalFixture.centerHandoffFix);
});

ava('falls back coherently when a spawn pattern airline is unknown and carries a fleet the fallback airline lacks', (t) => {
    // AAL here defines only a `default` fleet, reproducing the production case where a
    // spawn pattern references an airline (with a fleet suffix) that is absent from the
    // corpus. The airline-not-found fallback must not then ask AAL for a fleet it lacks.
    const airlineController = new AirlineController([
        { name: 'American', icao: 'aal', callsignFormats: ['###'], fleets: { default: [['B737', 1]] } }
    ]);
    const controller = new AircraftController(
        AIRCRAFT_DEFINITION_LIST_MOCK,
        airlineController,
        scopeModelFixture,
        undefined,
        { integer: (lower) => lower, real: (lower) => lower }
    );
    sinon.stub(controller, '_generateUniqueTransponderCode').returns('1000');
    const getRandomAirlineForSpawnStub = sinon
        .stub(spawnPatternModelArrivalFixture, 'getRandomAirlineForSpawn')
        .returns('zzz/long');

    let aircraftProps;
    t.notThrows(() => {
        aircraftProps = controller._buildAircraftProps(spawnPatternModelArrivalFixture);
    });
    t.is(aircraftProps.airline, 'aal');
    t.is(aircraftProps.fleet, 'default');
    t.is(aircraftProps.icao, 'B737');

    getRandomAirlineForSpawnStub.restore();
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
