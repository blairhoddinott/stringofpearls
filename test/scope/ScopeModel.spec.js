import ava from 'ava';
import sinon from 'sinon';
import GameController from '../../src/assets/scripts/client/game/GameController';
import ScopeModel from '../../src/assets/scripts/client/scope/ScopeModel';
import ScopeCommandModel from '../../src/assets/scripts/client/commands/scopeCommand/ScopeCommandModel';
import RadarTargetCollection from '../../src/assets/scripts/client/scope/RadarTargetCollection';
import {
    createRadarTargetArrivalMock,
    createRadarCollectionMock
} from './_mocks/radarTargetMocks';
import { createScopeCommandMock } from './_mocks/scopeCommandMocks';
import { THEME } from '../../src/assets/scripts/client/constants/themes';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';

let sandbox; // using the sinon sandbox ensures stubs are restored after each test

ava.beforeEach(() => {
    sandbox = sinon.createSandbox();
});

ava.afterEach(() => {
    sandbox.restore();
});

ava('does not throw when instantiated with no parameters', (t) => {
    t.notThrows(() => new ScopeModel());
});

ava('creates RadarTargetCollection on instantiation', (t) => {
    const model = new ScopeModel();

    t.true(model.radarTargetCollection instanceof RadarTargetCollection);
});

ava('#ptlLength returns #_ptlLength', (t) => {
    const model = new ScopeModel();
    const expectedResult = 17;
    model._ptlLength = expectedResult;
    const result = model.ptlLength;

    t.true(result === expectedResult);
});

ava('.enable() registers event handlers', (t) => {
    const model = new ScopeModel();
    const eventBusOnStub = sandbox.stub(model._eventBus, 'on');
    const expectedEventsToRegister = 1;
    const result = model.enable();

    t.true(typeof result === 'undefined');
    t.true(eventBusOnStub.callCount === expectedEventsToRegister);
});

ava('.disable() deregisters event handlers', (t) => {
    const model = new ScopeModel();
    const eventBusOffStub = sandbox.stub(model._eventBus, 'off');
    const expectedEventsToDeregister = 1;
    const result = model.disable();

    t.true(typeof result === 'undefined');
    t.true(eventBusOffStub.callCount === expectedEventsToDeregister);
});

ava('.acceptHandoff() accepts a pending center handoff', (t) => {
    const model = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    radarTargetModel.markAsNotOurControl();
    radarTargetModel.handoffModel.offerFromCenter();
    const expectedResult = [true, 'HANDOFF ACCEPTED'];

    const result = model.acceptHandoff(radarTargetModel);

    t.deepEqual(result, expectedResult);
    t.true(radarTargetModel.handoffModel.isPlayerControlled);
});

ava('.acceptHandoff() rejects aircraft without a pending inbound handoff', (t) => {
    const model = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();

    const result = model.acceptHandoff(radarTargetModel);

    t.deepEqual(result, [false, 'ERR: NO INBOUND HANDOFF']);
    t.true(radarTargetModel.handoffModel.isPlayerControlled);
});

ava('.acceptHandoffIfOffered() resolves and accepts an offered aircraft', (t) => {
    const model = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    radarTargetModel.markAsNotOurControl();
    radarTargetModel.handoffModel.offerFromCenter();
    model.radarTargetCollection.addRadarTargetModel(radarTargetModel);

    t.true(model.acceptHandoffIfOffered(radarTargetModel.aircraftModel));
    t.true(radarTargetModel.handoffModel.isPlayerControlled);
});

ava('.amendAltitude() accepts {string} number and passes {number} number to radarTargetModel.amendAltitude()', (t) => {
    const model = new ScopeModel();
    const radarTargetArrivalMock = createRadarTargetArrivalMock();
    const radarTargetModelAmendAltitudeSpy = sinon.spy(radarTargetArrivalMock, 'amendAltitude');

    model.amendAltitude(radarTargetArrivalMock, '220');

    t.true(radarTargetModelAmendAltitudeSpy.calledWithExactly(220));
});

