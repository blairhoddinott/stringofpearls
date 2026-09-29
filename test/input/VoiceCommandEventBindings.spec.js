import ava from 'ava';
import sinon from 'sinon';

import VoiceCommandEventBindings from '../../src/assets/scripts/client/input/VoiceCommandEventBindings';

// -------------------------------------------------------------------------- //
// The bindings are a *pure DOM adapter*: injected element/window targets and an
// injected controller, no globals on import. Narrow fake targets record their
// listeners so we can dispatch synthetic events and prove exactly which
// controller method each accessible interaction drives, and that unbinding is
// clean and idempotent.
// -------------------------------------------------------------------------- //

const makeTarget = () => {
    const listeners = {};

    return {
        listeners,
        setPointerCapture: sinon.spy(),
        releasePointerCapture: sinon.spy(),
        addEventListener: sinon.spy((type, handler) => {
            (listeners[type] = listeners[type] || []).push(handler);
        }),
        removeEventListener: sinon.spy((type, handler) => {
            listeners[type] = (listeners[type] || []).filter((registered) => registered !== handler);
        }),
        dispatch(type, event = {}) {
            (listeners[type] || []).forEach((handler) => handler(event));
        },
        listenerCount(type) {
            return (listeners[type] || []).length;
        }
    };
};

const makeController = () => ({
    enable: sinon.spy(),
    beginPushToTalk: sinon.spy(),
    endPushToTalk: sinon.spy(),
    cancel: sinon.spy()
});

const makeEvent = (overrides = {}) => ({
    preventDefault: sinon.spy(),
    ...overrides
});

const build = () => {
    const optInButton = makeTarget();
    const pushToTalkButton = makeTarget();
    const windowTarget = makeTarget();
    const controller = makeController();
    const bindings = new VoiceCommandEventBindings({
        optInButton,
        pushToTalkButton,
        windowTarget,
        controller
    });

    return { bindings, optInButton, pushToTalkButton, windowTarget, controller };
};

const enabled = () => {
    const bundle = build();
    bundle.bindings.enable();

    return bundle;
};

// -------------------------------------------------------------------------- //
// opt-in
// -------------------------------------------------------------------------- //

ava('opt-in click enables the controller', (t) => {
    const { optInButton, controller } = enabled();

    optInButton.dispatch('click', makeEvent());

    t.true(controller.enable.calledOnce);
});

// -------------------------------------------------------------------------- //
// pointer hold / release
// -------------------------------------------------------------------------- //

ava('pointer press begins and a matching pointer release ends push-to-talk', (t) => {
    const { pushToTalkButton, controller } = enabled();

    pushToTalkButton.dispatch('pointerdown', makeEvent({ pointerId: 1 }));
    t.true(controller.beginPushToTalk.calledOnce);
    t.true(pushToTalkButton.setPointerCapture.calledOnceWithExactly(1));
    t.is(controller.endPushToTalk.callCount, 0);

    pushToTalkButton.dispatch('pointerup', makeEvent({ pointerId: 1 }));
    t.true(controller.endPushToTalk.calledOnce);
    t.true(pushToTalkButton.releasePointerCapture.calledOnceWithExactly(1));
});

ava('a pointer release that does not match the active press does not end push-to-talk', (t) => {
    const { pushToTalkButton, controller } = enabled();

    pushToTalkButton.dispatch('pointerdown', makeEvent({ pointerId: 1 }));
    pushToTalkButton.dispatch('pointerup', makeEvent({ pointerId: 2 }));

    t.true(controller.beginPushToTalk.calledOnce);
    t.is(controller.endPushToTalk.callCount, 0);
});

ava('a second pointer press while already holding does not begin again', (t) => {
    const { pushToTalkButton, controller } = enabled();

    pushToTalkButton.dispatch('pointerdown', makeEvent({ pointerId: 1 }));
    pushToTalkButton.dispatch('pointerdown', makeEvent({ pointerId: 2 }));

    t.is(controller.beginPushToTalk.callCount, 1);
});

