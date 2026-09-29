// the keys that natively activate a button; push-to-talk holds only on these
const ACTIVATION_KEYS = new Set(['Enter', ' ']);

// the source that currently owns an in-flight push-to-talk hold
const HOLD_SOURCE = {
    POINTER: 'pointer',
    KEYBOARD: 'keyboard'
};

/**
 * The DOM event adapter for push-to-talk voice command entry.
 *
 * It is a pure adapter: every DOM target and the {@link VoiceCommandController}
 * are injected, it touches no browser globals on import or construction, and it
 * translates accessible interactions into the four controller verbs
 * (`enable`/`beginPushToTalk`/`endPushToTalk`/`cancel`) — nothing more.
 *
 * Push-to-talk is driven from pointer and keyboard events only. A native button
 * emits a synthetic `click` after either activation path, so `click` is left
 * unbound on the push-to-talk button to avoid a duplicate begin/end; the opt-in
 * button, which is a plain activation, is the only `click` consumer.
 *
 * Key invariants enforced here:
 *   - at most one hold is active at a time, owned by exactly one source
 *     (pointer or keyboard); a competing press while held is ignored
 *   - a pointer hold ends or cancels only for the pointer that began it
 *   - keyboard auto-repeat never re-begins a hold
 *   - losing window focus mid-hold cancels the capture
 *   - a disabled push-to-talk button ignores every begin interaction
 *   - handlers are pre-bound so binding is idempotent and unbinding is exact
 *
 * @class VoiceCommandEventBindings
 */
export default class VoiceCommandEventBindings {
    /**
     * @constructor
     * @param dependencies {object}
     * @param dependencies.optInButton {EventTarget}       explicit voice opt-in button
     * @param dependencies.pushToTalkButton {EventTarget}  native push-to-talk button
     * @param dependencies.windowTarget {EventTarget}      window, for focus loss
     * @param dependencies.controller {object}             enable/beginPushToTalk/endPushToTalk/cancel
     */
    constructor({ optInButton, pushToTalkButton, windowTarget, controller } = {}) {
        this._optInButton = optInButton;
        this._pushToTalkButton = pushToTalkButton;
        this._windowTarget = windowTarget;
        this._controller = controller;

        // whether the listeners are currently attached; keeps enable/disable idempotent
        this._isBound = false;

        // the active hold, or null when idle: { source, pointerId? }
        this._hold = null;

        // pre-bind so add/removeEventListener share identical handler identities
        this._onOptInClick = this._onOptInClick.bind(this);
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onPointerCancel = this._onPointerCancel.bind(this);
        this._onLostPointerCapture = this._onLostPointerCapture.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onWindowBlur = this._onWindowBlur.bind(this);
    }

    /**
     * The full binding table: `[target, type, handler]` triples applied on
     * `enable()` and removed on `disable()` with identical handler identities.
     *
     * @for VoiceCommandEventBindings
     * @method _bindings
     * @return {Array}
     * @private
     */
    _bindings() {
        return [
            [this._optInButton, 'click', this._onOptInClick],
            [this._pushToTalkButton, 'pointerdown', this._onPointerDown],
            [this._pushToTalkButton, 'pointerup', this._onPointerUp],
            [this._pushToTalkButton, 'pointercancel', this._onPointerCancel],
            [this._pushToTalkButton, 'lostpointercapture', this._onLostPointerCapture],
            [this._pushToTalkButton, 'keydown', this._onKeyDown],
            [this._pushToTalkButton, 'keyup', this._onKeyUp],
            [this._windowTarget, 'blur', this._onWindowBlur]
        ];
    }

    /**
     * Attach every listener. Idempotent: a second call binds nothing further.
     *
     * @for VoiceCommandEventBindings
     * @method enable
     * @return {VoiceCommandEventBindings}
     * @chainable
     */
    enable() {
        if (this._isBound) {
            return this;
        }

        this._bindings().forEach(([target, type, handler]) => target.addEventListener(type, handler));
        this._isBound = true;

        return this;
    }

