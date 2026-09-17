import ava from 'ava';
import sinon from 'sinon';
import AircraftAnnotationRenderer from '../../src/assets/scripts/client/canvas/AircraftAnnotationRenderer';

ava('retains exact viewport, scope, aircraft, game, time, and callsign-provider identities', (t) => {
    const viewport = {};
    const scopeModel = {};
    const aircraftController = {};
    const gameController = {};
    const timeKeeper = {};
    const callsignProvider = () => '';
    const renderer = new AircraftAnnotationRenderer(
        viewport,
        scopeModel,
        aircraftController,
        gameController,
        timeKeeper,
        callsignProvider
    );

    t.is(renderer._viewport, viewport);
    t.is(renderer._scopeModel, scopeModel);
    t.is(renderer._aircraftController, aircraftController);
    t.is(renderer._gameController, gameController);
    t.is(renderer._timeKeeper, timeKeeper);
    t.is(renderer._callsignProvider, callsignProvider);
});

ava('drawCompass() returns before every other dependency when the game is paused', (t) => {
    const unreadable = new Proxy({}, {
        get() {
            throw new Error('dependency should not be read');
        }
    });
    const gameController = { game_paused: () => true };
    const renderer = new AircraftAnnotationRenderer(
        unreadable,
        unreadable,
        unreadable,
        gameController,
        unreadable,
        () => {
            throw new Error('callsign should not be read');
        }
    );

    t.is(renderer.drawCompass(unreadable, unreadable), undefined);
});

ava('drawCompass() returns before aircraft and presentation access for an empty callsign', (t) => {
    const unreadable = new Proxy({}, {
        get() {
            throw new Error('dependency should not be read');
        }
    });
    const callsignProvider = sinon.stub().returns('');
    const renderer = new AircraftAnnotationRenderer(
        unreadable,
        unreadable,
        unreadable,
        { game_paused: () => false },
        unreadable,
        callsignProvider
    );

    t.is(renderer.drawCompass(unreadable, unreadable), undefined);
    t.true(callsignProvider.calledOnceWithExactly());
});

ava('drawCompass() preserves selected-aircraft filtering and compass mark cadence', (t) => {
    const hidden = {
        matchCallsign: sinon.stub().returns(true),
        isVisible: sinon.stub().returns(false)
    };
    const selected = {
        relativePosition: [0, 0],
        matchCallsign: sinon.stub().returns(true),
        isVisible: sinon.stub().returns(true)
    };
    const viewport = {
        width: 100,
        height: 80,
        halfWidth: 50,
        halfHeight: 40,
        _panX: 0,
        _panY: 0,
        _translateKilometersToPixels: sinon.stub().callsFake((value) => value * 10)
    };
    const renderer = new AircraftAnnotationRenderer(
        viewport,
        {},
        { aircraft: { list: [hidden, selected] } },
        { game_paused: () => false },
        {},
        () => 'abc'
    );
    const calls = [];
    const context = new Proxy({
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        beginPath: () => calls.push(['beginPath']),
        moveTo: (...args) => calls.push(['moveTo', ...args]),
        lineTo: (...args) => calls.push(['lineTo', ...args]),
        stroke: () => calls.push(['stroke']),
        measureText: (text) => {
            calls.push(['measureText', text]);

            return { width: 6 };
        },
        fillText: (...args) => calls.push(['fillText', ...args])
    }, {
        set(object, property, value) {
            calls.push([String(property), value]);
            object[property] = value;

            return true;
        }
    });
    const theme = {
        SCOPE: {
            COMPASS_HASH: 'hash',
            COMPASS_TEXT: 'text'
        }
    };

    t.is(renderer.drawCompass(context, theme), undefined);
    t.true(hidden.matchCallsign.calledOnceWithExactly('ABC'));
    t.true(hidden.isVisible.calledOnce);
    t.true(selected.matchCallsign.calledOnceWithExactly('ABC'));
    t.true(selected.isVisible.calledOnce);
    t.deepEqual(calls.slice(0, 5), [
        ['save'],
        ['strokeStyle', 'hash'],
        ['fillStyle', 'text'],
        ['textAlign', 'center'],
        ['textBaseline', 'middle']
    ]);
    t.is(calls.filter(([name]) => name === 'beginPath').length, 360);
    t.is(calls.filter(([name]) => name === 'stroke').length, 360);
    t.is(calls.filter(([name]) => name === 'fillText').length, 36);
    t.deepEqual(
        calls.filter(([name]) => name === 'fillText').map(([, text]) => text),
        Array.from({ length: 36 }, (_, index) => String((index + 1) * 10).padStart(3, '0'))
    );
    t.is(calls.filter(([name, value]) => name === 'lineWidth' && value === 2).length, 12);
    t.deepEqual(calls.at(-1), ['restore']);
});

