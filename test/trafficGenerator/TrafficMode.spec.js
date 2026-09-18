import ava from 'ava';
import TrafficMode, { TRAFFIC_MODE } from '../../src/assets/scripts/client/trafficGenerator/TrafficMode';
import { FLIGHT_CATEGORY } from '../../src/assets/scripts/client/constants/aircraftConstants';

ava('defaults to both and allows every existing flight category', (t) => {
    const trafficMode = new TrafficMode();

    t.is(trafficMode.value, TRAFFIC_MODE.BOTH);
    t.true(trafficMode.allows(FLIGHT_CATEGORY.ARRIVAL));
    t.true(trafficMode.allows(FLIGHT_CATEGORY.DEPARTURE));
    t.true(trafficMode.allows(FLIGHT_CATEGORY.OVERFLIGHT));
});

ava('arrivals mode allows arrivals and excludes every other category', (t) => {
    const trafficMode = new TrafficMode();

    t.is(trafficMode.select(TRAFFIC_MODE.ARRIVALS), TRAFFIC_MODE.ARRIVALS);
    t.is(trafficMode.value, TRAFFIC_MODE.ARRIVALS);
    t.true(trafficMode.allows(FLIGHT_CATEGORY.ARRIVAL));
    t.false(trafficMode.allows(FLIGHT_CATEGORY.DEPARTURE));
    t.false(trafficMode.allows(FLIGHT_CATEGORY.OVERFLIGHT));
});

ava('departures mode allows departures and excludes every other category', (t) => {
    const trafficMode = new TrafficMode();

    trafficMode.select(TRAFFIC_MODE.DEPARTURES);

    t.false(trafficMode.allows(FLIGHT_CATEGORY.ARRIVAL));
    t.true(trafficMode.allows(FLIGHT_CATEGORY.DEPARTURE));
    t.false(trafficMode.allows(FLIGHT_CATEGORY.OVERFLIGHT));
});

ava('rejects an unknown mode without changing the current selection', (t) => {
    const trafficMode = new TrafficMode();

    const error = t.throws(() => trafficMode.select('overflights'));

    t.true(error instanceof RangeError);
    t.is(error.message, 'Unknown traffic mode: overflights');
    t.is(trafficMode.value, TRAFFIC_MODE.BOTH);
});
