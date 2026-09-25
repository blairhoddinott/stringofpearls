import ava from 'ava';
import WeatherController from '../../src/assets/scripts/client/weather/WeatherController';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';
import { EventBusClass } from '../../src/assets/scripts/client/lib/EventBus';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

const buildObservation = (overrides = {}) => ({
    station: 'KSFO',
    observedAt: '2026-09-25T09:56:00.000Z',
    raw: 'METAR KSFO 250956Z 26013G20KT 10SM FEW004 BKN009 16/14 A2996',
    wind: {
        directionDegrees: 260,
        speedKnots: 13,
        gustKnots: 20,
        variable: false
    },
    altimeterHpa: 1014.6,
    usableForSimulation: true,
    ...overrides
});

ava('start publishes loading then fresh live weather and schedules thirty minutes', async (t) => {
    const calls = [];
    const scheduled = [];
    const states = [];
    const eventBus = new EventBusClass();
    const weatherClient = {
        getMetar: async (station) => {
            calls.push(station);
            return buildObservation();
        }
    };
    const scheduler = {
        cancel: () => {},
        schedule: (callback, delay) => {
            scheduled.push({ callback, delay });
            return scheduled.length;
        }
    };
    const controller = new WeatherController(
        weatherClient,
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        scheduler,
        eventBus
    );
    eventBus.on(EVENT.WEATHER_CHANGE, (state) => states.push(state));

    await controller.start('ksfo');

    t.deepEqual(calls, ['KSFO']);
    t.deepEqual(states, [
        {
            station: 'KSFO',
            status: 'loading',
            observation: null,
            usesLiveWeather: false
        },
        {
            station: 'KSFO',
            status: 'available',
            observation: buildObservation(),
            usesLiveWeather: true
        }
    ]);
    t.is(scheduled.length, 1);
    t.is(scheduled[0].delay, THIRTY_MINUTES_MS);
});

ava('current unusable weather remains displayable and retries after five minutes', async (t) => {
    const states = [];
    const delays = [];
    const eventBus = new EventBusClass();
    const observation = buildObservation({
        wind: {
            directionDegrees: null,
            speedKnots: 8,
            gustKnots: null,
            variable: true
        },
        usableForSimulation: false
    });
    const controller = new WeatherController(
        { getMetar: async () => observation },
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        {
            cancel: () => {},
            schedule: (_callback, delay) => { delays.push(delay); return 1; }
        },
        eventBus
    );
    eventBus.on(EVENT.WEATHER_CHANGE, (state) => states.push(state));

    await controller.start('KSFO');

    t.deepEqual(states[1], {
        station: 'KSFO',
        status: 'available',
        observation,
        usesLiveWeather: false
    });
    t.deepEqual(delays, [FIVE_MINUTES_MS]);
});

ava('missing weather publishes unavailable and retries after five minutes', async (t) => {
    const states = [];
    const delays = [];
    const eventBus = new EventBusClass();
    const controller = new WeatherController(
        { getMetar: async () => null },
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        {
            cancel: () => {},
            schedule: (_callback, delay) => { delays.push(delay); return 1; }
        },
        eventBus
    );
    eventBus.on(EVENT.WEATHER_CHANGE, (state) => states.push(state));

    await controller.start('KSFO');

    t.deepEqual(states[1], {
        station: 'KSFO',
        status: 'unavailable',
        observation: null,
        usesLiveWeather: false
    });
    t.deepEqual(delays, [FIVE_MINUTES_MS]);
});

ava('old usable weather is applied as stale and retries after five minutes', async (t) => {
    const states = [];
    const delays = [];
    const eventBus = new EventBusClass();
    const observation = buildObservation({ observedAt: '2026-09-25T08:00:00.000Z' });
    const controller = new WeatherController(
        { getMetar: async () => observation },
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        {
            cancel: () => {},
            schedule: (_callback, delay) => { delays.push(delay); return 1; }
        },
        eventBus
    );
    eventBus.on(EVENT.WEATHER_CHANGE, (state) => states.push(state));

    await controller.start('KSFO');

    t.deepEqual(states[1], {
        station: 'KSFO',
        status: 'stale',
        observation,
        usesLiveWeather: true
    });
    t.deepEqual(delays, [FIVE_MINUTES_MS]);
});

ava('startup retrieval failure publishes unavailable and retries without rejecting', async (t) => {
    const states = [];
    const delays = [];
    const eventBus = new EventBusClass();
    const controller = new WeatherController(
        { getMetar: async () => { throw new Error('offline'); } },
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        {
            cancel: () => {},
            schedule: (_callback, delay) => { delays.push(delay); return 1; }
        },
        eventBus
    );
    eventBus.on(EVENT.WEATHER_CHANGE, (state) => states.push(state));

    await t.notThrowsAsync(controller.start('KSFO'));

    t.deepEqual(states[1], {
        station: 'KSFO',
        status: 'unavailable',
        observation: null,
        usesLiveWeather: false
    });
    t.deepEqual(delays, [FIVE_MINUTES_MS]);
});

