import $ from 'jquery';

/**
 * The Start Shift landing page.
 *
 * A modal overlay presenting a semantic form: controller sector, airport (all
 * enabled airports, defaulting to KSEA), and shift length. The airport options
 * are supplied by the `ShiftController` from the real airport data rather than
 * inferred from the DOM. Submitting reports the chosen configuration and closes
 * the modal. Keyboard focus is trapped within the form for accessibility.
 *
 * @class ShiftStartView
 */
export default class ShiftStartView {
    /**
     * @constructor
     * @param $element {JQuery} the landing-page `<section>` element
     */
    constructor($element) {
        this.$element = $element;
        this._onStart = null;
        this._previouslyFocusedElement = null;
        this._inertSiblings = [];

        this._onSubmit = (event) => {
            event.preventDefault();

            const config = {
                sector: this.$element.find('[data-shift-sector]').val(),
                airportIcao: this.$element.find('[data-shift-airport]').val(),
                shiftLengthMinutes: parseInt(this.$element.find('[data-shift-length]').val(), 10)
            };
            const onStart = this._onStart;
            const result = onStart(config);

            this.hide();

            return result;
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
     * Open the landing page.
     *
     * @for ShiftStartView
     * @method show
     * @param airportOptions {array<object>} `{ icao, name }`
     * @param defaultIcao {string}
     * @param onStart {function} called with the chosen configuration
     * @chainable
     */
    show(airportOptions, defaultIcao, onStart) {
        this._onStart = onStart;
        this._previouslyFocusedElement = this.$element[0].ownerDocument.activeElement;
        this._isolateBackground();
        this._renderAirportOptions(airportOptions, defaultIcao);

        this.$element
            .off('.shiftStart')
            .on('submit.shiftStart', '[data-shift-start-form]', this._onSubmit)
            .on('keydown.shiftStart', this._onKeydown)
            .addClass('open')
            .attr('aria-hidden', 'false')
            .prop('hidden', false);
        this.$element.find('[data-shift-sector]').trigger('focus');

        return this;
    }

    /**
     * Close the landing page.
     *
     * @for ShiftStartView
     * @method hide
     * @chainable
     */
    hide() {
        this.$element
            .off('.shiftStart')
            .removeClass('open')
            .attr('aria-hidden', 'true')
            .prop('hidden', true);
        this._onStart = null;
        this._restoreBackground();

        if (this._previouslyFocusedElement?.isConnected) {
            this._previouslyFocusedElement.focus();
        }

        this._previouslyFocusedElement = null;

        return this;
    }

    /**
     * Render the airport `<option>` list and select the default.
     *
     * @for ShiftStartView
     * @method _renderAirportOptions
     * @param airportOptions {array<object>}
     * @param defaultIcao {string}
     * @private
     */
    _renderAirportOptions(airportOptions, defaultIcao) {
        const $airportSelect = this.$element.find('[data-shift-airport]').empty();

        airportOptions.forEach((airport) => {
            $('<option>')
                .val(airport.icao)
                .text(`${airport.name} (${airport.icao.toUpperCase()})`)
                .appendTo($airportSelect);
        });

        $airportSelect.val(defaultIcao);
    }

    /**
     * @for ShiftStartView
     * @method _getFocusableElements
     * @return {HTMLElement[]}
     * @private
     */
    _getFocusableElements() {
        return this.$element.find('select, button').toArray();
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
