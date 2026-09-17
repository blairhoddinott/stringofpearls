/**
 * A pure adapter around an injected delayed-callback callable.
 *
 * The callable is anything that schedules a callback to run after a delay when
 * invoked with that callback and delay (for example
 * `(callback, delay) => window.setTimeout(callback, delay)`). This adapter
 * intentionally references no browser globals so it stays trivially testable
 * with a fake callable, and it forwards the callback and delay and returns the
 * callable's value verbatim so callers own how the timer handle is interpreted.
 *
 * @class DelayScheduler
 */
export default class DelayScheduler {
    /**
     * @constructor
     * @param delay {Function}  delayed-callback callable accepting a callback and delay
     */
    constructor(delay) {
        this._delay = delay;
    }

    /**
     * Schedule the supplied callback via the injected callable.
     *
     * Delegates exactly to the callable with only the supplied callback and
     * delay and returns its value verbatim, letting any thrown error propagate
     * unchanged.
     *
     * @for DelayScheduler
     * @method schedule
     * @param callback {Function}
     * @param delay {number}  milliseconds to wait before invoking the callback
     * @return {*} timer handle produced by the injected callable
     */
    schedule(callback, delay) {
        return this._delay(callback, delay);
    }
}
