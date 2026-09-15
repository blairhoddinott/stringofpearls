import ava from 'ava';
import sinon from 'sinon';
import CanvasStageModel from '../../src/assets/scripts/client/canvas/CanvasStageModel';
import { SCALE } from '../../src/assets/scripts/client/constants/canvasConstants';
import { STORAGE_KEY } from '../../src/assets/scripts/client/constants/storageKeys';

// Build a storage adapter stub exposing only the `get(key)`/`set(key, value)`
// contract, so the zoom-persistence boundary is exercised without a global
// `localStorage` backend.
const buildStorageAdapter = ({ storedValue = null } = {}) => ({
    get: sinon.stub().returns(storedValue),
    set: sinon.stub()
});

ava.beforeEach(() => {
    CanvasStageModel._init();
});

ava.afterEach(() => {
    CanvasStageModel.reset();
});

ava('throws when called to instantiate', (t) => {
    t.throws(() => new CanvasStageModel());
});

ava('.translatePixelsToKilometers() divides pixels by scale', (t) => {
    const expectedResult = 12.5;
    const pixelValueMock = 100;
    const result = CanvasStageModel.translatePixelsToKilometers(pixelValueMock);

    t.true(result === expectedResult);
});

ava('.calculateCanvasPositionFromPagePosition() returns an [x, y] array with precise canvas coordinate values', (t) => {
    const pagePositionMock = [533.6571116862411, 529.6559736409592];
    const expectedCanvasPosition = [213.65711168624114, -289.65597364095925];
    const canvasPosition = CanvasStageModel.calculateCanvasPositionFromPagePosition(...pagePositionMock);

    t.deepEqual(canvasPosition, expectedCanvasPosition);
});

ava('.calculateRelativePositionFromCanvasPosition() returns an [x, y] array of kilometers offset from the airport', (t) => {
    const canvasPositionMock = [533.6571116862411, -529.6559736409592];
    const expectedResult = [66.70713896078014, -66.2069967051199];
    const result = CanvasStageModel.calculateRelativePositionFromCanvasPosition(...canvasPositionMock);

    t.deepEqual(result, expectedResult);
});

ava('.calculatePreciseCanvasPositionFromRelativePosition() returns an [x, y] array with precise canvas coordinate values', (t) => {
    const expectedResult = [533.6571116862411, -529.6559736409592];
    const positionMock = [66.70713896078014, 66.2069967051199];
    const result = CanvasStageModel.calculatePreciseCanvasPositionFromRelativePosition(positionMock);

    t.deepEqual(result, expectedResult);
});

ava('.calculateRoundedCanvasPositionFromRelativePosition() returns an [x, y] array and rounded canvas coordinate values', (t) => {
    const expectedResult = [534, -530];
    const positionMock = [66.70713896078014, 66.2069967051199];
    const result = CanvasStageModel.calculateRoundedCanvasPositionFromRelativePosition(positionMock);

    t.deepEqual(result, expectedResult);
});

ava('._translateKilometersToPixels() multiplies kilometers by scale', (t) => {
    const expectedResult = 100;
    const kilometerValueMock = 12.5;
    const result = CanvasStageModel._translateKilometersToPixels(kilometerValueMock);

    t.true(result === expectedResult);
});

ava('.updatePan() calls _eventBus.trigger()', (t) => {
    const updatePanSpy = sinon.spy(CanvasStageModel, 'updatePan');

    CanvasStageModel.updatePan(1, 1);

    t.true(updatePanSpy.calledOnce);
});

ava('.zoomOut() increases #_scale by SCALE.CHANGE_FACTOR', (t) => {
    const previousScale = CanvasStageModel._scale;

    CanvasStageModel.zoomOut();

    const result = CanvasStageModel._scale / previousScale;

    t.true(result === SCALE.CHANGE_FACTOR);
});

ava('.zoomOut() resets #_scale to #_scaleMin when #_scale is < #scaleMin', (t) => {
    CanvasStageModel._scale = 0.5;
    CanvasStageModel.zoomOut();


    t.true(CanvasStageModel._scale === CanvasStageModel._scaleMin);
});

ava('.zoomOut() calls ._storeZoomLevel()', (t) => {
    const _storeZoomLevelSpy = sinon.spy(CanvasStageModel, '_storeZoomLevel');

    CanvasStageModel.zoomOut();

    t.true(_storeZoomLevelSpy.calledOnce);

    _storeZoomLevelSpy.restore();
});

ava('.zoomOut() calls ._eventBus.trigger()', (t) => {
    const _eventBusTrigger = sinon.spy(CanvasStageModel._eventBus, 'trigger');

    CanvasStageModel.zoomOut();

    t.true(_eventBusTrigger.callCount === 2);

    _eventBusTrigger.restore();
});

