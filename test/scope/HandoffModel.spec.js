import ava from 'ava';

import HandoffModel, { HANDOFF_STATE } from '../../src/assets/scripts/client/scope/HandoffModel';

ava('defaults to player ownership for compatibility', (t) => {
    const model = new HandoffModel();

    t.is(model.state, HANDOFF_STATE.PLAYER_OWNED);
    t.true(model.isPlayerControlled);
    t.is(model.controllerIdentifier, '');
    t.false(model.shouldFlashDataBlock);
    t.false(model.shouldFlashControllerIdentifier);
});

ava('center ownership can offer a flashing inbound handoff', (t) => {
    const model = new HandoffModel(HANDOFF_STATE.CENTER_OWNED);

    t.false(model.isPlayerControlled);
    t.is(model.controllerIdentifier, 'C');
    t.false(model.shouldFlashDataBlock);

    t.true(model.offerFromCenter());
    t.is(model.state, HANDOFF_STATE.CENTER_TO_PLAYER);
    t.false(model.isPlayerControlled);
    t.is(model.controllerIdentifier, 'C');
    t.true(model.shouldFlashDataBlock);
    t.true(model.isInboundHandoffPending);
});

ava('accepting a pending center handoff grants player ownership', (t) => {
    const model = new HandoffModel(HANDOFF_STATE.CENTER_OWNED);
    model.offerFromCenter();

    t.true(model.acceptFromCenter());
    t.is(model.state, HANDOFF_STATE.PLAYER_OWNED);
    t.true(model.isPlayerControlled);
    t.is(model.controllerIdentifier, '');
    t.false(model.shouldFlashDataBlock);
    t.false(model.acceptFromCenter());
});

ava('expiring a pending center handoff restores solid center ownership', (t) => {
    const model = new HandoffModel(HANDOFF_STATE.CENTER_OWNED);
    model.offerFromCenter();

    t.true(model.expireCenterOffer());
    t.is(model.state, HANDOFF_STATE.CENTER_OWNED);
    t.false(model.isPlayerControlled);
    t.is(model.controllerIdentifier, 'C');
    t.false(model.shouldFlashDataBlock);
    t.false(model.expireCenterOffer());
});

ava('requesting a center handoff keeps player control and flashes C', (t) => {
    const model = new HandoffModel();

    t.true(model.requestCenterHandoff(42));
    t.is(model.state, HANDOFF_STATE.PLAYER_TO_CENTER);
    t.true(model.isPlayerControlled);
    t.is(model.controllerIdentifier, 'C');
    t.true(model.shouldFlashControllerIdentifier);
    t.is(model.centerHandoffRequestedAtSeconds, 42);
});

ava('center acceptance transfers control and clears its request timestamp', (t) => {
    const model = new HandoffModel();
    model.requestCenterHandoff(42);

    t.true(model.acceptByCenter());
    t.is(model.state, HANDOFF_STATE.CENTER_OWNED);
    t.false(model.isPlayerControlled);
    t.is(model.controllerIdentifier, 'C');
    t.false(model.shouldFlashControllerIdentifier);
    t.is(model.centerHandoffRequestedAtSeconds, null);
});

ava('requesting a tower handoff keeps player control and flashes T', (t) => {
    const model = new HandoffModel();

    t.true(model.requestTowerHandoff(42));
    t.is(model.state, HANDOFF_STATE.PLAYER_TO_TOWER);
    t.is(model.towerHandoffRequestedAtSeconds, 42);
    t.true(model.isPlayerControlled);
    t.is(model.controllerIdentifier, 'T');
    t.false(model.shouldFlashDataBlock);
    t.true(model.shouldFlashControllerIdentifier);
    t.false(model.requestTowerHandoff());
});

ava('tower acceptance removes player control and leaves a solid T', (t) => {
    const model = new HandoffModel();
    model.requestTowerHandoff();

    t.true(model.acceptByTower());
    t.is(model.state, HANDOFF_STATE.TOWER_OWNED);
    t.is(model.towerHandoffRequestedAtSeconds, null);
    t.false(model.isPlayerControlled);
    t.is(model.controllerIdentifier, 'T');
    t.false(model.shouldFlashDataBlock);
    t.false(model.shouldFlashControllerIdentifier);
    t.false(model.acceptByTower());
});

ava('cancelling a pending tower handoff restores player ownership', (t) => {
    const model = new HandoffModel();
    model.requestTowerHandoff();

    t.true(model.cancelTowerHandoff());
    t.is(model.state, HANDOFF_STATE.PLAYER_OWNED);
    t.is(model.towerHandoffRequestedAtSeconds, null);
    t.true(model.isPlayerControlled);
    t.is(model.controllerIdentifier, '');
    t.false(model.shouldFlashControllerIdentifier);
    t.false(model.cancelTowerHandoff());
});

ava('rejects an unknown initial ownership state', (t) => {
    const error = t.throws(() => new HandoffModel('SPACE_FORCE'));

    t.is(error.message, 'Unknown handoff state: SPACE_FORCE');
});
