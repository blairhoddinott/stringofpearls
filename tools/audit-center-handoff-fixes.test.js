'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    auditAirports,
    writeObviousCandidates
} = require('./audit-center-handoff-fixes');

test('resolves the boundary-adjacent fix from the actual arrival route', () => {
    const result = auditAirports(path.join(__dirname, '..', 'assets', 'airports'), {
        airportNames: ['klas.json'],
        suppressNavigationWarnings: true
    });
    const misenArrival = result.rows.find((row) => row.route === 'MISEN.KEPEC6.KLAS26L');

    assert.equal(misenArrival.candidate, 'CLARR');
    assert.equal(misenArrival.transitionCount, 1);
    assert.ok(misenArrival.boundaryDistanceNm < 25);
    assert.equal(misenArrival.reviewRequired, false);
});

test('writes only the explicit fix without reformatting airport data', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-audit-'));
    const airportPath = path.join(directory, 'test.json');
    const source = `{
    "icao": "TEST",
    "spawnPatterns": [
        {
            "route": "ALPHA..BRAVO",
            "category": "arrival",
            "compact": [1, 2]
        }
    ]
}
`;
    const expected = source.replace(
        '            "route": "ALPHA..BRAVO",\n',
        '            "route": "ALPHA..BRAVO",\n            "centerHandoffFix": "ALPHA",\n'
    );
    t.after(() => fs.rmSync(directory, { recursive: true }));
    fs.writeFileSync(airportPath, source);

    writeObviousCandidates(directory, {
        automatic: [{ candidate: 'ALPHA', fileName: 'test.json', patternIndex: 0 }]
    });

    assert.equal(fs.readFileSync(airportPath, 'utf8'), expected);
});
