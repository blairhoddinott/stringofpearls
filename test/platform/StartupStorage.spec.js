import ava from 'ava';
import sinon from 'sinon';
import StartupStorage from '../../src/assets/scripts/client/platform/StartupStorage';
import { STORAGE_KEY } from '../../src/assets/scripts/client/constants/storageKeys';
import { DEFAULT_AIRPORT_ICAO } from '../../src/assets/scripts/client/constants/airportConstants';

const buildStorage = (getReturn) => {
    const storageAdapter = { get: sinon.stub().returns(getReturn) };

    return { storageAdapter, startupStorage: new StartupStorage(storageAdapter) };
};

ava('.getInitialAirport() reads the stored ICAO with the last-airport key', (t) => {
    const { storageAdapter, startupStorage } = buildStorage('KPDX');

    startupStorage.getInitialAirport([{ icao: 'KPDX' }]);

    t.true(storageAdapter.get.calledOnceWithExactly(STORAGE_KEY.ATC_LAST_AIRPORT));
});

ava('.getInitialAirport() returns a valid stored ICAO lowercased', (t) => {
    const { startupStorage } = buildStorage('KPDX');

    const icao = startupStorage.getInitialAirport([{ icao: 'KPDX' }, { icao: 'KSFO' }]);

    t.is(icao, 'kpdx');
});

ava('.getInitialAirport() falls back to the default when the stored value is missing', (t) => {
    const { startupStorage } = buildStorage(null);

    const icao = startupStorage.getInitialAirport([{ icao: 'KPDX' }]);

    t.is(icao, DEFAULT_AIRPORT_ICAO);
});

ava('.getInitialAirport() falls back to the default when the stored value is not in the load list', (t) => {
    const { startupStorage } = buildStorage('KZZZ');

    const icao = startupStorage.getInitialAirport([{ icao: 'KPDX' }]);

    t.is(icao, DEFAULT_AIRPORT_ICAO);
});

ava('.getInitialAirport() requires an exact match against airport.icao', (t) => {
    const { startupStorage } = buildStorage('kpdx');

    const icao = startupStorage.getInitialAirport([{ icao: 'KPDX' }]);

    t.is(icao, DEFAULT_AIRPORT_ICAO);
});
