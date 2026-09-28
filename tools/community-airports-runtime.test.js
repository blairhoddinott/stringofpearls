'use strict';

require('../test/testHelpers/registerBabel');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AirportModel = require('../src/assets/scripts/client/airport/AirportModel').default;
const { NavigationLibraryClass } = require('../src/assets/scripts/client/navigationLibrary/NavigationLibrary');
const RouteModel = require('../src/assets/scripts/client/aircraft/FlightManagementSystem/RouteModel').default;
const SpawnPatternModel = require('../src/assets/scripts/client/trafficGenerator/SpawnPatternModel').default;

const root = path.resolve(__dirname, '..');
const icaos = ['cyyc', 'kcle', 'kden', 'kfll', 'kiah', 'kind', 'klga', 'mkjp'];
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

function terrainRings(geometry) {
    if (geometry.type === 'Polygon') {
        return geometry.coordinates;
    }
    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.flat();
    }
    return [];
}

function coordinateToDecimal(value) {
    const decimalMatch = /^([NSEW])(\d+(?:\.\d+)?)$/.exec(value);
    if (decimalMatch) {
        const decimal = Number(decimalMatch[2]);
        return /[SW]/.test(decimalMatch[1]) ? -decimal : decimal;
    }
    const match = /^([NSEW])(\d{1,3})(?:d(\d{1,2})(?:m(\d{1,2}(?:\.\d+)?))?)?$/.exec(value);
    assert.ok(match, `invalid coordinate ${value}`);
    const decimal = Number(match[2]) + Number(match[3] || 0) / 60 + Number(match[4] || 0) / 3600;
    return /[SW]/.test(match[1]) ? -decimal : decimal;
}

function orientation(a, b, c) {
    const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return Math.abs(value) < 1e-12 ? 0 : Math.sign(value);
}

function pointOnSegment(a, b, point) {
    return orientation(a, b, point) === 0
        && point[0] >= Math.min(a[0], b[0]) && point[0] <= Math.max(a[0], b[0])
        && point[1] >= Math.min(a[1], b[1]) && point[1] <= Math.max(a[1], b[1]);
}

function segmentsCross(a, b, c, d) {
    const first = orientation(a, b, c);
    const second = orientation(a, b, d);
    const third = orientation(c, d, a);
    const fourth = orientation(c, d, b);
    return (first * second < 0 && third * fourth < 0)
        || (first === 0 && pointOnSegment(a, b, c))
        || (second === 0 && pointOnSegment(a, b, d))
        || (third === 0 && pointOnSegment(c, d, a))
        || (fourth === 0 && pointOnSegment(c, d, b));
}

function ringArea(ring) {
    return Math.abs(ring.slice(0, -1).reduce((area, point, index) => {
        const next = ring[index + 1];
        return area + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2);
}

function ringContainsPoint(ring, point) {
    let inside = false;
    for (let index = 0, previous = ring.length - 2; index < ring.length - 1; previous = index, index += 1) {
        const currentPoint = ring[index];
        const previousPoint = ring[previous];
        if (((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]))
            && point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]))
                / (previousPoint[1] - currentPoint[1]) + currentPoint[0]) {
            inside = !inside;
        }
    }
    return inside;
}

function assertSimpleRing(label, ring) {
    const points = ring.slice(0, -1);
    assert.ok(ringArea(ring) > 1e-12, `${label} must have positive area`);
    assert.strictEqual(new Set(points.map((point) => point.join(','))).size, points.length,
        `${label} must not repeat interior vertices`);
    const edges = ring.slice(0, -1).map((point, index) => [point, ring[index + 1]]);
    edges.forEach(([a, b], first) => {
        edges.forEach(([c, d], second) => {
            if (second <= first || second === first + 1 || (first === 0 && second === edges.length - 1)) {
                return;
            }
            assert.ok(!segmentsCross(a, b, c, d), `${label} must not self-intersect`);
        });
    });
}

function assertSeparateRings(label, firstRing, secondRing) {
    const firstEdges = firstRing.slice(0, -1).map((point, index) => [point, firstRing[index + 1]]);
    const secondEdges = secondRing.slice(0, -1).map((point, index) => [point, secondRing[index + 1]]);
    firstEdges.forEach(([a, b]) => secondEdges.forEach(([c, d]) => {
        assert.ok(!segmentsCross(a, b, c, d), `${label} boundaries must not intersect or touch`);
    }));
}

function assertValidTerrainGeometry(label, geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    polygons.forEach((polygon, polygonIndex) => {
        const shell = polygon[0];
        polygon.slice(1).forEach((hole, holeIndex) => {
            assert.ok(ringContainsPoint(shell, hole[0]),
                `${label} polygon ${polygonIndex} hole ${holeIndex} must be inside its shell`);
            assertSeparateRings(`${label} polygon ${polygonIndex} hole ${holeIndex}`, shell, hole);
            polygon.slice(1, holeIndex + 1).forEach((otherHole, otherIndex) => {
                assertSeparateRings(`${label} polygon ${polygonIndex} holes ${otherIndex}/${holeIndex}`, otherHole, hole);
                assert.ok(!ringContainsPoint(otherHole, hole[0]) && !ringContainsPoint(hole, otherHole[0]),
                    `${label} polygon ${polygonIndex} holes must not overlap or contain one another`);
            });
        });
        polygons.slice(0, polygonIndex).forEach((otherPolygon, otherIndex) => {
            const otherShell = otherPolygon[0];
            assertSeparateRings(`${label} polygons ${otherIndex}/${polygonIndex}`, otherShell, shell);
            assert.ok(!ringContainsPoint(otherShell, shell[0]) && !ringContainsPoint(shell, otherShell[0]),
                `${label} polygon shells must not overlap or contain one another`);
        });
    });
}

