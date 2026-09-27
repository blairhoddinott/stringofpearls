'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    parseCsv,
    normalizeBtsTime,
    buildAirportIcaoMap,
    resolveAirportIcao,
    normalizeSchedule,
    loadAirlineMap,
    importSchedule,
    parseCliArguments
} = require('./import-bts-schedule');
const { validateAssets } = require('../validate-assets');

// CSV parsing: ordinary rows, quoted commas, escaped quotes, CRLF, trailing newline.
assert.deepStrictEqual(
    parseCsv('a,b,c\n1,2,3\n'),
    [['a', 'b', 'c'], ['1', '2', '3']],
    'plain rows should split on commas'
);

assert.deepStrictEqual(
    parseCsv('name,note\r\n"Smith, John","said ""hi"""\r\n'),
    [['name', 'note'], ['Smith, John', 'said "hi"']],
    'quoted commas and escaped quotes must be preserved'
);

assert.deepStrictEqual(
    parseCsv('a,"b\nc",d'),
    [['a', 'b\nc', 'd']],
    'newlines inside quotes stay within one field'
);

assert.deepStrictEqual(
    parseCsv('x,,z\n'),
    [['x', '', 'z']],
    'empty fields are preserved'
);

[
    'a,"unterminated',
    'a,"closed"junk,b',
    'a,un"quoted,b'
].forEach((csv) => {
    assert.throws(
        () => parseCsv(csv),
        /malformed CSV/,
        `malformed quoting must be rejected: ${JSON.stringify(csv)}`
    );
});

// BTS times are HHMM integers; normalize to zero-padded HH:mm.
assert.strictEqual(normalizeBtsTime('815'), '08:15', 'three-digit HHMM should pad the hour');
assert.strictEqual(normalizeBtsTime('0630'), '06:30', 'leading-zero HHMM is preserved');
assert.strictEqual(normalizeBtsTime('1430'), '14:30', 'afternoon HHMM maps directly');
assert.strictEqual(normalizeBtsTime('5'), '00:05', 'single-digit HHMM is minutes past midnight');
assert.strictEqual(normalizeBtsTime('0'), '00:00', 'zero is midnight');

// Missing or out-of-range times are rejected.
[' ', '', '2400', '1265', 'abc', '99999', '12:30'].forEach((value) => {
    assert.throws(
        () => normalizeBtsTime(value),
        /invalid BTS time/,
        `expected ${JSON.stringify(value)} to be rejected`
    );
});

// OurAirports maps IATA -> ICAO ident, resolving by header name and failing
// closed on ambiguous, missing, or non-ICAO-shaped identifiers.
const airportsCsv = [
    '"id","ident","type","name","iata_code","local_code"',
    '1,"KSEA","large_airport","Seattle-Tacoma Intl","SEA","SEA"',
    '2,"KPDX","large_airport","Portland Intl","PDX","PDX"',
    '3,"KLAX","large_airport","Los Angeles Intl","LAX","LAX"',
    '7,"KDEN","large_airport","Denver Intl","DEN","DEN"',
    // Ambiguous: two idents claim the same IATA code.
    '4,"KXXX","large_airport","First Ambiguous","AMB","XXX"',
    '5,"KYYY","large_airport","Second Ambiguous","AMB","YYY"',
    // Non-ICAO-shaped ident must not be accepted as an ICAO code.
    '6,"00A","small_airport","Total RF Heliport","SML","00A"',
    ''
].join('\n');
const airportMap = buildAirportIcaoMap(airportsCsv);

assert.throws(
    () => buildAirportIcaoMap([
        'ident,iata_code,name',
        'KSEA,SEA'
    ].join('\n')),
    /OurAirports CSV row 2 has 2 fields; expected 3/,
    'every OurAirports row must have exactly the header field count'
);