// -------------------------------------------------------------------------- //
// cancellation
// -------------------------------------------------------------------------- //

ava('pointer cancel during a hold cancels the capture', (t) => {
    const { pushToTalkButton, controller } = enabled();

    pushToTalkButton.dispatch('pointerdown', makeEvent({ pointerId: 1 }));
    pushToTalkButton.dispatch('pointercancel', makeEvent({ pointerId: 1 }));

    t.true(controller.cancel.calledOnce);
    // a late release after a cancel must not also end
    pushToTalkButton.dispatch('pointerup', makeEvent({ pointerId: 1 }));
    t.is(controller.endPushToTalk.callCount, 0);
});

ava('losing pointer capture during a hold cancels the capture', (t) => {
    const { pushToTalkButton, controller } = enabled();

    pushToTalkButton.dispatch('pointerdown', makeEvent({ pointerId: 7 }));
    pushToTalkButton.dispatch('lostpointercapture', makeEvent({ pointerId: 7 }));

    t.true(controller.cancel.calledOnce);
});

ava('losing window focus during a hold cancels the capture', (t) => {
    const { pushToTalkButton, windowTarget, controller } = enabled();

    pushToTalkButton.dispatch('pointerdown', makeEvent({ pointerId: 1 }));
    windowTarget.dispatch('blur', makeEvent());

    t.true(controller.cancel.calledOnce);
});

ava('window blur without an active hold does not cancel', (t) => {
    const { windowTarget, controller } = enabled();

    windowTarget.dispatch('blur', makeEvent());

    t.is(controller.cancel.callCount, 0);
});

// -------------------------------------------------------------------------- //
// keyboard hold / release using native button activation keys
// -------------------------------------------------------------------------- //

['Enter', ' '].forEach((key) => {
    ava(`keydown/keyup of ${key === ' ' ? 'Space' : key} holds and releases push-to-talk`, (t) => {
        const { pushToTalkButton, controller } = enabled();
        const down = makeEvent({ key });
        const up = makeEvent({ key });

        pushToTalkButton.dispatch('keydown', down);
        t.true(controller.beginPushToTalk.calledOnce);
        t.true(down.preventDefault.calledOnce);

        pushToTalkButton.dispatch('keyup', up);
        t.true(controller.endPushToTalk.calledOnce);
        t.true(up.preventDefault.calledOnce);
    });
});

ava('key auto-repeat while held does not begin again', (t) => {
    const { pushToTalkButton, controller } = enabled();

    pushToTalkButton.dispatch('keydown', makeEvent({ key: 'Enter', repeat: true }));
    t.is(controller.beginPushToTalk.callCount, 0);

    pushToTalkButton.dispatch('keydown', makeEvent({ key: 'Enter' }));
    pushToTalkButton.dispatch('keydown', makeEvent({ key: 'Enter', repeat: true }));
    pushToTalkButton.dispatch('keydown', makeEvent({ key: 'Enter' }));
    t.is(controller.beginPushToTalk.callCount, 1);
});

ava('an unrelated key neither begins nor prevents default', (t) => {
    const { pushToTalkButton, controller } = enabled();
    const down = makeEvent({ key: 'a' });

    pushToTalkButton.dispatch('keydown', down);

    t.is(controller.beginPushToTalk.callCount, 0);
    t.true(down.preventDefault.notCalled);
});

ava('a keyup without a held key does not end and does not prevent default', (t) => {
    const { pushToTalkButton, controller } = enabled();
    const up = makeEvent({ key: 'Enter' });

    pushToTalkButton.dispatch('keyup', up);

    t.is(controller.endPushToTalk.callCount, 0);
    t.true(up.preventDefault.notCalled);
});

// -------------------------------------------------------------------------- //
// no duplicate event path: click is never wired to an action
// -------------------------------------------------------------------------- //

