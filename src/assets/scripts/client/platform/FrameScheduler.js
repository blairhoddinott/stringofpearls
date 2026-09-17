/**
 * A pure adapter around an injected request-frame callable.
 *
 * The callable is anything that schedules a callback for the next animation
 * frame when invoked with that callback (for example
 * `(callback) => window.requestAnimationFrame(callback)`). This adapter
 * intentionally references no browser globals so it stays trivially testable
 * with a fake callable, and it forwards the callback and returns the callable's
 * value verbatim so callers own how the frame handle is interpreted.
 *
 * @class FrameScheduler
 */
export default class FrameScheduler {
    /**
     * @constructor
     * @param requestFrame {Function}  request-frame callable accepting a callback
     */
    constructor(requestFrame) {
        this._requestFrame = requestFrame;
    }

    /**
     * Schedule the supplied callback via the injected callable.
     *
     * Delegates exactly to the callable with only the supplied callback and
     * returns its value verbatim, letting any thrown error propagate unchanged.
     *
     * @for FrameScheduler
     * @method requestFrame
     * @param callback {Function}
     * @return {*} frame handle produced by the injected callable
     */
    requestFrame(callback) {
        return this._requestFrame(callback);
    }
}