assert.throws(
    () => buildAirportIcaoMap([
        'ident,iata_code,ident',
        'KSEA,SEA,SECOND'
    ].join('\n')),
    /OurAirports CSV has duplicate required column: ident/,
    'duplicate OurAirports mapping columns must fail closed'
);

assert.strictEqual(resolveAirportIcao(airportMap, 'PDX'), 'KPDX', 'PDX resolves to its ICAO ident');
assert.strictEqual(resolveAirportIcao(airportMap, 'LAX'), 'KLAX', 'LAX resolves to its ICAO ident');
assert.strictEqual(resolveAirportIcao(airportMap, 'AMB'), null, 'ambiguous IATA must fail closed');
assert.strictEqual(resolveAirportIcao(airportMap, 'SML'), null, 'non-ICAO ident must not resolve');
assert.strictEqual(resolveAirportIcao(airportMap, 'ZZZ'), null, 'unknown IATA is unresolved');

// normalizeSchedule: select the sample date + airport, choose arrival/departure
// times, map every code, derive stable ids, and sort by scheduledTime then id.
const airlineMap = { AS: 'asa', DL: 'dal', UA: 'ual' };
const btsCsv = [
    'FlightDate,Reporting_Airline,Flight_Number_Reporting_Airline,Origin,Dest,CRSDepTime,CRSArrTime,Cancelled',
    '2026-07-15,AS,123,SEA,PDX,815,900,0',
    '2026-07-15,DL,456,LAX,SEA,600,830,0',
    '2026-07-15,UA,10,SEA,DEN,700,1030,0',
    '2026-07-14,AS,999,SEA,LAX,700,900,0',
    '2026-07-15,DL,777,BOS,DEN,700,900,0',
    ''
].join('\n');

const baseOptions = {
    bts: parseCsv(btsCsv),
    airportMap,
    airlineMap,
    airportIata: 'SEA',
    airportIcao: 'KSEA',
    timezone: 'America/Los_Angeles',
    sampleDate: '2026-07-15',
    retrievedAt: '2026-09-26',
    sourceUrl: 'https://transtats.bts.gov/PREZIP/example.zip'
};

assert.throws(
    () => normalizeSchedule({ ...baseOptions, timezone: 'Not/AZone' }),
    /timezone must be a valid IANA time zone/,
    'invalid timezone metadata must fail before a schedule can be published'
);
assert.throws(
    () => normalizeSchedule({ ...baseOptions, sampleDate: '2026-02-30' }),
    /sampleDate must be a real YYYY-MM-DD calendar date/,
    'invalid sample-date metadata must fail before a schedule can be published'
);
assert.throws(
    () => normalizeSchedule({ ...baseOptions, retrievedAt: '' }),
    /retrievedAt must be a real YYYY-MM-DD calendar date/,
    'invalid retrieval-date metadata must fail before a schedule can be published'
);
assert.throws(
    () => normalizeSchedule({ ...baseOptions, sourceUrl: '' }),
    /sourceUrl must be an absolute HTTP URL/,
    'invalid source provenance must fail before a schedule can be published'
);

const schedule = normalizeSchedule({ ...baseOptions });

