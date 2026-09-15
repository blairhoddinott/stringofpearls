/**
 * A pure adapter around the injected page focus/visibility registration seams.
 *
 * It is constructed from three capabilities: a callable that registers a window
 * event listener (`addWindowListener(type, listener)`, for example a wrapper
 * around `window.addEventListener`), a callable that registers a document event
 * listener (`addDocumentListener(type, listener)`, for example a wrapper around
 * `document.addEventListener`), and a callable that reads the current page
 * visibility state (`readVisibilityState()`, for example
 * `() => document.visibilityState`). This adapter intentionally references no
 * browser globals so it stays trivially testable with fakes, and it is safe to
 * construct with any capability omitted: a nullish capability is normalized to
 * `null` and `subscribe()` becomes a no-op that performs no partial
 * registrations and returns `undefined` with no ambient fallback.
 *
 * @class PageVisibilityAdapter
 */
export default class PageVisibilityAdapter {
    /**
     * @constructor
     * @param addWindowListener {Function|null} [optional]  registers a window listener as `(type, listener)`, or nullish when unavailable
     * @param addDocumentListener {Function|null} [optional]  registers a document listener as `(type, listener)`, or nullish when unavailable
     * @param readVisibilityState {Function|null} [optional]  returns the current visibility state, or nullish when unavailable
     */
    constructor(addWindowListener = null, addDocumentListener = null, readVisibilityState = null) {
        /**
         * Injected window listener registration callable, or `null` when unavailable.
         *
         * @property _addWindowListener
         * @type {Function|null}
         * @private
         */
        this._addWindowListener = addWindowListener == null ? null : addWindowListener;

        /**
         * Injected document listener registration callable, or `null` when unavailable.
         *
         * @property _addDocumentListener
         * @type {Function|null}
         * @private
         */
        this._addDocumentListener = addDocumentListener == null ? null : addDocumentListener;

        /**
         * Injected visibility-state read callable, or `null` when unavailable.
         *
         * @property _readVisibilityState
         * @type {Function|null}
         * @private
         */
        this._readVisibilityState = readVisibilityState == null ? null : readVisibilityState;
    }

    /**
     * Register the page focus/visibility listeners that drive pause/resume.
     *
     * Returns `undefined` without registering anything when any required
     * capability is missing, so there are never partial registrations and no
     * ambient fallback. Otherwise reproduces the legacy inline behavior exactly:
     * register `onHidden` for the window `'blur'` event first, `onVisible` for
     * the window `'focus'` event second, and a `'visibilitychange'` document
     * handler third. The `'blur'`/`'focus'` listeners receive the original
     * callbacks directly so they observe whatever event arguments the
     * `EventTarget` supplies. The visibility handler reads the state once per
     * event and, when it is exactly `'hidden'`, invokes `onHidden()` with no
     * arguments and returns its result; otherwise it invokes `onVisible()` with
     * no arguments and returns its result.
     *
     * @for PageVisibilityAdapter
     * @method subscribe
     * @param onHidden {Function}  invoked on blur and when the page becomes hidden
     * @param onVisible {Function}  invoked on focus and when the page becomes visible
     * @return {undefined}
     */
    subscribe(onHidden, onVisible) {
        if (this._addWindowListener === null || this._addDocumentListener === null || this._readVisibilityState === null) {
            return undefined;
        }

        this._addWindowListener('blur', onHidden);
        this._addWindowListener('focus', onVisible);
        this._addDocumentListener('visibilitychange', () => {
            if (this._readVisibilityState() === 'hidden') {
                return onHidden();
            }

            return onVisible();
        });

        return undefined;
    }
}
