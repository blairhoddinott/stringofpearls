'use strict';

require('../test/testHelpers/registerBabel');

const fs = require('node:fs');
const path = require('node:path');
const { NavigationLibraryClass } = require('../src/assets/scripts/client/navigationLibrary/NavigationLibrary');
const RouteModel = require('../src/assets/scripts/client/aircraft/FlightManagementSystem/RouteModel').default;
const StaticPositionModel = require('../src/assets/scripts/client/base/StaticPositionModel').default;
const AirspaceModel = require('../src/assets/scripts/client/airport/AirspaceModel').default;
const { degreesToRadians } = require('../src/assets/scripts/client/utilities/unitConverters');

const MAX_AUTOMATIC_BOUNDARY_DISTANCE_NM = 25;

function buildAirspaceGeometry(airport) {
    const magneticNorth = degreesToRadians(airport.magnetic_north);
    const airportPosition = new StaticPositionModel(airport.position, null, magneticNorth);

    if (Array.isArray(airport.airspace) && airport.airspace.length > 0) {
        const sections = airport.airspace.map((section) => new AirspaceModel(
            section,
            airportPosition,
            magneticNorth
        ));

        return {
            isInside: (waypoint) => sections.some(
                (section) => section.isPointInside2D(waypoint.positionModel.relativePosition)
            ),
            distanceToBoundary: (waypoint) => Math.min(...sections.map(
                (section) => section.distanceToBoundary(waypoint.positionModel.relativePosition)
            ))
        };
    }

    return {
        isInside: (waypoint) => {
            const [x, y] = waypoint.positionModel.relativePosition;

            return Math.hypot(x, y) <= airport.ctr_radius;
        },
        distanceToBoundary: (waypoint) => {
            const [x, y] = waypoint.positionModel.relativePosition;

            return Math.abs(Math.hypot(x, y) - airport.ctr_radius) / 1.852;
        }
    };
}

function withSuppressedNavigationWarnings(suppress, callback) {
    if (!suppress) {
        return callback();
    }

    const originalWarn = console.warn;
    const originalError = console.error;
    console.warn = () => {};
    console.error = () => {};

    try {
        return callback();
    } finally {
        console.warn = originalWarn;
        console.error = originalError;
    }
}

function auditAirport(airport, fileName, suppressNavigationWarnings) {
    const rows = [];
    const navigationLibrary = new NavigationLibraryClass();
    let geometry;

    try {
        withSuppressedNavigationWarnings(suppressNavigationWarnings, () => {
            navigationLibrary.init(airport);
        });
        geometry = buildAirspaceGeometry(airport);
    } catch (error) {
        (airport.spawnPatterns || []).forEach((pattern, patternIndex) => {
            if (pattern.category === 'arrival') {
                rows.push({
                    airport: airport.icao,
                    error: error.message,
                    fileName,
                    patternIndex,
                    reviewRequired: true,
                    route: pattern.route
                });
            }
        });

        return rows;
    }

    (airport.spawnPatterns || []).forEach((pattern, patternIndex) => {
        if (pattern.category !== 'arrival') {
            return;
        }

        try {
            const routeModel = new RouteModel(pattern.route, navigationLibrary);
            const waypoints = routeModel.waypoints.filter((waypoint) => !waypoint.isVectorWaypoint);
            const inside = waypoints.map(geometry.isInside);
            const transitions = [];

            for (let index = 0; index < waypoints.length - 1; index++) {
                if (!inside[index] && inside[index + 1]) {
                    transitions.push(index);
                }
            }

            const candidateWaypoint = transitions.length === 1 ? waypoints[transitions[0]] : null;
            const boundaryDistanceNm = candidateWaypoint ?
                geometry.distanceToBoundary(candidateWaypoint) : null;

            rows.push({
                airport: airport.icao,
                boundaryDistanceNm,
                candidate: candidateWaypoint?.name ?? null,
                fileName,
                patternIndex,
                reviewRequired: transitions.length !== 1 ||
                    boundaryDistanceNm > MAX_AUTOMATIC_BOUNDARY_DISTANCE_NM,
                route: pattern.route,
                transitionCount: transitions.length
            });
        } catch (error) {
            rows.push({
                airport: airport.icao,
                error: error.message,
                fileName,
                patternIndex,
                reviewRequired: true,
                route: pattern.route
            });
        }
    });

    return rows;
}