ava('drawDataBlocks() preserves empty-collection translation and canvas state order', (t) => {
    const renderer = new AircraftAnnotationRenderer(
        { halfWidth: 100.4, halfHeight: 80.6 },
        { radarTargetCollection: { items: [] } },
        {},
        {},
        {},
        () => ''
    );
    const calls = [];
    const context = {
        save: () => calls.push(['save']),
        translate: (...args) => calls.push(['translate', ...args]),
        restore: () => calls.push(['restore'])
    };

    t.is(renderer.drawDataBlocks(context, {}), undefined);
    t.deepEqual(calls, [
        ['save'],
        ['translate', 100, 81],
        ['restore']
    ]);
});

ava('drawDataBlocks() preserves leader geometry and timed secondary text without legacy fill', (t) => {
    const aircraftModel = {
        relativePosition: [1, 2],
        isControllable: true,
        hit: false,
        isVisible: sinon.stub().returns(true),
        matchCallsign: sinon.stub().returns(true),
        pilot: { hasApproachClearance: false }
    };
    const radarTargetModel = {
        aircraftModel,
        dataBlockLeaderDirection: 'ctr',
        dataBlockLeaderLength: 2,
        calculateDataBlockCenter: sinon.stub().returns([30, 40]),
        buildDataBlockRowOne: sinon.stub().returns('ROW1'),
        buildDataBlockRowTwoPrimaryInfo: sinon.stub().returns('PRIMARY'),
        buildDataBlockRowTwoSecondaryInfo: sinon.stub().returns('SECONDARY')
    };
    const viewport = {
        halfWidth: 100.4,
        halfHeight: 80.6,
        calculateRoundedCanvasPositionFromRelativePosition: sinon.stub().returns([10, 20])
    };
    const renderer = new AircraftAnnotationRenderer(
        viewport,
        { radarTargetCollection: { items: [radarTargetModel] } },
        {},
        {},
        { gameTimeMilliseconds: 2500 },
        () => 'abc'
    );
    const calls = [];
    const context = new Proxy({
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        translate: (...args) => calls.push(['translate', ...args]),
        beginPath: () => calls.push(['beginPath']),
        moveTo: (...args) => calls.push(['moveTo', ...args]),
        lineTo: (...args) => calls.push(['lineTo', ...args]),
        stroke: () => calls.push(['stroke']),
        fillText: (...args) => calls.push(['fillText', ...args])
    }, {
        set(object, property, value) {
            calls.push([String(property), value]);
            object[property] = value;

            return true;
        }
    });
    const theme = {
        DATA_BLOCK: {
            HAS_FILL: false,
            TEXT_IN_RANGE: 'in-range',
            TEXT_OUT_OF_RANGE: 'out-range',
            TEXT_SELECTED: 'selected',
            LEADER_DIRECTION: 45,
            LEADER_LENGTH_INCREMENT_PIXELS: 10,
            LEADER_LENGTH_ADJUSTMENT_PIXELS: 4,
            LEADER_PADDING_FROM_BLOCK_PX: 2,
            LEADER_PADDING_FROM_TARGET_PX: 1,
            HALF_WIDTH: 20,
            TEXT_FONT: 'font'
        }
    };

    t.is(renderer.drawDataBlocks(context, theme), undefined);
    t.true(aircraftModel.matchCallsign.calledOnceWithExactly('abc'));
    t.true(viewport.calculateRoundedCanvasPositionFromRelativePosition.calledOnceWithExactly([1, 2]));
    t.true(radarTargetModel.calculateDataBlockCenter.calledOnceWithExactly([10, 20]));
    t.true(radarTargetModel.buildDataBlockRowOne.calledOnce);
    t.true(radarTargetModel.buildDataBlockRowTwoPrimaryInfo.calledOnce);
    t.true(radarTargetModel.buildDataBlockRowTwoSecondaryInfo.calledOnce);
    t.deepEqual(calls, [
        ['save'], ['translate', 100, 81],
        ['save'], ['textBaseline', 'middle'],
        ['beginPath'], ['moveTo', 10, 20], ['lineTo', 10, 20],
        ['strokeStyle', 'selected'], ['stroke'], ['translate', 30, 40],
        ['fillStyle', 'in-range'], ['font', 'font'], ['textAlign', 'left'],
        ['fillText', 'ROW1', -15, -6], ['fillText', 'SECONDARY', -15, 6],
        ['font', '10px monoOne, monospace'], ['restore'], ['restore']
    ]);
});

