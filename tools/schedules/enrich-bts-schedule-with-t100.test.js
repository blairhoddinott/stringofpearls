'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    enrichScheduleWithT100,
    importEnrichedSchedule,
    parseCliArguments,
    rebalanceDirectionAllocations
} = require('./enrich-bts-schedule-with-t100');
const { buildAirportIcaoMap } = require('./import-bts-schedule');
const { validateScheduleDocument } = require('../validate-assets');

const baseSchedule = {
    schemaVersion: 1,
    airportIcao: 'KSEA',
    timezone: 'America/Los_Angeles',
    sampleDate: '2026-07-15',
    source: {
        name: 'US DOT BTS Reporting Carrier On-Time Performance',
        url: 'https://example.test/on-time',
        retrievedAt: '2026-09-21',
        license: 'Public domain',
        coverage: 'Fixture'
    },
    flights: [
        {
            id: 'bts-as-100-sea-pdx-departure',
            scheduledTime: '06:00',
            category: 'departure',
            originIcao: 'KSEA',
            destinationIcao: 'KPDX',
            airlineIcao: 'asa',
            flightNumber: '100'
        },
        {
            id: 'bts-as-101-pdx-sea-arrival',
            scheduledTime: '07:00',
            category: 'arrival',
            originIcao: 'KPDX',
            destinationIcao: 'KSEA',
            airlineIcao: 'asa',
            flightNumber: '101'
        },
        {
            id: 'bts-as-102-sea-lax-departure',
            scheduledTime: '18:00',
            category: 'departure',
            originIcao: 'KSEA',
            destinationIcao: 'KLAX',
            airlineIcao: 'asa',
            flightNumber: '102'
        },
        {
            id: 'bts-as-103-lax-sea-arrival',
            scheduledTime: '19:00',
            category: 'arrival',
            originIcao: 'KLAX',
            destinationIcao: 'KSEA',
            airlineIcao: 'asa',
            flightNumber: '103'
        }
    ]
};

const airportsCsv = [
    'ident,iata_code,name',
    'KSEA,SEA,Seattle-Tacoma International',
    'KPDX,PDX,Portland International',
    'KLAX,LAX,Los Angeles International',
    'KBOI,BOI,Boise Airport',
    'KMEM,MEM,Memphis International',
    'EGLL,LHR,London Heathrow',
    'RCTP,TPE,Taiwan Taoyuan International',
    ''
].join('\n');

const header = [
    'DEPARTURES_SCHEDULED',
    'DEPARTURES_PERFORMED',
    'UNIQUE_CARRIER',
    'AIRLINE_ID',
    'UNIQUE_CARRIER_NAME',
    'CARRIER',
    'CARRIER_NAME',
    'ORIGIN',
    'DEST',
    'AIRCRAFT_TYPE',
    'AIRCRAFT_CONFIG',
    'YEAR',
    'MONTH',
    'CLASS',
    'DATA_SOURCE'
].join(',');

const rows = [
    // Existing AS traffic contributes to the T-100 daily-volume ceiling but is
    // not duplicated because the exact On-Time schedule already contains it.
    '60,60,AS,19930,Alaska Airlines Inc.,AS,Alaska Airlines Inc.,SEA,PDX,614,1,2026,4,F,DU',
    '60,60,AS,19930,Alaska Airlines Inc.,AS,Alaska Airlines Inc.,PDX,SEA,614,1,2026,4,F,DU',
    '0,60,QX,19687,Horizon Air,QX,Horizon Air,SEA,BOI,638,1,2026,4,F,DU',
    '0,60,QX,19687,Horizon Air,QX,Horizon Air,BOI,SEA,638,1,2026,4,F,DU',
    '30,30,FX,20107,Federal Express Corporation,FX,Federal Express Corporation,SEA,MEM,625,2,2026,4,G,DU',
    '30,30,FX,20107,Federal Express Corporation,FX,Federal Express Corporation,MEM,SEA,625,2,2026,4,G,DU',
    '0,30,BA,19540,British Airways Plc,BA,British Airways Plc,SEA,LHR,819,1,2026,4,F,IF',
    '0,30,BA,19540,British Airways Plc,BA,British Airways Plc,LHR,SEA,819,1,2026,4,F,IF',
    // Every selected carrier must map to a real repository airline asset.
    '0,30,JX,99999,STARLUX AIRLINES,JX,STARLUX AIRLINES,SEA,TPE,819,1,2026,4,F,IF'
];

