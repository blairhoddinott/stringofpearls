import ava from 'ava';
import sinon from 'sinon';
import AircraftTargetRenderer from '../../src/assets/scripts/client/canvas/AircraftTargetRenderer';

function buildRecordingContext(calls) {
    const methods = [
        'save', 'restore', 'translate', 'rotate', 'beginPath', 'moveTo',
        'lineTo', 'arc', 'closePath', 'fill', 'stroke'
    ];
    const target = {};

    for (const method of methods) {
        target[method] = (...args) => calls.push(`${method}:${args.join(',')}`);
    }

    return new Proxy(target, {
        set(object, property, value) {
            calls.push(`${String(property)}=${value}`);
            object[property] = value;

            return true;
        }
    });
}

function buildRenderer(overrides = {}) {
    const viewport = overrides.viewport || {
        halfWidth: 100.4,
        halfHeight: 80.4,
        calculatePreciseCanvasPositionFromRelativePosition: sinon.stub(),
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub(),
        _translateKilometersToPixels: sinon.stub().callsFake((value) => value * 10)
    };
    const scopeModel = overrides.scopeModel || {
        ptlLength: 0,
        radarTargetCollection: { items: [] }
    };
    const gameController = overrides.gameController || {
        game: { option: { getOptionByName: sinon.stub().returns('off') } },
        shouldUseTrailingSeparationIndicator: sinon.stub().returns(false)
    };
    const timeKeeper = overrides.timeKeeper || {
        simulationRate: 1,
        saveDeltaTimeBeforeFutureTrackCalculation: sinon.spy(),
        restoreDeltaTimeAfterFutureTrackCalculation: sinon.spy()
    };
    const callsignProvider = overrides.callsignProvider || (() => '');

    return {
        renderer: new AircraftTargetRenderer(
            viewport,
            scopeModel,
            gameController,
            timeKeeper,
            callsignProvider
        ),
        viewport,
        scopeModel,
        gameController,
        timeKeeper
    };
}

const THEME = {
    RADAR_TARGET: {
        HISTORY_DOT_OUTSIDE_RANGE: 'history-out',
        HISTORY_DOT_INSIDE_RANGE: 'history-in',
        HISTORY_DOT_RADIUS_KM: 0.1,
        HISTORY_LENGTH: 1,
        TRAILING_SEPARATION_INDICATOR: 'separation',
        RING_CONFLICT: 'conflict',
        RING_VIOLATION: 'violation',
        HALO: 'halo',
        PROJECTED_TRACK_LINES: 'vector',
        RADAR_TARGET: 'target',
        RADIUS_KM: 0.2,
        RADIUS_SELECTED_KM: 0.3,
        PROJECTION_ARRIVAL_ALL: 'arrival-all',
        PROJECTION_DEPARTURE: 'departure',
        PROJECTION_DEPARTURE_ALL: 'departure-all',
        PROJECTION_ARRIVAL: 'arrival',
        PROJECTION_ESTABLISHED_ON_APPROACH: 'established'
    }
};

ava('retains exact viewport, scope, game, time, and callsign-provider identities', (t) => {
    const viewport = {};
    const scopeModel = {};
    const gameController = {};
    const timeKeeper = {};
    const callsignProvider = () => '';
    const renderer = new AircraftTargetRenderer(
        viewport,
        scopeModel,
        gameController,
        timeKeeper,
        callsignProvider
    );

    t.is(renderer._viewport, viewport);
    t.is(renderer._scopeModel, scopeModel);
    t.is(renderer._gameController, gameController);
    t.is(renderer._timeKeeper, timeKeeper);
    t.is(renderer._callsignProvider, callsignProvider);
});

ava('draw() translates once and skips invisible targets before target state access', (t) => {
    const aircraftModel = {
        isVisible: sinon.stub().returns(false),
        get relativePositionHistory() {
            throw new Error('invisible target state should not be read');
        }
    };
    const { renderer, scopeModel } = buildRenderer();
    scopeModel.radarTargetCollection.items = [{ aircraftModel }];
    const calls = [];

    t.is(renderer.draw(buildRecordingContext(calls), THEME), undefined);
    t.deepEqual(calls, [
        'font=10px monoOne, monospace',
        'save:',
        'translate:100,80',
        'restore:'
    ]);
});

