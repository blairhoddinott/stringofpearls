import $ from 'jquery';
import _forEach from 'lodash/forEach';
import _has from 'lodash/has';
import EventBus from '../lib/EventBus';
import EventTracker from '../EventTracker';
import GameOptions from './GameOptions';
import {
    GAME_EVENTS,
    GAME_EVENTS_DESCRIPTION,
    GAME_EVENTS_POINT_VALUES
} from './gameEventConstants';
import TimeKeeper from '../engine/TimeKeeper';
import SimulationTimerQueue from '../simulation/SimulationTimerQueue';
import { round } from '../math/core';
import { EVENT } from '../constants/eventNames';
import { GAME_OPTION_NAMES } from '../constants/gameOptionConstants';
import { TIME } from '../constants/globalConstants';
import { TRACKABLE_EVENT } from '../constants/trackableEvents';
import { SELECTORS } from '../constants/selectors';
import { THEME } from '../constants/themes';

export { GAME_EVENTS } from './gameEventConstants';

/**
 * @class GameController
 */
export class GameControllerClass {
    /**
     * @constructor
     */
    constructor(timerQueue = new SimulationTimerQueue(TimeKeeper), eventBus = EventBus) {
        this._timerQueue = timerQueue;

        // TODO: the below $elements _should_ be used instead of the inline vars currently in use but
        // take caution when implmenting these because it will break tests currently in place. This is
        // because of the use of $ within lifecycle methods and becuase this is a static class used
        // by many of the files under test.
        // this._$htmlElement = $('html');
        // this._$pauseToggleElement = null;
        // this._$fastForwardElement = null;
        // this._$scoreElement = null;
        this.game = {};
        this.game.focused = true;
        this.game.frequency = 1;
        this.game.events = {};
        this.game.timeouts = this._timerQueue.timers;
        this.game.last_score = 0;
        this.game.score = 0;
        this.game.option = new GameOptions();
        this.theme = THEME.DEFAULT;

        /**
         * Persistence boundary forwarded to the `GameOptions` instance.
         *
         * Remains `null` until the composition root configures it through
         * `initStorage()`, so import-time construction never touches a browser
         * global. Retained across `destroy()` so rebuilt options stay
         * storage-backed.
         *
         * @property _storageAdapter
         * @type {StorageAdapter}
         * @default null
         * @private
         */
        this._storageAdapter = null;

        /**
         * Page focus/visibility boundary used to register the pause/resume
         * listeners.
         *
         * Remains `null` until the composition root configures it through
         * `initPageVisibility()`, so import-time construction and `enable()`
         * never touch a browser global. Retained across `destroy()` so a rebuilt
         * lifecycle keeps its focus/visibility wiring.
         *
         * @property _pageVisibilityAdapter
         * @type {PageVisibilityAdapter}
         * @default null
         * @private
         */
        this._pageVisibilityAdapter = null;

        this._eventBus = eventBus;
    }

    /**
     * Configure the persistence boundary used by game options.
     *
     * Called by `AppController.setupChildren()` at the composition root, before
     * any downstream UI/canvas consumer reads a game option, so persisted
     * settings are rehydrated on the existing `GameOptions` instance rather than
     * replacing it.
     *
     * @for GameController
     * @method initStorage
     * @param storageAdapter {StorageAdapter}  boundary exposing `get(key)`/`set(key, value)`
     * @chainable
     */
    initStorage(storageAdapter) {
        this._storageAdapter = storageAdapter == null ? null : storageAdapter;

        this.game.option.initStorage(this._storageAdapter);

        return this;
    }

    /**
     * Configure the page focus/visibility boundary used by `enable()` to register
     * the pause/resume listeners.
     *
     * Called by `AppController.setupChildren()` at the composition root, before
     * `init_pre` calls `enable()`, so the browser `window`/`document` references
     * live only in the composition root rather than inside this controller. A
     * nullish adapter is normalized to canonical `null`, in which case `enable()`
     * stays a safe, browser-free no-op for this capability.
     *
     * @for GameController
     * @method initPageVisibility
     * @param pageVisibilityAdapter {PageVisibilityAdapter} [optional]  boundary exposing `subscribe(onHidden, onVisible)`
     * @chainable
     */
    initPageVisibility(pageVisibilityAdapter = null) {
        this._pageVisibilityAdapter = pageVisibilityAdapter == null ? null : pageVisibilityAdapter;

        return this;
    }

    /**
     * @for GameController
     * @method init_pre
     */
    init_pre() {
        return this.setupHandlers()
            .createChildren()
            .enable();
    }