ava.serial('.changePtlLength() sets #_ptlLength to 0 and triggers a shallow render when #_ptlLength is invalid and a decrease is requested', (t) => {
    const model = new ScopeModel();
    model._ptlLength = 3.5;
    const direction = -1;

    sandbox.stub(GameController, 'getGameOption').returns('1-2-4-8');

    const eventBusTriggerStub = sandbox.stub(model._eventBus, 'trigger');
    const result = model.changePtlLength(direction);

    t.true(typeof result === 'undefined');
    t.true(model._ptlLength === 0);
    t.true(eventBusTriggerStub.calledWithExactly(EVENT.MARK_SHALLOW_RENDER));
});

ava.serial('.changePtlLength() sets #_ptlLength to 0 and triggers a shallow render when #_ptlLength is 0 and a decrease is requested', (t) => {
    const model = new ScopeModel();
    model._ptlLength = 0;
    const direction = -1;

    sandbox.stub(GameController, 'getGameOption').returns('1-2-4-8');

    const eventBusTriggerStub = sandbox.stub(model._eventBus, 'trigger');
    const result = model.changePtlLength(direction);

    t.true(typeof result === 'undefined');
    t.true(model._ptlLength === 0);
    t.true(eventBusTriggerStub.calledWithExactly(EVENT.MARK_SHALLOW_RENDER));
});

ava.serial('.changePtlLength() returns early when #_ptlLength is already at the highest increment and an increase is requested', (t) => {
    const model = new ScopeModel();
    model._ptlLength = 8;
    const direction = 1;

    sandbox.stub(GameController, 'getGameOption').returns('1-2-4-8');

    const eventBusTriggerStub = sandbox.stub(model._eventBus, 'trigger');
    const result = model.changePtlLength(direction);

    t.true(typeof result === 'undefined');
    t.true(model._ptlLength === 8);
    t.true(eventBusTriggerStub.notCalled);
});

ava.serial('.changePtlLength() increases #_ptlLength by one step and triggers a shallow render when an increase is requested and is possible', (t) => {
    const model = new ScopeModel();
    model._ptlLength = 2;
    const direction = 1;

    sandbox.stub(GameController, 'getGameOption').returns('1-2-4-8');

    const eventBusTriggerStub = sandbox.stub(model._eventBus, 'trigger');
    const result = model.changePtlLength(direction);

    t.true(typeof result === 'undefined');
    t.true(model._ptlLength === 4);
    t.true(eventBusTriggerStub.calledWithExactly(EVENT.MARK_SHALLOW_RENDER));
});

ava.serial('.changePtlLength() decreases #_ptlLength by one step and triggers a shallow render when a decrease is requested and is possible', (t) => {
    const model = new ScopeModel();
    model._ptlLength = 4;
    const direction = -1;

    sandbox.stub(GameController, 'getGameOption').returns('1-2-4-8');

    const eventBusTriggerStub = sandbox.stub(model._eventBus, 'trigger');
    const result = model.changePtlLength(direction);

    t.true(typeof result === 'undefined');
    t.true(model._ptlLength === 2);
    t.true(eventBusTriggerStub.calledWithExactly(EVENT.MARK_SHALLOW_RENDER));
});

ava('.decreasePtlLength() calls .changePtlLength() with direction of `-1`', (t) => {
    const model = new ScopeModel();
    const expectedDirection = -1;
    const changePtlLengthStub = sandbox.stub(model, 'changePtlLength');
    const result = model.decreasePtlLength();

    t.true(typeof result === 'undefined');
    t.true(changePtlLengthStub.calledWithExactly(expectedDirection));
});

ava('.increasePtlLength() calls .changePtlLength() with direction of `1`', (t) => {
    const model = new ScopeModel();
    const expectedDirection = 1;
    const changePtlLengthStub = sandbox.stub(model, 'changePtlLength');
    const result = model.increasePtlLength();

    t.true(typeof result === 'undefined');
    t.true(changePtlLengthStub.calledWithExactly(expectedDirection));
});

