/**
 * Owns the aircraft models for one simulation session.
 *
 * @class AircraftCollection
 */
export default class AircraftCollection {
    constructor() {
        this._items = [];
        this.auto = { enabled: false };
    }

    get items() {
        return this._items;
    }

    get list() {
        return this._items;
    }

    set list(items) {
        this._items = items;
    }

    addItem(item) {
        this._items.push(item);
    }

    reset() {
        this._items = [];
        this.auto.enabled = false;
    }
}
