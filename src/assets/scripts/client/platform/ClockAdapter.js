/**
 * A pure adapter around an injected current-time callable.
 *
 * The callable is anything that returns a date-like value when invoked with no
 * arguments (for example `() => new Date()`). This adapter intentionally
 * references no browser globals so it stays trivially testable with a fake
 * callable, and it returns the callable's value verbatim so callers own how the
 * date-like value is interpreted.
 *
 * @class ClockAdapter
 */
export default class ClockAdapter {
    /**
     * @constructor
     * @param now {Function}  current-time callable returning a date-like value
     */
    constructor(now) {
        this._now = now;
    }

    /**
     * Read the current date-like value from the injected callable.
     *
     * Delegates exactly to the callable and returns its value verbatim, letting
     * any thrown error propagate unchanged.
     *
     * @for ClockAdapter
     * @method now
     * @return {Date}
     */
    now() {
        return this._now();
    }
}