assert.strictEqual(schedule.schemaVersion, 1);
assert.strictEqual(schedule.airportIcao, 'KSEA');
assert.strictEqual(schedule.timezone, 'America/Los_Angeles');
assert.strictEqual(schedule.sampleDate, '2026-07-15');
assert.strictEqual(schedule.source.name, 'US DOT BTS Reporting Carrier On-Time Performance');
assert.strictEqual(schedule.source.url, 'https://transtats.bts.gov/PREZIP/example.zip');
assert.strictEqual(schedule.source.retrievedAt, '2026-09-26');
assert.match(schedule.source.license, /public domain/i);
assert.match(schedule.source.coverage, /domestic/i);
assert.match(schedule.source.coverage, /exclud/i);
assert.match(schedule.source.coverage, /https:\/\/ourairports\.com\/data\//);
assert.doesNotMatch(schedule.source.coverage, /full|complete|all traffic/i);

assert.strictEqual(schedule.flights.length, 3, 'only same-day flights touching SEA are kept');
assert.deepStrictEqual(schedule.flights, [
    {
        id: 'departure-ua10-sea-den',
        category: 'departure',
        scheduledTime: '07:00',
        airlineIcao: 'ual',
        flightNumber: '10',
        originIcao: 'KSEA',
        destinationIcao: 'KDEN'
    },
    {
        id: 'departure-as123-sea-pdx',
        category: 'departure',
        scheduledTime: '08:15',
        airlineIcao: 'asa',
        flightNumber: '123',
        originIcao: 'KSEA',
        destinationIcao: 'KPDX'
    },
    {
        id: 'arrival-dl456-lax-sea',
        category: 'arrival',
        scheduledTime: '08:30',
        airlineIcao: 'dal',
        flightNumber: '456',
        originIcao: 'KLAX',
        destinationIcao: 'KSEA'
    }
], 'departures use CRSDepTime, arrivals CRSArrTime, sorted by time then id');

assert.throws(
    () => normalizeSchedule({
        ...baseOptions,
        bts: btsRows('2026-07-14,AS,123,SEA,PDX,815,900')
    }),
    /no flights matched SEA on 2026-07-15/,
    'a wrong date or airport must not silently produce an empty schedule'
);

// normalizeSchedule fails closed with actionable counts for each defect class.
function btsRows(...lines) {
    return parseCsv([
        'FlightDate,Reporting_Airline,Flight_Number_Reporting_Airline,Origin,Dest,CRSDepTime,CRSArrTime',
        ...lines,
        ''
    ].join('\n'));
}

assert.throws(
    () => normalizeSchedule({ ...baseOptions, bts: btsRows('2026-07-15,ZZ,5,SEA,PDX,815,900') }),
    /unresolved reporting airlines: ZZ \(1\)/,
    'unknown reporting airline must be reported with a count'
);

assert.throws(
    () => normalizeSchedule({ ...baseOptions, bts: btsRows('2026-07-15,AS,5,SEA,ZZZ,815,900') }),
    /unresolved airport codes: ZZZ \(1\)/,
    'unresolvable airport code must be reported with a count'
);

assert.throws(
    () => normalizeSchedule({
        ...baseOptions,
        bts: btsRows('2026-07-15,AS,5,SEA,PDX,815,900'),
        airlineIcaoExists: (icao) => icao !== 'asa'
    }),
    /mapped airlines with no asset in assets\/airlines: AS->asa \(1\)/,
    'a mapped airline lacking an asset must fail closed'
);

assert.throws(
    () => normalizeSchedule({
        ...baseOptions,
        bts: btsRows(
            '2026-07-15,AS,123,SEA,PDX,815,900',
            '2026-07-15,AS,123,SEA,PDX,1200,1300'
        )
    }),
    /duplicate stable ids: departure-as123-sea-pdx/,
    'colliding source identity must fail rather than suffix by row order'
);

assert.throws(
    () => normalizeSchedule({ ...baseOptions, bts: btsRows('2026-07-15,AS,5,SEA,PDX,2400,900') }),
    /invalid times/,
    'an invalid departure time must fail the run'
);

assert.throws(
    () => normalizeSchedule({ ...baseOptions, bts: btsRows('2026-07-15,AS,5,SEA,SEA,815,900') }),
    /same-airport routes: SEA->SEA \(1\)/,
    'a source row whose endpoints are both the schedule airport must fail closed'
);

assert.throws(
    () => normalizeSchedule({
        ...baseOptions,
        bts: parseCsv([
            'FlightDate,Reporting_Airline,Flight_Number_Reporting_Airline,Origin,Dest,CRSDepTime,CRSArrTime',
            '2026-07-15,AS,5,SEA,PDX,815,900,unexpected',
            ''
        ].join('\n'))
    }),
    /BTS CSV row 2 has 8 fields; expected 7/,
    'every source row must have exactly the header field count'
);

assert.throws(
    () => normalizeSchedule({
        ...baseOptions,
        bts: parseCsv([
            'FlightDate,Reporting_Airline,Flight_Number_Reporting_Airline,Origin,Dest,CRSDepTime,CRSArrTime,Reporting_Airline',
            '2026-07-15,AS,5,SEA,PDX,815,900,DL',
            ''
        ].join('\n'))
    }),
    /BTS CSV has duplicate required column: Reporting_Airline/,
    'duplicate BTS identity columns must fail closed'
);

assert.throws(
    () => normalizeSchedule({ ...baseOptions, bts: [['FlightDate', 'Origin']] }),
    /missing required columns/,
    'a BTS table missing required columns is rejected'
);

// The schedule airport itself must resolve unambiguously through OurAirports to
// the supplied ICAO; the airport end is never trusted blindly.
assert.throws(
    () => normalizeSchedule({ ...baseOptions, airportIcao: 'KLAX' }),
    /schedule airport IATA SEA does not resolve to the supplied ICAO KLAX/,
    'a mismatch between the airport IATA resolution and supplied ICAO must fail'
);

assert.throws(
    () => normalizeSchedule({
        ...baseOptions,
        airportMap: buildAirportIcaoMap('id,ident,iata_code\n1,KPDX,PDX\n')
    }),
    /schedule airport IATA SEA does not resolve to the supplied ICAO KSEA/,
    'an unresolvable schedule airport IATA must fail'
);

// The shipped reporting-airline map exposes exactly the sample's IATA->ICAO pairs.
assert.deepStrictEqual(
    loadAirlineMap(),
    { AS: 'asa', DL: 'dal', OO: 'skw', UA: 'ual', WN: 'swa', AA: 'aal', F9: 'fft', MQ: 'eny', B6: 'jbu' },
    'the reviewable airline map must stay explicit and in sync with the sample'
);

// importSchedule: end-to-end read -> normalize -> atomic write.
function makeWorkspace() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sop-import-'));
    const airlinesDir = path.join(root, 'airlines');

    fs.mkdirSync(airlinesDir, { recursive: true });
    ['asa', 'dal', 'ual'].forEach((icao) => {
        fs.writeFileSync(path.join(airlinesDir, `${icao}.json`), `{"icao":"${icao}"}\n`);
    });
    fs.writeFileSync(path.join(root, 'bts.csv'), btsCsv);
    fs.writeFileSync(path.join(root, 'airports.csv'), airportsCsv);

    return { airlinesDir, root };
}

