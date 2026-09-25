import ava from 'ava';
import WeatherClient from '../../src/assets/scripts/client/platform/WeatherClient';

ava('getMetar requests the fixed same-origin station route and returns its observation', async (t) => {
    const calls = [];
    const observation = { station: 'KSFO', raw: 'METAR KSFO ...' };
    const client = new WeatherClient(async (url, options) => {
        calls.push({ url, options });
        return {
            ok: true,
            json: async () => ({ observation })
        };
    });

    const result = await client.getMetar('ksfo');

    t.deepEqual(result, observation);
    t.deepEqual(calls, [{
        url: '/api/weather/metar/KSFO',
        options: {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            method: 'GET'
        }
    }]);
});

ava('getMetar rejects a non-success response before reading its body', async (t) => {
    let bodyRead = false;
    const client = new WeatherClient(async () => ({
        ok: false,
        status: 502,
        json: async () => { bodyRead = true; return { error: 'weather-unavailable' }; }
    }));

    const error = await t.throwsAsync(() => client.getMetar('KSFO'));

    t.is(error.status, 502);
    t.false(bodyRead);
});
