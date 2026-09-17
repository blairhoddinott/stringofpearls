/**
 * A pure adapter around an injected `gtag`-compatible transport callable.
 *
 * The transport is anything that matches the Google Analytics `gtag` calling
 * convention when invoked (for example the browser `window.gtag`). This adapter
 * intentionally references no browser globals so it stays trivially testable
 * with a fake callable, and it is safe to construct with no transport at all:
 * a nullish transport is normalized to `null` and every recorded event becomes
 * a no-op that returns `undefined`. When a transport is present it is called
 * with the exact `('event', eventName, parameters)` argument shape and its
 * return value is forwarded verbatim so callers own how the result is
 * interpreted; any thrown error propagates unchanged.
 *
 * @class AnalyticsAdapter
 */
export default class AnalyticsAdapter {
    /**
     * @constructor
     * @param transport {Function|null} [optional]  `gtag`-compatible callable, or nullish for a disabled adapter
     */
    constructor(transport = null) {
        /**
         * Injected transport callable, or `null` when analytics are disabled.
         *
         * @property _transport
         * @type {Function|null}
         * @private
         */
        this._transport = transport == null ? null : transport;
    }

    /**
     * Record a single analytics event through the injected transport.
     *
     * Returns `undefined` without side effects when no transport is configured.
     * Otherwise delegates exactly to `transport('event', eventName, parameters)`
     * and returns its value verbatim, letting any thrown error propagate
     * unchanged.
     *
     * @for AnalyticsAdapter
     * @method record
     * @param eventName {string}
     * @param parameters {object}
     * @return {*}
     */
    record(eventName, parameters) {
        if (this._transport === null) {
            return undefined;
        }

        return this._transport('event', eventName, parameters);
    }
}