function baseImport(workspace, overrides) {
    return {
        btsPath: path.join(workspace.root, 'bts.csv'),
        airportsPath: path.join(workspace.root, 'airports.csv'),
        iata: 'SEA',
        icao: 'KSEA',
        timezone: 'America/Los_Angeles',
        sampleDate: '2026-07-15',
        retrievedAt: '2026-09-26',
        sourceUrl: 'https://transtats.bts.gov/PREZIP/example.zip',
        outPath: path.join(workspace.root, 'ksea.json'),
        airlinesDir: workspace.airlinesDir,
        ...overrides
    };
}

(function importWritesAtomically() {
    const workspace = makeWorkspace();

    try {
        const options = baseImport(workspace);
        const result = importSchedule(options);
        const written = fs.readFileSync(options.outPath, 'utf8');

        assert.deepStrictEqual(JSON.parse(written), result, 'return value must match the written file');
        assert.strictEqual(result.flights.length, 3);
        assert.ok(written.endsWith('\n'), 'output must end with a trailing newline');
        assert.strictEqual(written, `${JSON.stringify(result, null, 2)}\n`, 'output must be 2-space indented');
        assert.deepStrictEqual(
            fs.readdirSync(workspace.root).filter((name) => name.includes('.tmp')),
            [],
            'no temporary file may remain after a successful import'
        );
    } finally {
        fs.rmSync(workspace.root, { force: true, recursive: true });
    }
}());

