import ava from 'ava';
import MeasurementInteraction from '../../src/assets/scripts/client/input/MeasurementInteraction';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';

ava('retains exact viewport, measure-tool, event-bus, aircraft, and fix identities', (t) => {
    const viewport = {};
    const measureTool = {};
    const eventBus = {};
    const aircraftController = {};
    const fixCollection = {};
    const interaction = new MeasurementInteraction(
        viewport,
        measureTool,
        eventBus,
        aircraftController,
        fixCollection
    );

    t.is(interaction._viewport, viewport);
    t.is(interaction._measureTool, measureTool);
    t.is(interaction._eventBus, eventBus);
    t.is(interaction._aircraftController, aircraftController);
    t.is(interaction._fixCollection, fixCollection);
});

ava('addPoint() converts once and adds without snap dependency reads when shift is not held', (t) => {
    const calls = [];
    const relativePosition = [1, 2];
    const viewport = {
        calculateCanvasPositionFromPagePosition: (...args) => {
            calls.push(['canvas', ...args]);

            return [10, 20];
        },
        calculateRelativePositionFromCanvasPosition: (...args) => {
            calls.push(['relative', ...args]);

            return relativePosition;
        },
        translatePixelsToKilometers: () => {
            throw new Error('unexpected threshold conversion');
        }
    };
    const measureTool = {
        hasStarted: false,
        addPoint: (value) => calls.push(['addPoint', value])
    };
    const eventBus = {
        trigger: (...args) => calls.push(['trigger', ...args])
    };
    const aircraftController = {
        aircraft_get_nearest: () => {
            throw new Error('unexpected aircraft lookup');
        }
    };
    const fixCollection = {
        getNearestFix: () => {
            throw new Error('unexpected fix lookup');
        }
    };
    const interaction = new MeasurementInteraction(
        viewport, measureTool, eventBus, aircraftController, fixCollection
    );
    const event = { pageX: 30, pageY: 40, originalEvent: { shiftKey: false } };

    t.is(interaction.addPoint(event), undefined);
    t.deepEqual(calls, [
        ['canvas', 30, 40],
        ['relative', 10, 20],
        ['addPoint', relativePosition],
        ['trigger', EVENT.MARK_SHALLOW_RENDER]
    ]);
});

ava('addPoint() snaps to the nearer fix within the converted 50-pixel threshold', (t) => {
    const calls = [];
    const initialPosition = [1, 2];
    const aircraftPosition = [3, 4];
    const fixPosition = [5, 6];
    const aircraft = { callsign: 'AAL1' };
    const fix = { name: 'FIX' };
    let relativeRead = 0;
    const viewport = {
        calculateCanvasPositionFromPagePosition: (...args) => {
            calls.push(['canvas', ...args]);

            return [10, 20];
        },
        calculateRelativePositionFromCanvasPosition: (...args) => {
            const values = [initialPosition, aircraftPosition, fixPosition];
            const result = values[relativeRead++];
            calls.push(['relative', ...args, result]);

            return result;
        },
        translatePixelsToKilometers: (pixels) => {
            calls.push(['threshold', pixels]);

            return 8;
        }
    };
    const measureTool = {
        hasStarted: false,
        addPoint: (value) => calls.push(['addPoint', value])
    };
    const eventBus = { trigger: (...args) => calls.push(['trigger', ...args]) };
    const aircraftController = {
        aircraft_get_nearest: (position) => {
            calls.push(['aircraft', position]);

            return [aircraft, 7];
        }
    };
    const fixCollection = {
        getNearestFix: (position) => {
            calls.push(['fix', position]);

            return [fix, 6];
        }
    };
    const interaction = new MeasurementInteraction(
        viewport, measureTool, eventBus, aircraftController, fixCollection
    );

    interaction.addPoint({ pageX: 30, pageY: 40, originalEvent: { shiftKey: true } });

    t.deepEqual(calls, [
        ['canvas', 30, 40],
        ['relative', 10, 20, initialPosition],
        ['relative', 10, 20, aircraftPosition],
        ['aircraft', aircraftPosition],
        ['relative', 10, 20, fixPosition],
        ['fix', fixPosition],
        ['threshold', 50],
        ['addPoint', fix],
        ['trigger', EVENT.MARK_SHALLOW_RENDER]
    ]);
});

