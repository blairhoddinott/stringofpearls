import { HANDOFF_STATE } from './HandoffModel';

export const TOWER_HANDOFF_ACCEPTANCE_DELAY_SECONDS = 3;

export default class TowerHandoffCoordinator {
    constructor(scopeModel, clock) {
        this._scopeModel = scopeModel;
        this._clock = clock;
    }

    update(aircraftModel) {
        const radarTargetModel = this._scopeModel.radarTargetCollection
            .findRadarTargetModelForAircraftModel(aircraftModel);
        const handoffModel = radarTargetModel?.handoffModel;

        if (handoffModel?.state !== HANDOFF_STATE.PLAYER_TO_TOWER) {
            return;
        }

        const elapsedSeconds = this._clock.accumulatedDeltaTime -
            handoffModel.towerHandoffRequestedAtSeconds;

        if (elapsedSeconds >= TOWER_HANDOFF_ACCEPTANCE_DELAY_SECONDS) {
            handoffModel.acceptByTower();
        }
    }
}