ava('a synthetic click on the push-to-talk button triggers no controller action', (t) => {
    const { pushToTalkButton, controller } = enabled();

    // native buttons emit a click after pointer/keyboard activation; the bindings
    // drive begin/end from pointer + key events only, so click must be inert
    pushToTalkButton.dispatch('pointerdown', makeEvent({ pointerId: 1 }));
    pushToTalkButton.dispatch('pointerup', makeEvent({ pointerId: 1 }));
    controller.beginPushToTalk.resetHistory();
    controller.endPushToTalk.resetHistory();

    pushToTalkButton.dispatch('click', makeEvent());

    t.is(controller.beginPushToTalk.callCount, 0);
    t.is(controller.endPushToTalk.callCount, 0);
    t.is(pushToTalkButton.listenerCount('click'), 0);
});

// -------------------------------------------------------------------------- //
// a disabled push-to-talk button ignores every begin interaction
// -------------------------------------------------------------------------- //

ava('a disabled push-to-talk button makes pointer and keyboard events do nothing', (t) => {
    const { pushToTalkButton, controller } = enabled();
    pushToTalkButton.disabled = true;

    pushToTalkButton.dispatch('pointerdown', makeEvent({ pointerId: 1 }));

    const keyDown = makeEvent({ key: 'Enter' });

    pushToTalkButton.dispatch('keydown', keyDown);

    t.is(controller.beginPushToTalk.callCount, 0);
    t.true(keyDown.preventDefault.notCalled);
});

// -------------------------------------------------------------------------- //
// idempotent binding + clean unbinding
// -------------------------------------------------------------------------- //

ava('enable() is idempotent and binds each listener exactly once', (t) => {
    const { bindings, pushToTalkButton, controller } = build();

    bindings.enable();
    bindings.enable();

    t.is(pushToTalkButton.listenerCount('pointerdown'), 1);
    t.is(pushToTalkButton.listenerCount('keydown'), 1);

    pushToTalkButton.dispatch('pointerdown', makeEvent({ pointerId: 1 }));
    t.is(controller.beginPushToTalk.callCount, 1);
});

ava('enable() returns the instance', (t) => {
    const { bindings } = build();

    t.is(bindings.enable(), bindings);
});

ava('disable() removes every listener and leaves the targets inert', (t) => {
    const { bindings, optInButton, pushToTalkButton, windowTarget, controller } = enabled();

    t.is(bindings.disable(), bindings);

    t.is(optInButton.listenerCount('click'), 0);
    t.is(pushToTalkButton.listenerCount('pointerdown'), 0);
    t.is(pushToTalkButton.listenerCount('pointerup'), 0);
    t.is(pushToTalkButton.listenerCount('pointercancel'), 0);
    t.is(pushToTalkButton.listenerCount('lostpointercapture'), 0);
    t.is(pushToTalkButton.listenerCount('keydown'), 0);
    t.is(pushToTalkButton.listenerCount('keyup'), 0);
    t.is(windowTarget.listenerCount('blur'), 0);

    // dispatching after teardown reaches nothing
    optInButton.dispatch('click', makeEvent());
    pushToTalkButton.dispatch('pointerdown', makeEvent({ pointerId: 1 }));
    t.is(controller.enable.callCount, 0);
    t.is(controller.beginPushToTalk.callCount, 0);
});

ava('disable() is idempotent and safe before enable()', (t) => {
    const { bindings, pushToTalkButton } = build();

    t.notThrows(() => bindings.disable());
    bindings.enable();
    bindings.disable();
    bindings.disable();

    t.is(pushToTalkButton.listenerCount('pointerdown'), 0);
});

ava('removeEventListener is called with the same handler identities used to bind', (t) => {
    const { bindings, pushToTalkButton } = build();

    bindings.enable();
    const boundPointerDown = pushToTalkButton.addEventListener.getCalls()
        .find((call) => call.args[0] === 'pointerdown').args[1];

    bindings.disable();
    const unboundPointerDown = pushToTalkButton.removeEventListener.getCalls()
        .find((call) => call.args[0] === 'pointerdown').args[1];

    t.is(unboundPointerDown, boundPointerDown);
});
