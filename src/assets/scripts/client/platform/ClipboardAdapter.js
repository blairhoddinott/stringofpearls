/**
 * A pure adapter around an injected clipboard `writeText` callable.
 *
 * The callable is anything matching the asynchronous clipboard write contract
 * used here — invoked with the text to copy and typically returning a promise
 * (for example a receiver-preserving wrapper around
 * `window.navigator.clipboard.writeText`). This adapter intentionally
 * references no browser globals so it stays trivially testable with a fake
 * callable, and it is safe to construct with no callable at all: a nullish
 * `writeText` is normalized to `null` and the copy operation becomes a no-op
 * that returns `undefined`. When the callable is present it is invoked with the
 * exact text argument and its return value is forwarded verbatim so callers own
 * how the (promise or otherwise) result is interpreted; any thrown error
 * propagates unchanged.
 *
 * @class ClipboardAdapter
 */
export default class ClipboardAdapter {
    /**
     * @constructor
     * @param writeText {Function|null} [optional]  clipboard write callable invoked as `writeText(text)`, or nullish for a disabled adapter
     */
    constructor(writeText = null) {
        /**
         * Injected clipboard write callable, or `null` when unavailable.
         *
         * @property _writeText
         * @type {Function|null}
         * @private
         */
        this._writeText = writeText == null ? null : writeText;
    }

    /**
     * Copy `text` to the clipboard through the injected callable.
     *
     * Returns `undefined` without side effects when no callable is configured.
     * Otherwise delegates exactly to `writeText(text)` and returns its value
     * verbatim, letting any thrown error (or rejected promise) propagate
     * unchanged.
     *
     * @for ClipboardAdapter
     * @method writeText
     * @param text {string}
     * @return {*}
     */
    writeText(text) {
        if (this._writeText === null) {
            return undefined;
        }

        return this._writeText(text);
    }
}
