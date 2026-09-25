import ava from 'ava';
import TimerScheduler from '../../src/assets/scripts/client/platform/TimerScheduler';

ava('schedule forwards callback and delay and returns the timer handle', (t) => {
    const callback = () => {};
    const calls = [];
    const scheduler = new TimerScheduler((receivedCallback, delay) => {
        calls.push({ receivedCallback, delay });
        return 42;
    }, () => {});

    const handle = scheduler.schedule(callback, 300000);

    t.is(handle, 42);
    t.deepEqual(calls, [{ receivedCallback: callback, delay: 300000 }]);
});

ava('cancel forwards the exact timer handle', (t) => {
    const calls = [];
    const scheduler = new TimerScheduler(() => 42, (handle) => calls.push(handle));

    scheduler.cancel(73);

    t.deepEqual(calls, [73]);
});
