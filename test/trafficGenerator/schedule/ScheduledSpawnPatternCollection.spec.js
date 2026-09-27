import ava from 'ava';
import ScheduledSpawnPatternCollection from '../../../src/assets/scripts/client/trafficGenerator/schedule/ScheduledSpawnPatternCollection';
import ScheduledSpawnPatternModel from '../../../src/assets/scripts/client/trafficGenerator/schedule/ScheduledSpawnPatternModel';
import MappedScheduledSpawnPatternModel from '../../../src/assets/scripts/client/trafficGenerator/schedule/MappedScheduledSpawnPatternModel';
import { resolveTrafficPlan } from '../../../src/assets/scripts/client/trafficGenerator/schedule/resolveTrafficPlan';
import { secondsOfDayInZone } from '../../../src/assets/scripts/client/trafficGenerator/schedule/scheduleTrafficPlanUtils';

const SCHEDULE_DOCUMENT_MOCK = {
    schemaVersion: 1,
    airportIcao: 'KSEA',
    timezone: 'America/Los_Angeles',
    sampleDate: '2026-07-15',
    source: {},
    flights: [
        {
            id: 'arrival-aal1-kmia-ksea',
            category: 'arrival',
            scheduledTime: '05:30',
            airlineIcao: 'aal',
            flightNumber: '1',
            originIcao: 'KMIA',
            destinationIcao: 'KSEA'
        },
        {
            id: 'departure-asa2-ksea-kord',
            category: 'departure',
            scheduledTime: '06:15',
            airlineIcao: 'asa',
            flightNumber: '2',
            originIcao: 'KSEA',
            destinationIcao: 'KORD'
        },
        {
            id: 'departure-dal3-ksea-kmsp',
            category: 'departure',
            scheduledTime: '07:00',
            airlineIcao: 'dal',
            flightNumber: '3',
            originIcao: 'KSEA',
            destinationIcao: 'KMSP'
        },
        {
            id: 'arrival-ual4-kden-ksea',
            category: 'arrival',
            scheduledTime: '08:45',
            airlineIcao: 'ual',
            flightNumber: '4',
            originIcao: 'KDEN',
            destinationIcao: 'KSEA'
        }
    ]
};

// A fixed instant so zone anchoring is deterministic across hosts.
const SESSION_START = new Date('2026-07-15T12:00:00Z');

ava('fromScheduleDocument() builds a scheduled slot model per selected flight, in schedule order', (t) => {
    const collection = ScheduledSpawnPatternCollection.fromScheduleDocument(SCHEDULE_DOCUMENT_MOCK, {
        sessionStartDate: SESSION_START
    });

    t.is(collection.spawnPatternModels.length, 4);
    t.true(collection.spawnPatternModels.every((model) => model instanceof ScheduledSpawnPatternModel));
    t.deepEqual(
        collection.spawnPatternModels.map((model) => model.id),
        SCHEDULE_DOCUMENT_MOCK.flights.map((flight) => flight.id)
    );
    t.is(collection.airportIcao, 'KSEA');
    t.is(collection.timezone, 'America/Los_Angeles');
    t.is(collection.subsetPercent, 100);
});

ava('fromScheduleDocument() anchors every slot to the airport zone at sim time zero', (t) => {
    const expectedZoneSeconds = secondsOfDayInZone(SESSION_START, 'America/Los_Angeles');
    const collection = ScheduledSpawnPatternCollection.fromScheduleDocument(SCHEDULE_DOCUMENT_MOCK, {
        sessionStartDate: SESSION_START
    });
    const firstModel = collection.spawnPatternModels[0];

    t.is(firstModel._zoneSecondsOfDayAtSimZero, expectedZoneSeconds);
});

ava('fromScheduleDocument() anchors repeated shifts to current local wall time at nonzero simulation time', (t) => {
    const collection = ScheduledSpawnPatternCollection.fromScheduleDocument({
        ...SCHEDULE_DOCUMENT_MOCK,
        flights: [SCHEDULE_DOCUMENT_MOCK.flights[0]]
    }, {
        sessionStartDate: SESSION_START,
        simulationStartSeconds: 3600
    });

    t.is(collection.spawnPatternModels[0].getNextDelayValue(3600), 30 * 60);
});

ava('fromScheduleDocument() honours a nested subset selection', (t) => {
    const collection = ScheduledSpawnPatternCollection.fromScheduleDocument(SCHEDULE_DOCUMENT_MOCK, {
        subsetPercent: 50,
        sessionStartDate: SESSION_START
    });

    t.is(collection.spawnPatternModels.length, 2);
    t.is(collection.subsetPercent, 50);
});

