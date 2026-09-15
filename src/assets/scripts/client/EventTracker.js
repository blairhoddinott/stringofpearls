import { TRACKABLE_EVENT } from './constants/trackableEvents';

/**
 * Provide methods to send tracking events to google analytics
 *
 * Exported as a singleton
 *
 * The analytics provider is not read from the window here. The composition root
 * (`App`) constructs an `AnalyticsAdapter` around the browser transport and
 * hands it to `initAnalytics()`, so this singleton stays browser-global-free
 * and simply records `undefined` no-ops until it is configured.
 *
 * @class EventTracker
 */
class EventTracker {
    /**
     * @for EventTracker
     * @constructor
     */
    constructor() {
        /**
         * Configured analytics boundary, or `null` until `initAnalytics()` runs.
         *
         * @property _analyticsAdapter
         * @type {AnalyticsAdapter|null}
         * @private
         */
        this._analyticsAdapter = null;
    }

    /**
     * Configure the analytics boundary used to record events.
     *
     * Called by `App` at the composition root, before `AppController` is built
     * and before the initial-load event is recorded. A nullish adapter is
     * normalized to `null`; otherwise the exact adapter identity is retained.
     * Configuration itself is silent and never touches a browser global.
     *
     * @for EventTracker
     * @method initAnalytics
     * @param analyticsAdapter {AnalyticsAdapter|null} [optional]  boundary exposing `record(eventName, parameters)`
     */
    initAnalytics(analyticsAdapter = null) {
        this._analyticsAdapter = analyticsAdapter == null ? null : analyticsAdapter;
    }

    // TODO: UiController.onToggleTerrain() and other toggle methods seem to be expecting a
    // different order to these arguments, possibly screwing up the way events are reported to GA
    /**
     * Send a custom event to google analytics
     *
     * @for EventTracker
     * @method recordEvent
     * @param category {TRACKABLE_EVENT}
     * @param action {string}
     * @param label {string}
     * @param value {string|null} [optional]
     */
    recordEvent(category, action, label, value = null) {
        if (!this._isEnabled()) {
            console.error('Event tracking is disabled because we couldn\'t find `gtag` on the window');

            return;
        }

        // using underscores here to match google analytics api
        const event = {
            event_category: category,
            event_action: action,
            event_label: label
        };

        if (value) {
            event.value = value;
        }

        return this._analyticsAdapter.record(event.event_category, event);
    }

    /**
     * Track a click on an outbound link
     *
     * @for EventTracker
     * @method recordClickOnOutboundLink
     * @param url {string}
     */
    recordClickOnOutboundLink(url) {
        if (!this._isEnabled()) {
            console.error('Event tracking is disabled because we couldn\'t find `gtag` on the window');

            return;
        }

        // using underscores here to match google analytics api
        const event = {
            event_category: TRACKABLE_EVENT.OUTBOUND,
            event_label: url,
            transport_type: 'beacon'
        };

        return this._analyticsAdapter.record('click', event);
    }

    /**
     * @private
     * @method _isEnabled
     * @returns {boolean}
     */
    _isEnabled() {
        return this._analyticsAdapter !== null;
    }
}

export default new EventTracker();