const input = `${header}\n${rows.join('\n')}\n`;
const options = {
    airportIata: 'SEA',
    airportIcao: 'KSEA',
    year: 2026,
    month: 4,
    retrievedAt: '2026-09-27',
    sourceUrl: 'https://transtats.bts.gov/t100-fixture',
    airlineMap: {
        AS: 'asa',
        QX: 'qxe',
        FX: 'fdx',
        BA: 'baw',
        JX: 'sjx'
    },
    airlineIcaoExists: (icao) => ['asa', 'qxe', 'fdx', 'baw', 'sjx'].includes(icao)
};

const enriched = enrichScheduleWithT100({
    baseSchedule,
    t100Csv: input,
    airportMap: buildAirportIcaoMap(airportsCsv),
    ...options
});

assert.strictEqual(enriched.flights.length, 13, 'T-100 monthly volume should cap the representative day at 13');
assert.deepStrictEqual(
    enriched.flights.filter((flight) => flight.id.startsWith('bts-')),
    baseSchedule.flights,
    'exact On-Time movements must survive unchanged'
);

const synthesized = enriched.flights.filter((flight) => flight.id.startsWith('t100-'));
assert.strictEqual(synthesized.length, 9, 'only the missing-carrier daily volume is synthesized');
assert.deepStrictEqual(
    synthesized.reduce((counts, flight) => {
        const key = flight.airlineIcao || 'generated';
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {}),
    { baw: 2, fdx: 2, qxe: 4, sjx: 1 },
    'carrier quotas should use performed departures, including foreign and all-cargo service'
);
assert.deepStrictEqual(
    synthesized.reduce((counts, flight) => {
        counts[flight.category] = (counts[flight.category] || 0) + 1;
        return counts;
    }, {}),
    { arrival: 4, departure: 5 },
    'directional weighting should remain balanced apart from the one-way fixture record'
);
assert.ok(
    synthesized.every((flight) => /^([01]\d|2[0-3]):[0-5]\d$/.test(flight.scheduledTime)),
    'all synthesized wall-clock slots must be valid'
);
assert.ok(
    synthesized.every((flight) => /^[a-z]{3}$/.test(flight.airlineIcao) && /^\d{1,4}$/.test(flight.flightNumber)),
    'every synthesized movement receives a validated carrier and deterministic flight number'
);
assert.strictEqual(
    new Set(enriched.flights.map((flight) => `${flight.airlineIcao || ''}:${flight.flightNumber || ''}`)
        .filter((identity) => identity !== ':')).size,
    enriched.flights.filter((flight) => flight.airlineIcao && flight.flightNumber).length,
    'synthesized identities must not collide with exact or other synthesized identities'
);
assert.deepStrictEqual(
    enriched.flights,
    [...enriched.flights].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime) || a.id.localeCompare(b.id)),
    'the merged document must retain canonical schedule ordering'
);
assert.match(enriched.source.name, /T-100 Segment \(All Carriers\)/);
assert.match(enriched.source.coverage, /synthesized/i);
const contractErrors = [];
validateScheduleDocument(
    '/virtual/assets',
    '/virtual/assets/schedules/ksea.json',
    enriched,
    new Set(Object.values(options.airlineMap)),
    contractErrors
);
assert.deepStrictEqual(contractErrors, [], 'real enrichment output must pass the real schedule validator unchanged');

const inputHeader = input.split('\n')[0];
const existingCarrierOnlyInput = [
    inputHeader,
    ...input.split('\n').slice(1).filter((row) => row.includes(',AS,'))
].filter(Boolean).join('\n');
const unchangedWhenBudgetCannotBeFilled = enrichScheduleWithT100({
    baseSchedule,
    t100Csv: `${existingCarrierOnlyInput}\n`,
    airportMap: buildAirportIcaoMap(airportsCsv),
    ...options
});
assert.deepStrictEqual(
    unchangedWhenBudgetCannotBeFilled.flights,
    baseSchedule.flights,
    'a positive daily budget with no missing-carrier quota leaves the exact schedule unchanged'
);