ava('fromScheduleDocument() builds mapped slots when supplied a local mapping context', (t) => {
    const mappingContext = {
        candidatePatterns: [{ category: 'arrival', routeString: 'A', origin: 'A', destination: 'KSEA' }],
        isAirlineKnown: () => true,
        isAircraftTypeKnown: () => true
    };
    const collection = ScheduledSpawnPatternCollection.fromScheduleDocument({
        ...SCHEDULE_DOCUMENT_MOCK,
        flights: [SCHEDULE_DOCUMENT_MOCK.flights[0]]
    }, { mappingContext, sessionStartDate: SESSION_START });

    t.true(collection.spawnPatternModels[0] instanceof MappedScheduledSpawnPatternModel);
});

ava('fromScheduleDocument() rejects mapped plans with no category-compatible pattern before scheduling', (t) => {
    const mappingContext = {
        candidatePatterns: [{ category: 'arrival', routeString: 'A', origin: 'A', destination: 'KSEA' }],
        isAirlineKnown: () => true,
        isAircraftTypeKnown: () => true
    };

    t.throws(() => ScheduledSpawnPatternCollection.fromScheduleDocument({
        ...SCHEDULE_DOCUMENT_MOCK,
        flights: [SCHEDULE_DOCUMENT_MOCK.flights[1]]
    }, { mappingContext, sessionStartDate: SESSION_START }), { instanceOf: RangeError });
});

ava('getDepartureModelsForPreSpawn() returns the local generated departure baseline for mapped traffic', (t) => {
    const departurePreSpawnModel = { category: 'departure' };
    const mappingContext = {
        candidatePatterns: [departurePreSpawnModel],
        departurePreSpawnModels: [departurePreSpawnModel],
        isAirlineKnown: () => true,
        isAircraftTypeKnown: () => true
    };
    const collection = ScheduledSpawnPatternCollection.fromScheduleDocument({
        ...SCHEDULE_DOCUMENT_MOCK,
        flights: [SCHEDULE_DOCUMENT_MOCK.flights[1]]
    }, { mappingContext, sessionStartDate: SESSION_START });

    t.deepEqual(collection.getDepartureModelsForPreSpawn(), [departurePreSpawnModel]);
});

ava('mapped arrivals pre-spawn each selected local route once rather than once per scheduled slot', (t) => {
    let callCount = 0;
    const arrivalCandidate = {
        category: 'arrival',
        routeString: 'A',
        origin: 'A',
        destination: 'KSEA',
        createPreSpawnAircraft: () => callCount++
    };
    const mappingContext = {
        candidatePatterns: [arrivalCandidate],
        isAirlineKnown: () => true,
        isAircraftTypeKnown: () => true
    };
    const collection = ScheduledSpawnPatternCollection.fromScheduleDocument({
        ...SCHEDULE_DOCUMENT_MOCK,
        flights: [SCHEDULE_DOCUMENT_MOCK.flights[0], SCHEDULE_DOCUMENT_MOCK.flights[3]]
    }, { mappingContext, sessionStartDate: SESSION_START });

    collection.spawnPatternModels.forEach((model) => model.createPreSpawnAircraft({}));

    t.is(callCount, 1);
});

ava('departureModels exposes only the departure slots', (t) => {
    const collection = ScheduledSpawnPatternCollection.fromScheduleDocument(SCHEDULE_DOCUMENT_MOCK, {
        sessionStartDate: SESSION_START
    });

    t.deepEqual(
        collection.departureModels.map((model) => model.id),
        ['departure-asa2-ksea-kord', 'departure-dal3-ksea-kmsp']
    );
});

ava('reset() empties the collection so it can be torn down through the airport lifecycle', (t) => {
    const collection = ScheduledSpawnPatternCollection.fromScheduleDocument(SCHEDULE_DOCUMENT_MOCK, {
        sessionStartDate: SESSION_START
    });

    collection.reset();

    t.deepEqual(collection.spawnPatternModels, []);
});

ava('fromScheduleDocument() rejects a document without a flights array', (t) => {
    t.throws(() => ScheduledSpawnPatternCollection.fromScheduleDocument({}, { sessionStartDate: SESSION_START }));
    t.throws(() => ScheduledSpawnPatternCollection.fromScheduleDocument(null, { sessionStartDate: SESSION_START }));
});

