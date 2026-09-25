import ava from 'ava';
import sinon from 'sinon';

import CenterHandoffCoordinator, {
    CENTER_HANDOFF_HOLD_DISTANCE_NM,
    CENTER_HANDOFF_OFFER_DISTANCE_NM,
    CENTER_HANDOFF_REOFFER_SECONDS
} from '../../src/assets/scripts/client/scope/CenterHandoffCoordinator';
import HandoffModel, { HANDOFF_STATE } from '../../src/assets/scripts/client/scope/HandoffModel';

function buildHarness(distanceNm = 30) {
    const handoffModel = new HandoffModel(HANDOFF_STATE.CENTER_OWNED);
    const aircraftModel = {
        centerHandoffFix: 'BETHL',
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
    const coordinator = new CenterHandoffCoordinator(scopeModel, navigationLibrary, clock);

    return { aircraftModel, clock, coordinator, handoffModel };
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
