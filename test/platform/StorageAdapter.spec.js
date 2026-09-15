import ava from 'ava';
import sinon from 'sinon';
import StorageAdapter from '../../src/assets/scripts/client/platform/StorageAdapter';

ava('.get() delegates to the backend getItem with the exact key and returns its value', (t) => {
    const backend = { getItem: sinon.stub().returns('KPDX') };
    const storageAdapter = new StorageAdapter(backend);

    const value = storageAdapter.get('atc-last-airport');

    t.true(backend.getItem.calledOnceWithExactly('atc-last-airport'));
    t.is(value, 'KPDX');
});

ava('.get() returns the backend missing-value sentinel unchanged', (t) => {
    const backend = { getItem: sinon.stub().returns(null) };
    const storageAdapter = new StorageAdapter(backend);

    const value = storageAdapter.get('missing-key');

    t.true(backend.getItem.calledOnceWithExactly('missing-key'));
    t.is(value, null);
});

ava('.set() delegates to the backend setItem with the exact key and value', (t) => {
    const backend = { setItem: sinon.stub() };
    const storageAdapter = new StorageAdapter(backend);

    storageAdapter.set('atc-last-version', '1.2.3');

    t.true(backend.setItem.calledOnceWithExactly('atc-last-version', '1.2.3'));
});
