/**
 * A pure adapter around an injected Web Storage-compatible backend.
 *
 * The backend is anything exposing the standard Web Storage `getItem(key)`,
 * `setItem(key, value)`, and `clear()` contract (for example
 * `window.localStorage`). This
 * adapter intentionally references no browser globals so it stays trivially
 * testable with a fake backend.
 *
 * @class StorageAdapter
 */
export default class StorageAdapter {
    /**
     * @constructor
     * @param backend {Storage}  Web Storage-compatible backend exposing `getItem(key)`, `setItem(key, value)`, and `clear()`
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

    /**
     * Write `value` under `key`.
     *
     * Delegates exactly to the backend `setItem(key, value)`.
     *
     * @for StorageAdapter
     * @method set
     * @param key {string}
     * @param value {*}  Raw value forwarded to the backend for Web Storage coercion
     */
    set(key, value) {
        this._backend.setItem(key, value);
    }

    /**
     * Remove every key owned by the backend.
     *
     * Delegates exactly to the backend `clear()` and returns its result verbatim,
     * letting any backend failure propagate unchanged.
     *
     * @for StorageAdapter
     * @method clear
     */
    clear() {
        return this._backend.clear();
    }
}