ava('addPoint() updates the last point when a path has started and replacement is requested', (t) => {
    const calls = [];
    const position = [1, 2];
    const interaction = new MeasurementInteraction(
        {
            calculateCanvasPositionFromPagePosition: () => [10, 20],
            calculateRelativePositionFromCanvasPosition: () => position
        },
        {
            hasStarted: true,
            updateLastPoint: (value) => calls.push(['updateLastPoint', value]),
            addPoint: (value) => calls.push(['addPoint', value])
        },
        { trigger: (...args) => calls.push(['trigger', ...args]) },
        {},
        {}
    );

    interaction.addPoint({ pageX: 30, pageY: 40, originalEvent: { shiftKey: false } }, true);

    t.deepEqual(calls, [
        ['updateLastPoint', position],
        ['trigger', EVENT.MARK_SHALLOW_RENDER]
    ]);
});

ava('addPoint() keeps the converted position when tied aircraft distance equals the threshold', (t) => {
    const initialPosition = [1, 2];
    const aircraft = { callsign: 'AAL1' };
    const fix = { name: 'FIX' };
    let added;
    const interaction = new MeasurementInteraction(
        {
            calculateCanvasPositionFromPagePosition: () => [10, 20],
            calculateRelativePositionFromCanvasPosition: () => initialPosition,
            translatePixelsToKilometers: () => 8
        },
        {
            hasStarted: false,
            addPoint: (value) => { added = value; }
        },
        { trigger: () => {} },
        { aircraft_get_nearest: () => [aircraft, 8] },
        { getNearestFix: () => [fix, 8] }
    );

    interaction.addPoint({ pageX: 30, pageY: 40, originalEvent: { shiftKey: true } });

    t.is(added, initialPosition);
});

ava('exposes live measuring and started state from the exact measure tool', (t) => {
    const measureTool = { isMeasuring: false, hasStarted: true };
    const interaction = new MeasurementInteraction({}, measureTool, {}, {}, {});

    t.false(interaction.isMeasuring);
    t.true(interaction.hasStarted);
    measureTool.isMeasuring = true;
    measureTool.hasStarted = false;
    t.true(interaction.isMeasuring);
    t.false(interaction.hasStarted);
});

ava('removePreviousPoint() removes before always invalidating the shallow frame', (t) => {
    const calls = [];
    const interaction = new MeasurementInteraction(
        {},
        { removePreviousPoint: () => calls.push('remove') },
        { trigger: (...args) => calls.push(['trigger', ...args]) },
        {},
        {}
    );

    t.is(interaction.removePreviousPoint(), undefined);
    t.deepEqual(calls, ['remove', ['trigger', EVENT.MARK_SHALLOW_RENDER]]);
});

ava('reset() snapshots hasPaths before reset and invalidates only when paths existed', (t) => {
    const calls = [];
    let hasPaths = true;
    const measureTool = {
        get hasPaths() {
            calls.push('hasPaths');

            return hasPaths;
        },
        reset: () => {
            calls.push('reset');
            hasPaths = false;
        }
    };
    const interaction = new MeasurementInteraction(
        {}, measureTool, { trigger: (...args) => calls.push(['trigger', ...args]) }, {}, {}
    );

    t.is(interaction.reset(), undefined);
    t.deepEqual(calls, [
        'hasPaths',
        'reset',
        ['trigger', EVENT.MARK_SHALLOW_RENDER]
    ]);
});

ava('reset() does not invalidate when the pre-reset tool has no paths', (t) => {
    const calls = [];
    const interaction = new MeasurementInteraction(
        {},
        { hasPaths: false, reset: () => calls.push('reset') },
        { trigger: (...args) => calls.push(['trigger', ...args]) },
        {},
        {}
    );

    interaction.reset();
    t.deepEqual(calls, ['reset']);
});

ava('start() short-circuits an active tool and otherwise starts one path', (t) => {
    let starts = 0;
    const measureTool = {
        isMeasuring: true,
        startNewPath: () => { starts += 1; }
    };
    const interaction = new MeasurementInteraction({}, measureTool, {}, {}, {});

    t.is(interaction.start(), undefined);
    t.is(starts, 0);
    measureTool.isMeasuring = false;
    t.is(interaction.start(), undefined);
    t.is(starts, 1);
});

ava('stop() delegates exactly once and returns undefined', (t) => {
    let stops = 0;
    const interaction = new MeasurementInteraction(
        {},
        { endPath: () => { stops += 1; } },
        {},
        {},
        {}
    );

    t.is(interaction.stop(), undefined);
    t.is(stops, 1);
});