    /**
    * Initialize blur functions used during game pausing
    *
    * @for GameController
    * @method setupHandlers
    * @chainable
    */
    setupHandlers() {
        this._onWindowBlurHandler = this._onWindowBlur.bind(this);
        this._onWindowFocusHandler = this._onWindowFocus.bind(this);

        return this;
    }

    /**
     * @for GameController
     * @method createChildren
     * @chainable
     */
    createChildren() {
        // see comment in constructor. tl;dr these props should be used but are not because they break tests
        // this._$pauseToggleElement = $(SELECTORS.DOM_SELECTORS.TOGGLE_PAUSE);
        // this._$fastForwardElement = $(SELECTORS.DOM_SELECTORS.FAST_FORWARDS);
        // this._$scoreElement = $(SELECTORS.DOM_SELECTORS.SCORE);

        return this;
    }

    /**
     * @for GameController
     * @method enable
     * @chainable
     */
    enable() {
        this._eventBus.on(EVENT.SET_THEME, this._setTheme);

        // Register the window blur/focus and document visibilitychange listeners
        // (for when the browser window receives or looses focus) through the
        // injected boundary so no browser global is touched here. Remains a safe
        // no-op when no adapter was configured.
        if (this._pageVisibilityAdapter !== null) {
            this._pageVisibilityAdapter.subscribe(this._onWindowBlurHandler, this._onWindowFocusHandler);
        }

        return this.initializeEventCount();
    }

    /**
     * @for GameController
     * @method disable
     * @chainable
     */
    disable() {
        this._eventBus.off(EVENT.SET_THEME, this._setTheme);

        return this.destroy();
    }

    /**
     * Destroy instance properties
     *
     * @for GameController
     * @method destroy
     * @chainable
     */
    destroy() {
        // this._$htmlElement = $('html');
        // this._$pauseToggleElement = null;
        // this._$fastForwardElement = null;
        // this._$scoreElement = null;
        this.game = {};
        this.game.focused = true;
        // TODO: remove
        this.game.frequency = 1;
        this.game.events = {};
        this._timerQueue.destroyTimers();
        this.game.timeouts = this._timerQueue.timers;
        this.game.last_score = 0;
        this.game.score = 0;
        this.game.option = new GameOptions();
        this.theme = THEME.DEFAULT;

        // Retain any configured adapter so the rebuilt `GameOptions` instance
        // stays storage-backed after lifecycle reconstruction.
        this.game.option.initStorage(this._storageAdapter);

        return this;
    }

    /**
     * Initialize `GameController.events` to contain appropriate properties with values of 0
     *
     * @for GameController
     * @method initializeEventCount
     */
    initializeEventCount() {
        _forEach(GAME_EVENTS, (gameEvent, key) => {
            this.game.events[key] = 0;
        });
    }

    // TODO: usages of this method should move to use EventBus
    /**
     * Record a game event to this.game.events, and update this.game.score
     *
     * @for GameController
     * @method events_recordNew
     * @param gameEvent {String} one of the events listed in GAME_EVENTS
     */
    events_recordNew(gameEvent) {
        if (!_has(GAME_EVENTS, gameEvent)) {
            throw new TypeError(`Expected a game event listed in GAME_EVENTS, but instead received ${gameEvent}`);
        }

        this.game.events[gameEvent] += 1;
        this.game.score += GAME_EVENTS_POINT_VALUES[gameEvent];

        this.game_updateScore();
        this.updateScoreHistory(gameEvent);

        // Publish the scoring event so observers (e.g. the shift scoring log)
        // can capture the event with its own simulation-time context. This is
        // the incremental step toward moving scoring notifications onto the
        // `EventBus` noted above.
        this._eventBus.trigger(EVENT.SCORE_EVENT_RECORDED, gameEvent);
    }


    /**
     * @for GameController
     * @method game_get_weighted_score
     */
    game_get_weighted_score() {
        const hoursPlayed = TimeKeeper.accumulatedDeltaTime / TIME.ONE_HOUR_IN_SECONDS;
        const scorePerHour = this.game.score / hoursPlayed;

        return scorePerHour;
    }

    /**
     * @for GameController
     * @method game_reset_score_and_events
     */
    game_reset_score_and_events() {
        // Reset events
        _forEach(this.game.events, (gameEvent, key) => {
            this.game.events[key] = 0;
        });

        // Reset score
        this.game.score = 0;

        this.game_updateScore();
    }

