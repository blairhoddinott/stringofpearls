import ava from 'ava';
import sinon from 'sinon';
import ChangelogController from '../../src/assets/scripts/client/changelog/ChangelogController';
import { AssetLoadError } from '../../src/assets/scripts/client/platform/AssetLoader';
import { STORAGE_KEY } from '../../src/assets/scripts/client/constants/storageKeys';

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

// Build a browser-light instance targeting `_shouldShowOnLoad` with an injected
// storage stub, so version-gating is exercised without touching a global
// `localStorage` or the DOM/UI graph.
const buildVersionInstance = ({ storedVersion, version } = {}) => {
    const instance = Object.create(ChangelogController.prototype);

    instance._storageAdapter = {
        get: sinon.stub().returns(storedVersion),
        set: sinon.stub()
    };
    instance.version = version;

    return instance;
};

ava('_shouldShowOnLoad returns false and does not write when the stored version matches the current version', (t) => {
    const instance = buildVersionInstance({ storedVersion: '1.2.3', version: '1.2.3' });

    const result = instance._shouldShowOnLoad();

    t.false(result);
    t.false(instance._storageAdapter.set.called);
});

ava('_shouldShowOnLoad returns true and writes the exact current version under the last-version key', (t) => {
    const instance = buildVersionInstance({ storedVersion: '1.0.0', version: '2.0.0' });

    const result = instance._shouldShowOnLoad();

    t.true(result);
    t.true(instance._storageAdapter.set.calledOnceWithExactly(STORAGE_KEY.ATC_LAST_VERSION, '2.0.0'));
});

ava('_shouldShowOnLoad normalizes a missing backend null to legacy undefined and does not write when the current version is also undefined', (t) => {
    const instance = buildVersionInstance({ storedVersion: null, version: undefined });

    const result = instance._shouldShowOnLoad();

    t.false(result);
    t.false(instance._storageAdapter.set.called);
});

ava('_shouldShowOnLoad reads the last-version key through the storage adapter', (t) => {
    const instance = buildVersionInstance({ storedVersion: '1.2.3', version: '1.2.3' });

    instance._shouldShowOnLoad();

    t.true(instance._storageAdapter.get.calledOnceWithExactly(STORAGE_KEY.ATC_LAST_VERSION));
});
