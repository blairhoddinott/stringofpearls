import ava from 'ava';
import $ from 'jquery';
import sinon from 'sinon';
import ContentQueue from '../../src/assets/scripts/client/contentQueue/ContentQueue';
import { AssetLoadError } from '../../src/assets/scripts/client/platform/AssetLoader';

const waitForDeferred = (deferred, timeoutMs = 100) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('content queue did not settle')), timeoutMs);

    deferred.done((value) => {
        clearTimeout(timeout);
        resolve(value);
    });
    deferred.fail((error) => {
        clearTimeout(timeout);
        reject(error);
    });
});

const waitForDeferredFailure = (deferred, timeoutMs = 100) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('content queue did not reject')), timeoutMs);

    deferred.fail((...args) => {
        clearTimeout(timeout);
        resolve(args);
    });
});

ava.serial('.add() loads through the injected asset boundary and resolves its Deferred', async (t) => {
    const expectedPayload = { changelog: 'ready' };
    const assetLoader = { loadJson: sinon.stub().resolves(expectedPayload) };
    const legacyRequest = $.Deferred();
    const getJsonStub = sinon.stub($, 'getJSON').returns(legacyRequest.promise());
    const queue = new ContentQueue({}, assetLoader);

    try {
        const deferred = queue.add({ url: 'assets/changelog.json' });
        const payload = await waitForDeferred(deferred);

        t.true(assetLoader.loadJson.calledOnceWithExactly('assets/changelog.json'));
        t.is(payload, expectedPayload);
        t.false('assets/changelog.json' in queue.queuedContent);
        t.true(getJsonStub.notCalled);
    } finally {
        getJsonStub.restore();
    }
});

ava.serial('.add() preserves jQuery failure arguments from the asset boundary', async (t) => {
    const request = { status: 500, statusText: 'Server Error' };
    const thrown = new Error('invalid JSON');
    const assetError = new AssetLoadError(request, 'parsererror', thrown);
    const assetLoader = { loadJson: sinon.stub().rejects(assetError) };
    const queue = new ContentQueue({}, assetLoader);

    const deferred = queue.add({ url: 'assets/broken.json' });
    const failureArgs = await waitForDeferredFailure(deferred);

    t.deepEqual(failureArgs, [request, 'parsererror', thrown]);
    t.false('assets/broken.json' in queue.queuedContent);
});

ava.serial('.load() reports exceptions from Deferred success consumers without rejecting internally', async (t) => {
    const consumerError = new Error('consumer boom');
    const assetLoader = { loadJson: sinon.stub().resolves({ ready: true }) };
    const reportError = sinon.stub();
    const queue = new ContentQueue({}, assetLoader, reportError);

    queue.isLoading = true;
    const deferred = queue.add({ url: 'assets/example.json' });
    deferred.done(() => {
        throw consumerError;
    });

    await t.notThrowsAsync(queue.load('assets/example.json'));
    t.true(reportError.calledOnceWithExactly(consumerError));
    t.false('assets/example.json' in queue.queuedContent);
});

ava.serial('.addPromise() resolves the same payload through the queued asset boundary', async (t) => {
    const expectedPayload = { tutorial: 'ready' };
    const assetLoader = { loadJson: sinon.stub().resolves(expectedPayload) };
    const queue = new ContentQueue({}, assetLoader);

    const payload = await queue.addPromise({ url: 'assets/tutorial/tutorial.json', immediate: true });

    t.true(assetLoader.loadJson.calledOnceWithExactly('assets/tutorial/tutorial.json'));
    t.is(payload, expectedPayload);
    t.false('assets/tutorial/tutorial.json' in queue.queuedContent);
});

ava.serial('.addPromise() reconstructs an AssetLoadError carrying jQuery failure metadata', async (t) => {
    const request = { status: 500, statusText: 'Server Error' };
    const thrown = new Error('invalid JSON');
    const assetError = new AssetLoadError(request, 'parsererror', thrown);
    const assetLoader = { loadJson: sinon.stub().rejects(assetError) };
    const queue = new ContentQueue({}, assetLoader);

    const rejection = await t.throwsAsync(queue.addPromise({ url: 'assets/broken.json' }));

    t.true(rejection instanceof AssetLoadError);
    t.is(rejection.request, request);
    t.is(rejection.textStatus, 'parsererror');
    t.is(rejection.errorThrown, thrown);
    t.false('assets/broken.json' in queue.queuedContent);
});

ava.serial('.addPromise() passes through an ordinary single-error rejection unchanged', async (t) => {
    const ordinaryError = new Error('offline');
    const assetLoader = { loadJson: sinon.stub().rejects(ordinaryError) };
    const queue = new ContentQueue({}, assetLoader);

    const rejection = await t.throwsAsync(queue.addPromise({ url: 'assets/offline.json' }));

    t.is(rejection, ordinaryError);
});

ava.serial('.addPromise() adapts an already-settled Deferred returned from the shared add() path', async (t) => {
    const expectedPayload = { tutorial: 'cached' };
    const assetLoader = { loadJson: sinon.stub() };
    const queue = new ContentQueue({}, assetLoader);
    const options = { url: 'assets/tutorial/tutorial.json', immediate: true };
    const settled = $.Deferred().resolve(expectedPayload).promise();
    const addStub = sinon.stub(queue, 'add').returns(settled);

    const payload = await queue.addPromise(options);

    t.true(addStub.calledOnceWithExactly(options));
    t.is(payload, expectedPayload);
});
