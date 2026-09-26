import ava from 'ava';
import sinon from 'sinon';

import CenterHandoffCoordinator, {
    CENTER_HANDOFF_ACCEPTANCE_DELAY_SECONDS,
    CENTER_HANDOFF_HOLD_DISTANCE_NM,
    CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS,
    CENTER_HANDOFF_OFFER_DISTANCE_NM,
    CENTER_HANDOFF_REOFFER_SECONDS
} from '../../src/assets/scripts/client/scope/CenterHandoffCoordinator';
import HandoffModel, { HANDOFF_STATE } from '../../src/assets/scripts/client/scope/HandoffModel';
import { GAME_EVENTS } from '../../src/assets/scripts/client/game/gameEventConstants';

function buildHarness(distanceNm = 30, initialState = HANDOFF_STATE.CENTER_OWNED) {
    const handoffModel = new HandoffModel(initialState);
    const aircraftModel = {
        centerHandoffFix: 'BETHL',
        isArrival: sinon.stub().returns(true),
        fms: {
            waypoints: [{
                name: 'BETHL',
                positionModel: {}
            }]
        },
        pilot: {
            initiateHoldingPattern: sinon.stub().returns([true, {}])
        },
        positionModel: {
            distanceToPosition: () => distanceNm
        }
    };
    const radarTargetModel = { aircraftModel, handoffModel };
    const scopeModel = {
        radarTargetCollection: {
            findRadarTargetModelForAircraftModel: () => radarTargetModel
        }
    };
    const navigationLibrary = {
        findFixByName: () => ({
            positionModel: {
                bearingFromPosition: () => 1.5
            }
        })
    };
    const clock = { accumulatedDeltaTime: 0 };
    const gameState = {
        events_recordNew: sinon.stub()
    };
    const coordinator = new CenterHandoffCoordinator(
        scopeModel,
        navigationLibrary,
        clock,
        gameState
    );

    return { aircraftModel, clock, coordinator, gameState, handoffModel };
}

ava('accepts an outbound center handoff after exactly three simulation seconds', (t) => {
    const harness = buildHarness(30, HANDOFF_STATE.PLAYER_OWNED);
    harness.clock.accumulatedDeltaTime = 10;
    harness.handoffModel.requestCenterHandoff(harness.clock.accumulatedDeltaTime);

    harness.clock.accumulatedDeltaTime = 10 + CENTER_HANDOFF_ACCEPTANCE_DELAY_SECONDS - 0.001;
    harness.coordinator.update(harness.aircraftModel);
    t.is(harness.handoffModel.state, HANDOFF_STATE.PLAYER_TO_CENTER);
    t.true(harness.handoffModel.isPlayerControlled);

    harness.clock.accumulatedDeltaTime = 10 + CENTER_HANDOFF_ACCEPTANCE_DELAY_SECONDS;
    harness.coordinator.update(harness.aircraftModel);
    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);
    t.false(harness.handoffModel.isPlayerControlled);
});

ava('keeps an outbound departure center-owned after acceptance while it remains inside player airspace', (t) => {
    const harness = buildHarness(CENTER_HANDOFF_OFFER_DISTANCE_NM - 1, HANDOFF_STATE.PLAYER_OWNED);

    harness.aircraftModel.isControllable = true;
    harness.aircraftModel.isArrival = sinon.stub().returns(false);
    harness.handoffModel.requestCenterHandoff(0);
    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_ACCEPTANCE_DELAY_SECONDS;
    harness.coordinator.update(harness.aircraftModel);
    harness.coordinator.update(harness.aircraftModel);
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);
    t.true(harness.aircraftModel.isArrival.calledTwice);
});

ava('offers a center-owned arrival at the configured route distance', (t) => {
    t.is(CENTER_HANDOFF_OFFER_DISTANCE_NM, 10);

    let distanceNm = CENTER_HANDOFF_OFFER_DISTANCE_NM + 1;
    const harness = buildHarness();

    harness.aircraftModel.positionModel.distanceToPosition = () => distanceNm;
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);

    distanceNm = CENTER_HANDOFF_OFFER_DISTANCE_NM;
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_TO_PLAYER);
});

ava('offers immediately when a center-owned arrival reaches player airspace after its handoff fix passed', (t) => {
    const harness = buildHarness();

    harness.aircraftModel.isControllable = true;
    harness.aircraftModel.fms.waypoints = [];
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_TO_PLAYER);
});