function assertSimpleAirspace(icao, sections) {
    sections.forEach((section, sectionIndex) => {
        const points = section.poly.map(([latitude, longitude]) => [coordinateToDecimal(longitude), coordinateToDecimal(latitude)]);
        assert.ok(new Set(points.map((point) => point.join(','))).size === points.length,
            `${icao} airspace ${sectionIndex} must not repeat vertices`);
        for (let first = 0; first < points.length; first += 1) {
            const firstNext = (first + 1) % points.length;
            for (let second = first + 1; second < points.length; second += 1) {
                const secondNext = (second + 1) % points.length;
                if (first === second || firstNext === second || secondNext === first) {
                    continue;
                }
                assert.ok(!segmentsCross(points[first], points[firstNext], points[second], points[secondNext]),
                    `${icao} airspace ${sectionIndex} must not self-intersect`);
            }
        }
    });
}

assert.throws(
    () => assertSimpleRing('terrain-validator probe', [[0, 0], [1, 0], [2, 0], [0, 0]]),
    /must have positive area/,
    'terrain validator must reject closed collinear rings'
);
assert.throws(
    () => assertValidTerrainGeometry('terrain-validator probe', {
        type: 'Polygon',
        coordinates: [
            [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
            [[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]
        ]
    }),
    /must be inside its shell/,
    'terrain validator must reject holes outside their shell'
);

for (const icao of icaos) {
    const upper = icao.toUpperCase();
    const airportJson = readJson(`assets/airports/${icao}.json`);
    const navigationLibrary = new NavigationLibraryClass();
    navigationLibrary.init(airportJson);

    const airportModel = new AirportModel({ icao: upper });
    airportModel.set(airportJson);
    assert.strictEqual(airportModel.loaded, true, `${upper} AirportModel must load`);
    assert.ok(airportModel.mapCollection.maps.length > 0, `${upper} MapCollection must construct`);
    airportModel.mapCollection.maps.forEach((map, mapIndex) => {
        map.lines.forEach((line, lineIndex) => {
            assert.strictEqual(line.length, 4, `${upper} map ${mapIndex} line ${lineIndex} must have two endpoints`);
            assert.ok(line.every(Number.isFinite), `${upper} map ${mapIndex} line ${lineIndex} must be finite`);
            assert.notDeepStrictEqual(line.slice(0, 2), line.slice(2),
                `${upper} map ${mapIndex} line ${lineIndex} must not be zero-length`);
        });
    });
    assert.ok(airportModel.getRunway(airportJson.arrivalRunway), `${upper} arrival runway must resolve`);
    assert.ok(airportModel.getRunway(airportJson.departureRunway), `${upper} departure runway must resolve`);
    assertSimpleAirspace(upper, airportJson.airspace);
    const airportController = {
        current: airportModel,
        airport_get: () => airportModel
    };

    airportJson.spawnPatterns.forEach((pattern, index) => {
        const route = new RouteModel(pattern.route, navigationLibrary);
        assert.doesNotThrow(() => new SpawnPatternModel(pattern, null, navigationLibrary, airportController),
            `${upper} spawn ${index} must construct through the real spawn boundary`);
        assert.ok(route.waypoints.length > 0, `${upper} spawn ${index} must construct waypoints`);
        const positionedWaypoints = route.waypoints.filter((waypoint) => !waypoint.isVectorWaypoint);
        assert.ok(positionedWaypoints.length >= 2, `${upper} spawn ${index} needs two positioned waypoints for spawn geometry`);
        route.waypoints.forEach((waypoint) => {
            if (!waypoint.isVectorWaypoint) {
                assert.ok(waypoint.positionModel, `${upper} spawn ${index} waypoint ${waypoint.name} must be positioned`);
                assert.ok(Number.isFinite(waypoint.positionModel.latitude), `${upper} ${waypoint.name} latitude must be finite`);
                assert.ok(Number.isFinite(waypoint.positionModel.longitude), `${upper} ${waypoint.name} longitude must be finite`);
            }
        });
        if (pattern.category === 'arrival') {
            assert.strictEqual(route.waypoints[0].name, pattern.centerHandoffFix,
                `${upper} spawn ${index} must enter at its centre-handoff fix`);
        }
    });

    const terrain = readJson(`assets/airports/terrain/${icao}.geojson`);
    terrain.features.forEach((feature, featureIndex) => {
        const rings = terrainRings(feature.geometry);
        assert.ok(rings.length > 0, `${upper} terrain feature ${featureIndex} must contain polygon rings`);
        rings.forEach((ring, ringIndex) => {
            assert.ok(ring.length >= 4, `${upper} terrain feature ${featureIndex} ring ${ringIndex} must have four positions`);
            assert.deepStrictEqual(ring[0], ring[ring.length - 1], `${upper} terrain ring must be closed`);
            assert.ok(new Set(ring.slice(0, -1).map((point) => point.join(','))).size >= 3,
                `${upper} terrain ring must contain three unique vertices`);
            ring.forEach((point) => assert.ok(point.every(Number.isFinite), `${upper} terrain coordinates must be finite`));
            assertSimpleRing(`${upper} terrain feature ${featureIndex} ring ${ringIndex}`, ring);
        });
        assertValidTerrainGeometry(`${upper} terrain feature ${featureIndex}`, feature.geometry);
    });
}

console.log('Community airport runtime contract passed');
