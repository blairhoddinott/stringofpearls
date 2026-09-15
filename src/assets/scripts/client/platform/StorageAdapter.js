/**
 * A pure adapter around an injected Web Storage-compatible backend.
 *
 * The backend is anything exposing the standard Web Storage `getItem(key)`
 * contract (for example `window.localStorage`). This adapter intentionally
 * references no browser globals so it stays trivially testable with a fake
 * backend.
 *
 * @class StorageAdapter
 */
export default class StorageAdapter {
    /**
     * @constructor
     * @param backend {Storage}  Web Storage-compatible backend exposing `getItem(key)`
     */
    constructor(backend) {
        this._backend = backend;
    }

    /**
     * Read the raw value stored under `key`.
     *
     * Delegates to the backend `getItem(key)` and returns its value verbatim,
     * including the backend's missing-value sentinel.
     *
     * @for StorageAdapter
     * @method get
     * @param key {string}
     * @return {string|null}
     */
    get(key) {
        return this._backend.getItem(key);
    }
}
