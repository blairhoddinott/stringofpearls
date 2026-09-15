import ava from 'ava';
import $ from 'jquery';
import sinon from 'sinon';
import ContentQueue from '../../src/assets/scripts/client/contentQueue/ContentQueue';
import { AssetLoadError } from '../../src/assets/scripts/client/platform/AssetLoader';

ava.serial('addPromise loads through the injected asset boundary and resolves the exact payload', async (t) => {
    const expectedPayload = { changelog: 'ready' };
    const assetLoader = { loadJson: sinon.stub().resolves(expectedPayload) };
    const getJsonStub = sinon.stub($, 'getJSON');
    const queue = new ContentQueue({}, assetLoader);

    try {
        const payload = await queue.addPromise({ url: 'assets/changelog.json', immediate: true });

        t.true(assetLoader.loadJson.calledOnceWithExactly('assets/changelog.json'));
        t.is(payload, expectedPayload);
        t.false('assets/changelog.json' in queue.queuedContent);
        t.true(getJsonStub.notCalled);
    } finally {
        getJsonStub.restore();
    }
});

ava.serial('addPromise rejects with the exact original AssetLoadError and cleans queuedContent', async (t) => {
    const request = { status: 500, statusText: 'Server Error' };
    const assetError = new AssetLoadError(request, 'parsererror', new Error('invalid JSON'));
    const assetLoader = { loadJson: sinon.stub().rejects(assetError) };
    const queue = new ContentQueue({}, assetLoader);

    const rejection = await t.throwsAsync(queue.addPromise({ url: 'assets/broken.json' }));

    t.is(rejection, assetError);
    t.false('assets/broken.json' in queue.queuedContent);
});

ava.serial('addPromise passes through an ordinary single-error rejection unchanged', async (t) => {
    const ordinaryError = new Error('offline');
    const assetLoader = { loadJson: sinon.stub().rejects(ordinaryError) };
    const queue = new ContentQueue({}, assetLoader);

    const rejection = await t.throwsAsync(queue.addPromise({ url: 'assets/offline.json' }));

    t.is(rejection, ordinaryError);
    t.false('assets/offline.json' in queue.queuedContent);
});

ava.serial('addPromise de-duplicates in-flight requests to a single transport call and shared promise', async (t) => {
    const expectedPayload = { ok: true };
    let resolveLoad;
    const pending = new Promise((resolve) => {
        resolveLoad = resolve;
    });
    const assetLoader = { loadJson: sinon.stub().returns(pending) };
    const queue = new ContentQueue({}, assetLoader);

    const first = queue.addPromise({ url: 'assets/dup.json' });
    const second = queue.addPromise({ url: 'assets/dup.json' });

    t.is(first, second);
    t.true(assetLoader.loadJson.calledOnce);

    resolveLoad(expectedPayload);

    t.is(await first, expectedPayload);
    t.is(await second, expectedPayload);
});

ava.serial('a duplicate request upgraded to immediate promotes its url from low to high priority exactly once', (t) => {
    const assetLoader = { loadJson: sinon.stub().returns(new Promise(() => {})) };
    const queue = new ContentQueue({}, assetLoader);
    // isLoading keeps the queues inspectable by preventing an automatic startLoad
    queue.isLoading = true;

    const first = queue.addPromise({ url: 'assets/late.json' });

    t.deepEqual(queue.lowPriorityQueue, ['assets/late.json']);
    t.deepEqual(queue.highPriorityQueue, []);

    const second = queue.addPromise({ url: 'assets/late.json', immediate: true });

    t.is(second, first);
    t.deepEqual(queue.lowPriorityQueue, []);
    t.deepEqual(queue.highPriorityQueue, ['assets/late.json']);

    const third = queue.addPromise({ url: 'assets/late.json', immediate: true });

    t.is(third, first);
    t.deepEqual(queue.highPriorityQueue, ['assets/late.json']);
    t.true(assetLoader.loadJson.notCalled);
});

ava.serial('startLoad and load can be driven manually while isLoading is true', async (t) => {
    const expectedPayload = { ready: true };
    const assetLoader = { loadJson: sinon.stub().resolves(expectedPayload) };
    const queue = new ContentQueue({}, assetLoader);
    queue.isLoading = true;

    const promise = queue.addPromise({ url: 'assets/manual.json', immediate: true });

    t.true(assetLoader.loadJson.notCalled);
    t.deepEqual(queue.highPriorityQueue, ['assets/manual.json']);

    t.true(queue.startLoad());
    t.true(assetLoader.loadJson.calledOnceWithExactly('assets/manual.json'));

    t.is(await promise, expectedPayload);
    t.false('assets/manual.json' in queue.queuedContent);
    t.deepEqual(queue.highPriorityQueue, []);
});
