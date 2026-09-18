import ava from 'ava';
import $ from 'jquery';
import TrafficModeStripView from '../../src/assets/scripts/client/ui/TrafficModeStripView';
import { TRAFFIC_MODE } from '../../src/assets/scripts/client/trafficGenerator/TrafficMode';

ava('.apply() shows only the arrivals strip section in arrivals mode', (t) => {
    const $arrivalsSection = $('<section hidden></section>');
    const $departuresSection = $('<section></section>');
    const view = new TrafficModeStripView($arrivalsSection, $departuresSection);

    const result = view.apply(TRAFFIC_MODE.ARRIVALS);

    t.is(result, view);
    t.false($arrivalsSection.prop('hidden'));
    t.true($departuresSection.prop('hidden'));
});

ava('.apply() shows only the departures strip section in departures mode', (t) => {
    const $arrivalsSection = $('<section></section>');
    const $departuresSection = $('<section hidden></section>');
    const view = new TrafficModeStripView($arrivalsSection, $departuresSection);

    view.apply(TRAFFIC_MODE.DEPARTURES);

    t.true($arrivalsSection.prop('hidden'));
    t.false($departuresSection.prop('hidden'));
});

ava('.apply() shows both strip sections in both mode', (t) => {
    const $arrivalsSection = $('<section hidden></section>');
    const $departuresSection = $('<section hidden></section>');
    const view = new TrafficModeStripView($arrivalsSection, $departuresSection);

    view.apply(TRAFFIC_MODE.BOTH);

    t.false($arrivalsSection.prop('hidden'));
    t.false($departuresSection.prop('hidden'));
});
