import ava from 'ava';
import sinon from 'sinon';
import ScheduledSpawnPatternModel from '../../../src/assets/scripts/client/trafficGenerator/schedule/ScheduledSpawnPatternModel';
import { FLIGHT_CATEGORY } from '../../../src/assets/scripts/client/constants/aircraftConstants';
import { INVALID_NUMBER } from '../../../src/assets/scripts/client/constants/globalConstants';

const ARRIVAL_FLIGHT_MOCK = {
    id: 'arrival-aal3252-kmia-ksea',
    category: 'arrival',
    scheduledTime: '05:30',
    airlineIcao: 'aal',
    flightNumber: '3252',
    originIcao: 'KMIA',
    destinationIcao: 'KSEA'
};

const DEPARTURE_FLIGHT_MOCK = {
    id: 'departure-asa328-ksea-kord',
    category: 'departure',
    scheduledTime: '00:17',
    airlineIcao: 'asa',
    flightNumber: '328',
    originIcao: 'KSEA',
    destinationIcao: 'KORD',
    aircraftTypeIcao: 'B739'
};

const CONTEXT = {
    airportIcao: 'KSEA',
    timezone: 'America/Los_Angeles',
    zoneSecondsOfDayAtSimZero: 5 * 3600
};

ava('carries the scheduled identity needed by the spawn-pattern mapping slice', (t) => {
    const model = new ScheduledSpawnPatternModel(DEPARTURE_FLIGHT_MOCK, CONTEXT);

    t.is(model.id, 'departure-asa328-ksea-kord');
    t.is(model.category, FLIGHT_CATEGORY.DEPARTURE);
    t.is(model.scheduledTime, '00:17');
    t.is(model.scheduledSecondsOfDay, 17 * 60);
    t.is(model.airlineIcao, 'asa');
    t.is(model.flightNumber, '328');
    t.is(model.originIcao, 'KSEA');
    t.is(model.destinationIcao, 'KORD');
    t.is(model.aircraftTypeIcao, 'B739');
    t.is(model.airportIcao, 'KSEA');
    t.is(model.timezone, 'America/Los_Angeles');
});

ava('defaults an omitted aircraftTypeIcao to null', (t) => {
    const model = new ScheduledSpawnPatternModel(ARRIVAL_FLIGHT_MOCK, CONTEXT);

    t.is(model.aircraftTypeIcao, null);
});

ava('exposes the scheduler-facing spawn-pattern interface', (t) => {
    const model = new ScheduledSpawnPatternModel(ARRIVAL_FLIGHT_MOCK, CONTEXT);

    t.is(model.scheduleId, INVALID_NUMBER);
    t.deepEqual(model.preSpawnAircraftList, []);
    t.is(typeof model.cycleStart, 'function');
    t.is(typeof model.getNextDelayValue, 'function');
    t.is(typeof model.createPreSpawnAircraft, 'function');
});

ava('isArrival()/isDeparture()/isAirborneAtSpawn() reflect the flight category', (t) => {
    const arrival = new ScheduledSpawnPatternModel(ARRIVAL_FLIGHT_MOCK, CONTEXT);
    const departure = new ScheduledSpawnPatternModel(DEPARTURE_FLIGHT_MOCK, CONTEXT);

    t.true(arrival.isArrival());
    t.false(arrival.isDeparture());
    t.true(arrival.isAirborneAtSpawn());

    t.true(departure.isDeparture());
    t.false(departure.isArrival());
    t.false(departure.isAirborneAtSpawn());
});

ava('getNextDelayValue() aligns the slot to the airport-local repeating day', (t) => {
    const ONE_DAY = 86400;
    const model = new ScheduledSpawnPatternModel(ARRIVAL_FLIGHT_MOCK, CONTEXT);

    // sim-zero local time-of-day is 05:00; the 05:30 slot is 30 minutes away
    t.is(model.getNextDelayValue(0), 30 * 60);
    // ten minutes after the slot passes, it re-arms for the next day
    t.is(model.getNextDelayValue(40 * 60), ONE_DAY - (10 * 60));
});

ava('createPreSpawnAircraft() is inert until the mapping slice provides spawn geometry', (t) => {
    const model = new ScheduledSpawnPatternModel(ARRIVAL_FLIGHT_MOCK, CONTEXT);
    const aircraftController = {
        createPreSpawnAircraftWithSpawnPatternModel: sinon.stub()
    };

    t.notThrows(() => model.createPreSpawnAircraft(aircraftController));
    t.true(aircraftController.createPreSpawnAircraftWithSpawnPatternModel.notCalled);
});