ava('draw() preserves history, trim, vector, halo, conflict, and target order', (t) => {
    const history = [[1, 1], [2, 2]];
    const aircraftModel = {
        relativePositionHistory: history,
        relativePosition: [3, 3],
        isControllable: true,
        hit: false,
        groundSpeed: 60,
        groundTrack: 0,
        isVisible: sinon.stub().returns(true),
        matchCallsign: sinon.stub().returns(true),
        isEstablishedOnCourse: sinon.stub().returns(false),
        getAlerts: sinon.stub().returns([true, true])
    };
    const radarTargetModel = { aircraftModel, hasHalo: true, haloRadius: 2 };
    const { renderer, viewport, scopeModel } = buildRenderer({ callsignProvider: () => 'abc' });
    scopeModel.radarTargetCollection.items = [radarTargetModel];
    viewport.calculatePreciseCanvasPositionFromRelativePosition
        .withArgs(sinon.match([1, 1])).returns([10, 11]);
    viewport.calculatePreciseCanvasPositionFromRelativePosition
        .withArgs(sinon.match([2, 2])).returns([20, 21]);
    viewport.calculatePreciseCanvasPositionFromRelativePosition
        .withArgs(sinon.match([3, 3])).returns([30, 31]);
    const calls = [];

    renderer.draw(buildRecordingContext(calls), THEME);

    t.true(aircraftModel.matchCallsign.calledOnceWithExactly('abc'));
    t.deepEqual(aircraftModel.relativePositionHistory, [[2, 2]]);
    t.deepEqual(calls, [
        'font=10px monoOne, monospace', 'save:', 'translate:100,80',
        'save:', 'fillStyle=history-in',
        'beginPath:', 'arc:10,11,1,0,6.283185307179586', 'closePath:', 'fill:',
        'beginPath:', 'arc:20,21,1,0,6.283185307179586', 'closePath:', 'fill:',
        'restore:', 'save:', 'translate:30,31',
        'save:', 'fillStyle=vector', 'strokeStyle=vector',
        'beginPath:', 'moveTo:0,0', 'lineTo:0,0', 'stroke:', 'restore:',
        'strokeStyle=halo', 'beginPath:', 'arc:0,0,37.04,0,6.283185307179586', 'stroke:',
        'strokeStyle=violation', 'beginPath:', 'arc:0,0,55.56,0,6.283185307179586', 'stroke:',
        'fillStyle=target', 'beginPath:', 'arc:0,0,3,0,6.283185307179586', 'fill:',
        'restore:', 'restore:'
    ]);
});

ava('draw() uses projected-path option before translating to the target', (t) => {
    const aircraftModel = {
        relativePositionHistory: [],
        relativePosition: [3, 3],
        isControllable: false,
        hit: true,
        isVisible: sinon.stub().returns(true),
        matchCallsign: sinon.stub().returns(true),
        isEstablishedOnCourse: sinon.stub().returns(false),
        isTaxiing: sinon.stub().returns(true),
        getAlerts: sinon.stub().returns([false])
    };
    const gameController = {
        game: { option: { getOptionByName: sinon.stub().returns('selected') } },
        shouldUseTrailingSeparationIndicator: sinon.stub().returns(false)
    };
    const { renderer, viewport, scopeModel, timeKeeper } = buildRenderer({
        gameController,
        callsignProvider: () => 'selected'
    });
    scopeModel.radarTargetCollection.items = [{ aircraftModel, hasHalo: false }];
    viewport.calculatePreciseCanvasPositionFromRelativePosition.returns([30, 31]);
    const calls = [];

    renderer.draw(buildRecordingContext(calls), THEME);

    t.true(gameController.game.option.getOptionByName.calledOnceWithExactly('drawProjectedPaths'));
    t.true(aircraftModel.isTaxiing.calledOnce);
    t.true(timeKeeper.saveDeltaTimeBeforeFutureTrackCalculation.notCalled);
    t.deepEqual(calls.slice(-8), [
        'save:', 'translate:30,31', 'fillStyle=target', 'beginPath:',
        'arc:0,0,3,0,6.283185307179586', 'fill:', 'restore:', 'restore:'
    ]);
});

ava('_drawAircraftFuturePath() preserves simulation and approach-style transition order', (t) => {
    const { renderer, viewport, timeKeeper } = buildRenderer();
    let updates = 0;
    const aircraftModel = {
        fms: { currentPhase: 'APPROACH' },
        category: 'arrival',
        relativePosition: [0, 0],
        altitude: 1000,
        isTaxiing: sinon.stub().returns(false),
        isEstablishedOnCourse() {
            return updates >= 2;
        },
        update() {
            updates++;
            this.relativePosition = [updates, updates];
            this.altitude = updates >= 2 ? 400 : 1000;
        }
    };
    viewport.calculatePreciseCanvasPositionFromRelativePosition
        .withArgs(sinon.match([1, 1, false])).returns([10, 11]);
    viewport.calculatePreciseCanvasPositionFromRelativePosition
        .withArgs(sinon.match([2, 2, true])).returns([20, 21]);
    const calls = [];

    renderer._drawAircraftFuturePath(buildRecordingContext(calls), THEME, aircraftModel, false);

    t.true(timeKeeper.saveDeltaTimeBeforeFutureTrackCalculation.calledBefore(
        timeKeeper.restoreDeltaTimeAfterFutureTrackCalculation
    ));
    t.deepEqual(calls, [
        'save:', 'strokeStyle=arrival-all', 'globalCompositeOperation=screen',
        'lineWidth=2', 'beginPath:', 'moveTo:10,11', 'lineTo:20,21', 'stroke:',
        'strokeStyle=established', 'lineWidth=2', 'beginPath:', 'moveTo:20,21',
        'stroke:', 'restore:'
    ]);
});
