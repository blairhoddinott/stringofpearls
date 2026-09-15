import $ from 'jquery';
import EventBus from '../lib/EventBus';
import reportAsyncError from '../platform/reportAsyncError';
import { SELECTORS } from '../constants/selectors';
import { STORAGE_KEY } from '../constants/storageKeys';
import { EVENT } from '../constants/eventNames';

/**
 * The controller class for the in-game changelog.
 *
 * @class ChangelogController
 */
export default class ChangelogController {
    /**
     * @constructor
     * @param {ContentQueue} contentQueue
     * @param {StorageAdapter} storageAdapter  persistence boundary for the
     *                                         last-played version
     * @param {Function} [reportError] reporter for processing-time exceptions,
     *                                 defaults to {@link reportAsyncError}
     */
    constructor(contentQueue, storageAdapter, reportError = reportAsyncError) {
        /**
         * Persistence boundary used to read and write the last-played version.
         *
         * @property _storageAdapter
         * @type {StorageAdapter}
         */
        this._storageAdapter = storageAdapter;

        /**
         * Reporter used to surface processing-time exceptions on the browser's
         * uncaught-error channel without leaking an unhandled rejection.
         *
         * @property _reportError
         * @type {Function}
         * @default reportAsyncError
         */
        this._reportError = reportError;

        /**
         * A string representation of the actual changelog.
         *
         * @property content
         * @type {String}
         */
        this.content = null;

        /**
         * The content queue, used to load in the changelog data
         *
         * @property contentQueue
         * @type {ContentQueue}
         */
        this.contentQueue = null;

        /**
         * The DOM of the changelog container, containing version, data, and dismiss.
         *
         * @property $changelogContainer
         * @type {JQuery|HTMLElement}
         */
        this.$changelogContainer = null;

        /**
         * Changelog data element - where the text goes
         *
         * @property $changelogData
         * @type {JQuery|HTMLElement}
         */
        this.$changelogData = null;

        /**
         * Toggle selector for the changelog
         * You know, the button thing
         *
         * @property $changelogToggle
         * @type {JQuery|HTMLElement}
         */
        this.$changelogToggle = null;

        /**
         * local reference to the EventBus
         *
         * @property _eventBus
         * @type {EventBus}
         */
        this._eventBus = null;

        this.init(contentQueue);
    }

    // ------------------------------ LIFECYCLE ------------------------------

    /**
     * @for ChangelogController
     * @method init
     * @chainable
     */
    init(contentQueue) {
        this.content = '<p>Loading...</p>';
        this.contentQueue = contentQueue;
        this._eventBus = EventBus;

        this._createChildren();
        this.$changelogData.html(this.content);
        this._createHandlers();
        this.enable();
        this.loadChangelogContent();

        return this;
    }

    /**
     * @for ChangelogController
     * @method reset
     * @chainable
     */
    reset() {
        this.content = null;
        this.contentQueue = null;
        this.$changelogContainer = null;
        this.$changelogData = null;
        this.$changelogToggle = null;
        this._eventBus = null;

        this._resetHandlers();
        this.disable();

        return this;
    }

    /**
     * @for ChangelogController
     * @method enable
     */
    enable() {
        this._eventBus.on(EVENT.TOGGLE_CHANGELOG, this._onChangelogToggleHandler);
    }

    /**
     * @for ChangelogController
     * @method disable
     */
    disable() {
        this.$changelogToggle.off(EVENT.TOGGLE_CHANGELOG, this._onChangelogToggleHandler);
    }

    /**
     * Sets up the DOM class properties
     *
     * @for ChangelogController
     * @method _createChildren
     * @private
     * @chainable
     */
    _createChildren() {
        this.$changelogContainer = $(SELECTORS.DOM_SELECTORS.CHANGELOG_CONTAINER);
        this.$changelogData = $(SELECTORS.DOM_SELECTORS.CHANGELOG_CONTENT);
        this.$changelogToggle = $(SELECTORS.DOM_SELECTORS.TOGGLE_CHANGELOG);

        return this;
    }

    /**
     * Sets up the event handlers
     *
     * @for ChangelogController
     * @method _createHandlers
     * @private
     * @chainable
     */
    _createHandlers() {
        this._onChangelogToggleHandler = this._onChangelogToggle.bind(this);

        return this;
    }


    /**
     * Sets up the event handlers
     *
     * @for ChangelogController
     * @method _resetHandlers
     * @private
     * @chainable
     */
    _resetHandlers() {
        this._onChangelogToggleHandler = null;

        return this;
    }

    // ------------------------------ PUBLIC ------------------------------

    /**
     * Calls a changelog loader asynchronously. Calls `onLoadComplete` when
     * the changelog data is successfully loaded. Stores data in
     * `this.content`.
     *
     * Returns the complete promise chain so composition and tests can observe
     * settlement.
     *
     * @for ChangelogController
     * @method loadChangelogContent
     * @return {Promise}
     */
    loadChangelogContent() {
        return this.contentQueue.addPromise({
            url: 'assets/changelog.json',
            immediate: true
        }).then(
            (data) => {
                // Guard payload application separately from the transport failure
                // path so a throwing content update or `onLoadComplete` surfaces on
                // the browser uncaught-error channel instead of being mislabeled as
                // a load failure or leaking as an unhandled rejection.
                try {
                    this.content = data.changelog;
                    this.onLoadComplete();
                } catch (error) {
                    this._reportError(error);
                }
            },
            () => {
                // Transport failure is intentionally quiet: the changelog is
                // supplementary content, so a failed load leaves the placeholder
                // in place with no diagnostic or UI replacement.
            }
        );
    }

    /**
     * Called when the changelog content has been loaded and the resolving
     * promise from `loadChangelogContent` runs its success handler.
     *
     * @for ChangelogController
     * @method onLoadComplete
     */
    onLoadComplete() {
        this.isLoaded = true;
        this.$changelogData.html(this.content);

        if (this._shouldShowOnLoad()) {
            this._onChangelogToggle();
        }
    }

    // ------------------------------ PRIVATE ------------------------------

    /**
     * Toggles visibility.
     *
     * @for ChangelogController
     * @method _onChangelogToggle
     * @private
     */
    _onChangelogToggle() {
        this.$changelogToggle.toggleClass(SELECTORS.CLASSNAMES.ACTIVE);
        this.$changelogContainer.toggleClass(SELECTORS.CLASSNAMES.OPEN);
    }

    /**
     * Determines whether the user has played this version before,
     * and if the changelog should display on load.
     *
     * @for ChangelogController
     * @method _shouldShowOnLoad
     * @returns {Boolean} if the user has not played this version
     */
    _shouldShowOnLoad() {
        const storedVersion = this._storageAdapter.get(STORAGE_KEY.ATC_LAST_VERSION);
        // Web Storage `getItem()` returns `null` for a missing key, whereas the
        // legacy `storage[key]` property access returned `undefined`. Normalize
        // the missing case back to `undefined` so the comparison preserves the
        // historical behavior when `this.version` is also undefined.
        const lastPlayedVersion = storedVersion === null ? undefined : storedVersion;
        const currentVersion = this.version;
        const shouldDisplayChangelog = lastPlayedVersion !== currentVersion;

        if (shouldDisplayChangelog) {
            this._storageAdapter.set(STORAGE_KEY.ATC_LAST_VERSION, currentVersion);
        }

        return shouldDisplayChangelog;
    }
}
