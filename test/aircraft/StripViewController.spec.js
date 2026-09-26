import ava from 'ava';
import sinon from 'sinon';

import StripViewController from '../../src/assets/scripts/client/aircraft/StripView/StripViewController';

ava('activeStripCount reports the live strip collection size', (t) => {
    const controller = new StripViewController();
    controller._collection.addItem({ aircraftId: 'one' });

    t.is(controller.activeStripCount, 1);

    controller._collection.reset();
    t.is(controller.activeStripCount, 0);
});

ava('update() creates a strip for player-owned aircraft outside geographic control', (t) => {
    const scopeModel = {
        canIssueCommandsTo: sinon.stub().returns(true)
    };
    const controller = new StripViewController(undefined, undefined, scopeModel);
    const stripViewModel = {
        update: sinon.stub()
    };
    const createStripViewStub = sinon.stub(controller, 'createStripView').returns(stripViewModel);
    const addViewStub = sinon.stub(controller, '_addViewToStripList');
    const aircraftModel = {
        id: 'arrival-1',
        isControllable: false,
        isDeparture: sinon.stub().returns(false)
    };

    controller.update([aircraftModel]);

    t.true(scopeModel.canIssueCommandsTo.calledOnceWithExactly(aircraftModel));
    t.true(createStripViewStub.calledOnceWithExactly(aircraftModel));
    t.true(addViewStub.calledOnceWithExactly(stripViewModel));
    t.true(stripViewModel.update.calledOnceWithExactly(aircraftModel));
});

ava('update() removes an existing strip when another controller accepts ownership', (t) => {
    const scopeModel = {
        canIssueCommandsTo: sinon.stub().returns(false)
    };
    const controller = new StripViewController(undefined, undefined, scopeModel);
    const removeStripViewStub = sinon.stub(controller, 'removeStripView');
    const createStripViewStub = sinon.stub(controller, 'createStripView');
    const aircraftModel = { id: 'departure-1' };

    controller.update([aircraftModel]);

    t.true(scopeModel.canIssueCommandsTo.calledOnceWithExactly(aircraftModel));
    t.true(removeStripViewStub.calledOnceWithExactly(aircraftModel));
    t.true(createStripViewStub.notCalled);
});
