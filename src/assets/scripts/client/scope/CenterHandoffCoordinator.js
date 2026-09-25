import { HANDOFF_STATE } from './HandoffModel';

export const CENTER_HANDOFF_OFFER_DISTANCE_NM = 25;
export const CENTER_HANDOFF_HOLD_DISTANCE_NM = 8;
export const CENTER_HANDOFF_REOFFER_SECONDS = 60;

export default class CenterHandoffCoordinator {
    constructor(scopeModel, navigationLibrary, clock) {
        this._scopeModel = scopeModel;
        this._navigationLibrary = navigationLibrary;
        this._clock = clock;
        this._arrivalState = new WeakMap();
    }

    update(aircraftModel) {
        const radarTargetModel = this._scopeModel.radarTargetCollection
            .findRadarTargetModelForAircraftModel(aircraftModel);
        const handoffModel = radarTargetModel?.handoffModel;

        if (!handoffModel?.controllerIdentifier || handoffModel.controllerIdentifier !== 'C') {
            return;
        }

        const handoffFix = this._navigationLibrary.findFixByName(aircraftModel.centerHandoffFix);

        if (!handoffFix) {
            return;
        }

        const distanceToFixNm = aircraftModel.positionModel.distanceToPosition(handoffFix.positionModel);
        const arrivalState = this._arrivalState.get(aircraftModel);

        if (arrivalState?.holdAssigned) {
            if (handoffModel.state === HANDOFF_STATE.CENTER_OWNED &&
                this._clock.accumulatedDeltaTime >= arrivalState.nextOfferAt) {
                handoffModel.offerFromCenter();
            }

            return;
        }

        if (handoffModel.state === HANDOFF_STATE.CENTER_TO_PLAYER &&
            distanceToFixNm <= CENTER_HANDOFF_HOLD_DISTANCE_NM) {
            const fallbackInboundHeading = handoffFix.positionModel
                .bearingFromPosition(aircraftModel.positionModel);
            const [holdAccepted] = aircraftModel.pilot.initiateHoldingPattern(
                aircraftModel.centerHandoffFix,
                {},
                fallbackInboundHeading
            );

            if (holdAccepted) {
                handoffModel.expireCenterOffer();
                this._arrivalState.set(aircraftModel, {
                    holdAssigned: true,
                    nextOfferAt: this._clock.accumulatedDeltaTime + CENTER_HANDOFF_REOFFER_SECONDS
                });
            }

            return;
        }

        if (handoffModel.state === HANDOFF_STATE.CENTER_OWNED &&
            distanceToFixNm <= CENTER_HANDOFF_OFFER_DISTANCE_NM) {
            handoffModel.offerFromCenter();
        }
    }
}
