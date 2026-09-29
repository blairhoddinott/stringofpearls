import ava from 'ava';
import sinon from 'sinon';

import AppController from '../../src/assets/scripts/client/AppController';
import AirportController from '../../src/assets/scripts/client/airport/AirportController';
import EventTracker from '../../src/assets/scripts/client/EventTracker';
import GameController from '../../src/assets/scripts/client/game/GameController';
import NavigationLibrary from '../../src/assets/scripts/client/navigationLibrary/NavigationLibrary';
import SpawnPatternCollection from '../../src/assets/scripts/client/trafficGenerator/SpawnPatternCollection';

ava.afterEach.always(() => {
    sinon.restore();
});

ava.serial('airport change cancels voice capture before resetting live airport context', (t) => {
    const originalAirport = AirportController.current;
    const calls = [];
    AirportController.current = {};
    sinon.stub(EventTracker, 'recordEvent');
    sinon.stub(NavigationLibrary, 'reset').callsFake(() => calls.push('navigation-reset'));
    sinon.stub(NavigationLibrary, 'init');
    sinon.stub(SpawnPatternCollection, 'reset');
    sinon.stub(SpawnPatternCollection, 'init');
    sinon.stub(GameController, 'destroyTimers');

    const controller = Object.create(AppController.prototype);
    controller.voiceCommandFeature = { cancel: sinon.spy(() => calls.push('voice-cancel')) };
    controller.airlineController = { reset: sinon.spy() };
    controller.aircraftController = { aircraft_remove_all: sinon.spy() };
    controller.scopeModel = { radarTargetCollection: { reset: sinon.spy() } };
    controller.updateViewControls = sinon.spy();

    try {
        controller.onAirportChange({ icao: 'kjfk' });
    } finally {
        AirportController.current = originalAirport;
    }

    t.deepEqual(calls.slice(0, 2), ['voice-cancel', 'navigation-reset']);
    t.true(controller.voiceCommandFeature.cancel.calledOnce);
});

ava('destroy tears down the voice feature before dropping its reference', (t) => {
    const voiceCommandFeature = { destroy: sinon.spy() };
    const controller = Object.create(AppController.prototype);

    Object.assign(controller, {
        shiftController: null,
        weatherController: null,
        voiceCommandFeature,
        $element: {},
        _assetLoader: {},
        $canvasesElement: {},
        _eventBus: {},
        loadingView: {},
        contentQueue: {},
        airlineCollection: {},
        airportGuideController: {},
        inputController: {},
        canvasController: {},
        _voiceCommandFeatureFactory: () => {}
    });

    t.is(controller.destroy(), controller);
    t.true(voiceCommandFeature.destroy.calledOnceWithExactly());
    t.is(controller.voiceCommandFeature, null);
    t.is(controller._voiceCommandFeatureFactory, null);
});
