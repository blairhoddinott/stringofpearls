import { TRAFFIC_MODE } from '../trafficGenerator/TrafficMode';

export default class TrafficModeStripView {
    constructor($arrivalsSection, $departuresSection) {
        this.$arrivalsSection = $arrivalsSection;
        this.$departuresSection = $departuresSection;
    }

    apply(trafficMode) {
        if (trafficMode === TRAFFIC_MODE.ARRIVALS) {
            this.$arrivalsSection.prop('hidden', false);
            this.$departuresSection.prop('hidden', true);
        }

        if (trafficMode === TRAFFIC_MODE.DEPARTURES) {
            this.$arrivalsSection.prop('hidden', true);
            this.$departuresSection.prop('hidden', false);
        }

        if (trafficMode === TRAFFIC_MODE.BOTH) {
            this.$arrivalsSection.prop('hidden', false);
            this.$departuresSection.prop('hidden', false);
        }

        return this;
    }
}