const insufficientQuotaInput = [
    inputHeader,
    '0,600,AS,19930,ALASKA AIRLINES INC.,AS,ALASKA AIRLINES INC.,SEA,BOI,612,6,2026,4,F,DU',
    '0,600,AS,19930,ALASKA AIRLINES INC.,AS,ALASKA AIRLINES INC.,BOI,SEA,612,6,2026,4,F,DU',
    '0,30,QX,19687,HORIZON AIR INDUSTRIES INC.,QX,HORIZON AIR INDUSTRIES INC.,SEA,PDX,612,6,2026,4,F,DU',
    '0,30,QX,19687,HORIZON AIR INDUSTRIES INC.,QX,HORIZON AIR INDUSTRIES INC.,PDX,SEA,612,6,2026,4,F,DU'
].join('\n');
const partiallyFilledBudget = enrichScheduleWithT100({
    baseSchedule,
    t100Csv: `${insufficientQuotaInput}\n`,
    airportMap: buildAirportIcaoMap(airportsCsv),
    ...options
});
assert.strictEqual(
    partiallyFilledBudget.flights.filter((flight) => flight.id.startsWith('t100-')).length,
    2,
    'the addition budget is a cap and does not fabricate traffic beyond available missing-carrier quota'
);

const oneDirectionMissingCarrierInput = [
    inputHeader,
    '0,600,AS,19930,ALASKA AIRLINES INC.,AS,ALASKA AIRLINES INC.,SEA,BOI,612,6,2026,4,F,DU',
    '0,30,QX,19687,HORIZON AIR INDUSTRIES INC.,QX,HORIZON AIR INDUSTRIES INC.,PDX,SEA,612,6,2026,4,F,DU'
].join('\n');
const oneDirectionResult = enrichScheduleWithT100({
    baseSchedule,
    t100Csv: `${oneDirectionMissingCarrierInput}\n`,
    airportMap: buildAirportIcaoMap(airportsCsv),
    ...options
});
const oneDirectionSynthesized = oneDirectionResult.flights.filter((flight) => flight.id.startsWith('t100-'));
assert.strictEqual(oneDirectionSynthesized.length, 1);
assert.strictEqual(
    oneDirectionSynthesized[0].category,
    'arrival',
    'direction targets must be clamped to the directions the missing carriers can supply'
);

const reversed = enrichScheduleWithT100({
    baseSchedule,
    t100Csv: `${header}\n${[...rows].reverse().join('\n')}\n`,
    airportMap: buildAirportIcaoMap(airportsCsv),
    ...options
});
assert.deepStrictEqual(reversed, enriched, 'source row order must not affect the normalized schedule');

const rebalanced = rebalanceDirectionAllocations(
    new Map([
        ['A', { arrival: 1, departure: 0 }],
        ['B', { arrival: 1, departure: 0 }],
        ['C', { arrival: 1, departure: 0 }]
    ]),
    new Map([
        ['A', { arrival: 10, departure: 10 }],
        ['B', { arrival: 10, departure: 10 }],
        ['C', { arrival: 10, departure: 10 }]
    ]),
    { arrival: 1, departure: 2 }
);
assert.deepStrictEqual(
    [...rebalanced.values()].reduce((total, quota) => ({
        arrival: total.arrival + quota.arrival,
        departure: total.departure + quota.departure
    }), { arrival: 0, departure: 0 }),
    { arrival: 1, departure: 2 },
    'carrier direction rounding must be corrected to the global airport direction target'
);
assert.ok(
    [...rebalanced.values()].every((quota) => quota.arrival + quota.departure === 1),
    'direction rebalancing must preserve every carrier total'
);

const decimalInput = [header, ...rows.map((row) => {
    const columns = row.split(',');
    columns[0] = `${columns[0]}.00`;
    columns[1] = `${columns[1]}.00`;
    return columns.join(',');
}), ''].join('\n');
assert.deepStrictEqual(
    enrichScheduleWithT100({
        baseSchedule,
        t100Csv: decimalInput,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options
    }),
    enriched,
    'whole-number T-100 measures serialized with decimal zeroes must normalize identically'
);
assert.deepStrictEqual(
    enrichScheduleWithT100({
        baseSchedule,
        t100Csv: `${input.trimEnd()}\n0,30,OO,20304,SkyWest Airlines Inc.,OO,SkyWest Airlines Inc.,SEA,SEA,673,1,2026,4,F,DU\n`,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options
    }),
    enriched,
    'same-airport T-100 segments must be explicitly excluded from physical movements'
);

assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule: { ...baseSchedule, airportIcao: 'KPDX' },
        t100Csv: input,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options
    }),
    /base schedule airport KPDX does not match KSEA/,
    'the base document must belong to the requested airport'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule,
        t100Csv: input,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options,
        sourceUrl: '/relative'
    }),
    /sourceUrl must be an absolute HTTP\(S\) URL/,
    'source provenance must use an absolute HTTP(S) URL'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule,
        t100Csv: input,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options,
        retrievedAt: '2026-02-30'
    }),
    /retrievedAt must be a real YYYY-MM-DD date/,
    'source provenance must use a real calendar date'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule,
        t100Csv: input,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options,
        month: 13
    }),
    /month must be an integer from 1 through 12/,
    'the requested reporting month must be valid before parsing rows'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule,
        t100Csv: input.replace('AIRLINE_ID', 'UNIQUE_CARRIER'),
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options
    }),
    /duplicate required column: UNIQUE_CARRIER/,
    'duplicate authoritative headers must fail closed'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule,
        t100Csv: `${header}\n${rows[0]},extra\n`,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options
    }),
    /row 2 has 16 fields; expected 15/,
    'row-width drift must fail closed'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule,
        t100Csv: `${header}\n${rows[0].replace(',60,AS,', ',-1,AS,')}\n`,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options
    }),
    /DEPARTURES_PERFORMED must be an integer/,
    'negative performed-departure counts must fail closed'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule,
        t100Csv: input,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options,
        year: 2025
    }),
    /contains no performed scheduled movements for SEA in 2025-04/,
    'an empty reporting-period selection must fail closed'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule,
        t100Csv: input.replaceAll('BOI', 'ZZZ'),
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options
    }),
    /unresolved T-100 airport code: ZZZ/,
    'allocated remote airports must resolve explicitly'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule,
        t100Csv: `${input.trimEnd()}\n0,1,SK,99998,Scandinavian Airlines Sys.,SK,Scandinavian Airlines Sys.,SEA,ZZZ,819,1,2026,4,F,IF\n`,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options,
        airlineMap: { ...options.airlineMap, SK: 'sas' },
        airlineIcaoExists: (icao) => [...Object.values(options.airlineMap), 'sas'].includes(icao)
    }),
    /unresolved T-100 airport code: ZZZ/,
    'positive source routes must resolve even when their daily quota rounds to zero'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule,
        t100Csv: input,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options,
        airlineMap: Object.fromEntries(Object.entries(options.airlineMap).filter(([code]) => code !== 'JX'))
    }),
    /unresolved T-100 airline code: JX/,
    'every selected carrier must resolve instead of emitting a schema-invalid partial identity'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule,
        t100Csv: input.replace(/,IF\n$/, ',\n'),
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options
    }),
    /DATA_SOURCE must be one of DU, DF, IU, or IF/,
    'source provenance codes must be validated rather than merely required as a header'
);
assert.throws(
    () => enrichScheduleWithT100({
        baseSchedule: { ...baseSchedule, sampleDate: '2026-02-30' },
        t100Csv: input,
        airportMap: buildAirportIcaoMap(airportsCsv),
        ...options
    }),
    /base schedule.*sampleDate must be a real YYYY-MM-DD calendar date/,
    'the exact baseline must pass the real schedule contract before enrichment'
);

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 't100-enrichment-'));
const basePath = path.join(temporaryDirectory, 'base.json');
const t100Path = path.join(temporaryDirectory, 't100.csv');
const airportsPath = path.join(temporaryDirectory, 'airports.csv');
const airlineMapPath = path.join(temporaryDirectory, 'airline-map.json');
const airlinesDirectory = path.join(temporaryDirectory, 'airlines');
const outputPath = path.join(temporaryDirectory, 'schedule.json');
fs.mkdirSync(airlinesDirectory);
fs.writeFileSync(basePath, JSON.stringify(baseSchedule));
fs.writeFileSync(t100Path, input);
fs.writeFileSync(airportsPath, airportsCsv);
fs.writeFileSync(airlineMapPath, JSON.stringify(options.airlineMap));
Object.values(options.airlineMap).forEach((icao) => {
    fs.writeFileSync(path.join(airlinesDirectory, `${icao}.json`), JSON.stringify({ icao }));
});

