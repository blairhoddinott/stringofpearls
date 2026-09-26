import { HANDOFF_STATE } from './HandoffModel';
import GameController from '../game/GameController';
import { GAME_EVENTS } from '../game/gameEventConstants';

export const CENTER_HANDOFF_OFFER_DISTANCE_NM = 10;
export const CENTER_HANDOFF_HOLD_DISTANCE_NM = 8;
export const CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS = 10;
export const CENTER_HANDOFF_REOFFER_SECONDS = 60;
export const CENTER_HANDOFF_ACCEPTANCE_DELAY_SECONDS = 3;

function remainingRouteDistanceToFixNm(aircraftModel, fixName) {
    const waypoints = aircraftModel.fms?.waypoints ?? [];
    const fixIndex = waypoints.findIndex((waypoint) => waypoint.name === fixName);

    if (fixIndex === -1) {
        return Infinity;
    }

    let previousPosition = aircraftModel.positionModel;
    let distanceNm = 0;

    for (const waypoint of waypoints.slice(0, fixIndex + 1)) {
        if (!previousPosition || !waypoint.positionModel) {
            return Infinity;
        }

        distanceNm += previousPosition.distanceToPosition(waypoint.positionModel);
        previousPosition = waypoint.positionModel;
    }

    return distanceNm;
}

export default class CenterHandoffCoordinator {
    constructor(scopeModel, navigationLibrary, clock, gameState = GameController) {
        this._scopeModel = scopeModel;
        this._navigationLibrary = navigationLibrary;
        this._clock = clock;
        this._gameState = gameState;
        this._arrivalState = new WeakMap();
    }

    update(aircraftModel) {
        const radarTargetModel = this._scopeModel.radarTargetCollection
            .findRadarTargetModelForAircraftModel(aircraftModel);
        const handoffModel = radarTargetModel?.handoffModel;

        if (handoffModel?.state === HANDOFF_STATE.PLAYER_TO_CENTER) {
            const elapsedSeconds = this._clock.accumulatedDeltaTime -
                handoffModel.centerHandoffRequestedAtSeconds;

            if (elapsedSeconds >= CENTER_HANDOFF_ACCEPTANCE_DELAY_SECONDS) {
                handoffModel.acceptByCenter();
            }

            return;
        }

        if (!aircraftModel.isArrival()) {
            return;
        }

        if (!handoffModel?.controllerIdentifier || handoffModel.controllerIdentifier !== 'C') {
            return;
        }

        const arrivalState = this._arrivalState.get(aircraftModel);

        if (arrivalState?.holdAssigned) {
            if (handoffModel.state === HANDOFF_STATE.CENTER_OWNED &&
                this._clock.accumulatedDeltaTime >= arrivalState.nextOfferAt) {
                handoffModel.offerFromCenter();
            }

            return;
        }

        if (handoffModel.state === HANDOFF_STATE.CENTER_OWNED &&
            aircraftModel.centerHandoffFix &&
            aircraftModel.isControllable) {
            handoffModel.offerFromCenter();
            this._arrivalState.set(aircraftModel, {
                holdAssigned: false,
                offeredAt: this._clock.accumulatedDeltaTime
            });

            return;
        }

        const handoffFix = this._navigationLibrary.findFixByName(aircraftModel.centerHandoffFix);

        if (!handoffFix) {
            return;
        }

        const distanceToFixNm = remainingRouteDistanceToFixNm(
            aircraftModel,
            aircraftModel.centerHandoffFix
        );

        if (handoffModel.state === HANDOFF_STATE.CENTER_TO_PLAYER &&
            distanceToFixNm <= CENTER_HANDOFF_HOLD_DISTANCE_NM &&
            arrivalState?.offeredAt != null &&
            this._clock.accumulatedDeltaTime >=
                arrivalState.offeredAt + CENTER_HANDOFF_MINIMUM_RESPONSE_SECONDS) {
            const fallbackInboundHeading = handoffFix.positionModel
                .bearingFromPosition(aircraftModel.positionModel);
            const [holdAccepted] = aircraftModel.pilot.initiateHoldingPattern(
                aircraftModel.centerHandoffFix,
                {},
                fallbackInboundHeading
            );

            if (holdAccepted) {
                handoffModel.expireCenterOffer();
                this._gameState.events_recordNew(GAME_EVENTS.MISSED_HANDOFF);
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
            this._arrivalState.set(aircraftModel, {
                holdAssigned: false,
                offeredAt: this._clock.accumulatedDeltaTime
            });
        }
    }
}