(function importLeavesNoPartialOutputOnFailure() {
    const workspace = makeWorkspace();

    try {
        // A same-airport route violates the normalized schedule contract and
        // must abort before replacing an existing destination.
        fs.writeFileSync(path.join(workspace.root, 'bts.csv'), btsRows('2026-07-15,AS,5,SEA,SEA,815,900')
            .map((row) => row.join(','))
            .join('\n'));

        const options = baseImport(workspace);
        fs.writeFileSync(options.outPath, 'existing valid schedule\n');
        assert.throws(() => importSchedule(options), /same-airport routes: SEA->SEA \(1\)/);
        assert.strictEqual(
            fs.readFileSync(options.outPath, 'utf8'),
            'existing valid schedule\n',
            'failed import must preserve an existing output unchanged'
        );
        assert.deepStrictEqual(
            fs.readdirSync(workspace.root).filter((name) => name.includes('.tmp')),
            [],
            'failed import must not leave a temporary file'
        );
    } finally {
        fs.rmSync(workspace.root, { force: true, recursive: true });
    }
}());

// CLI parsing maps flags to importer options and rejects incomplete invocations.
assert.deepStrictEqual(
    parseCliArguments([
        '--bts', 'b.csv', '--airports', 'a.csv', '--iata', 'SEA', '--icao', 'KSEA',
        '--timezone', 'America/Los_Angeles', '--date', '2026-07-15',
        '--retrieved', '2026-09-26', '--source-url', 'https://example.test', '--out', 'out.json'
    ]),
    {
        btsPath: 'b.csv',
        airportsPath: 'a.csv',
        iata: 'SEA',
        icao: 'KSEA',
        timezone: 'America/Los_Angeles',
        sampleDate: '2026-07-15',
        retrievedAt: '2026-09-26',
        sourceUrl: 'https://example.test',
        outPath: 'out.json'
    },
    'every flag maps to its importer option'
);

assert.throws(
    () => parseCliArguments(['--bts', 'b.csv']),
    /missing required arguments: .*--out/,
    'omitting required flags is rejected with usage'
);

assert.throws(() => parseCliArguments(['--nope', 'x']), /unknown argument: --nope/);
assert.throws(() => parseCliArguments(['--bts']), /missing value for --bts/);

// The CLI entrypoint exits nonzero and prints usage when arguments are missing.
const cliResult = spawnSync(process.execPath, [path.join(__dirname, 'import-bts-schedule.js')], {
    encoding: 'utf8'
});
assert.notStrictEqual(cliResult.status, 0, 'a bare invocation must exit nonzero');
assert.match(cliResult.stderr, /missing required arguments/);
assert.match(cliResult.stderr, /Usage:/);