ava('.initiateHandoff() returns message that command is unavailable', (t) => {
    const model = new ScopeModel();
    const expectedResult = [false, 'initiateHandoff command not yet available'];

    const result = model.initiateHandoff();

    t.deepEqual(result, expectedResult);
});

ava('.initiateTowerHandoff() starts a tower transfer for a player-owned arrival on final', (t) => {
    const model = new ScopeModel({ accumulatedDeltaTime: 37 });
    const radarTargetModel = createRadarTargetArrivalMock();

    sandbox.stub(radarTargetModel.aircraftModel, 'isOnFinal').returns(true);

    t.deepEqual(
        model.initiateTowerHandoff(radarTargetModel),
        [true, 'HANDOFF TO TOWER INITIATED']
    );
    t.true(radarTargetModel.handoffModel.shouldFlashControllerIdentifier);
    t.is(radarTargetModel.handoffModel.towerHandoffRequestedAtSeconds, 37);
});

ava('.initiateTowerHandoff() rejects an arrival that is not on final', (t) => {
    const model = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();

    sandbox.stub(radarTargetModel.aircraftModel, 'isOnFinal').returns(false);

    t.deepEqual(
        model.initiateTowerHandoff(radarTargetModel),
        [false, 'ERR: AIRCRAFT NOT ON FINAL']
    );
    t.true(radarTargetModel.handoffModel.isPlayerControlled);
    t.false(radarTargetModel.handoffModel.shouldFlashControllerIdentifier);
});

ava('.initiateTowerHandoff() rejects aircraft not owned by the player', (t) => {
    const model = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();

    radarTargetModel.markAsNotOurControl();
    sandbox.stub(radarTargetModel.aircraftModel, 'isOnFinal').returns(true);

    t.deepEqual(
        model.initiateTowerHandoff(radarTargetModel),
        [false, 'ERR: AIRCRAFT NOT UNDER YOUR CONTROL']
    );
});

ava('.initiateTowerHandoff() rejects departures', (t) => {
    const model = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();

    radarTargetModel.aircraftModel.category = 'departure';
    sandbox.stub(radarTargetModel.aircraftModel, 'isOnFinal').returns(true);

    t.deepEqual(
        model.initiateTowerHandoff(radarTargetModel),
        [false, 'ERR: TOWER HANDOFF ARRIVALS ONLY']
    );
});

ava('.moveDataBlock() calls radarTargetModel.moveDataBlock() with correct parameters', (t) => {
    const model = new ScopeModel();
    const radarTargetArrivalMock = createRadarTargetArrivalMock();
    const radarTargetModelMoveDataBlockSpy = sinon.spy(radarTargetArrivalMock, 'moveDataBlock');

    model.moveDataBlock(radarTargetArrivalMock, '3/2');

    t.true(radarTargetModelMoveDataBlockSpy.calledWithExactly('3/2'));
});

ava('.propogateDataBlock() returns message that command is unavailable', (t) => {
    const model = new ScopeModel();
    const expectedResult = [false, 'propogateDataBlock command not yet available'];

    const result = model.propogateDataBlock();

    t.deepEqual(result, expectedResult);
});

ava('.route() returns message that command is unavailable', (t) => {
    const model = new ScopeModel();
    const expectedResult = [false, 'route command not yet available'];

    const result = model.route();

    t.deepEqual(result, expectedResult);
});

ava('.runScopeCommand() returns syntax error if scope command function does not exist', (t) => {
    const scopeModel = new ScopeModel();
    const scopeCommandModel = createScopeCommandMock();
    const expectedResponse = [false, 'ERR: BAD SYNTAX'];

    scopeCommandModel.commandFunction = 'complete and utter nonsense';

    const response = scopeModel.runScopeCommand(scopeCommandModel);

    t.deepEqual(response, expectedResponse);
});

