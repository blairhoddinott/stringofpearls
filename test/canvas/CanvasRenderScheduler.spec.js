import ava from 'ava';
import sinon from 'sinon';
import CanvasRenderScheduler from '../../src/assets/scripts/client/canvas/CanvasRenderScheduler';

// The scheduler owns only the render dirty-state/update policy that
// `CanvasController` previously expressed through `_shouldShallowRender`,
// `_shouldDeepRender` and the `TimeKeeper.shouldUpdate()` short-circuit. The
// simulation-update predicate stands in for `TimeKeeper.shouldUpdate()` so the
// policy can be exercised without any browser globals or `TimeKeeper` import.

ava('.nextFrame() on a fresh scheduler requires a static+dynamic frame without calling the predicate', (t) => {
    const scheduler = new CanvasRenderScheduler();
    const shouldUpdate = sinon.stub().returns(false);

    const plan = scheduler.nextFrame(shouldUpdate);

    t.deepEqual(plan, { renderStatic: true, renderDynamic: true });
    t.true(shouldUpdate.notCalled);
});

ava('.nextFrame() after completeFrame() with a false predicate yields no frame and calls the predicate exactly once', (t) => {
    const scheduler = new CanvasRenderScheduler();
    const shouldUpdate = sinon.stub().returns(false);

    scheduler.nextFrame(shouldUpdate);
    scheduler.completeFrame();

    const plan = scheduler.nextFrame(shouldUpdate);

    t.is(plan, null);
    t.true(shouldUpdate.calledOnce);
});

ava('.nextFrame() after completeFrame() with a true predicate yields a dynamic-only frame', (t) => {
    const scheduler = new CanvasRenderScheduler();

    scheduler.nextFrame(() => false);
    scheduler.completeFrame();

    const plan = scheduler.nextFrame(() => true);

    t.deepEqual(plan, { renderStatic: false, renderDynamic: true });
});

ava('.markShallow() forces a dynamic-only frame without calling the predicate', (t) => {
    const scheduler = new CanvasRenderScheduler();

    scheduler.nextFrame(() => false);
    scheduler.completeFrame();
    scheduler.markShallow();

    const shouldUpdate = sinon.stub().returns(false);
    const plan = scheduler.nextFrame(shouldUpdate);

    t.deepEqual(plan, { renderStatic: false, renderDynamic: true });
    t.true(shouldUpdate.notCalled);
});

ava('.markDeep() forces a static+dynamic frame without calling the predicate', (t) => {
    const scheduler = new CanvasRenderScheduler();

    scheduler.nextFrame(() => false);
    scheduler.completeFrame();
    scheduler.markDeep();

    const shouldUpdate = sinon.stub().returns(false);
    const plan = scheduler.nextFrame(shouldUpdate);

    t.deepEqual(plan, { renderStatic: true, renderDynamic: true });
    t.true(shouldUpdate.notCalled);
});

ava('.nextFrame() does not clear dirty state, so a renderer exception before completeFrame() leaves the same plan pending', (t) => {
    const scheduler = new CanvasRenderScheduler();

    const firstPlan = scheduler.nextFrame(() => false);
    // Simulate a renderer throwing before `completeFrame()` is reached: the
    // dirty state must survive so the next frame reproduces the same plan.
    const secondPlan = scheduler.nextFrame(() => false);

    t.deepEqual(firstPlan, { renderStatic: true, renderDynamic: true });
    t.deepEqual(secondPlan, { renderStatic: true, renderDynamic: true });
});

ava('.reset() restores the initial deep+dynamic state', (t) => {
    const scheduler = new CanvasRenderScheduler();

    scheduler.nextFrame(() => false);
    scheduler.completeFrame();
    scheduler.reset();

    const shouldUpdate = sinon.stub().returns(false);
    const plan = scheduler.nextFrame(shouldUpdate);

    t.deepEqual(plan, { renderStatic: true, renderDynamic: true });
    t.true(shouldUpdate.notCalled);
});

ava('.nextFrame() lets a predicate exception propagate with its identity preserved', (t) => {
    const scheduler = new CanvasRenderScheduler();

    scheduler.nextFrame(() => false);
    scheduler.completeFrame();

    const predicateError = new Error('predicate exploded');
    const error = t.throws(() => scheduler.nextFrame(() => {
        throw predicateError;
    }));

    t.is(error, predicateError);
});

ava('.nextFrame() preserves predicate truthiness rather than a strict boolean return', (t) => {
    const scheduler = new CanvasRenderScheduler();

    scheduler.nextFrame(() => false);
    scheduler.completeFrame();

    // A truthy (non-boolean) predicate result must produce a dynamic-only frame.
    const plan = scheduler.nextFrame(() => 'update please');

    t.deepEqual(plan, { renderStatic: false, renderDynamic: true });
});