// Vertical seam: real importer output flows unchanged into the real asset
// validator inside a tiny complete fixture, yielding zero errors.
(function importerOutputSatisfiesRealValidator() {
    const workspace = makeWorkspace();
    const assetsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sop-assets-'));

    function writeJson(target, value) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
    }

    try {
        writeJson(path.join(assetsRoot, 'airports', 'airportLoadList.json'), [
            { icao: 'ksea', level: 'beginner', name: 'Seattle-Tacoma Intl', premium: false }
        ]);
        writeJson(path.join(assetsRoot, 'airports', 'ksea.json'), {
            arrivalRunway: '16L',
            ctr_ceiling: 15000,
            ctr_radius: 50,
            departureRunway: '34R',
            fixes: {},
            iata: 'SEA',
            icao: 'KSEA',
            initial_alt: 5000,
            magnetic_north: 0,
            position: [47, -122],
            radio: { app: 'Seattle Approach', dep: 'Seattle Departure', twr: 'Seattle Tower' },
            rangeRings: { enabled: true, center: [47, -122], radius_nm: 5 },
            runways: [{ name: ['16L', '34R'], end: [[1, 2], [3, 4]], ils: [true, true] }],
            sids: {},
            wind: { angle: 180, speed: 5 }
        });
        ['asa', 'dal', 'ual'].forEach((icao) => {
            writeJson(path.join(assetsRoot, 'airlines', `${icao}.json`), { icao });
        });
        writeJson(path.join(assetsRoot, 'schedules', 'scheduleLoadList.json'), [
            { icao: 'ksea', file: 'ksea.json' }
        ]);
        fs.copyFileSync(
            path.join(__dirname, '..', '..', 'assets', 'schedules', 'schedule.schema.json'),
            path.join(assetsRoot, 'schedules', 'schedule.schema.json')
        );

        // Produce the schedule with the real importer and feed it in unchanged.
        importSchedule(baseImport(workspace, {
            outPath: path.join(assetsRoot, 'schedules', 'ksea.json')
        }));

        const result = validateAssets(assetsRoot);
        assert.deepStrictEqual(result.errors, [], 'importer output must validate with zero errors');
        assert.strictEqual(result.scheduleCount, 1, 'the imported schedule must be counted');
    } finally {
        fs.rmSync(assetsRoot, { force: true, recursive: true });
        fs.rmSync(workspace.root, { force: true, recursive: true });
    }
}());

// Corpus audit: the shipped normalized derivative retains the reviewed 2026-07-15
// On-Time baseline and adds the deterministic 2026-05 T-100 representative profile.
(function shippedKseaCorpusMatchesReviewedImport() {
    const filename = path.join(__dirname, '..', '..', 'assets', 'schedules', 'ksea.json');
    const contents = fs.readFileSync(filename);
    const shipped = JSON.parse(contents);
    const categoryCounts = shipped.flights.reduce((counts, flight) => {
        counts[flight.category] = (counts[flight.category] || 0) + 1;
        return counts;
    }, {});
    const airlineCounts = shipped.flights.reduce((counts, flight) => {
        const airline = flight.airlineIcao || 'generated';
        counts[airline] = (counts[airline] || 0) + 1;
        return counts;
    }, {});
    const synthesizedCount = shipped.flights.filter((flight) => flight.id.startsWith('t100-')).length;
    const remoteAirportCount = new Set(shipped.flights.map((flight) =>
        flight.category === 'arrival' ? flight.originIcao : flight.destinationIcao
    )).size;

    assert.strictEqual(shipped.sampleDate, '2026-07-15');
    assert.strictEqual(shipped.timezone, 'America/Los_Angeles');
    assert.strictEqual(shipped.flights.length, 1208);
    assert.strictEqual(synthesizedCount, 170);
    assert.strictEqual(remoteAirportCount, 120);
    assert.deepStrictEqual(categoryCounts, { arrival: 605, departure: 603 });
    assert.deepStrictEqual(airlineCounts, {
        aal: 46,
        aar: 1,
        abx: 7,
        aca: 2,
        afr: 1,
        aih: 2,
        amx: 2,
        ana: 2,
        asa: 480,
        baw: 4,
        box: 1,
        cal: 3,
        chh: 1,
        cpa: 1,
        dal: 196,
        dlh: 3,
        ein: 2,
        eny: 8,
        eva: 3,
        fdx: 11,
        fft: 10,
        ice: 4,
        jal: 2,
        jbu: 6,
        jza: 7,
        kal: 3,
        lco: 1,
        pal: 1,
        qtr: 1,
        qxe: 90,
        scx: 2,
        sia: 1,
        sjx: 2,
        skw: 165,
        swa: 62,
        thy: 2,
        ual: 65,
        vir: 2,
        voi: 2,
        wja: 4
    });
    assert.strictEqual(
        crypto.createHash('sha256').update(contents).digest('hex'),
        'd6f1bb5eab122ef69846847ecd9b5788085b11a6ae86249124c8855426fa6794'
    );
}());

console.log('import-bts-schedule tests passed');