    /**
     * Remove every listener and leave the targets inert. Idempotent and safe to
     * call before `enable()`.
     *
     * @for VoiceCommandEventBindings
     * @method disable
     * @return {VoiceCommandEventBindings}
     * @chainable
     */
    disable() {
        if (!this._isBound) {
            return this;
        }

        this._bindings().forEach(([target, type, handler]) => target.removeEventListener(type, handler));
        this._isBound = false;
        this._hold = null;

        return this;
    }

    /**
     * @for VoiceCommandEventBindings
     * @method _onOptInClick
     * @private
     */
    _onOptInClick() {
        this._controller.enable();
    }

    /**
     * @for VoiceCommandEventBindings
     * @method _onPointerDown
     * @param event {PointerEvent}
     * @private
     */
    _onPointerDown(event) {
        if (this._pushToTalkButton.disabled || this._hold) {
            return;
        }

        this._hold = { source: HOLD_SOURCE.POINTER, pointerId: event.pointerId };

        if (typeof this._pushToTalkButton.setPointerCapture === 'function') {
            this._pushToTalkButton.setPointerCapture(event.pointerId);
        }

        this._controller.beginPushToTalk();
    }

    /**
     * @for VoiceCommandEventBindings
     * @method _onPointerUp
     * @param event {PointerEvent}
     * @private
     */
    _onPointerUp(event) {
        if (!this._isPointerHold(event)) {
            return;
        }

        const { pointerId } = this._hold;

        this._hold = null;
        this._releasePointerCapture(pointerId);
        this._controller.endPushToTalk();
    }

    /**
     * @for VoiceCommandEventBindings
     * @method _onPointerCancel
     * @param event {PointerEvent}
     * @private
     */
    _onPointerCancel(event) {
        if (!this._isPointerHold(event)) {
            return;
        }

        this._hold = null;
        this._controller.cancel();
    }

    _onLostPointerCapture(event) {
        if (!this._isPointerHold(event)) {
            return;
        }

        this._hold = null;
        this._controller.cancel();
    }

    /**
     * @for VoiceCommandEventBindings
     * @method _onKeyDown
     * @param event {KeyboardEvent}
     * @private
     */
    _onKeyDown(event) {
        if (this._pushToTalkButton.disabled || !ACTIVATION_KEYS.has(event.key) || event.repeat) {
            return;
        }

        // suppress the native click that a button would emit for this activation
        event.preventDefault();

        if (this._hold) {
            return;
        }

        this._hold = { source: HOLD_SOURCE.KEYBOARD };
        this._controller.beginPushToTalk();
    }

    /**
     * @for VoiceCommandEventBindings
     * @method _onKeyUp
     * @param event {KeyboardEvent}
     * @private
     */
    _onKeyUp(event) {
        if (this._pushToTalkButton.disabled || !ACTIVATION_KEYS.has(event.key)) {
            return;
        }

        if (!this._hold || this._hold.source !== HOLD_SOURCE.KEYBOARD) {
            return;
        }

        event.preventDefault();
        this._hold = null;
        this._controller.endPushToTalk();
    }

    /**
     * @for VoiceCommandEventBindings
     * @method _onWindowBlur
     * @private
     */
    _onWindowBlur() {
        if (!this._hold) {
            return;
        }

        this._hold = null;
        this._controller.cancel();
    }

    /**
     * Whether the given pointer event matches the active pointer hold.
     *
     * @for VoiceCommandEventBindings
     * @method _isPointerHold
     * @param event {PointerEvent}
     * @return {boolean}
     * @private
     */
    _isPointerHold(event) {
        return Boolean(this._hold)
            && this._hold.source === HOLD_SOURCE.POINTER
            && this._hold.pointerId === event.pointerId;
    }

    _releasePointerCapture(pointerId) {
        if (typeof this._pushToTalkButton.releasePointerCapture !== 'function') {
            return;
        }

        try {
            this._pushToTalkButton.releasePointerCapture(pointerId);
        } catch {
            // The browser may already have released capture.
        }
    }
}