ava('.zoomIn() increases #_scale by SCALE.CHANGE_FACTOR', (t) => {
    CanvasStageModel._scale = 50;
    const previousScale = CanvasStageModel._scale;

    CanvasStageModel.zoomIn();

    const result = previousScale / CanvasStageModel._scale;

    t.true(result === SCALE.CHANGE_FACTOR);
});

ava('.zoomIn() resets #_scale to #_scaleMax when #_scale is > #scaleMax', (t) => {
    CanvasStageModel._scale = 999999;
    CanvasStageModel.zoomIn();

    t.true(CanvasStageModel._scale === CanvasStageModel._scaleMax);
});

ava('.zoomIn() calls ._storeZoomLevel()', (t) => {
    const _storeZoomLevelSpy = sinon.spy(CanvasStageModel, '_storeZoomLevel');

    CanvasStageModel.zoomIn();

    t.true(_storeZoomLevelSpy.calledOnce);

    _storeZoomLevelSpy.restore();
});

ava('.zoomIn() calls ._eventBus.trigger()', (t) => {
    const _eventBusTrigger = sinon.spy(CanvasStageModel._eventBus, 'trigger');

    CanvasStageModel.zoomIn();

    t.true(_eventBusTrigger.callCount === 2);

    _eventBusTrigger.restore();
});

ava('._retrieveZoomLevelFromStorageOrDefault() returns numeric SCALE.DEFAULT when no adapter is configured', (t) => {
    const result = CanvasStageModel._retrieveZoomLevelFromStorageOrDefault();

    t.is(result, SCALE.DEFAULT);
});

ava('.initStorage() treats an omitted adapter as unconfigured and rehydrates the numeric default', (t) => {
    t.notThrows(() => CanvasStageModel.initStorage());
    t.is(CanvasStageModel._scale, SCALE.DEFAULT);
});

ava('.initStorage() stores the exact adapter instance and reads exactly STORAGE_KEY.ZOOM_LEVEL', (t) => {
    const storageAdapter = buildStorageAdapter();

    CanvasStageModel.initStorage(storageAdapter);

    t.is(CanvasStageModel._storageAdapter, storageAdapter);
    t.true(storageAdapter.get.calledOnceWithExactly(STORAGE_KEY.ZOOM_LEVEL));
});

ava('._retrieveZoomLevelFromStorageOrDefault() returns numeric SCALE.DEFAULT when the adapter returns null', (t) => {
    CanvasStageModel.initStorage(buildStorageAdapter({ storedValue: null }));

    t.is(CanvasStageModel._retrieveZoomLevelFromStorageOrDefault(), SCALE.DEFAULT);
});

ava('._retrieveZoomLevelFromStorageOrDefault() returns numeric SCALE.DEFAULT when the adapter returns undefined', (t) => {
    CanvasStageModel.initStorage(buildStorageAdapter({ storedValue: undefined }));

    t.is(CanvasStageModel._retrieveZoomLevelFromStorageOrDefault(), SCALE.DEFAULT);
});

ava('._retrieveZoomLevelFromStorageOrDefault() preserves a falsy-but-present raw value verbatim', (t) => {
    CanvasStageModel.initStorage(buildStorageAdapter({ storedValue: '0' }));

    t.is(CanvasStageModel._retrieveZoomLevelFromStorageOrDefault(), '0');
});

ava('._retrieveZoomLevelFromStorageOrDefault() returns a present raw numeric string verbatim', (t) => {
    CanvasStageModel.initStorage(buildStorageAdapter({ storedValue: '7.5' }));

    t.is(CanvasStageModel._retrieveZoomLevelFromStorageOrDefault(), '7.5');
});

ava('.initStorage() rehydrates #_scale from the stored raw value', (t) => {
    CanvasStageModel.initStorage(buildStorageAdapter({ storedValue: '7.5' }));

    t.is(CanvasStageModel._scale, '7.5');
});

ava('._storeZoomLevel() forwards the raw scale under STORAGE_KEY.ZOOM_LEVEL exactly once', (t) => {
    const storageAdapter = buildStorageAdapter();

    CanvasStageModel.initStorage(storageAdapter);
    CanvasStageModel._scale = 0.05;
    CanvasStageModel._storeZoomLevel();

    t.true(storageAdapter.set.calledOnceWithExactly(STORAGE_KEY.ZOOM_LEVEL, 0.05));
});

ava('._storeZoomLevel() is a no-op and touches no browser globals when no adapter is configured', (t) => {
    t.notThrows(() => CanvasStageModel._storeZoomLevel());
});

ava('.reset() clears the configured storage adapter', (t) => {
    CanvasStageModel.initStorage(buildStorageAdapter());

    CanvasStageModel.reset();

    t.is(CanvasStageModel._storageAdapter, null);
});
