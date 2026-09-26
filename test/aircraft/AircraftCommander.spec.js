import ava from 'ava';
import sinon from 'sinon';
import AircraftCommander from '../../src/assets/scripts/client/aircraft/AircraftCommander';
import AircraftModel from '../../src/assets/scripts/client/aircraft/AircraftModel';
import UiController from '../../src/assets/scripts/client/ui/UiController';
import {
    AIRCRAFT_MOCK_BASE,
    AIRCRAFT_MOCK_WITH_NE_HEADING,
    AIRCRAFT_MOCK_WITH_NORTH_HEADING,
    AIRCRAFT_MOCK_WITH_POSITIVE_SW_HEADING,
    AIRCRAFT_MOCK_WITH_NEGATIVE_SW_HEADING,
    RUN_SAY_HEADING_RESULT_NE,
    RUN_SAY_HEADING_RESULT_NORTH,
    RUN_SAY_HEADING_RESULT_SW,
    SQUAWK_RESPONSE_SUCCESS,
    SQUAWK_RESPONSE_FAILURE
} from './_mocks/aircraftCommanderMocks';

const sandbox = sinon.createSandbox();
let onChangeTransponderCodeFixture;
let findAircraftByIdFixture;

ava.beforeEach(() => {
    onChangeTransponderCodeFixture = () => true;
    findAircraftByIdFixture = () => new AircraftModel(AIRCRAFT_MOCK_WITH_NORTH_HEADING);
});

ava.afterEach(() => {
    sandbox.restore();
});

ava('.runCommands() rejects commands when the player does not own the aircraft', (t) => {
    const canIssueCommandsTo = sinon.stub().returns(false);
    const commander = new AircraftCommander(
        onChangeTransponderCodeFixture,
        findAircraftByIdFixture,
        undefined,
        undefined,
        undefined,
        undefined,
        canIssueCommandsTo
    );
    const aircraft = new AircraftModel(AIRCRAFT_MOCK_BASE);
    const runStub = sinon.stub(commander, 'run');
    const uiLogStub = sinon.stub(UiController, 'ui_log');
    aircraft.isControllable = true;

    const result = commander.runCommands(aircraft, [['heading', null, 90, false]]);

    t.true(result);
    t.true(canIssueCommandsTo.calledOnceWithExactly(aircraft));
    t.true(runStub.notCalled);
    t.true(uiLogStub.calledOnceWithExactly(
        `${aircraft.callsign}, unable, aircraft is not under your control`,
        true
    ));
});

ava('.runContactTower() delegates the exact aircraft to the tower handoff boundary', (t) => {
    const initiateTowerHandoff = sinon.stub().returns([true, 'contact tower']);
    const commander = new AircraftCommander(
        onChangeTransponderCodeFixture,
        findAircraftByIdFixture,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        initiateTowerHandoff
    );
    const aircraft = new AircraftModel(AIRCRAFT_MOCK_BASE);

    const result = commander.runContactTower(aircraft);

    t.deepEqual(result, [true, 'contact tower']);
    t.true(initiateTowerHandoff.calledOnceWithExactly(aircraft));
});

ava('.runContactCenter() delegates the exact aircraft to the center handoff boundary', (t) => {
    const initiateCenterHandoff = sinon.stub().returns([true, 'contact center']);
    const commander = new AircraftCommander(
        onChangeTransponderCodeFixture,
        findAircraftByIdFixture,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        initiateCenterHandoff
    );
    const aircraft = new AircraftModel(AIRCRAFT_MOCK_BASE);

    const result = commander.runContactCenter(aircraft);

    t.deepEqual(result, [true, 'contact center']);
    t.true(initiateCenterHandoff.calledOnceWithExactly(aircraft));
});

ava('.runSayHeading() returns correct when heading north', (t) => {
    const commander = new AircraftCommander(onChangeTransponderCodeFixture, findAircraftByIdFixture);
    const aircraft = new AircraftModel(AIRCRAFT_MOCK_WITH_NORTH_HEADING);
    const result = commander.runSayHeading(aircraft);

    t.deepEqual(result, RUN_SAY_HEADING_RESULT_NORTH);
});

ava('.runSayHeading() returns correct when heading has two digits', (t) => {
    const commander = new AircraftCommander(onChangeTransponderCodeFixture, findAircraftByIdFixture);
    const aircraft = new AircraftModel(AIRCRAFT_MOCK_WITH_NE_HEADING);
    const result = commander.runSayHeading(aircraft);

    t.deepEqual(result, RUN_SAY_HEADING_RESULT_NE);
});

ava('.runSayHeading() returns correct when heading is positive', (t) => {
    const commander = new AircraftCommander(onChangeTransponderCodeFixture, findAircraftByIdFixture);
    const aircraft = new AircraftModel(AIRCRAFT_MOCK_WITH_POSITIVE_SW_HEADING);
    const result = commander.runSayHeading(aircraft);

    t.deepEqual(result, RUN_SAY_HEADING_RESULT_SW);
});

ava('.runSayHeading() returns correct when heading is negative', (t) => {
    const commander = new AircraftCommander(onChangeTransponderCodeFixture, findAircraftByIdFixture);
    const aircraft = new AircraftModel(AIRCRAFT_MOCK_WITH_NEGATIVE_SW_HEADING);
    const result = commander.runSayHeading(aircraft);

    t.deepEqual(result, RUN_SAY_HEADING_RESULT_SW);
});

ava('.runSquawk() returns a success response when _onChangeTransponderCode() succeeds', (t) => {
    const commander = new AircraftCommander(onChangeTransponderCodeFixture, findAircraftByIdFixture);
    const aircraft = new AircraftModel(AIRCRAFT_MOCK_BASE);
    const result = commander.runSquawk(aircraft, ['3377']);

    t.deepEqual(result, SQUAWK_RESPONSE_SUCCESS);
});

ava('.runSquawk() returns a failure response when _onChangeTransponderCode() fails', (t) => {
    const commander = new AircraftCommander(onChangeTransponderCodeFixture, findAircraftByIdFixture);
    const aircraft = new AircraftModel(AIRCRAFT_MOCK_BASE);

    sandbox.stub(commander, '_onChangeTransponderCode').returns(false);

    const result = commander.runSquawk(aircraft, ['3377']);

    t.deepEqual(result, SQUAWK_RESPONSE_FAILURE);
});
