import ava from 'ava';
import StaticPositionModel from '../../../src/assets/scripts/client/base/StaticPositionModel';
import {
    selectCandidateSpawnPattern,
    resolveScheduledSpawnPlan
} from '../../../src/assets/scripts/client/trafficGenerator/schedule/scheduledSlotMapping';

const arrivalCandidate = (routeString, origin = '', destination = 'KSEA') => ({
    category: 'arrival',
    routeString,
    origin,
    destination
});
const departureCandidate = (routeString, origin = 'KSEA', destination = '') => ({
    category: 'departure',
    routeString,
    origin,
    destination
});

const CANDIDATES = [
    arrivalCandidate('BETHL.GRNPA1.KSEA16R'),
    arrivalCandidate('DAG.KEPEC3.KSEA16R'),
    arrivalCandidate('DUImmY.ANJLL4.KSEA16R'),
    departureCandidate('KSEA16L.SUMMA2.HEC'),
    departureCandidate('KSEA16L.MONTN3.GUP')
];

const scheduledSlot = (overrides = {}) => ({
    id: 'arrival-aal1-kmia-ksea',
    category: 'arrival',
    airlineIcao: 'aal',
    flightNumber: '1',
    originIcao: 'KMIA',
    destinationIcao: 'KSEA',
    aircraftTypeIcao: null,
    ...overrides
});

ava('selectCandidateSpawnPattern() only ever returns a category-compatible candidate', (t) => {
    const arrivalChoice = selectCandidateSpawnPattern(scheduledSlot(), CANDIDATES);
    const departureChoice = selectCandidateSpawnPattern(
        scheduledSlot({ id: 'departure-asa2-ksea-kord', category: 'departure' }),
        CANDIDATES
    );

    t.is(arrivalChoice.category, 'arrival');
    t.is(departureChoice.category, 'departure');
});

ava('selectCandidateSpawnPattern() is deterministic for a given schedule id and candidate corpus', (t) => {
    const first = selectCandidateSpawnPattern(scheduledSlot(), CANDIDATES);
    const second = selectCandidateSpawnPattern(scheduledSlot(), CANDIDATES);

    t.is(first, second);

    // candidate order does not affect the choice: same corpus content, shuffled
    const shuffled = [CANDIDATES[2], CANDIDATES[0], CANDIDATES[1], CANDIDATES[4], CANDIDATES[3]];
    const fromShuffled = selectCandidateSpawnPattern(scheduledSlot(), shuffled);

    t.is(fromShuffled.routeString, first.routeString);
});

ava('selectCandidateSpawnPattern() distributes different schedule ids across candidates', (t) => {
    const routesChosen = new Set();

    for (let i = 0; i < 40; i++) {
        const choice = selectCandidateSpawnPattern(scheduledSlot({ id: `arrival-x${i}-kxxx-ksea` }), CANDIDATES);
        routesChosen.add(choice.routeString);
    }

    t.true(routesChosen.size > 1);
});

ava('selectCandidateSpawnPattern() breaks authored-route ties by full operational content', (t) => {
    const first = {
        ...arrivalCandidate('BETHL.GRNPA1.KSEA16R'),
        airlines: [['aal', 1]],
        commands: { runway: '16R' },
        marker: 'first'
    };
    const second = {
        ...arrivalCandidate('BETHL.GRNPA1.KSEA16R'),
        airlines: [['asa', 1]],
        commands: { runway: '16L' },
        marker: 'second'
    };

    const forward = selectCandidateSpawnPattern(scheduledSlot(), [first, second]);
    const reversed = selectCandidateSpawnPattern(scheduledSlot(), [second, first]);

    t.is(forward.marker, reversed.marker);
});

ava('selectCandidateSpawnPattern() ignores transient real position-model ids', (t) => {
    const makeCorpus = (reverseConstruction) => {
        const positions = {};
        const definitions = reverseConstruction
            ? [['second', [47.6, -122.3]], ['first', [47.5, -122.4]]]
            : [['first', [47.5, -122.4]], ['second', [47.6, -122.3]]];

        definitions.forEach(([name, coordinates]) => {
            positions[name] = new StaticPositionModel(coordinates);
        });

        return ['first', 'second'].map((marker) => ({
            ...arrivalCandidate('BETHL.GRNPA1.KSEA16R'),
            positionModel: positions[marker],
            marker
        }));
    };

    const firstConstructionOrder = selectCandidateSpawnPattern(scheduledSlot(), makeCorpus(false));
    const reversedConstructionOrder = selectCandidateSpawnPattern(scheduledSlot(), makeCorpus(true));

    t.is(firstConstructionOrder.marker, reversedConstructionOrder.marker);
});

ava('selectCandidateSpawnPattern() fails closed when no category-compatible candidate exists', (t) => {
    const arrivalsOnly = CANDIDATES.filter((candidate) => candidate.category === 'arrival');

    t.throws(
        () => selectCandidateSpawnPattern(scheduledSlot({ category: 'departure', id: 'departure-x-ksea-kord' }), arrivalsOnly),
        { instanceOf: RangeError }
    );
    t.throws(() => selectCandidateSpawnPattern(scheduledSlot(), []), { instanceOf: RangeError });
});

ava('resolveScheduledSpawnPlan() maps exact identity when the airline is known', (t) => {
    const plan = resolveScheduledSpawnPlan(scheduledSlot(), {
        candidatePatterns: CANDIDATES,
        isAirlineKnown: (icao) => icao === 'aal',
        isAircraftTypeKnown: () => false
    });

    t.is(plan.candidate.category, 'arrival');
    t.deepEqual(plan.identity, {
        airlineIcao: 'aal',
        flightNumber: '1',
        aircraftTypeIcao: null
    });
});

ava('resolveScheduledSpawnPlan() includes the scheduled aircraft type only when it is usable', (t) => {
    const withUsableType = resolveScheduledSpawnPlan(scheduledSlot({ aircraftTypeIcao: 'B739' }), {
        candidatePatterns: CANDIDATES,
        isAirlineKnown: () => true,
        isAircraftTypeKnown: (icao) => icao === 'B739'
    });
    const withUnusableType = resolveScheduledSpawnPlan(scheduledSlot({ aircraftTypeIcao: 'ZZZZ' }), {
        candidatePatterns: CANDIDATES,
        isAirlineKnown: () => true,
        isAircraftTypeKnown: (icao) => icao === 'B739'
    });

    t.is(withUsableType.identity.aircraftTypeIcao, 'B739');
    t.is(withUnusableType.identity, null);
});

ava('resolveScheduledSpawnPlan() falls back to a generated flight when the airline is unknown, keeping the slot', (t) => {
    const plan = resolveScheduledSpawnPlan(scheduledSlot({ airlineIcao: 'xyz' }), {
        candidatePatterns: CANDIDATES,
        isAirlineKnown: () => false,
        isAircraftTypeKnown: () => false
    });

    t.is(plan.identity, null);
    t.is(plan.candidate.category, 'arrival');
});

ava('resolveScheduledSpawnPlan() fails closed when no compatible fallback candidate exists', (t) => {
    t.throws(() => resolveScheduledSpawnPlan(scheduledSlot({ category: 'departure', id: 'departure-x-ksea-kord' }), {
        candidatePatterns: CANDIDATES.filter((candidate) => candidate.category === 'arrival'),
        isAirlineKnown: () => false,
        isAircraftTypeKnown: () => false
    }), { instanceOf: RangeError });
});
