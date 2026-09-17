import ava from 'ava';
import sinon from 'sinon';
import FrameScheduler from '../../src/assets/scripts/client/platform/FrameScheduler';

ava('.requestFrame() invokes the injected callable exactly once with only the supplied callback', (t) => {
    const requestFrame = sinon.stub().returns(1);
    const frameScheduler = new FrameScheduler(requestFrame);
    const callback = () => {};

    frameScheduler.requestFrame(callback);

    t.true(requestFrame.calledOnceWithExactly(callback));
});

ava('.requestFrame() returns the exact handle produced by the injected callable', (t) => {
    const handle = 42;
    const requestFrame = sinon.stub().returns(handle);
    const frameScheduler = new FrameScheduler(requestFrame);

    const value = frameScheduler.requestFrame(() => {});

    t.is(value, handle);
});

ava('.requestFrame() lets a thrown error propagate with the exact error identity', (t) => {
    const failure = new Error('frame request unavailable');
    const requestFrame = sinon.stub().throws(failure);
    const frameScheduler = new FrameScheduler(requestFrame);

    const thrown = t.throws(() => frameScheduler.requestFrame(() => {}));

    t.is(thrown, failure);
});