ava('.runScopeCommand() returns unknown aircraft error when aircraft reference has no matching target models', (t) => {
    const scopeModel = new ScopeModel();

    scopeModel.radarTargetCollection = createRadarCollectionMock();

    const scopeCommandModel = createScopeCommandMock();

    scopeCommandModel.aircraftReference = 'yabbadabbadoo';

    const scopeMethodSpy = sinon.spy(scopeModel, scopeCommandModel.commandFunction);
    const expectedResponse = [false, 'ERR: UNKNOWN AIRCRAFT'];
    const response = scopeModel.runScopeCommand(scopeCommandModel);
    t.deepEqual(response, expectedResponse);
    t.true(scopeMethodSpy.notCalled);
});

ava('.runScopeCommand() calls the correct method specified in the ScopeCommandModel', (t) => {
    const scopeModel = new ScopeModel();

    scopeModel.radarTargetCollection = createRadarCollectionMock();

    const scopeCommandModel = createScopeCommandMock();
    const scopeMethodSpy = sinon.spy(scopeModel, scopeCommandModel.commandFunction);
    const expectedResponse = [true, 'AMEND ALTITUDE'];
    const response = scopeModel.runScopeCommand(scopeCommandModel);

    t.deepEqual(response, expectedResponse);
    t.true(scopeMethodSpy.calledOnce);
});

ava('.runScopeCommand() executes a literal tower handoff command', (t) => {
    const scopeModel = new ScopeModel({ accumulatedDeltaTime: 12 });
    const radarTargetModel = createRadarTargetArrivalMock();

    sandbox.stub(radarTargetModel.aircraftModel, 'isOnFinal').returns(true);
    scopeModel.radarTargetCollection.addRadarTargetModel(radarTargetModel);

    t.deepEqual(
        scopeModel.runScopeCommand(new ScopeCommandModel('T AAL432')),
        [true, 'HANDOFF TO TOWER INITIATED']
    );
    t.is(radarTargetModel.handoffModel.towerHandoffRequestedAtSeconds, 12);
});

ava('.canIssueCommandsTo() rejects center-owned aircraft regardless of geography', (t) => {
    const scopeModel = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    radarTargetModel.aircraftModel.isControllable = true;
    radarTargetModel.markAsNotOurControl();
    scopeModel.radarTargetCollection.addRadarTargetModel(radarTargetModel);

    t.true(radarTargetModel.aircraftModel.isControllable);
    t.false(scopeModel.canIssueCommandsTo(radarTargetModel.aircraftModel));
});

ava('.canIssueCommandsTo() accepts player-owned aircraft outside the airspace', (t) => {
    const scopeModel = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    radarTargetModel.aircraftModel.isControllable = false;
    scopeModel.radarTargetCollection.addRadarTargetModel(radarTargetModel);

    t.true(scopeModel.canIssueCommandsTo(radarTargetModel.aircraftModel));
});

ava('.canSelectAircraft() accepts only an offered center-owned aircraft', (t) => {
    const scopeModel = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    radarTargetModel.markAsNotOurControl();
    scopeModel.radarTargetCollection.addRadarTargetModel(radarTargetModel);

    t.false(scopeModel.canSelectAircraft(radarTargetModel.aircraftModel));

    radarTargetModel.handoffModel.offerFromCenter();

    t.true(scopeModel.canSelectAircraft(radarTargetModel.aircraftModel));
});

ava('.setScratchpad() returns scratchpad length error when too many characters provided', (t) => {
    const model = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    const radarTargetModelSetScratchPadSpy = sinon.spy(radarTargetModel, 'setScratchpad');
    const newScratchPadText = 'ABDEFGHIJKLMNOP';
    const expectedResponse = [false, 'ERR: SCRATCHPAD MAX 3 CHAR'];
    const response = model.setScratchpad(radarTargetModel, newScratchPadText);

    t.deepEqual(response, expectedResponse);
    t.true(radarTargetModelSetScratchPadSpy.notCalled);
});

