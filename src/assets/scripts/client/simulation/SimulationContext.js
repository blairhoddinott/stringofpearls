import { EventBusClass } from '../lib/EventBus';
import SimulationClock from './SimulationClock';
import SimulationTimerQueue from './SimulationTimerQueue';

/**
 * Owns the mutable domain services for one simulation session.
 *
 * Phase 4 migrates those services incrementally. The initial context establishes
 * per-session event dispatch while retaining explicit seams for the session clock
 * and random source.
 *
 * @class SimulationContext
 */
export default class SimulationContext {
    /**
     * @constructor
     * @param options {object} [optional]
     * @param options.clock {*} [optional] session clock
     * @param options.randomSource {RandomSource|null} [optional] session random source
     * @param options.eventBus {EventBus|null} [optional] session event bus; a fresh instance is created when nullish
     */
    constructor({ clock = null, randomSource = null, eventBus = null } = {}) {
        this._clock = clock ?? new SimulationClock();
        this._timerQueue = new SimulationTimerQueue(this._clock);
        this._randomSource = randomSource;
        this._eventBus = eventBus ?? new EventBusClass();
    }

    get clock() {
        return this._clock;
    }

    get timerQueue() {
        return this._timerQueue;
    }

    get randomSource() {
        return this._randomSource;
    }

    get eventBus() {
        return this._eventBus;
    }

    tick(delta) {
        const result = this._clock.tick(delta);

        this._timerQueue.update();

        return result;
    }

    destroy() {
        this._eventBus.destroy();
        this._timerQueue.destroyTimers();
    }
}
