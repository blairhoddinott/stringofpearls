import ava from 'ava';
import sinon from 'sinon';
import ChangelogController from '../../src/assets/scripts/client/changelog/ChangelogController';
import { AssetLoadError } from '../../src/assets/scripts/client/platform/AssetLoader';

const CHANGELOG_URL = 'assets/changelog.json';

// Build a browser-light instance that bypasses the DOM/global UI graph the real
// constructor wires up, so these tests exercise `loadChangelogContent` in
// isolation with explicit, injected dependencies.
const buildInstance = ({ contentQueue, reportError = sinon.stub() } = {}) => {
    const instance = Object.create(ChangelogController.prototype);

    instance.content = '<p>Loading...</p>';
    instance.contentQueue = contentQueue;
    instance._reportError = reportError;
    instance.onLoadComplete = sinon.stub();

    return instance;
};

ava.serial('loadChangelogContent requests the changelog immediately and applies it on success', async (t) => {
    const payload = { changelog: '<p>release notes</p>' };
    const contentQueue = { addPromise: sinon.stub().resolves(payload) };
    const instance = buildInstance({ contentQueue });

    await instance.loadChangelogContent();

    t.true(contentQueue.addPromise.calledOnceWithExactly({ url: CHANGELOG_URL, immediate: true }));
    t.is(instance.content, '<p>release notes</p>');
    t.true(instance.onLoadComplete.calledOnce);
    t.false(instance._reportError.called);
});

ava.serial('loadChangelogContent stays quiet on a transport failure and applies no content', async (t) => {
    const request = { status: 404, statusText: 'Not Found' };
    const assetError = new AssetLoadError(request, 'error', 'Not Found');
    const contentQueue = { addPromise: sinon.stub().rejects(assetError) };
    const instance = buildInstance({ contentQueue });

    await t.notThrowsAsync(instance.loadChangelogContent());

    t.is(instance.content, '<p>Loading...</p>');
    t.false(instance.onLoadComplete.called);
    t.false(instance._reportError.called);
});

ava.serial('loadChangelogContent reports a throwing onLoadComplete through the uncaught-error channel', async (t) => {
    const processingError = new Error('render boom');
    const contentQueue = { addPromise: sinon.stub().resolves({ changelog: 'ready' }) };
    const instance = buildInstance({ contentQueue });
    instance.onLoadComplete = sinon.stub().throws(processingError);

    await t.notThrowsAsync(instance.loadChangelogContent());

    t.true(instance._reportError.calledOnceWithExactly(processingError));
});