ava('failed refresh retains the last observation as stale live weather', async (t) => {
    const states = [];
    const scheduled = [];
    const eventBus = new EventBusClass();
    const observation = buildObservation();
    let calls = 0;
    const controller = new WeatherController(
        {
            getMetar: async () => {
                calls += 1;
                if (calls === 1) {
                    return observation;
                }
                throw new Error('offline');
            }
        },
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        {
            cancel: () => {},
            schedule: (callback, delay) => {
                scheduled.push({ callback, delay });
                return scheduled.length;
            }
        },
        eventBus
    );
    eventBus.on(EVENT.WEATHER_CHANGE, (state) => states.push(state));

    await controller.start('KSFO');
    await scheduled[0].callback();

    t.deepEqual(states[2], {
        station: 'KSFO',
        status: 'stale',
        observation,
        usesLiveWeather: true
    });
    t.deepEqual(scheduled.map(({ delay }) => delay), [THIRTY_MINUTES_MS, FIVE_MINUTES_MS]);
});

ava('no-report refresh retains the last observation as stale live weather', async (t) => {
    const states = [];
    const callbacks = [];
    const eventBus = new EventBusClass();
    const observation = buildObservation();
    let calls = 0;
    const controller = new WeatherController(
        {
            getMetar: async () => {
                calls += 1;
                return calls === 1 ? observation : null;
            }
        },
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        {
            cancel: () => {},
            schedule: (callback) => { callbacks.push(callback); return callbacks.length; }
        },
        eventBus
    );
    eventBus.on(EVENT.WEATHER_CHANGE, (state) => states.push(state));

    await controller.start('KSFO');
    await callbacks[0]();

    t.deepEqual(states[2], {
        station: 'KSFO',
        status: 'stale',
        observation,
        usesLiveWeather: true
    });
});

ava('airport switch ignores the previous station late response', async (t) => {
    const states = [];
    const scheduled = [];
    const pending = {};
    const eventBus = new EventBusClass();
    const controller = new WeatherController(
        {
            getMetar: (station) => new Promise((resolve) => { pending[station] = resolve; })
        },
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        {
            cancel: () => {},
            schedule: (callback, delay) => {
                scheduled.push({ callback, delay });
                return scheduled.length;
            }
        },
        eventBus
    );
    eventBus.on(EVENT.WEATHER_CHANGE, (state) => states.push(state));

    const first = controller.start('KSFO');
    const second = controller.start('KJFK');
    const kjfkObservation = buildObservation({ station: 'KJFK' });
    pending.KJFK(kjfkObservation);
    await second;
    pending.KSFO(buildObservation());
    await first;

    t.deepEqual(states, [
        { station: 'KSFO', status: 'loading', observation: null, usesLiveWeather: false },
        { station: 'KJFK', status: 'loading', observation: null, usesLiveWeather: false },
        { station: 'KJFK', status: 'available', observation: kjfkObservation, usesLiveWeather: true }
    ]);
    t.is(scheduled.length, 1);
});

ava('starting a new station cancels the existing scheduled poll', async (t) => {
    const cancelled = [];
    let nextHandle = 40;
    const eventBus = new EventBusClass();
    const controller = new WeatherController(
        { getMetar: async (station) => buildObservation({ station }) },
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        {
            cancel: (handle) => cancelled.push(handle),
            schedule: () => {
                nextHandle += 1;
                return nextHandle;
            }
        },
        eventBus
    );

    await controller.start('KSFO');
    await controller.start('KJFK');

    t.deepEqual(cancelled, [41]);
});

ava('destroy cancels the scheduled poll', async (t) => {
    const cancelled = [];
    const eventBus = new EventBusClass();
    const controller = new WeatherController(
        { getMetar: async () => buildObservation() },
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        {
            cancel: (handle) => cancelled.push(handle),
            schedule: () => 73
        },
        eventBus
    );

    await controller.start('KSFO');
    controller.destroy();

    t.deepEqual(cancelled, [73]);
});

ava('airport change events start weather retrieval for the new station', async (t) => {
    const calls = [];
    const eventBus = new EventBusClass();
    const controller = new WeatherController(
        {
            getMetar: async (station) => {
                calls.push(station);
                return buildObservation({ station });
            }
        },
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        {
            cancel: () => {},
            schedule: () => 1
        },
        eventBus
    );

    await controller.start('KSFO');
    eventBus.trigger(EVENT.AIRPORT_CHANGE, { icao: 'kjfk' });

    t.deepEqual(calls, ['KSFO', 'KJFK']);
});

ava('destroy removes the airport change subscription', (t) => {
    const eventBus = new EventBusClass();
    const controller = new WeatherController(
        { getMetar: async () => null },
        { now: () => new Date('2026-09-25T10:05:00.000Z') },
        { cancel: () => {}, schedule: () => 1 },
        eventBus
    );

    controller.destroy();

    t.false(eventBus.has(EVENT.AIRPORT_CHANGE));
});
