/**
 * Build a reporter that surfaces an error on the browser's uncaught-error
 * channel via an injected delayed-callback boundary.
 *
 * The returned reporter rethrows the error on a fresh task (scheduled at delay
 * `0`) so it reaches `window.onerror` (and the surrounding uncaught-error
 * handling) instead of being swallowed by a promise chain or turning into an
 * `unhandledrejection`. This factory references no browser globals; the timer
 * capability arrives entirely through `delayScheduler`, keeping it trivially
 * testable with a fake scheduler.
 *
 * @function createAsyncErrorReporter
 * @param delayScheduler {DelayScheduler}  delayed-callback boundary exposing
 *                                         `schedule(callback, delay)`; when
 *                                         nullish the reporter is a safe no-op
 * @return {Function} reporter accepting an `error` to surface asynchronously
 */
export default function createAsyncErrorReporter(delayScheduler) {
    return function reportAsyncError(error) {
        if (delayScheduler == null) {
            return undefined;
        }

        // Schedule the rethrow at delay 0 and intentionally discard the handle
        // so the reporter always returns `undefined` and never leaks the
        // scheduler's timer handle. A scheduling error propagates unchanged.
        delayScheduler.schedule(() => {
            throw error;
        }, 0);
    };
}
