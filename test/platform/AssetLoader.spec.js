import ava from 'ava';
import AssetLoader, { formatAssetLoadError } from '../../src/assets/scripts/client/platform/AssetLoader';

ava('.loadJson() requests the asset and resolves its payload', async (t) => {
    const requestedUrls = [];
    const expectedPayload = { icao: 'KPDX' };
    const loader = new AssetLoader((url) => {
        requestedUrls.push(url);

        return Promise.resolve(expectedPayload);
    });

    const payload = await loader.loadJson('assets/airports/kpdx.json');

    t.deepEqual(requestedUrls, ['assets/airports/kpdx.json']);
    t.is(payload, expectedPayload);
});

ava('.loadJson() returns a rejected promise when the transport throws', async (t) => {
    const loader = new AssetLoader(() => {
        throw new Error('network unavailable');
    });
    let loadPromise;

    t.notThrows(() => {
        loadPromise = loader.loadJson('assets/airports/kpdx.json');
    });
    await t.throwsAsync(loadPromise, { message: 'network unavailable' });
});

ava('formatAssetLoadError() describes standard and jQuery transport failures', (t) => {
    t.is(formatAssetLoadError(new Error('network unavailable')), 'network unavailable');
    t.is(formatAssetLoadError({ status: 404, statusText: 'Not Found' }), '404: Not Found');
});
