import ava from 'ava';
import sinon from 'sinon';
import TutorialView from '../../src/assets/scripts/client/ui/TutorialView';
import TimeKeeper from '../../src/assets/scripts/client/engine/TimeKeeper';
import { AssetLoadError } from '../../src/assets/scripts/client/platform/AssetLoader';
import { STORAGE_KEY } from '../../src/assets/scripts/client/constants/storageKeys';

const TUTORIAL_URL = 'assets/tutorial/tutorial.json';

// Build a browser-light instance that bypasses the DOM/global UI graph the
// real constructor wires up, so these tests exercise `tutorial_init_pre` in
// isolation with explicit, injected dependencies.
const buildInstance = ({ contentQueue, reportError = sinon.stub() } = {}) => {
    const instance = Object.create(TutorialView.prototype);

    instance._contentQueue = contentQueue;
    instance._reportError = reportError;
    instance._loadTutorialStep = sinon.stub();
    instance.tutorial_step = sinon.stub();

    return instance;
};

ava.serial('tutorial_init_pre loads every response item in order via the injected ContentQueue', async (t) => {
    const stepA = { title: 'a' };
    const stepB = { title: 'b' };
    const stepC = { title: 'c' };
    const contentQueue = { addPromise: sinon.stub().resolves([stepA, stepB, stepC]) };
    const instance = buildInstance({ contentQueue });

    await instance.tutorial_init_pre();

    t.true(contentQueue.addPromise.calledOnceWithExactly({ url: TUTORIAL_URL, immediate: true }));
    t.is(instance._loadTutorialStep.callCount, 3);
    t.true(instance._loadTutorialStep.getCall(0).calledWithExactly(stepA));
    t.true(instance._loadTutorialStep.getCall(1).calledWithExactly(stepB));
    t.true(instance._loadTutorialStep.getCall(2).calledWithExactly(stepC));
    t.false(instance._reportError.called);
});

ava.serial('tutorial_init_pre renders the tutorial error UI on a jQuery-style transport failure', async (t) => {
    const request = { status: 504, statusText: 'Gateway Timeout' };
    const assetError = new AssetLoadError(request, 'timeout', 'Gateway Timeout');
    const contentQueue = { addPromise: sinon.stub().rejects(assetError) };
    const instance = buildInstance({ contentQueue });
    const consoleError = sinon.stub(console, 'error');

    try {
        await instance.tutorial_init_pre();

        t.true(consoleError.calledOnceWithExactly('Failed to load tutorial data: timeout, Gateway Timeout'));
        t.true(instance.tutorial_step.calledOnceWithExactly({
            title: 'Error',
            text: 'The tutorial failed to load: timeout, Gateway Timeout'
        }));
        t.false(instance._reportError.called);
    } finally {
        consoleError.restore();
    }
});

ava.serial('tutorial_init_pre reports a throwing step loader through the uncaught-error channel without a transport diagnostic', async (t) => {
    const stepError = new Error('bad tutorial step');
    const contentQueue = { addPromise: sinon.stub().resolves([{ title: 'a' }]) };
    const instance = buildInstance({ contentQueue });
    instance._loadTutorialStep = sinon.stub().throws(stepError);
    const consoleError = sinon.stub(console, 'error');

    try {
        await instance.tutorial_init_pre();

        t.true(instance._reportError.calledOnceWithExactly(stepError));
        t.false(consoleError.called);
        t.false(instance.tutorial_step.called);
    } finally {
        consoleError.restore();
    }
});

// Build a browser-light instance targeting `tutorial_complete` with an injected
// storage stub, so first-run persistence is exercised without touching a global
// `localStorage` or the DOM/UI graph.
const buildStorageInstance = ({ storedValue } = {}) => {
    const instance = Object.create(TutorialView.prototype);

    instance._storageAdapter = {
        get: sinon.stub().returns(storedValue),
        set: sinon.stub()
    };
    instance.tutorial_open = sinon.stub();

    return instance;
};

ava.serial('tutorial_complete opens the tutorial before forwarding the inherited raw game-time value when no value is stored', (t) => {
    const instance = buildStorageInstance({ storedValue: null });

    instance.tutorial_complete();

    t.true(instance._storageAdapter.get.calledOnceWithExactly(STORAGE_KEY.FIRST_RUN_TIME));
    t.true(instance.tutorial_open.calledOnce);
    t.true(instance._storageAdapter.set.calledOnceWithExactly(
        STORAGE_KEY.FIRST_RUN_TIME,
        TimeKeeper.gameTimeInSeconds
    ));
    t.is(TimeKeeper.gameTimeInSeconds, undefined);
    t.true(instance.tutorial_open.calledBefore(instance._storageAdapter.set));
});

ava.serial('tutorial_complete treats an undefined stored value as missing and opens the tutorial before writing', (t) => {
    const instance = buildStorageInstance({ storedValue: undefined });

    instance.tutorial_complete();

    t.true(instance.tutorial_open.calledOnce);
    t.true(instance._storageAdapter.set.calledOnceWithExactly(STORAGE_KEY.FIRST_RUN_TIME, TimeKeeper.gameTimeInSeconds));
});

ava.serial('tutorial_complete leaves the tutorial closed for a falsy-but-present stored value yet still writes the game time', (t) => {
    const instance = buildStorageInstance({ storedValue: '' });

    instance.tutorial_complete();

    t.false(instance.tutorial_open.called);
    t.true(instance._storageAdapter.set.calledOnceWithExactly(STORAGE_KEY.FIRST_RUN_TIME, TimeKeeper.gameTimeInSeconds));
});