    /**
     *
     * @for GameController
     * @method updateTimescale
     * @param nextValue {number}
     */
    updateTimescale(nextValue) {
        if (nextValue === 0) {
            this.game_timewarp_toggle();
            return;
        } else if (nextValue < 0) {
            return;
        }

        TimeKeeper.updateSimulationRate(nextValue);
        EventTracker.recordEvent(TRACKABLE_EVENT.OPTIONS, 'timewarp', nextValue);

        const $fastForwards = $(SELECTORS.DOM_SELECTORS.FAST_FORWARDS);

        if (nextValue === 1) {
            $fastForwards.removeClass(SELECTORS.CLASSNAMES.SPEED_2);
            $fastForwards.removeClass(SELECTORS.CLASSNAMES.SPEED_5);
            $fastForwards.prop('title', 'Set time warp to 2');
        } else if (nextValue < 5) {
            $fastForwards.removeClass(SELECTORS.CLASSNAMES.SPEED_5);
            $fastForwards.addClass(SELECTORS.CLASSNAMES.SPEED_2);
            $fastForwards.prop('title', 'Set time warp to 5');
        } else {
            $fastForwards.removeClass(SELECTORS.CLASSNAMES.SPEED_2);
            $fastForwards.addClass(SELECTORS.CLASSNAMES.SPEED_5);
            $fastForwards.prop('title', 'Reset time warp');
        }
    }

    /**
     * Update the visual state of the timewarp control button and call
     * `TimeKeeper.updateTimescalse` with the next timewarp value.
     *
     * This method is called as a result of a user interaction
     *
     * @for GameController
     * @method game_timewarp_toggle
     */
    game_timewarp_toggle() {
        if (TimeKeeper.simulationRate >= 5) {
            this.updateTimescale(1);
        } else if (TimeKeeper.simulationRate === 1) {
            this.updateTimescale(2);
        } else {
            this.updateTimescale(5);
        }
    }

    /**
     * @for GameController
     * @method game_pause
     */
    game_pause() {
        TimeKeeper.setPause(true);

        const $pauseToggleElement = $(SELECTORS.DOM_SELECTORS.TOGGLE_PAUSE);

        $pauseToggleElement.addClass(SELECTORS.CLASSNAMES.ACTIVE);
        $pauseToggleElement.attr('title', 'Resume simulation');
        $('html').addClass(SELECTORS.CLASSNAMES.PAUSED);
    }

    /**
     * @for GameController
     * @method game_unpause
     */
    game_unpause() {
        TimeKeeper.setPause(false);

        const $pauseToggleElement = $(SELECTORS.DOM_SELECTORS.TOGGLE_PAUSE);

        $pauseToggleElement.removeClass(SELECTORS.CLASSNAMES.ACTIVE);
        $pauseToggleElement.attr('title', 'Pause simulation');
        $('html').removeClass(SELECTORS.CLASSNAMES.PAUSED);
    }

    /**
     * @for GameController
     * @method game_pause_toggle
     */
    game_pause_toggle() {
        if (TimeKeeper.isPaused) {
            EventTracker.recordEvent(TRACKABLE_EVENT.OPTIONS, 'pause', 'false');
            this.game_unpause();

            return;
        }

        EventTracker.recordEvent(TRACKABLE_EVENT.OPTIONS, 'pause', 'true');
        this.game_pause();
    }

    /**
     * @for GameController
     * @method game_paused
     * @return {boolean}
     */
    game_paused() {
        return !this.game.focused || TimeKeeper.isPaused;
    }

    /**
     * @for GameController
     * @method game_speedup
     * @return {number}
     */
    game_speedup() {
        return !this.game_paused() ? TimeKeeper.simulationRate : 0;
    }

    /**
     * @for GameController
     * @method game_timeout
     * @param func {function} called when timeout is triggered
     * @param delay {number} in seconds
     * @param that
     * @param data
     * @return {array} gameTimeout
     */
    game_timeout(functionToCall, delay, that, data) {
        return this._timerQueue.scheduleTimeout(functionToCall, delay, that, data);
    }

    /**
     * @for GameController
     * @method game_interval
     * @param func {function} called when timeout is triggered
     * @param delay {number} in seconds
     * @param that
     * @param data
     * @return {array} to
     */
    game_interval(func, delay, that, data) {
        return this._timerQueue.scheduleInterval(func, delay, that, data);
    }

    /**
     * Destroys a specific timer.
     *
     * @for GameController
     * @method destroyTimer
     * @param timer {array} the timer to destroy
     */
    destroyTimer(timer) {
        this._timerQueue.destroyTimer(timer);
    }

    /**
     * Destroy all current timers
     *
     * Used when changing airports. any timer is only valid
     * for a specific airport.
     *
     * @for GameController
     * @method destroyTimers
     */
    destroyTimers() {
        this._timerQueue.destroyTimers();
        this.game.timeouts = this._timerQueue.timers;
    }

