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
        this._isPaused = false;
        this._simulationRate = 1;
    }

    get deltaTime() {
        return this._deltaTime;
    }

    get elapsedTime() {
        return this._elapsedTime;
    }

    get accumulatedDeltaTime() {
        return this._elapsedTime;
    }

    get simulationRate() {
        return this._simulationRate;
    }

    get isPaused() {
        return this._isPaused;
    }

    setPause(nextPause) {
        this._isPaused = nextPause;
    }

    updateSimulationRate(nextRate) {
        if (nextRate < 0) {
            return;
        }

        this._simulationRate = nextRate;
    }

    getDeltaTimeForGameStateAndTimewarp() {
        return this._deltaTime;
    }

    tick(delta) {
        const effectiveDelta = this._isPaused ? 0 : Math.min(delta * this._simulationRate, 100);

        this._deltaTime = effectiveDelta;
        this._elapsedTime += effectiveDelta;

        return effectiveDelta;
    }
}
