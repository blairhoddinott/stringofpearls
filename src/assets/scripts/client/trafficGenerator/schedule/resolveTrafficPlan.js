import ScheduledSpawnPatternCollection from './ScheduledSpawnPatternCollection';

/**
 * Traffic-plan modes returned by `resolveTrafficPlan`.
 *
 * @property TRAFFIC_PLAN_MODE
 * @type {object}
 * @final
 */
export const TRAFFIC_PLAN_MODE = Object.freeze({
    SCHEDULED: 'scheduled',
    LEGACY: 'legacy'
});

/**
 * Choose the single traffic-plan collection the `SpawnScheduler` should consume.
 *
 * This is the seam that guarantees a schedule-backed airport and the legacy random
 * generator never run in parallel: exactly one collection is returned. When the
 * airport has a reviewed schedule, a `ScheduledSpawnPatternCollection` is built from
 * it; otherwise the caller's legacy `SpawnPatternCollection` is passed through
 * unchanged so unsupported airports retain their generated traffic.
 *
 * @function resolveTrafficPlan
 * @param params {object}
 * @param params.airportIcao {string} ICAO of the airport being loaded
 * @param params.scheduleDocument {object|null} normalized schedule for the airport, or null
 * @param params.legacyCollection {SpawnPatternCollection} legacy generator used as fallback
 * @param params.subsetPercent {number} [optional] deterministic subset density
 * @param params.sessionStartDate {Date} [optional] wall-clock instant at plan creation
 * @param params.simulationStartSeconds {number} [optional] simulation time at plan creation
 * @return {{ mode: string, collection: object }} the selected plan
 */
export function resolveTrafficPlan({
    airportIcao,
    scheduleDocument = null,
    legacyCollection,
    mappingContext,
    subsetPercent,
    sessionStartDate,
    simulationStartSeconds
}) {
    if (scheduleDocument == null) {
        if (legacyCollection == null || !Array.isArray(legacyCollection.spawnPatternModels) ||
            typeof legacyCollection.getDepartureModelsForPreSpawn !== 'function') {
            throw new TypeError('A usable legacyCollection is required when no schedule is available.');
        }

        return {
            mode: TRAFFIC_PLAN_MODE.LEGACY,
            collection: legacyCollection
        };
    }

    if (scheduleDocument.airportIcao?.toUpperCase() !== airportIcao?.toUpperCase()) {
        throw new TypeError(
            `Schedule airport ${scheduleDocument.airportIcao} does not match requested airport ${airportIcao}.`
        );
    }

    if (legacyCollection == null || !Array.isArray(legacyCollection.spawnPatternModels) ||
        typeof legacyCollection.getDepartureModelsForPreSpawn !== 'function') {
        throw new TypeError('A usable legacyCollection is required to map scheduled slots onto local patterns.');
    }
    if (mappingContext == null || typeof mappingContext.isAirlineKnown !== 'function' ||
        typeof mappingContext.isAircraftTypeKnown !== 'function') {
        throw new TypeError('A mappingContext with airline and aircraft-type resolvers is required for scheduled traffic.');
    }

    const scheduledMappingContext = {
        ...mappingContext,
        candidatePatterns: legacyCollection.spawnPatternModels,
        departurePreSpawnModels: legacyCollection.getDepartureModelsForPreSpawn()
    };

    const collection = ScheduledSpawnPatternCollection.fromScheduleDocument(scheduleDocument, {
        mappingContext: scheduledMappingContext,
        subsetPercent,
        sessionStartDate,
        simulationStartSeconds
    });

    return {
        mode: TRAFFIC_PLAN_MODE.SCHEDULED,
        collection
    };
}