    /**
     * @for GameController
     * @method game_updateScore
     * @param score {number}
     */
    game_updateScore() {
        if (this.game.score === this.game.last_score) {
            return;
        }

        const $scoreElement = $(SELECTORS.DOM_SELECTORS.SCORE);

        $scoreElement.text(round(this.game.score));

        // TODO: wait, what? Why not just < 0?
        if (this.game.score < -0.51) {
            $scoreElement.addClass(SELECTORS.CLASSNAMES.NEGATIVE);
        } else {
            $scoreElement.removeClass(SELECTORS.CLASSNAMES.NEGATIVE);
        }

        this.game.last_score = this.game.score;
    }

    /**
     * @for GameController
     * @method updateScoreHistory
     * @param event {String} one of the events listed in GAME_EVENTS
     */
    updateScoreHistory(event) {
        let points = GAME_EVENTS_POINT_VALUES[event];

        if (points < 0) {
            points = `<span class="gameScoreHistory-points_negative">${points}</span>`;
        }

        const html = $(`<li>${GAME_EVENTS_DESCRIPTION[event]}: ${points}</li>`);
        const listView = $(SELECTORS.DOM_SELECTORS.SCORE_LOG);

        listView.append(html);
        listView.scrollTop(listView.get(0).scrollHeight);
    }

    /**
     * @for GameController
     * @method update_pre
     */
    update_pre() {
        const $htmlElement = $('html');

        if (!this.game_paused() && $htmlElement.hasClass(SELECTORS.CLASSNAMES.PAUSED)) {
            $htmlElement.removeClass(SELECTORS.CLASSNAMES.PAUSED);
        }

        this.updateTimers();
    }

    /**
     * @for GameController
     * @method updateTimers
     */
    updateTimers() {
        this._timerQueue.update();
    }

    /**
     * @for GameController
     * @method complete
     */
    complete() {
        TimeKeeper.setPause(false);
    }

    /**
     * Facade for `game.option.get`
     *
     * Allows for classes that import the `GameController` single-level
     * access to any game option value
     *
     * @for GameController
     * @method getGameOption
     * @param optionName {string}
     * @return {string}
     */
    getGameOption(optionName) {
        return this.game.option.getOptionByName(optionName);
    }

    /**
     * Check whether or not the trailing distance separator should be drawn.
     *
     * Used by the `CanvasController` to determine whether or not to proceed with
     * `canvas_draw_separation_indicator`.
     *
     * @for GameController
     * @method shouldUseTrailingSeparationIndicator
     * @param aircraft {AircraftModel}
     * @return {boolean}
     */
    shouldUseTrailingSeparationIndicator(aircraft) {
        const userSettingsValue = this.getGameOption(GAME_OPTION_NAMES.DRAW_ILS_DISTANCE_SEPARATOR);
        let isIndicatorEnabled = userSettingsValue === 'yes';

        if (userSettingsValue === 'from-theme') {
            isIndicatorEnabled = this.theme.RADAR_TARGET.TRAILING_SEPARATION_INDICATOR_ENABLED;
        }

        return isIndicatorEnabled && aircraft.isArrival();
    }

    /**
     * @for GameController
     * @method _onWindowBlur
     * @param event {UIEvent}
     * @private
     */
    _onWindowBlur(event) {
        this.game.focused = false;

        // resetting back to 1 here so when focus returns, we can reliably reset
        // `#game.delta` to 0 to prevent jumpiness
        TimeKeeper.updateSimulationRate(1);
        TimeKeeper.setPause(true);

        // update visual state of the timewarp control button for consistency
        const $fastForwards = $(SELECTORS.DOM_SELECTORS.FAST_FORWARDS);

        $fastForwards.removeClass(SELECTORS.CLASSNAMES.SPEED_2);
        $fastForwards.removeClass(SELECTORS.CLASSNAMES.SPEED_5);
        $fastForwards.prop('title', 'Set time warp to 2');
    }

    /**
     * @for GameController
     * @method _onWindowFocus
     * @param event {UIEvent}
     * @private
     */
    _onWindowFocus(event) {
        this.game.focused = true;

        // if was already manually paused when lost focus, respect that
        if ($('html').hasClass(SELECTORS.CLASSNAMES.PAUSED)) {
            return;
        }

        TimeKeeper.setPause(false);
    }


    /**
     * Change theme to the specified name
     *
     * This should ONLY be called through the EventBus during a `SET_THEME` event,
     * thus ensuring that the same theme is always in use by all app components.
     *
     * This method must remain an arrow function in order to preserve the scope
     * of `this`, since it is being invoked by an EventBus callback.
     *
     * @for GameController
     * @method _setTheme
     * @param themeName {string}
     */
    _setTheme = (themeName) => {
        if (!_has(THEME, themeName)) {
            console.error(`Expected valid theme to change to, but received '${themeName}'`);

            return;
        }

        this.theme = THEME[themeName];
    };
}

export default new GameControllerClass();