ava('_drawLegacyDataBlock() preserves selected departure fill and early return', (t) => {
    const aircraftModel = {
        category: 'departure',
        isControllable: true,
        pilot: { hasApproachClearance: false },
        matchCallsign: sinon.stub().returns(true)
    };
    const renderer = new AircraftAnnotationRenderer({}, {}, {}, {}, {}, () => 'abc');
    const calls = [];
    const context = new Proxy({
        fillRect: (...args) => calls.push(['fillRect', ...args])
    }, {
        set(object, property, value) {
            calls.push([String(property), value]);
            object[property] = value;

            return true;
        }
    });
    const theme = {
        DATA_BLOCK: {
            HAS_FILL: true,
            WIDTH: 40,
            HALF_WIDTH: 20,
            HEIGHT: 30,
            HALF_HEIGHT: 15,
            ARRIVAL_BAR_OUT_OF_RANGE: 'arrival-out',
            BACKGROUND_OUT_OF_RANGE: 'background-out',
            DEPARTURE_BAR_OUT_OF_RANGE: 'departure-out',
            TEXT_OUT_OF_RANGE: 'text-out',
            ARRIVAL_BAR_IN_RANGE: 'arrival-in',
            BACKGROUND_IN_RANGE: 'background-in',
            DEPARTURE_BAR_IN_RANGE: 'departure-in',
            TEXT_IN_RANGE: 'text-in',
            ARRIVAL_BAR_SELECTED: 'arrival-selected',
            BACKGROUND_SELECTED: 'background-selected',
            DEPARTURE_BAR_SELECTED: 'departure-selected',
            TEXT_SELECTED: 'text-selected'
        }
    };

    t.is(renderer._drawLegacyDataBlock(context, theme, aircraftModel), undefined);
    t.true(aircraftModel.matchCallsign.calledOnceWithExactly('abc'));
    t.deepEqual(calls, [
        ['fillStyle', 'background-selected'],
        ['fillRect', -20, -15, 40, 30],
        ['fillStyle', 'departure-selected'],
        ['fillRect', -23, -15, 3, 30]
    ]);
});

ava('_drawLegacyDataBlock() preserves ILS lock and capture-indicator operations', (t) => {
    const aircraftModel = {
        isControllable: false,
        pilot: { hasApproachClearance: true },
        isEstablishedOnCourse: sinon.stub().returns(true),
        matchCallsign: sinon.spy()
    };
    const renderer = new AircraftAnnotationRenderer({}, {}, {}, {}, {}, () => '');
    const calls = [];
    const methods = [
        'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arc',
        'closePath', 'fill', 'translate', 'stroke'
    ];
    const target = {};

    for (const method of methods) {
        target[method] = (...args) => calls.push([method, ...args]);
    }

    const context = new Proxy(target, {
        set(object, property, value) {
            calls.push([String(property), value]);
            object[property] = value;

            return true;
        }
    });
    const theme = {
        DATA_BLOCK: {
            HAS_FILL: true,
            WIDTH: 40,
            HALF_WIDTH: 20,
            HEIGHT: 30,
            HALF_HEIGHT: 15,
            ARRIVAL_BAR_OUT_OF_RANGE: 'arrival-out',
            BACKGROUND_OUT_OF_RANGE: 'background-out',
            DEPARTURE_BAR_OUT_OF_RANGE: 'departure-out',
            TEXT_OUT_OF_RANGE: 'text-out'
        }
    };
    const clippingMaskAngle = Math.atan(1.5 / 7.25);
    const piSlice = Math.PI / 24;

    renderer._drawLegacyDataBlock(context, theme, aircraftModel);

    t.true(aircraftModel.matchCallsign.notCalled);
    t.true(aircraftModel.isEstablishedOnCourse.calledOnce);
    t.deepEqual(calls, [
        ['save'], ['fillStyle', 'background-out'], ['beginPath'],
        ['moveTo', -20, 15], ['lineTo', 20, 15], ['lineTo', 20, -15],
        ['lineTo', -20, -15], ['lineTo', -20, -8.5],
        ['arc', -21.5, -1.25, 6.5, clippingMaskAngle - Math.PI / 2, 0],
        ['lineTo', -15, 1.25],
        ['arc', -21.5, 1.25, 6.5, 0, Math.PI / 2 - clippingMaskAngle],
        ['closePath'], ['fill'], ['translate', -21.5, 0],
        ['lineWidth', 3], ['strokeStyle', 'arrival-out'], ['beginPath'],
        ['arc', 0, -1.25, 5, -piSlice, Math.PI + piSlice, true],
        ['moveTo', 0, -5], ['lineTo', 0, -15], ['stroke'], ['beginPath'],
        ['arc', 0, 1.25, 5, piSlice, Math.PI - piSlice],
        ['moveTo', 0, 7], ['lineTo', 0, 15], ['stroke'],
        ['fillStyle', 'text-out'], ['beginPath'], ['arc', 0, 0, 2, 0, Math.PI * 2], ['fill'],
        ['translate', 21.5, 0], ['beginPath'], ['stroke'], ['restore']
    ]);
});
