/**
 * Deterministic simulation-time clock advanced only by explicit deltas.
 *
 * It deliberately has no current-time provider and never reads a wall clock.
 * Values are expressed in seconds.
 *
 * @class SimulationClock
 */
export default class SimulationClock {
    constructor() {
        this._deltaTime = 0;
        this._elapsedTime = 0;
    }

    get deltaTime() {
        return this._deltaTime;
    }

    get elapsedTime() {
        return this._elapsedTime;
    }

    tick(delta) {
        this._deltaTime = delta;
        this._elapsedTime += delta;
    }
}