ava('fromScheduleDocument() fails closed on missing timezone, empty flights, and invalid flight identity', (t) => {
    t.throws(
        () => ScheduledSpawnPatternCollection.fromScheduleDocument({
            ...SCHEDULE_DOCUMENT_MOCK,
            timezone: undefined
        }, { sessionStartDate: SESSION_START }),
        { message: /timezone/ }
    );
    t.throws(
        () => ScheduledSpawnPatternCollection.fromScheduleDocument({
            ...SCHEDULE_DOCUMENT_MOCK,
            flights: []
        }, { sessionStartDate: SESSION_START }),
        { message: /at least one flight/ }
    );
    t.throws(
        () => ScheduledSpawnPatternCollection.fromScheduleDocument({
            ...SCHEDULE_DOCUMENT_MOCK,
            flights: [{ ...SCHEDULE_DOCUMENT_MOCK.flights[0], category: 'overflight' }]
        }, { sessionStartDate: SESSION_START }),
        { message: /category/ }
    );

    const malformedFlights = [
        { ...SCHEDULE_DOCUMENT_MOCK.flights[0], airlineIcao: 'INVALID' },
        { ...SCHEDULE_DOCUMENT_MOCK.flights[0], originIcao: 'x' },
        { ...SCHEDULE_DOCUMENT_MOCK.flights[0], destinationIcao: 'KPDX' },
        { ...SCHEDULE_DOCUMENT_MOCK.flights[0], aircraftTypeIcao: 'b-7' },
        { ...SCHEDULE_DOCUMENT_MOCK.flights[0], aircraftTypeIcao: 123 },
        { ...SCHEDULE_DOCUMENT_MOCK.flights[0], aircraftTypeIcao: ['B739'] },
        { ...SCHEDULE_DOCUMENT_MOCK.flights[0], unsupported: true }
    ];

    for (const flight of malformedFlights) {
        t.throws(() => ScheduledSpawnPatternCollection.fromScheduleDocument({
            ...SCHEDULE_DOCUMENT_MOCK,
            flights: [flight]
        }, { sessionStartDate: SESSION_START }));
    }

    t.throws(
        () => ScheduledSpawnPatternCollection.fromScheduleDocument({
            ...SCHEDULE_DOCUMENT_MOCK,
            flights: [SCHEDULE_DOCUMENT_MOCK.flights[0], { ...SCHEDULE_DOCUMENT_MOCK.flights[0] }]
        }, { sessionStartDate: SESSION_START }),
        { message: /duplicate flight id/ }
    );
});

ava('resolveTrafficPlan() returns the schedule-backed plan when a schedule exists', (t) => {
    const departurePreSpawnModel = { category: 'departure', routeString: 'D', origin: 'KSEA', destination: 'D' };
    const legacyCollection = {
        spawnPatternModels: [
            { category: 'arrival', routeString: 'A', origin: 'A', destination: 'KSEA', createPreSpawnAircraft: () => {} },
            departurePreSpawnModel
        ],
        getDepartureModelsForPreSpawn: () => [departurePreSpawnModel]
    };
    const plan = resolveTrafficPlan({
        airportIcao: 'KSEA',
        scheduleDocument: SCHEDULE_DOCUMENT_MOCK,
        legacyCollection,
        mappingContext: {
            isAirlineKnown: () => true,
            isAircraftTypeKnown: () => true
        },
        sessionStartDate: SESSION_START
    });

    t.is(plan.mode, 'scheduled');
    t.true(plan.collection instanceof ScheduledSpawnPatternCollection);
    t.not(plan.collection, legacyCollection);
    t.true(plan.collection.spawnPatternModels.every((model) => model instanceof MappedScheduledSpawnPatternModel));
    t.deepEqual(plan.collection.getDepartureModelsForPreSpawn(), [departurePreSpawnModel]);
});

ava('resolveTrafficPlan() rejects a schedule without mapping resolvers', (t) => {
    const legacyCollection = {
        spawnPatternModels: [{ category: 'arrival', routeString: 'A', origin: 'A', destination: 'KSEA' }],
        getDepartureModelsForPreSpawn: () => []
    };

    t.throws(() => resolveTrafficPlan({
        airportIcao: 'KSEA',
        scheduleDocument: SCHEDULE_DOCUMENT_MOCK,
        legacyCollection
    }), { message: /mappingContext/ });
});

ava('resolveTrafficPlan() preserves legacy generated traffic when no schedule exists', (t) => {
    const legacyCollection = {
        spawnPatternModels: ['legacy'],
        getDepartureModelsForPreSpawn: () => []
    };
    const plan = resolveTrafficPlan({
        airportIcao: 'kpdx',
        scheduleDocument: null,
        legacyCollection,
        sessionStartDate: SESSION_START
    });

    t.is(plan.mode, 'legacy');
    t.is(plan.collection, legacyCollection);
});

ava('resolveTrafficPlan() fails closed when an unsupported airport has no usable legacy collection', (t) => {
    t.throws(() => resolveTrafficPlan({
        airportIcao: 'KPDX',
        scheduleDocument: null,
        legacyCollection: null
    }), { message: /legacyCollection/ });
});

ava('resolveTrafficPlan() fails closed when the schedule airport does not match the requested airport', (t) => {
    t.throws(() => resolveTrafficPlan({
        airportIcao: 'KPDX',
        scheduleDocument: SCHEDULE_DOCUMENT_MOCK,
        legacyCollection: { spawnPatternModels: [] },
        sessionStartDate: SESSION_START
    }));
});
