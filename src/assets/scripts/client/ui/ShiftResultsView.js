const SECONDS_PER_MINUTE = 60;

/**
 * Ordered, human-readable labels for the statistics shown on the results
 * screen. Order defines display order; keys map onto the summary DTO stats.
 *
 * @constant STAT_ROWS
 * @type {array<object>}
 */
const STAT_ROWS = [
    { key: 'uniqueAircraftHandled', label: 'Unique aircraft handled' },
    { key: 'arrivalsCompleted', label: 'Arrivals completed' },
    { key: 'departuresHandedOff', label: 'Departures handed off' },
    { key: 'caAlarms', label: 'CA alarms' },
    { key: 'separationLosses', label: 'Separation losses' },
    { key: 'collisions', label: 'Collisions' },
    { key: 'missedHandoffs', label: 'Missed handoffs' },
    { key: 'aircraftRemaining', label: 'Aircraft remaining at end' },
    { key: 'scorePerAircraft', label: 'Score per aircraft' }
];

/**
 * The shift results screen.
 *
 * A modal overlay rendering the finished shift: final score, a detailed
 * chronological scoring-event log (simulation timestamp, description, point
 * delta), summary statistics, and a Start another shift action. Keyboard focus
 * is trapped for accessibility.
 *
 * @class ShiftResultsView
 */
export default class ShiftResultsView {
    /**
     * @constructor
     * @param $element {JQuery} the results `<section>` element
     */
    constructor($element) {
        this.$element = $element;
        this._onStartAnother = null;
        this._previouslyFocusedElement = null;
        this._inertSiblings = [];

        this._onStartAnotherClick = () => {
            const onStartAnother = this._onStartAnother;

            this.hide();

            return onStartAnother();
        };

        this._onKeydown = (event) => {
            if (event.key !== 'Tab') {
                return;
            }

            const focusable = this._getFocusableElements();
            const firstElement = focusable[0];
            const lastElement = focusable[focusable.length - 1];

            if (event.shiftKey && event.target === firstElement) {
                event.preventDefault();
                lastElement.focus();

                return;
            }

            if (!event.shiftKey && event.target === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };
    }

    /**
     * Render and open the results screen.
     *
     * @for ShiftResultsView
     * @method show
     * @param summary {object} immutable shift summary DTO
     * @param onStartAnother {function}
     * @chainable
     */
    show(summary, onStartAnother) {
        this._onStartAnother = onStartAnother;
        this._previouslyFocusedElement = this.$element[0].ownerDocument.activeElement;
        this._isolateBackground();

        this.$element.find('[data-shift-final-score]').text(String(summary.finalScore));
        this._renderConfiguration(summary);
        this.$element.find('[data-shift-stats]').html(this._buildStatsHtml(summary.stats));
        this.$element.find('[data-shift-log]').html(this._buildLogHtml(summary.scoreEvents));

        this.$element
            .off('.shiftResults')
            .on('click.shiftResults', '[data-shift-start-another]', this._onStartAnotherClick)
            .on('keydown.shiftResults', this._onKeydown)
            .addClass('open')
            .attr('aria-hidden', 'false')
            .prop('hidden', false);
        this.$element.find('[data-shift-start-another]').trigger('focus');

        return this;
    }

    /**
     * Close the results screen.
     *
     * @for ShiftResultsView
     * @method hide
     * @chainable
     */
    hide() {
        this.$element
            .off('.shiftResults')
            .removeClass('open')
            .attr('aria-hidden', 'true')
            .prop('hidden', true);
        this._onStartAnother = null;
        this._restoreBackground();

        if (this._previouslyFocusedElement?.isConnected) {
            this._previouslyFocusedElement.focus();
        }

        this._previouslyFocusedElement = null;

        return this;
    }

    /**
     * Render the selected shift configuration and actual simulated time worked.
     * Values are assigned with `.text()` so configuration data never becomes HTML.
     *
     * @for ShiftResultsView
     * @method _renderConfiguration
     * @param summary {object}
     * @private
     */
    _renderConfiguration(summary) {
        const sector = summary.config.sector;
        const sectorLabel = `${sector.charAt(0).toUpperCase()}${sector.slice(1)}`;

        this.$element.find('[data-shift-config="airport"] dd').text(summary.config.airportIcao.toUpperCase());
        this.$element.find('[data-shift-config="sector"] dd').text(sectorLabel);
        this.$element.find('[data-shift-config="scheduledDuration"] dd')
            .text(this._formatTime(summary.scheduledShiftDurationSeconds));
        this.$element.find('[data-shift-config="elapsedDuration"] dd')
            .text(this._formatTime(summary.elapsedShiftDurationSeconds));
    }

    /**
     * @for ShiftResultsView
     * @method _buildStatsHtml
     * @param stats {object}
     * @return {string}
     * @private
     */
    _buildStatsHtml(stats) {
        return STAT_ROWS
            .map((row) => {
                const value = this._formatStatValue(stats[row.key]);

                return `<div class="shift-results-stat" data-stat="${row.key}">` +
                    `<dt>${row.label}</dt><dd>${value}</dd></div>`;
            })
            .join('');
    }

    /**
     * @for ShiftResultsView
     * @method _formatStatValue
     * @param value {number|null}
     * @return {string}
     * @private
     */
    _formatStatValue(value) {
        if (value === null) {
            return 'N/A';
        }

        return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }

    /**
     * @for ShiftResultsView
     * @method _buildLogHtml
     * @param scoreEvents {array<object>}
     * @return {string}
     * @private
     */
    _buildLogHtml(scoreEvents) {
        if (scoreEvents.length === 0) {
            return '<li class="shift-results-log_empty">No scoring events were recorded.</li>';
        }

        return scoreEvents
            .map((entry) => {
                const points = entry.points >= 0 ? `+${entry.points}` : String(entry.points);
                const pointsClass = entry.points < 0 ? ' shift-results-points_negative' : '';

                return `<li><span class="shift-results-log-time">${this._formatTime(entry.simulationTime)}</span>` +
                    `<span class="shift-results-log-description">${entry.description}</span>` +
                    `<span class="shift-results-log-points${pointsClass}">${points}</span></li>`;
            })
            .join('');
    }

    /**
     * Format a simulation time in seconds as `MM:SS`.
     *
     * @for ShiftResultsView
     * @method _formatTime
     * @param simulationTime {number}
     * @return {string}
     * @private
     */
    _formatTime(simulationTime) {
        const totalSeconds = Math.floor(simulationTime);
        const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
        const seconds = totalSeconds % SECONDS_PER_MINUTE;

        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    /**
     * @for ShiftResultsView
     * @method _getFocusableElements
     * @return {HTMLElement[]}
     * @private
     */
    _getFocusableElements() {
        return this.$element.find('button, [href], select, [tabindex]:not([tabindex="-1"])').toArray();
    }

    _isolateBackground() {
        this._inertSiblings = this.$element.siblings().toArray().map((element) => ({
            element,
            wasInert: element.inert
        }));
        this._inertSiblings.forEach(({ element }) => { element.inert = true; });
    }

    _restoreBackground() {
        this._inertSiblings.forEach(({ element, wasInert }) => { element.inert = wasInert; });
        this._inertSiblings = [];
    }
}