function auditAirports(airportsRoot, options = {}) {
    const airportNames = options.airportNames ?? fs.readdirSync(airportsRoot)
        .filter((name) => /^[a-z]{4}\.json$/.test(name))
        .sort();
    const rows = airportNames.flatMap((fileName) => {
        const airport = JSON.parse(fs.readFileSync(path.join(airportsRoot, fileName), 'utf8'));

        return auditAirport(airport, fileName, options.suppressNavigationWarnings === true);
    });
    const automatic = rows.filter((row) => !row.reviewRequired);
    const review = rows.filter((row) => row.reviewRequired);

    return {
        automatic,
        review,
        rows,
        summary: {
            arrivalPatterns: rows.length,
            automatic: automatic.length,
            reviewRequired: review.length
        }
    };
}

function findSpawnPatternObjectRanges(source) {
    const propertyIndex = source.indexOf('"spawnPatterns"');
    const arrayStart = source.indexOf('[', propertyIndex);
    const ranges = [];
    let depth = 0;
    let objectStart = -1;
    let inString = false;
    let escaped = false;

    for (let index = arrayStart + 1; index < source.length; index++) {
        const character = source[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === '"') {
                inString = false;
            }
            continue;
        }

        if (character === '"') {
            inString = true;
        } else if (character === '{') {
            if (depth === 0) {
                objectStart = index;
            }
            depth++;
        } else if (character === '}') {
            depth--;
            if (depth === 0) {
                ranges.push([objectStart, index + 1]);
            }
        } else if (character === ']' && depth === 0) {
            break;
        }
    }

    return ranges;
}

function writeObviousCandidates(airportsRoot, auditResult) {
    const candidatesByFile = new Map();

    auditResult.automatic.forEach((row) => {
        if (!candidatesByFile.has(row.fileName)) {
            candidatesByFile.set(row.fileName, []);
        }
        candidatesByFile.get(row.fileName).push(row);
    });

    candidatesByFile.forEach((rows, fileName) => {
        const airportPath = path.join(airportsRoot, fileName);
        let source = fs.readFileSync(airportPath, 'utf8');
        const ranges = findSpawnPatternObjectRanges(source);

        rows.sort((left, right) => right.patternIndex - left.patternIndex).forEach((row) => {
            const range = ranges[row.patternIndex];

            if (!range) {
                throw new Error(`${fileName}: spawn pattern ${row.patternIndex} was not found`);
            }

            const objectSource = source.slice(range[0], range[1]);
            const pattern = JSON.parse(objectSource);

            if (pattern.route !== row.route && row.route !== undefined) {
                throw new Error(`${fileName}: spawn pattern ${row.patternIndex} route changed during migration`);
            }
            if (Object.prototype.hasOwnProperty.call(pattern, 'centerHandoffFix')) {
                return;
            }

            const routeLine = objectSource.match(/^(\s*)"route"\s*:\s*.*\r?\n/m);

            if (!routeLine) {
                throw new Error(`${fileName}: spawn pattern ${row.patternIndex} has no route line`);
            }

            const insertionOffset = range[0] + routeLine.index + routeLine[0].length;
            const insertion = `${routeLine[1]}"centerHandoffFix": ${JSON.stringify(row.candidate)},\n`;
            source = source.slice(0, insertionOffset) + insertion + source.slice(insertionOffset);
        });

        fs.writeFileSync(airportPath, source);
    });

    return auditResult.automatic.length;
}

function main() {
    const airportsRoot = path.join(process.cwd(), 'assets', 'airports');
    const shouldWrite = process.argv.includes('--write-obvious');
    const result = auditAirports(airportsRoot);

    if (shouldWrite) {
        result.summary.written = writeObviousCandidates(airportsRoot, result);
    }

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
    main();
}

module.exports = {
    MAX_AUTOMATIC_BOUNDARY_DISTANCE_NM,
    auditAirports,
    writeObviousCandidates
};
