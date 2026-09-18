export default class TrafficModeSelectionView {
    constructor($element) {
        this.$element = $element;
        this._onSelect = null;
        this._onClick = (event) => {
            const trafficMode = event.currentTarget.getAttribute('data-traffic-mode');
            const result = this._onSelect(trafficMode);

            this.hide();

            return result;
        };
        this._onKeydown = (event) => {
            if (event.key !== 'Tab') {
                return;
            }

            const buttons = this.$element.find('[data-traffic-mode]').toArray();
            const firstButton = buttons[0];
            const lastButton = buttons[buttons.length - 1];

            if (event.shiftKey && event.target === firstButton) {
                event.preventDefault();
                lastButton.focus();

                return;
            }

            if (!event.shiftKey && event.target === lastButton) {
                event.preventDefault();
                firstButton.focus();
            }
        };
    }

    show(onSelect) {
        this._onSelect = onSelect;
        this.$element
            .off('.trafficModeSelection')
            .on('click.trafficModeSelection', '[data-traffic-mode]', this._onClick)
            .on('keydown.trafficModeSelection', this._onKeydown)
            .addClass('open')
            .attr('aria-hidden', 'false');
        this.$element.find('[data-traffic-mode]').first().trigger('focus');

        return this;
    }

    hide() {
        this.$element
            .off('.trafficModeSelection')
            .removeClass('open')
            .attr('aria-hidden', 'true');
        this._onSelect = null;

        return this;
    }
}
