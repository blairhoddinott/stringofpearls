import ava from 'ava';
import sinon from 'sinon';
import MappedScheduledSpawnPatternModel from '../../../src/assets/scripts/client/trafficGenerator/schedule/MappedScheduledSpawnPatternModel';
import ScheduledSpawnPatternModel from '../../../src/assets/scripts/client/trafficGenerator/schedule/ScheduledSpawnPatternModel';

const CONTEXT = {
    airportIcao: 'KSEA',
    timezone: 'America/Los_Angeles',
    zoneSecondsOfDayAtSimZero: 5 * 3600
};

const buildCandidate = (overrides = {}) => ({
    category: 'arrival',
    routeString: 'BETHL.GRNPA1.KSEA16R',
    origin: '',
    destination: 'KSEA',
    positionModel: { id: 'candidate-position' },
    altitude: 12000,
    heading: 1.23,
    speed: 280,
    commands: { KSEA16R: 'fh 250' },
    waypoints: ['BETHL', 'GRNPA'],
    centerHandoffFix: 'GRNPA',
    getRandomAirlineForSpawn: sinon.stub().returns('ual'),
    ...overrides
});

const ARRIVAL_FLIGHT = {
    id: 'arrival-aal1-kmia-ksea',
    category: 'arrival',
    scheduledTime: '05:30',
    airlineIcao: 'aal',
    flightNumber: '1',
    originIcao: 'KMIA',
    destinationIcao: 'KSEA'
};

const buildMappingContext = (candidate, overrides = {}) => ({
    candidatePatterns: [candidate],
    isAirlineKnown: () => true,
    isAircraftTypeKnown: () => false,
    ...overrides
});

ava('is a ScheduledSpawnPatternModel and keeps schedule timing behaviour', (t) => {
    const candidate = buildCandidate();
    const model = new MappedScheduledSpawnPatternModel(ARRIVAL_FLIGHT, CONTEXT, buildMappingContext(candidate));

    t.true(model instanceof ScheduledSpawnPatternModel);
    t.is(model.getNextDelayValue(0), 30 * 60);
    t.is(model.category, 'arrival');
    t.true(model.isAirborneAtSpawn());
});

ava('delegates spawn geometry to the chosen candidate pattern', (t) => {
    const candidate = buildCandidate();
    const model = new MappedScheduledSpawnPatternModel(ARRIVAL_FLIGHT, CONTEXT, buildMappingContext(candidate));

    t.is(model.positionModel, candidate.positionModel);
    t.is(model.altitude, 12000);
    t.is(model.heading, 1.23);
    t.is(model.speed, 280);
    t.is(model.routeString, 'BETHL.GRNPA1.KSEA16R');
    t.deepEqual(model.commands, { KSEA16R: 'fh 250' });
    t.deepEqual(model.waypoints, ['BETHL', 'GRNPA']);
    t.is(model.centerHandoffFix, 'GRNPA');
});

ava('overlays exact scheduled identity when the airline is known', (t) => {
    const candidate = buildCandidate();
    const model = new MappedScheduledSpawnPatternModel(ARRIVAL_FLIGHT, CONTEXT, buildMappingContext(candidate));

    t.is(model.getRandomAirlineForSpawn(), 'aal');
    t.deepEqual(model.getScheduledIdentity(), { airlineIcao: 'aal', flightNumber: '1', aircraftTypeIcao: null });
    t.is(model.origin, 'KMIA');
    t.is(model.destination, 'KSEA');
    t.true(candidate.getRandomAirlineForSpawn.notCalled);
});

ava('falls back to the candidate pattern identity when the airline is unknown', (t) => {
    const candidate = buildCandidate();
    const model = new MappedScheduledSpawnPatternModel(
        ARRIVAL_FLIGHT,
        CONTEXT,
        buildMappingContext(candidate, { isAirlineKnown: () => false })
    );

    t.is(model.getScheduledIdentity(), null);
    t.is(model.getRandomAirlineForSpawn(), 'ual');
    t.true(candidate.getRandomAirlineForSpawn.called);
    // a generated flight keeps the local pattern's own endpoints
    t.is(model.origin, '');
    t.is(model.destination, 'KSEA');
});

ava('resolves the mapping once and reuses it', (t) => {
    const candidate = buildCandidate();
    const secondCandidate = buildCandidate({ routeString: 'DAG.KEPEC3.KSEA16R' });
    const model = new MappedScheduledSpawnPatternModel(
        ARRIVAL_FLIGHT,
        CONTEXT,
        buildMappingContext(candidate, { candidatePatterns: [candidate, secondCandidate] })
    );

    const firstRoute = model.routeString;

    t.is(model.routeString, firstRoute);
    t.is(model.positionModel, model.positionModel);
});

ava('an enabled mapped arrival delegates each pre-spawn lifecycle call to its local candidate', (t) => {
    let callCount = 0;
    const candidate = buildCandidate({
        createPreSpawnAircraft: (aircraftController) => {
            callCount++;
            t.is(aircraftController, 'controller');
        }
    });
    const model = new MappedScheduledSpawnPatternModel(
        ARRIVAL_FLIGHT,
        CONTEXT,
        buildMappingContext(candidate)
    );

    model.enableCandidatePreSpawn();
    model.createPreSpawnAircraft('controller');
    model.createPreSpawnAircraft('controller');

    t.is(callCount, 2);
});

ava('fails closed when no category-compatible candidate exists', (t) => {
    const departureCandidate = buildCandidate({ category: 'departure' });

    t.throws(() => new MappedScheduledSpawnPatternModel(
        ARRIVAL_FLIGHT,
        CONTEXT,
        buildMappingContext(departureCandidate)
    ), { instanceOf: RangeError });
});
