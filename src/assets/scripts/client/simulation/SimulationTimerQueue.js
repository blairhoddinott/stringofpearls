/**
 * Per-simulation game timer queue driven by an injected simulation clock.
 */
export default class SimulationTimerQueue {
    constructor(clock) {
        this._clock = clock;
        this._timers = [];
    }

    get timers() {
        return this._timers;
    }

    scheduleTimeout(callback, delay, receiver, data) {
        const fireTime = this._clock.accumulatedDeltaTime + delay;
        const timer = [callback, fireTime, data, delay, false, receiver];

        this._timers.push(timer);

        return timer;
    }

    scheduleInterval(callback, delay, receiver, data) {
        const fireTime = this._clock.accumulatedDeltaTime + delay;
        const timer = [callback, fireTime, data, delay, true, receiver];

        this._timers.push(timer);

        return timer;
    }

    destroyTimer(timer) {
        this._timers.splice(this._timers.indexOf(timer), 1);
    }

    destroyTimers() {
        this._timers = [];
    }

    update() {
        const currentGameTime = this._clock.accumulatedDeltaTime;

        for (let i = this._timers.length - 1; i >= 0; i--) {
            let willRemoveTimerFromList = false;
            const timer = this._timers[i];
            const callback = timer[0];
            const fireTime = timer[1];
            const callbackArguments = timer[2];
            const delayInterval = timer[3];
            const shouldRepeat = timer[4];

            if (currentGameTime > fireTime) {
                callback.call(timer[5], callbackArguments);
                willRemoveTimerFromList = true;

                if (shouldRepeat) {
                    timer[1] = fireTime + delayInterval;
                    willRemoveTimerFromList = false;
                }
            }

            if (willRemoveTimerFromList) {
                this._timers.splice(i, 1);
                i -= 1;
            }
        }
    }
}
