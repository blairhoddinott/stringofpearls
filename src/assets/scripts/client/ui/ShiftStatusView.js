import { SHIFT_STATE } from '../shift/shiftConstants';

const SECONDS_PER_MINUTE = 60;
const ACTIVE_CLASSNAME = 'shift-status_active';
const CLEARING_CLASSNAME = 'shift-status_clearing';

/**
 * The in-scope shift status readout.
 *
 * Renders the shift countdown near the score area and owns the red End shift
 * button in the footer. It is a thin presentation layer driven each frame by
 * the `ShiftController`.
 *
 * @class ShiftStatusView
 */
export default class ShiftStatusView {
    /**
     * @constructor
     * @param $element {JQuery} the status container element
     */
    constructor($element) {
        this.$element = $element;
        this.$countdown = $element.find('[data-shift-countdown]');
        this.$endShiftButton = $element.find('[data-shift-end-button]');
    }

    /**
     * Bind the End shift button click to the supplied handler.
     *
     * @for ShiftStatusView
     * @method setEndShiftHandler
     * @param handler {function}
     * @chainable
     */
    setEndShiftHandler(handler) {
        this.$endShiftButton
            .off('click.shiftStatus')
            .on('click.shiftStatus', handler);

        return this;
    }

    /**
     * Release DOM handlers owned by this view.
     *
     * @chainable
     */
    destroy() {
        this.$endShiftButton.off('.shiftStatus');

        return this;
    }

    /**
     * Refresh the readout for the current shift state and remaining time.
     *
     * @for ShiftStatusView
     * @method update
     * @param status {object} `{ state, remainingSeconds }`
     * @chainable
     */
    update({ state, remainingSeconds }) {
        const isClearing = state === SHIFT_STATE.CLEARING;

        this.$element
            .toggleClass(ACTIVE_CLASSNAME, true)
            .toggleClass(CLEARING_CLASSNAME, isClearing);
        this.$countdown.text(isClearing ? 'CLEARING' : this._formatTime(remainingSeconds));

        return this;
    }

    /**
     * Clear the readout when no shift is active.
     *
     * @for ShiftStatusView
     * @method reset
     * @chainable
     */
    reset() {
        this.$element
            .removeClass(ACTIVE_CLASSNAME)
            .removeClass(CLEARING_CLASSNAME);
        this.$countdown.text('');

        return this;
    }

    /**
     * @for ShiftStatusView
     * @method _formatTime
     * @param remainingSeconds {number}
     * @return {string}
     * @private
     */
    _formatTime(remainingSeconds) {
        const totalSeconds = Math.max(0, Math.floor(remainingSeconds));
        const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
        const seconds = totalSeconds % SECONDS_PER_MINUTE;

        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}
