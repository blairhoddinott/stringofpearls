export default class TimerScheduler {
    constructor(schedule, cancel) {
        this._schedule = schedule;
        this._cancel = cancel;
    }

    schedule(callback, delay) {
        return this._schedule(callback, delay);
    }

    cancel(handle) {
        this._cancel(handle);
    }
}
