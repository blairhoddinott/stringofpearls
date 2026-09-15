import ava from 'ava';
import sinon from 'sinon';
import LoadingView from '../src/assets/scripts/client/LoadingView';

ava('.complete() schedules exactly one callback at 1500 through the injected DelayScheduler', (t) => {
    const delayScheduler = { schedule: sinon.stub() };
    const loadingView = new LoadingView(delayScheduler);

    loadingView.complete();

    t.true(delayScheduler.schedule.calledOnce);
    t.is(delayScheduler.schedule.firstCall.args[1], 1500);
    t.is(typeof delayScheduler.schedule.firstCall.args[0], 'function');
});

ava('.complete() scheduled callback fades out over 1000 then disables pointer events, in that order', (t) => {
    const delayScheduler = { schedule: sinon.stub() };
    const loadingView = new LoadingView(delayScheduler);
    const fadeOut = sinon.stub();
    const css = sinon.stub();
    loadingView.$element = { fadeOut, css };

    loadingView.complete();
    const scheduledCallback = delayScheduler.schedule.firstCall.args[0];
    scheduledCallback();

    t.true(fadeOut.calledOnceWithExactly(1000));
    t.true(css.calledOnceWithExactly('pointerEvents', 'none'));
    t.true(fadeOut.calledBefore(css));
});

ava('.complete() is a safe no-op when no DelayScheduler was injected', (t) => {
    const loadingView = new LoadingView();
    const fadeOut = sinon.stub();
    const css = sinon.stub();
    loadingView.$element = { fadeOut, css };

    t.notThrows(() => loadingView.complete());
    t.true(fadeOut.notCalled);
    t.true(css.notCalled);
});
