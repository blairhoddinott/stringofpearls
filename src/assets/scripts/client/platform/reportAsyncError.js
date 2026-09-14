/**
 * Surface an error on the browser's uncaught-error channel.
 *
 * Rethrows the error on a fresh task so it reaches `window.onerror`
 * (and the surrounding uncaught-error handling) instead of being swallowed
 * by a promise chain or turning into an `unhandledrejection`.
 *
 * @function reportAsyncError
 * @param error {Error}
 */
export default function reportAsyncError(error) {
    setTimeout(() => {
        throw error;
    }, 0);
}
