/**
 * A pure, browser-free service that clears persisted storage and reloads the page.
 *
 * Both collaborators are optional and injected at the composition root: the
 * `storageAdapter` is any `StorageAdapter`-compatible boundary exposing
 * `clear()`, and `reload` is a page-reload callable. This service references no
 * browser globals, so it stays trivially testable with fakes and can run in
 * tests without fabricated global browser state.
 *
 * @class ClearStorageAndReload
 */
export default class ClearStorageAndReload {
    /**
     * @constructor
     * @param storageAdapter {StorageAdapter|null}  persistence boundary exposing `clear()`; optional
     * @param reload {Function|null}  page-reload callable; optional
     */
    constructor(storageAdapter, reload) {
        /**
         * Persistence boundary used to clear stored state. Canonical null when omitted.
         *
         * @property _storageAdapter
         * @type {StorageAdapter|null}
         */
        this._storageAdapter = storageAdapter ?? null;

        /**
         * Page-reload callable invoked after storage is cleared. Canonical null when omitted.
         *
         * @property _reload
         * @type {Function|null}
         */
        this._reload = reload ?? null;
    }

    /**
     * Clear persisted storage and then reload the page.
     *
     * Each capability is guarded independently, so a configured reload still runs
     * when storage is omitted and vice versa. Storage is always cleared before the
     * reload; if the clear fails, its exact error propagates and the reload is
     * skipped, and if the reload fails its exact error propagates after the clear.
     * Returns `undefined`.
     *
     * @for ClearStorageAndReload
     * @method execute
     */
    execute() {
        if (this._storageAdapter != null) {
            this._storageAdapter.clear();
        }

        if (this._reload != null) {
            this._reload();
        }
    }
}
