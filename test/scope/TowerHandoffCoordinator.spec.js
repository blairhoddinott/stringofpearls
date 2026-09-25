import ava from 'ava';

import TowerHandoffCoordinator, {
    TOWER_HANDOFF_ACCEPTANCE_DELAY_SECONDS
} from '../../src/assets/scripts/client/scope/TowerHandoffCoordinator';
import HandoffModel, { HANDOFF_STATE } from '../../src/assets/scripts/client/scope/HandoffModel';

ava('accepts a pending tower handoff after exactly three simulation seconds', (t) => {
    const handoffModel = new HandoffModel();
    const aircraftModel = {};
    const radarTargetModel = { aircraftModel, handoffModel };
    const scopeModel = {
        radarTargetCollection: {
            findRadarTargetModelForAircraftModel: () => radarTargetModel
        }
    };
    const clock = { accumulatedDeltaTime: 10 };
    const coordinator = new TowerHandoffCoordinator(scopeModel, clock);

    handoffModel.requestTowerHandoff(clock.accumulatedDeltaTime);
    clock.accumulatedDeltaTime = 10 + TOWER_HANDOFF_ACCEPTANCE_DELAY_SECONDS - 0.001;
    coordinator.update(aircraftModel);

    t.is(handoffModel.state, HANDOFF_STATE.PLAYER_TO_TOWER);
    t.true(handoffModel.isPlayerControlled);

    clock.accumulatedDeltaTime = 10 + TOWER_HANDOFF_ACCEPTANCE_DELAY_SECONDS;
    coordinator.update(aircraftModel);

    t.is(handoffModel.state, HANDOFF_STATE.TOWER_OWNED);
    t.false(handoffModel.isPlayerControlled);
    t.is(handoffModel.controllerIdentifier, 'T');
});
