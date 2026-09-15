import $ from 'jquery';
import { SELECTORS } from './constants/selectors';

/**
 * Provides access to the full page takeover presented on app load
 *
 * @class LoadingView
 */
export default class LoadingView {
    /**
     * @for LoadingView
     * @constructor
     * @param delayScheduler {DelayScheduler} delayed-callback boundary; nullish/omitted normalizes to null
     */
    constructor(delayScheduler) {
        /**
         * Root DOM element
         *
         * @property $element
         * @type {jquery|null}
         */
        this.$element = null;

        /**
         * Delayed-callback boundary used to defer the loading-view fade out.
         *
         * Nullish/omitted normalizes to canonical null so the fade out becomes a
         * safe no-op rather than reaching for a browser global.
         *
         * @property _delayScheduler
         * @type {DelayScheduler|null}
         * @private
         */
        this._delayScheduler = delayScheduler ?? null;

        return this._setupChildren();
    }

    /**
     * @for LoadingView
     * @method _setupChildren
     * @chainable
     * @private
     */
    _setupChildren() {
        this.$element = $(SELECTORS.DOM_SELECTORS.LOADING_VIEW);

        return this;
    }

    /**
     * @for LoadingView
     * @method destroy
     * @chainable
     */
    destroy() {
        this.$element = null;

        return this;
    }

    /**
     * Initiates a timer that will fadeout the `#loadingView`
     *
     * Called from `AppController` once everything is loaded
     * and the app is ready to start.
     *
     * @for LoadingView
     * @method complete
     */
    complete() {
        if (!this._delayScheduler) {
            return;
        }

        this._delayScheduler.schedule(() => {
            this.$element.fadeOut(1000);
            this.$element.css('pointerEvents', 'none');
        }, 1500);
    }
}
