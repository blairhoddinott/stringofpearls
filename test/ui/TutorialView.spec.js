import ava from 'ava';
import sinon from 'sinon';
import TutorialView from '../../src/assets/scripts/client/ui/TutorialView';
import { AssetLoadError } from '../../src/assets/scripts/client/platform/AssetLoader';

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
