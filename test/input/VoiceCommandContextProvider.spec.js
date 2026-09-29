import ava from 'ava';

import VoiceCommandContextProvider from '../../src/assets/scripts/client/input/VoiceCommandContextProvider';

// Minimal fakes shaped like the real singletons the provider reads from. Each
// exposes only the exact public surface the provider is allowed to touch:
//   - AircraftController.aircraft.list -> [AircraftModel]
//   - NavigationLibrary.realFixes      -> [FixModel]
//   - AirportController.airport_get()  -> AirportModel (or null)
const buildAircraft = (callsign, airlineCallsign, flightNumber) => ({
    callsign,
    airlineCallsign,
    flightNumber
});

const pick = (overrides, key, fallback) => (key in overrides ? overrides[key] : fallback);

const buildProvider = (overrides = {}) => {
    const aircraftController = pick(overrides, 'aircraftController', {
        aircraft: {
            list: [
                buildAircraft('AAL1234', 'American', '1234'),
                buildAircraft('ACA420', 'Air Canada', '420')
            ]
        }
    });
    const navigationLibrary = pick(overrides, 'navigationLibrary', {
        realFixes: [{ name: 'BOACH' }, { name: 'DUMBA' }]
    });
    const airportController = pick(overrides, 'airportController', {
        airport_get: () => ({
            // real AirportModel.runways getter returns chunked runway-end pairs
            runways: [
                [{ name: '07L' }, { name: '25R' }],
                [{ name: '07R' }, { name: '25L' }]
            ]
        })
    });

    return new VoiceCommandContextProvider({ aircraftController, navigationLibrary, airportController });
};

// -------------------------------------------------------------------------- //
// happy path
// -------------------------------------------------------------------------- //

ava('derives the live normalization context from the injected singletons', (t) => {
    const context = buildProvider().getContext();

    t.deepEqual(context.activeAircraft, [
        { commandCallsign: 'AAL1234', airlineCallsign: 'American', flightNumber: '1234' },
        { commandCallsign: 'ACA420', airlineCallsign: 'Air Canada', flightNumber: '420' }
    ]);
    t.deepEqual(context.fixes, ['BOACH', 'DUMBA']);
    t.deepEqual(context.runways, ['07L', '25R', '07R', '25L']);
});

ava('reads fresh state on every call (no caching)', (t) => {
    const list = [buildAircraft('AAL1', 'American', '1')];
    const provider = buildProvider({
        aircraftController: { aircraft: { list } }
    });

    t.is(provider.getContext().activeAircraft.length, 1);

    list.push(buildAircraft('ACA2', 'Air Canada', '2'));

    t.is(provider.getContext().activeAircraft.length, 2);
});

ava('produces a context object the normalizer accepts', (t) => {
    // The provider output must be exactly the { activeAircraft, fixes, runways }
    // contract the normalizer validates. Empty-but-present arrays are the
    // fail-closed shape.
    const context = buildProvider().getContext();

    t.true(Array.isArray(context.activeAircraft));
    t.true(Array.isArray(context.fixes));
    t.true(Array.isArray(context.runways));
});

// -------------------------------------------------------------------------- //
// fail-closed: missing / half-initialised singletons yield empty arrays
// -------------------------------------------------------------------------- //

ava('returns empty aircraft when the controller or its list is absent', (t) => {
    t.deepEqual(buildProvider({ aircraftController: null }).getContext().activeAircraft, []);
    t.deepEqual(buildProvider({ aircraftController: {} }).getContext().activeAircraft, []);
    t.deepEqual(buildProvider({ aircraftController: { aircraft: {} } }).getContext().activeAircraft, []);
});

ava('returns empty fixes when the navigation library is absent or uninitialised', (t) => {
    t.deepEqual(buildProvider({ navigationLibrary: null }).getContext().fixes, []);
    t.deepEqual(buildProvider({
        navigationLibrary: { get realFixes() { throw new Error('not initialised'); } }
    }).getContext().fixes, []);
    t.deepEqual(buildProvider({
        navigationLibrary: { realFixes: [{ name: 'BOACH' }, null] }
    }).getContext().fixes, []);
});

ava('returns empty runways when no airport is set', (t) => {
    t.deepEqual(buildProvider({ airportController: { airport_get: () => null } }).getContext().runways, []);
    t.deepEqual(buildProvider({ airportController: null }).getContext().runways, []);
    t.deepEqual(buildProvider({
        airportController: { airport_get: () => ({ runways: [[{ name: '05' }, null]] }) }
    }).getContext().runways, []);
    t.deepEqual(buildProvider({
        airportController: { airport_get: () => ({ runways: [null] }) }
    }).getContext().runways, []);
});

ava('drops non-object aircraft entries and passes partial ones through for the normalizer to reject', (t) => {
    const provider = buildProvider({
        aircraftController: {
            aircraft: {
                list: [
                    null,
                    buildAircraft('AAL1', 'American', '1'),
                    { callsign: 'NOAIRLINE' }
                ]
            }
        }
    });

    const { activeAircraft } = provider.getContext();

    // the null entry is dropped; the well-formed and the partial entry remain
    // (the normalizer validates field types and will reject the partial one).
    t.is(activeAircraft.length, 2);
    t.deepEqual(activeAircraft[0], { commandCallsign: 'AAL1', airlineCallsign: 'American', flightNumber: '1' });
    t.is(activeAircraft[1].commandCallsign, 'NOAIRLINE');
});