ava('.setScratchpad() calls and returns RadarTargetModel.setDefaultScratchpad() with no parameters', (t) => {
    const model = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    const radarTargetModelSetScratchpadSpy = sinon.spy(radarTargetModel, 'setScratchpad');
    const radarTargetModelSetDefaultScratchpadSpy = sinon.spy(radarTargetModel, 'setDefaultScratchpad');
    const resetScratchPadTrigger = '.';
    const expectedResponse = [true, 'RESET SCRATCHPAD'];
    const response = model.setScratchpad(radarTargetModel, resetScratchPadTrigger);

    t.deepEqual(response, expectedResponse);
    t.true(radarTargetModelSetScratchpadSpy.notCalled);
    t.true(radarTargetModelSetDefaultScratchpadSpy.called);
    t.true(radarTargetModelSetDefaultScratchpadSpy.calledWithExactly());
});

ava('.setScratchpad() sets RadarTargetModel._scratchPadText to the specified string', (t) => {
    const model = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    const radarTargetModelSetScratchPadSpy = sinon.spy(radarTargetModel, 'setScratchpad');
    const newScratchPadText = 'V6R';
    const expectedResponse = [true, 'SET SCRATCHPAD'];
    const response = model.setScratchpad(radarTargetModel, newScratchPadText);

    t.deepEqual(response, expectedResponse);
    t.true(radarTargetModelSetScratchPadSpy.calledWithExactly(newScratchPadText));
});

ava('.setHalo() returns error when requested halo size is invalid', (t) => {
    const scopeModel = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    const setHaloRadiusStub = sinon.stub(radarTargetModel, 'setHalo');
    const expectedResponse = [false, 'ERR: HALO SIZE INVALID'];
    const response = scopeModel.setHalo(radarTargetModel, 0);

    t.deepEqual(response, expectedResponse);
    t.true(setHaloRadiusStub.notCalled);
});

ava('.setHalo() returns error when requested halo size is too large', (t) => {
    const scopeModel = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    const maxRadius = scopeModel._theme.SCOPE.HALO_MAX_RADIUS_NM;
    const radius = maxRadius + 0.1;
    const setHaloRadiusStub = sinon.stub(radarTargetModel, 'setHalo');
    const expectedResponse = [false, `ERR: HALO MAX ${maxRadius} NM`];
    const response = scopeModel.setHalo(radarTargetModel, radius);

    t.deepEqual(response, expectedResponse);
    t.true(setHaloRadiusStub.notCalled);
});

ava('.setHalo() uses default halo radius when one is not specified in the command', (t) => {
    const scopeModel = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    const defaultRadius = scopeModel._theme.SCOPE.HALO_DEFAULT_RADIUS_NM;
    const setHaloRadiusStub = sinon.stub(radarTargetModel, 'setHalo');

    scopeModel.setHalo(radarTargetModel);

    t.true(setHaloRadiusStub.calledWithExactly(defaultRadius));
});

ava('.setHalo() calls RadarTargetModel.setHalo()', (t) => {
    const scopeModel = new ScopeModel();
    const radarTargetModel = createRadarTargetArrivalMock();
    const radius = 7;
    const setHaloRadiusStub = sinon.stub(radarTargetModel, 'setHalo');

    scopeModel.setHalo(radarTargetModel, radius);

    t.true(setHaloRadiusStub.calledWithExactly(radius));
});

ava('._setTheme returns early when an invalid theme name is passed', (t) => {
    const model = new ScopeModel();
    const themeName = 'great googly moogly!';

    model._setTheme(themeName);

    t.true(model._theme === THEME.DEFAULT);
});

ava('._setTheme() changes the value of #_theme', (t) => {
    const model = new ScopeModel();
    const themeName = 'CLASSIC';

    model._setTheme(themeName);

    t.true(model._theme === THEME.CLASSIC);
});

// ava.todo('Add test for .amendAltitude()');