const imported = importEnrichedSchedule({
    basePath,
    t100Path,
    airportsPath,
    airlineMapPath,
    airlinesDirectory,
    outputPath,
    airportIata: options.airportIata,
    airportIcao: options.airportIcao,
    year: String(options.year),
    month: String(options.month),
    retrievedAt: options.retrievedAt,
    sourceUrl: options.sourceUrl
});
assert.deepStrictEqual(imported, enriched, 'the file importer must use the pure normalizer contract unchanged');
assert.strictEqual(
    fs.readFileSync(outputPath, 'utf8'),
    `${JSON.stringify(enriched, null, 2)}\n`,
    'the file importer writes the canonical normalized document'
);

fs.writeFileSync(outputPath, 'preserve me');
fs.writeFileSync(t100Path, `${header}\n${rows[0]},extra\n`);
assert.throws(
    () => importEnrichedSchedule({
        basePath,
        t100Path,
        airportsPath,
        airlineMapPath,
        airlinesDirectory,
        outputPath,
        airportIata: options.airportIata,
        airportIcao: options.airportIcao,
        year: String(options.year),
        month: String(options.month),
        retrievedAt: options.retrievedAt,
        sourceUrl: options.sourceUrl
    }),
    /row 2 has 16 fields; expected 15/,
    'file import must fail before replacing an existing destination'
);
assert.strictEqual(fs.readFileSync(outputPath, 'utf8'), 'preserve me');
assert.ok(
    !fs.readdirSync(temporaryDirectory).some((name) => name.startsWith('schedule.json.tmp-')),
    'failed import must not leave temporary output'
);

fs.writeFileSync(t100Path, input);
fs.writeFileSync(basePath, JSON.stringify({ ...baseSchedule, unexpected: true }));
assert.throws(
    () => importEnrichedSchedule({
        basePath,
        t100Path,
        airportsPath,
        airlineMapPath,
        airlinesDirectory,
        outputPath,
        airportIata: options.airportIata,
        airportIcao: options.airportIcao,
        year: String(options.year),
        month: String(options.month),
        retrievedAt: options.retrievedAt,
        sourceUrl: options.sourceUrl
    }),
    /base schedule.*unsupported property unexpected/,
    'post-parse contract failure must occur before replacing an existing destination'
);
assert.strictEqual(fs.readFileSync(outputPath, 'utf8'), 'preserve me');
fs.rmSync(temporaryDirectory, { recursive: true, force: true });

const cliArguments = [
    '--base', 'base.json',
    '--t100', 't100.csv',
    '--airports', 'airports.csv',
    '--airline-map', 'map.json',
    '--airlines-dir', 'airlines',
    '--iata', 'SEA',
    '--icao', 'KSEA',
    '--year', '2026',
    '--month', '4',
    '--retrieved', '2026-09-27',
    '--source-url', 'https://example.test/t100',
    '--out', 'out.json'
];
assert.deepStrictEqual(parseCliArguments(cliArguments), {
    basePath: 'base.json',
    t100Path: 't100.csv',
    airportsPath: 'airports.csv',
    airlineMapPath: 'map.json',
    airlinesDirectory: 'airlines',
    airportIata: 'SEA',
    airportIcao: 'KSEA',
    year: '2026',
    month: '4',
    retrievedAt: '2026-09-27',
    sourceUrl: 'https://example.test/t100',
    outputPath: 'out.json'
});
assert.throws(
    () => parseCliArguments(cliArguments.slice(0, -2)),
    /missing required arguments: --out/,
    'CLI must enumerate missing required arguments'
);
assert.throws(
    () => parseCliArguments([...cliArguments, '--mystery', 'value']),
    /unknown argument: --mystery/,
    'CLI must reject unknown arguments'
);
assert.throws(
    () => parseCliArguments([...cliArguments, '--month', '5']),
    /duplicate argument: --month/,
    'CLI must reject duplicate flags instead of silently accepting the final value'
);

console.log('T-100 schedule enrichment tests passed');
