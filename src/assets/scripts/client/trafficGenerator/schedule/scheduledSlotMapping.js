import { fnv1a32 } from './scheduleTrafficPlanUtils';

/**
 * Stable content key for a candidate airport-authored spawn pattern.
 *
 * `SpawnPatternModel.id` is a per-instance `lodash.uniqueId`, so it is not stable
 * across sessions or construction order. Selection instead orders candidates by
 * their authored route and endpoints, which are deterministic properties of the
 * airport definition.
 *
 * @function candidateSortKey
 * @param candidate {SpawnPatternModel}
 * @return {string}
 * @private
 */
function stableSerialize(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
            .join(',')}}`;
    }

    return JSON.stringify(value);
}

function stablePositionKey(positionModel) {
    if (positionModel == null) {
        return null;
    }

    const reference = positionModel.referencePosition;

    return {
        latitude: positionModel.latitude,
        longitude: positionModel.longitude,
        elevation: positionModel.elevation,
        magneticNorth: positionModel._magneticNorth,
        relativePosition: positionModel.relativePosition,
        reference: reference == null ? null : {
            latitude: reference.latitude,
            longitude: reference.longitude,
            elevation: reference.elevation
        }
    };
}

function candidateSortKey(candidate) {
    return stableSerialize({
        category: candidate.category,
        routeString: candidate.routeString,
        origin: candidate.origin,
        destination: candidate.destination,
        airlines: candidate.airlines,
        commands: candidate.commands,
        waypoints: candidate.waypoints,
        centerHandoffFix: candidate.centerHandoffFix,
        minimumAltitude: candidate._minimumAltitude,
        maximumAltitude: candidate._maximumAltitude,
        speed: candidate.speed,
        heading: candidate.heading,
        position: stablePositionKey(candidate.positionModel)
    });
}

/**
 * Deterministically choose one airport-authored spawn pattern for a scheduled slot.
 *
 * The chosen candidate must share the scheduled slot's flight category, which is the
 * category/sector compatibility guarantee: an arrival slot only ever maps onto an
 * arrival pattern and a departure slot onto a departure pattern. Because the
 * `SpawnScheduler` only schedules a slot when the selected traffic mode allows its
 * category, a category-compatible candidate is also traffic-mode compatible.
 *
 * The choice is a function of the schedule id and the candidate corpus content only:
 * candidates are ordered by a stable content key and indexed by a hash of the slot id,
 * so the same slot and corpus always yield the same candidate regardless of corpus order.
 *
 * Fails closed (throws) when no category-compatible candidate exists rather than
 * silently dropping the scheduled slot.
 *
 * @function selectCandidateSpawnPattern
 * @param scheduledModel {ScheduledSpawnPatternModel} slot being mapped
 * @param candidatePatterns {array<SpawnPatternModel>} airport-authored spawn patterns
 * @return {SpawnPatternModel}
 */
export function selectCandidateSpawnPattern(scheduledModel, candidatePatterns) {
    const compatibleCandidates = candidatePatterns
        .filter((candidate) => candidate.category === scheduledModel.category)
        .slice()
        .sort((a, b) => {
            const keyA = candidateSortKey(a);
            const keyB = candidateSortKey(b);

            if (keyA < keyB) {
                return -1;
            }

            if (keyA > keyB) {
                return 1;
            }

            return 0;
        });

    if (compatibleCandidates.length === 0) {
        throw new RangeError(
            `No ${scheduledModel.category} spawn pattern is available to map schedule slot ${scheduledModel.id}.`
        );
    }

    const index = fnv1a32(scheduledModel.id) % compatibleCandidates.length;

    return compatibleCandidates[index];
}

/**
 * Resolve how a scheduled slot should spawn: with exact scheduled identity, or as a
 * generated flight in the same slot when the identity cannot be honoured.
 *
 * A category-compatible local pattern is always chosen (see `selectCandidateSpawnPattern`),
 * so the slot is never silently dropped and the arrival/departure category is preserved.
 * The scheduled identity is used only when its airline resolves in the running airline
 * corpus; the optional scheduled aircraft type is carried only when it also resolves to a
 * usable type. Otherwise the returned `identity` is `null`, signalling the consumer to
 * generate a flight from the chosen local pattern's own airline/type rules.
 *
 * @function resolveScheduledSpawnPlan
 * @param scheduledModel {ScheduledSpawnPatternModel}
 * @param mappingContext {object}
 * @param mappingContext.candidatePatterns {array<SpawnPatternModel>}
 * @param mappingContext.isAirlineKnown {function} `(airlineIcao) => boolean`
 * @param mappingContext.isAircraftTypeKnown {function} `(aircraftTypeIcao) => boolean`
 * @return {{ candidate: SpawnPatternModel, identity: object|null }}
 */
export function resolveScheduledSpawnPlan(scheduledModel, { candidatePatterns, isAirlineKnown, isAircraftTypeKnown }) {
    if (scheduledModel.spawnPatternKey != null) {
        const keyedCandidates = candidatePatterns.filter(
            (candidate) => candidate.authoredScheduleKey === scheduledModel.spawnPatternKey
        );

        if (keyedCandidates.length === 0) {
            throw new RangeError(`No spawn pattern matches authored key ${scheduledModel.spawnPatternKey}.`);
        }
        if (keyedCandidates.length > 1) {
            throw new RangeError(`Multiple spawn patterns match authored key ${scheduledModel.spawnPatternKey}.`);
        }

        const candidate = keyedCandidates[0];
        if (candidate.category !== scheduledModel.category) {
            throw new RangeError(
                `Spawn pattern ${scheduledModel.spawnPatternKey} category ${candidate.category} does not match ` +
                `authored slot category ${scheduledModel.category}.`
            );
        }

        return { candidate, identity: null };
    }

    const candidate = selectCandidateSpawnPattern(scheduledModel, candidatePatterns);

    if (!isAirlineKnown(scheduledModel.airlineIcao)) {
        return { candidate, identity: null };
    }

    const hasScheduledType = scheduledModel.aircraftTypeIcao != null;
    const hasUsableType = hasScheduledType && isAircraftTypeKnown(scheduledModel.aircraftTypeIcao);

    if (hasScheduledType && !hasUsableType) {
        return { candidate, identity: null };
    }

    return {
        candidate,
        identity: {
            airlineIcao: scheduledModel.airlineIcao,
            flightNumber: scheduledModel.flightNumber,
            aircraftTypeIcao: hasUsableType ? scheduledModel.aircraftTypeIcao : null
        }
    };
}
