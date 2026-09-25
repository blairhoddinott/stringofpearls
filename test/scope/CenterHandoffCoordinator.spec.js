import ava from 'ava';
import sinon from 'sinon';

import CenterHandoffCoordinator, {
    CENTER_HANDOFF_HOLD_DISTANCE_NM,
    CENTER_HANDOFF_OFFER_DISTANCE_NM,
    CENTER_HANDOFF_REOFFER_SECONDS
} from '../../src/assets/scripts/client/scope/CenterHandoffCoordinator';
import HandoffModel, { HANDOFF_STATE } from '../../src/assets/scripts/client/scope/HandoffModel';
import { GAME_EVENTS } from '../../src/assets/scripts/client/game/gameEventConstants';

function buildHarness(distanceNm = 30) {
    const handoffModel = new HandoffModel(HANDOFF_STATE.CENTER_OWNED);
    const aircraftModel = {
        centerHandoffFix: 'BETHL',
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

ava('offers a center-owned arrival at the configured route distance', (t) => {
    let distanceNm = CENTER_HANDOFF_OFFER_DISTANCE_NM + 1;
    const harness = buildHarness();

    harness.aircraftModel.positionModel.distanceToPosition = () => distanceNm;
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);

    distanceNm = CENTER_HANDOFF_OFFER_DISTANCE_NM;
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_TO_PLAYER);
});

ava('does not offer early when the route to the fix is longer than the direct distance', (t) => {
    const harness = buildHarness(5);
    const firstTurnPosition = {
        distanceToPosition: () => 15
    };
    let finalSegmentDistanceNm = 15;

    harness.aircraftModel.fms.waypoints = [
        { name: 'TURN', positionModel: firstTurnPosition },
        {
            name: 'BETHL',
            positionModel: {}
        }
    ];
    harness.aircraftModel.positionModel.distanceToPosition = () => 15;
    firstTurnPosition.distanceToPosition = () => finalSegmentDistanceNm;

    harness.coordinator.update(harness.aircraftModel);
    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);

    finalSegmentDistanceNm = 10;
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

ava('expires an ignored offer and sends the arrival to hold at the configured fix', (t) => {
    const harness = buildHarness(CENTER_HANDOFF_HOLD_DISTANCE_NM);

    harness.handoffModel.offerFromCenter();
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

    harness.handoffModel.offerFromCenter();
    harness.coordinator.update(harness.aircraftModel);

    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_REOFFER_SECONDS - 1;
    harness.coordinator.update(harness.aircraftModel);
    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_OWNED);

    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_REOFFER_SECONDS;
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_TO_PLAYER);
    t.true(harness.aircraftModel.pilot.initiateHoldingPattern.calledOnce);
});

ava('keeps the assigned hold after a late handoff acceptance', (t) => {
    const harness = buildHarness(CENTER_HANDOFF_HOLD_DISTANCE_NM);

    harness.handoffModel.offerFromCenter();
    harness.coordinator.update(harness.aircraftModel);
    harness.clock.accumulatedDeltaTime = CENTER_HANDOFF_REOFFER_SECONDS;
    harness.coordinator.update(harness.aircraftModel);
    harness.handoffModel.acceptFromCenter();
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.PLAYER_OWNED);
    t.true(harness.aircraftModel.pilot.initiateHoldingPattern.calledOnce);
});

ava('keeps the center offer active when the FMS rejects the hold', (t) => {
    const harness = buildHarness(CENTER_HANDOFF_HOLD_DISTANCE_NM);

    harness.aircraftModel.pilot.initiateHoldingPattern.returns([false, 'unable']);
    harness.handoffModel.offerFromCenter();
    harness.coordinator.update(harness.aircraftModel);

    t.is(harness.handoffModel.state, HANDOFF_STATE.CENTER_TO_PLAYER);
});
