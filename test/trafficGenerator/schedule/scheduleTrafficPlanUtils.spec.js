import ava from 'ava';
import {
    parseScheduledTimeToSecondsOfDay,
    secondsOfDayInZone,
    secondsUntilNextOccurrence,
    selectScheduleSubset,
    SCHEDULE_SUBSET_PERCENTS,
    DEFAULT_SCHEDULE_SUBSET_PERCENT
} from '../../../src/assets/scripts/client/trafficGenerator/schedule/scheduleTrafficPlanUtils';

ava('parseScheduledTimeToSecondsOfDay() converts local HH:mm into seconds of day', (t) => {
    t.is(parseScheduledTimeToSecondsOfDay('00:00'), 0);
    t.is(parseScheduledTimeToSecondsOfDay('00:07'), 7 * 60);
    t.is(parseScheduledTimeToSecondsOfDay('13:45'), (13 * 3600) + (45 * 60));
    t.is(parseScheduledTimeToSecondsOfDay('23:59'), (23 * 3600) + (59 * 60));
});

ava('parseScheduledTimeToSecondsOfDay() rejects malformed values', (t) => {
    t.throws(() => parseScheduledTimeToSecondsOfDay('24:00'));
    t.throws(() => parseScheduledTimeToSecondsOfDay('9:00'));
    t.throws(() => parseScheduledTimeToSecondsOfDay('12:60'));
    t.throws(() => parseScheduledTimeToSecondsOfDay(''));
});

ava('secondsOfDayInZone() resolves wall-clock instant through the airport IANA zone, not the host zone', (t) => {
    // 2026-07-15T12:00:00Z is 05:00:00 in America/Los_Angeles (PDT, UTC-7)
    const instant = new Date('2026-07-15T12:00:00Z');

    t.is(secondsOfDayInZone(instant, 'America/Los_Angeles'), 5 * 3600);
    t.is(secondsOfDayInZone(instant, 'UTC'), 12 * 3600);
    // 2026-07-15T12:00:00Z is 21:00 in Asia/Tokyo (UTC+9)
    t.is(secondsOfDayInZone(instant, 'Asia/Tokyo'), 21 * 3600);
});

ava('secondsUntilNextOccurrence() returns delay to the next 24h-aligned slot', (t) => {
    const ONE_DAY = 86400;
    // sim-zero local time-of-day is 05:00:00; a 05:30 slot is 30 min away
    t.is(secondsUntilNextOccurrence(5.5 * 3600, 5 * 3600, 0), 30 * 60);
    // after 40 minutes of sim time (now local 05:40), the same 05:30 slot is tomorrow
    t.is(secondsUntilNextOccurrence(5.5 * 3600, 5 * 3600, 40 * 60), ONE_DAY - (10 * 60));
    // a slot exactly at the current instant re-arms a full day out (never 0)
    t.is(secondsUntilNextOccurrence(5 * 3600, 5 * 3600, 0), ONE_DAY);
});

ava('selectScheduleSubset() defaults to 100 and preserves every flight in schedule order', (t) => {
    const flights = [
        { id: 'a', scheduledTime: '00:07' },
        { id: 'b', scheduledTime: '01:00' },
        { id: 'c', scheduledTime: '02:00' },
        { id: 'd', scheduledTime: '03:00' }
    ];

    t.is(DEFAULT_SCHEDULE_SUBSET_PERCENT, 100);
    t.deepEqual(selectScheduleSubset(flights), flights);
    t.deepEqual(selectScheduleSubset(flights, 100), flights);
});

ava('selectScheduleSubset() produces deterministic, strictly nested subsets', (t) => {
    const flights = Array.from({ length: 40 }, (_, i) => ({
        id: `flight-${i}`,
        scheduledTime: '12:00'
    }));

    const subset25 = selectScheduleSubset(flights, 25);
    const subset50 = selectScheduleSubset(flights, 50);
    const subset75 = selectScheduleSubset(flights, 75);
    const subset100 = selectScheduleSubset(flights, 100);

    // sizes scale with the percentage
    t.is(subset25.length, 10);
    t.is(subset50.length, 20);
    t.is(subset75.length, 30);
    t.is(subset100.length, 40);

    // deterministic across calls
    t.deepEqual(selectScheduleSubset(flights, 25), subset25);

    // strictly nested: each smaller subset is contained in the next larger one
    const idsIn = (subset) => new Set(subset.map((flight) => flight.id));
    const ids50 = idsIn(subset50);
    const ids75 = idsIn(subset75);
    const ids100 = idsIn(subset100);

    for (const flight of subset25) {
        t.true(ids50.has(flight.id));
    }
    for (const flight of subset50) {
        t.true(ids75.has(flight.id));
    }
    for (const flight of subset75) {
        t.true(ids100.has(flight.id));
    }
});

ava('selectScheduleSubset() rejects unsupported subset percentages', (t) => {
    t.deepEqual(SCHEDULE_SUBSET_PERCENTS, [25, 50, 75, 100]);
    t.throws(() => selectScheduleSubset([{ id: 'a', scheduledTime: '00:00' }], 33));
    t.throws(() => selectScheduleSubset([{ id: 'a', scheduledTime: '00:00' }], 0));
});
