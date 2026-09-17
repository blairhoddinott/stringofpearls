import ava from 'ava';
import sinon from 'sinon';
import ClearStorageAndReload from '../../src/assets/scripts/client/platform/ClearStorageAndReload';

// These tests exercise the pure clear/reload service directly so they stay free
// of the DOM-heavy `InputController` constructor and never touch `localStorage`,
// `location`, or `window`.

ava('.execute() clears storage before reloading and returns undefined', (t) => {
    const clear = sinon.stub();
    const reload = sinon.stub();
    const service = new ClearStorageAndReload({ clear }, reload);

    const result = service.execute();

    t.is(result, undefined);
    t.true(clear.calledOnceWithExactly());
    t.true(reload.calledOnceWithExactly());
    t.true(clear.calledBefore(reload));
});

ava('.execute() is safe with omitted capabilities and returns undefined', (t) => {
    const service = new ClearStorageAndReload();

    t.notThrows(() => {
        const result = service.execute();

        t.is(result, undefined);
    });
});

ava('.execute() is safe with explicitly null capabilities and returns undefined', (t) => {
    const service = new ClearStorageAndReload(null, null);

    t.notThrows(() => {
        const result = service.execute();

        t.is(result, undefined);
    });
});

ava('.execute() runs a configured reload even when storage is omitted', (t) => {
    const reload = sinon.stub();
    const service = new ClearStorageAndReload(null, reload);

    service.execute();

    t.true(reload.calledOnceWithExactly());
});

ava('.execute() runs a configured storage clear even when reload is omitted', (t) => {
    const clear = sinon.stub();
    const service = new ClearStorageAndReload({ clear }, null);

    service.execute();

    t.true(clear.calledOnceWithExactly());
});

ava('.execute() does not reload when storage clear throws and propagates the exact error', (t) => {
    const failure = new Error('clear failed');
    const clear = sinon.stub().throws(failure);
    const reload = sinon.stub();
    const service = new ClearStorageAndReload({ clear }, reload);

    const thrown = t.throws(() => service.execute());

    t.is(thrown, failure);
    t.true(clear.calledOnce);
    t.false(reload.called);
});

ava('.execute() propagates the exact reload error after a successful clear', (t) => {
    const failure = new Error('reload failed');
    const clear = sinon.stub();
    const reload = sinon.stub().throws(failure);
    const service = new ClearStorageAndReload({ clear }, reload);

    const thrown = t.throws(() => service.execute());

    t.is(thrown, failure);
    t.true(clear.calledOnceWithExactly());
    t.true(reload.calledOnce);
});