ava('does not offer early when the route to the fix is longer than the direct distance', (t) => {
    const harness = buildHarness(5);
    const firstTurnPosition = {
        distanceToPosition: () => 5
    };
    let finalSegmentDistanceNm = 6;

    harness.aircraftModel.fms.waypoints = [
        { name: 'TURN', positionModel: firstTurnPosition },
        {
            name: 'BETHL',
            positionModel: {}
        }
    ];
    harness.aircraftModel.positionModel.distanceToPosition = () => 5;
    firstTurnPosition.distanceToPosition = () => finalSegmentDistanceNm;

    harness.coordinator.update(harness.aircraftModel);
    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);

    finalSegmentDistanceNm = 5;
    harness.coordinator.update(harness.aircraftModel);
    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_TO_PLAYER);
});

ava('does not traverse unresolved waypoints after the handoff fix has passed', (t) => {
    const harness = buildHarness(5);

    harness.aircraftModel.positionModel.distanceToPosition = (positionModel) => {
        if (!positionModel) {
            throw new TypeError('positionModel is required');
        }

        return 5;
    };
    harness.aircraftModel.fms.waypoints = [{
        name: 'VECTOR',
        positionModel: null
    }];

    t.notThrows(() => harness.coordinator.update(harness.aircraftModel));
    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);
});

ava('gives a late-visible arrival time to accept before assigning the hold', (t) => {
    const harness = buildHarness(CENTER_HANDOFF_HOLD_DISTANCE_NM);

    harness.coordinator.update(harness.aircraftModel);
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_TO_PLAYER);
    t.true(harness.aircraftModel.pilot.initiateHoldingPattern.notCalled);
});

ava('expires an ignored offer and sends the arrival to hold at the configured fix', (t) => {
    const harness = buildHarness(CENTER_HANDOFF_HOLD_DISTANCE_NM);

    harness.coordinator.update(harness.aircraftModel);
    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS;
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);
    t.true(harness.aircraftModel.pilot.initiateHoldingPattern.calledOnceWithExactly(
        'BETHL',
        {},
        1.5
    ));
    t.true(harness.gameState.events_recordNew.calledOnceWithExactly(GAME_EVENTS.MISSED_HANDOFF));
});

ava('reoffers a held arrival after sixty simulation seconds without reassigning the hold', (t) => {
    const harness = buildHarness(CENTER_HANDOFF_HOLD_DISTANCE_NM);

    harness.coordinator.update(harness.aircraftModel);
    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS;
    harness.coordinator.update(harness.aircraftModel);

    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS +
        CENTER_HANDOFF_REOFFER_SECONDS - 1;
    harness.coordinator.update(harness.aircraftModel);
    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);

    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS +
        CENTER_HANDOFF_REOFFER_SECONDS;
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_TO_PLAYER);
    t.true(harness.aircraftModel.pilot.initiateHoldingPattern.calledOnce);
});

ava('does not let geographic fallback bypass the held-arrival reoffer delay', (t) => {
    const harness = buildHarness(CENTER_HANDOFF_HOLD_DISTANCE_NM);

    harness.aircraftModel.isControllable = true;
    harness.coordinator.update(harness.aircraftModel);
    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS;
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);
    t.true(harness.aircraftModel.pilot.initiateHoldingPattern.calledOnce);

    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS +
        CENTER_HANDOFF_REOFFER_SECONDS - 1;
    harness.coordinator.update(harness.aircraftModel);
    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);

    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS +
        CENTER_HANDOFF_REOFFER_SECONDS;
    harness.coordinator.update(harness.aircraftModel);
    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_TO_PLAYER);
});

ava('keeps the assigned hold after a late handoff acceptance', (t) => {
    const harness = buildHarness(CENTER_HANDOFF_HOLD_DISTANCE_NM);

    harness.coordinator.update(harness.aircraftModel);
    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS;
    harness.coordinator.update(harness.aircraftModel);
    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS +
        CENTER_HANDOFF_REOFFER_SECONDS;
    harness.coordinator.update(harness.aircraftModel);
    harness.handoffModel.acceptFromCenter();
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.PLAYER_OWNED);
    t.true(harness.aircraftModel.pilot.initiateHoldingPattern.calledOnce);
});

ava('keeps the center offer active when the FMS rejects the hold', (t) => {
    const harness = buildHarness(CENTER_HANDOFF_HOLD_DISTANCE_NM);

    harness.aircraftModel.pilot.initiateHoldingPattern.returns([false, 'unable']);
    harness.coordinator.update(harness.aircraftModel);
    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS;
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_TO_PLAYER);
});
