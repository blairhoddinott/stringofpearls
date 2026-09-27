'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parseCsv, buildAirportIcaoMap, resolveAirportIcao } = require('./import-bts-schedule');
const { validateScheduleDocument } = require('../validate-assets');

const REQUIRED_COLUMNS = [
    'DEPARTURES_SCHEDULED',
    'DEPARTURES_PERFORMED',
    'UNIQUE_CARRIER',
    'UNIQUE_CARRIER_NAME',
    'ORIGIN',
    'DEST',
    'YEAR',
    'MONTH',
    'CLASS',
    'DATA_SOURCE'
];
const INCLUDED_SERVICE_CLASSES = new Set(['F', 'G']);

function isRealDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateOptions({
    baseSchedule,
    airportIata,
    airportIcao,
    year,
    month,
    retrievedAt,
    sourceUrl,
    airlineMap,
    airlineIcaoExists
}) {
    if (!baseSchedule || baseSchedule.airportIcao !== airportIcao) {
        throw new Error(
            `base schedule airport ${baseSchedule && baseSchedule.airportIcao} does not match ${airportIcao}`
        );
    }
    if (!Array.isArray(baseSchedule.flights) || baseSchedule.flights.length === 0) {
        throw new Error('base schedule must contain observed flights');
    }
    if (!/^[A-Z0-9]{3}$/.test(airportIata) || !/^[A-Z0-9]{4}$/.test(airportIcao)) {
        throw new Error('airportIata and airportIcao must be uppercase airport codes');
    }
    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
        throw new Error('year must be an integer from 1900 through 9999');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('month must be an integer from 1 through 12');
    }
    if (!isRealDate(retrievedAt)) {
        throw new Error('retrievedAt must be a real YYYY-MM-DD date');
    }
    let parsedUrl;
    try {
        parsedUrl = new URL(sourceUrl);
    } catch {
        throw new Error('sourceUrl must be an absolute HTTP(S) URL');
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('sourceUrl must be an absolute HTTP(S) URL');
    }
    if (!airlineMap || typeof airlineMap !== 'object' || Array.isArray(airlineMap)) {
        throw new Error('airlineMap must be an object');
    }
    if (typeof airlineIcaoExists !== 'function') {
        throw new Error('airlineIcaoExists must be a function');
    }
}

function stableHash(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function requireInteger(value, label, minimum = 0) {
    if (!/^\d+(?:\.0+)?$/.test(value)) {
        throw new Error(`${label} must be an integer`);
    }

    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum) {
        throw new Error(`${label} must be an integer >= ${minimum}`);
    }

    return number;
}

function indexColumns(header) {
    const indexes = {};

    REQUIRED_COLUMNS.forEach((name) => {
        const matches = [];
        header.forEach((column, index) => {
            if (column === name) {
                matches.push(index);
            }
        });

        if (matches.length === 0) {
            throw new Error(`T-100 CSV is missing required column: ${name}`);
        }
        if (matches.length > 1) {
            throw new Error(`T-100 CSV has duplicate required column: ${name}`);
        }
        indexes[name] = matches[0];
    });

    return indexes;
}

function allocateByWeight(items, quota, weightOf, keyOf) {
    if (quota === 0) {
        return new Map(items.map((item) => [item, 0]));
    }

    const totalWeight = items.reduce((total, item) => total + weightOf(item), 0);
    if (totalWeight <= 0) {
        throw new Error('cannot allocate a positive quota from zero weight');
    }

    const allocations = new Map();
    const remainders = [];
    let allocated = 0;

    items.forEach((item) => {
        const exact = quota * weightOf(item) / totalWeight;
        const floor = Math.floor(exact);
        allocations.set(item, floor);
        allocated += floor;
        remainders.push({ item, remainder: exact - floor, key: keyOf(item) });
    });

    remainders.sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key));
    for (let index = 0; index < quota - allocated; index += 1) {
        const item = remainders[index].item;
        allocations.set(item, allocations.get(item) + 1);
    }

    return allocations;
}

function aggregateT100({ t100Csv, airportIata, year, month }) {
    const table = parseCsv(t100Csv);
    if (table.length < 2) {
        throw new Error('T-100 CSV contains no data rows');
    }

    const header = table[0];
    const indexes = indexColumns(header);
    const aggregates = new Map();

    table.slice(1).forEach((row, rowOffset) => {
        const rowNumber = rowOffset + 2;
        if (row.length !== header.length) {
            throw new Error(`T-100 CSV row ${rowNumber} has ${row.length} fields; expected ${header.length}`);
        }

        const rowYear = requireInteger(row[indexes.YEAR], `T-100 row ${rowNumber} YEAR`, 1900);
        const rowMonth = requireInteger(row[indexes.MONTH], `T-100 row ${rowNumber} MONTH`, 1);
        if (rowMonth > 12) {
            throw new Error(`T-100 row ${rowNumber} MONTH must be <= 12`);
        }
        if (rowYear !== year || rowMonth !== month) {
            return;
        }

        const origin = row[indexes.ORIGIN].trim();
        const destination = row[indexes.DEST].trim();
        const serviceClass = row[indexes.CLASS].trim();
        if ((origin !== airportIata && destination !== airportIata) || !INCLUDED_SERVICE_CLASSES.has(serviceClass)) {
            return;
        }
        const dataSource = row[indexes.DATA_SOURCE].trim();
        if (!/^[DI][UF]$/.test(dataSource)) {
            throw new Error(`T-100 row ${rowNumber} DATA_SOURCE must be one of DU, DF, IU, or IF`);
        }
        if (origin === destination) {
            return;
        }

        const performed = requireInteger(
            row[indexes.DEPARTURES_PERFORMED],
            `T-100 row ${rowNumber} DEPARTURES_PERFORMED`
        );
        requireInteger(row[indexes.DEPARTURES_SCHEDULED], `T-100 row ${rowNumber} DEPARTURES_SCHEDULED`);
        if (performed === 0) {
            return;
        }

        const carrier = row[indexes.UNIQUE_CARRIER].trim();
        const carrierName = row[indexes.UNIQUE_CARRIER_NAME].trim();
        if (!/^[A-Z0-9]{2,3}$/.test(carrier) || carrierName.length === 0) {
            throw new Error(`T-100 row ${rowNumber} has invalid carrier identity`);
        }
        if (!/^[A-Z0-9]{3}$/.test(origin) || !/^[A-Z0-9]{3}$/.test(destination)) {
            throw new Error(`T-100 row ${rowNumber} has invalid airport code`);
        }

        const category = destination === airportIata ? 'arrival' : 'departure';
        const remoteIata = category === 'arrival' ? origin : destination;
        const key = [carrier, serviceClass, category, remoteIata].join('|');
        const current = aggregates.get(key) || {
            carrier,
            carrierName,
            serviceClass,
            category,
            remoteIata,
            performed: 0
        };
        current.performed += performed;
        aggregates.set(key, current);
    });

    if (aggregates.size === 0) {
        throw new Error(`T-100 selection contains no performed scheduled movements for ${airportIata} in ${year}-${String(month).padStart(2, '0')}`);
    }

    return [...aggregates.values()].sort((a, b) =>
        a.carrier.localeCompare(b.carrier) ||
        a.category.localeCompare(b.category) ||
        a.remoteIata.localeCompare(b.remoteIata) ||
        a.serviceClass.localeCompare(b.serviceClass)
    );
}

function capCarrierQuotas(quotas, budget) {
    const result = new Map(quotas);
    let total = [...result.values()].reduce((sum, value) => sum + value, 0);

    while (total > budget) {
        const reducible = [...result.entries()]
            .filter(([, value]) => value > 1)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        if (reducible.length === 0) {
            const retained = [...result.entries()]
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .slice(0, budget);
            return new Map(retained);
        }
        const [carrier, value] = reducible[0];
        result.set(carrier, value - 1);
        total -= 1;
    }

    return result;
}

function minutesFromTime(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

function timeFromMinutes(minutes) {
    const normalized = (minutes + 1440) % 1440;
    return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function assignTimes(flights, baseFlights) {
    ['arrival', 'departure'].forEach((category) => {
        const exactTimes = baseFlights
            .filter((flight) => flight.category === category)
            .map((flight) => minutesFromTime(flight.scheduledTime))
            .sort((a, b) => a - b);
        const selected = flights
            .filter((flight) => flight.category === category)
            .sort((a, b) => stableHash(a.id).localeCompare(stableHash(b.id)));

        if (selected.length > 0 && exactTimes.length === 0) {
            throw new Error(`cannot synthesize ${category} slots without observed ${category} times`);
        }

        selected.forEach((flight, index) => {
            const sampleIndex = Math.min(
                exactTimes.length - 1,
                Math.floor((index + 0.5) * exactTimes.length / selected.length)
            );
            const jitter = parseInt(stableHash(`${flight.id}|time`).slice(0, 2), 16) % 9 - 4;
            flight.scheduledTime = timeFromMinutes(exactTimes[sampleIndex] + jitter);
        });
    });
}

function assignFlightNumbers(flights, baseFlights) {
    const used = new Set(baseFlights
        .filter((flight) => flight.airlineIcao && flight.flightNumber)
        .map((flight) => `${flight.airlineIcao}|${flight.flightNumber}`));

    flights.forEach((flight) => {
        if (!flight.airlineIcao) {
            return;
        }

        let number = parseInt(stableHash(`${flight.id}|number`).slice(0, 8), 16) % 9999 + 1;
        while (used.has(`${flight.airlineIcao}|${number}`)) {
            number = number === 9999 ? 1 : number + 1;
        }
        flight.flightNumber = String(number);
        used.add(`${flight.airlineIcao}|${flight.flightNumber}`);
    });
}

function rebalanceDirectionAllocations(allocations, weights, target) {
    const result = new Map([...allocations.entries()].map(([carrier, quota]) => [carrier, { ...quota }]));
    const totals = () => [...result.values()].reduce((sum, quota) => ({
        arrival: sum.arrival + quota.arrival,
        departure: sum.departure + quota.departure
    }), { arrival: 0, departure: 0 });

    while (true) {
        const current = totals();
        const source = current.arrival > target.arrival ? 'arrival' :
            current.departure > target.departure ? 'departure' : null;
        if (!source) {
            if (current.arrival !== target.arrival || current.departure !== target.departure) {
                throw new Error('direction targets do not match the carrier quota total');
            }
            return result;
        }
        const destination = source === 'arrival' ? 'departure' : 'arrival';
        const candidates = [...result.entries()]
            .filter(([carrier, quota]) => quota[source] > 0 && weights.get(carrier)[destination] > 0)
            .map(([carrier, quota]) => {
                const carrierWeights = weights.get(carrier);
                const carrierTotal = quota.arrival + quota.departure;
                const weightTotal = carrierWeights.arrival + carrierWeights.departure;
                const idealSource = carrierTotal * carrierWeights[source] / weightTotal;
                const idealDestination = carrierTotal * carrierWeights[destination] / weightTotal;
                const before = (quota[source] - idealSource) ** 2 +
                    (quota[destination] - idealDestination) ** 2;
                const after = (quota[source] - 1 - idealSource) ** 2 +
                    (quota[destination] + 1 - idealDestination) ** 2;
                return { carrier, penalty: after - before };
            })
            .sort((a, b) => a.penalty - b.penalty ||
                stableHash(a.carrier).localeCompare(stableHash(b.carrier)));
        if (candidates.length === 0) {
            throw new Error(`cannot rebalance synthesized ${source} volume to ${destination}`);
        }
        const quota = result.get(candidates[0].carrier);
        quota[source] -= 1;
        quota[destination] += 1;
    }
}

function assertScheduleContract(label, schedule, airlineIcaoExists) {
    const airlineIcaos = new Set((Array.isArray(schedule && schedule.flights) ? schedule.flights : [])
        .map((flight) => flight && flight.airlineIcao)
        .filter((icao) => typeof icao === 'string' && airlineIcaoExists(icao)));
    const errors = [];
    validateScheduleDocument(
        '/virtual/assets',
        `/virtual/assets/schedules/${label.replaceAll(' ', '-')}.json`,
        schedule,
        airlineIcaos,
        errors
    );
    if (errors.length > 0) {
        throw new Error(`${label} failed validation: ${errors.join('; ')}`);
    }
}

function enrichScheduleWithT100({
    baseSchedule,
    t100Csv,
    airportMap,
    airportIata,
    airportIcao,
    year,
    month,
    retrievedAt,
    sourceUrl,
    airlineMap,
    airlineIcaoExists
}) {
    validateOptions({
        baseSchedule,
        airportIata,
        airportIcao,
        year,
        month,
        retrievedAt,
        sourceUrl,
        airlineMap,
        airlineIcaoExists
    });
    assertScheduleContract('base schedule', baseSchedule, airlineIcaoExists);
    const aggregates = aggregateT100({ t100Csv, airportIata, year, month });
    const unresolvedAirports = new Set();
    const unresolvedCarriers = new Set();
    aggregates.forEach((aggregate) => {
        aggregate.remoteIcao = resolveAirportIcao(airportMap, aggregate.remoteIata);
        if (!aggregate.remoteIcao) {
            unresolvedAirports.add(aggregate.remoteIata);
        }
        const mappedIcao = airlineMap[aggregate.carrier];
        if (!mappedIcao || !airlineIcaoExists(mappedIcao)) {
            unresolvedCarriers.add(aggregate.carrier);
        }
    });
    if (unresolvedAirports.size > 0) {
        throw new Error(`unresolved T-100 airport code: ${[...unresolvedAirports].sort().join(', ')}`);
    }
    if (unresolvedCarriers.size > 0) {
        throw new Error(`unresolved T-100 airline code: ${[...unresolvedCarriers].sort().join(', ')}`);
    }
    const monthDays = daysInMonth(year, month);
    const totalPerformed = aggregates.reduce((sum, aggregate) => sum + aggregate.performed, 0);
    const dailyVolumeTarget = Math.round(totalPerformed / monthDays);
    const additionBudget = Math.max(0, dailyVolumeTarget - baseSchedule.flights.length);
    const existingAirlines = new Set(baseSchedule.flights.map((flight) => flight.airlineIcao).filter(Boolean));
    const byCarrier = new Map();

    aggregates.forEach((aggregate) => {
        const records = byCarrier.get(aggregate.carrier) || [];
        records.push(aggregate);
        byCarrier.set(aggregate.carrier, records);
    });

    const requestedQuotas = new Map();
    byCarrier.forEach((records, carrier) => {
        const mappedIcao = airlineMap[carrier];
        if (mappedIcao && existingAirlines.has(mappedIcao)) {
            return;
        }
        const performed = records.reduce((sum, record) => sum + record.performed, 0);
        const quota = Math.round(performed / monthDays);
        if (quota > 0) {
            requestedQuotas.set(carrier, quota);
        }
    });
    const carrierQuotas = capCarrierQuotas(requestedQuotas, additionBudget);
    const allocatedAdditionCount = [...carrierQuotas.values()].reduce((sum, quota) => sum + quota, 0);
    const baseDirectionCounts = baseSchedule.flights.reduce((counts, flight) => {
        counts[flight.category] += 1;
        return counts;
    }, { arrival: 0, departure: 0 });
    const completedMovementCount = baseSchedule.flights.length + allocatedAdditionCount;
    const balancedArrivalTarget = Math.floor(completedMovementCount / 2);
    const desiredArrivalAdditions = Math.min(
        allocatedAdditionCount,
        Math.max(0, balancedArrivalTarget - baseDirectionCounts.arrival)
    );
    const desiredAdditionDirectionTargets = {
        arrival: desiredArrivalAdditions,
        departure: allocatedAdditionCount - desiredArrivalAdditions
    };
    const carrierDirectionWeights = new Map();
    const initialCarrierDirections = new Map();
    carrierQuotas.forEach((quota, carrier) => {
        const records = byCarrier.get(carrier);
        const weights = Object.fromEntries(['arrival', 'departure'].map((category) => [
            category,
            records
                .filter((record) => record.category === category)
                .reduce((sum, record) => sum + record.performed, 0)
        ]));
        carrierDirectionWeights.set(carrier, weights);
        const directions = ['arrival', 'departure']
            .filter((category) => weights[category] > 0)
            .map((category) => ({ category, performed: weights[category] }));
        const allocation = allocateByWeight(
            directions,
            quota,
            (direction) => direction.performed,
            (direction) => stableHash(`${carrier}|${direction.category}`)
        );
        initialCarrierDirections.set(carrier, {
            arrival: allocation.get(directions.find((direction) => direction.category === 'arrival')) || 0,
            departure: allocation.get(directions.find((direction) => direction.category === 'departure')) || 0
        });
    });
    let mandatoryArrivals = 0;
    let mandatoryDepartures = 0;
    carrierQuotas.forEach((quota, carrier) => {
        const weights = carrierDirectionWeights.get(carrier);
        if (weights.arrival > 0 && weights.departure === 0) {
            mandatoryArrivals += quota;
        }
        if (weights.departure > 0 && weights.arrival === 0) {
            mandatoryDepartures += quota;
        }
    });
    const maximumArrivals = allocatedAdditionCount - mandatoryDepartures;
    const feasibleArrivalTarget = Math.min(
        maximumArrivals,
        Math.max(mandatoryArrivals, desiredAdditionDirectionTargets.arrival)
    );
    const additionDirectionTargets = {
        arrival: feasibleArrivalTarget,
        departure: allocatedAdditionCount - feasibleArrivalTarget
    };
    const carrierDirectionQuotas = rebalanceDirectionAllocations(
        initialCarrierDirections,
        carrierDirectionWeights,
        additionDirectionTargets
    );
    const synthesized = [];

    [...carrierQuotas.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([carrier]) => {
        const records = byCarrier.get(carrier);
        const directionQuotas = carrierDirectionQuotas.get(carrier);
        const directionGroups = ['arrival', 'departure']
            .map((category) => ({
                category,
                records: records.filter((record) => record.category === category)
            }))
            .filter((group) => group.records.length > 0);

        directionGroups.forEach((group) => {
            const allocations = allocateByWeight(
                group.records,
                directionQuotas[group.category],
                (record) => record.performed,
                (record) => `${record.remoteIata}|${record.serviceClass}`
            );
            group.records.forEach((record) => {
                const count = allocations.get(record);
                if (count === 0) {
                    return;
                }
                const remoteIcao = record.remoteIcao;
                const airlineIcao = airlineMap[carrier];

                for (let sequence = 1; sequence <= count; sequence += 1) {
                    const flight = {
                        id: [
                            't100',
                            carrier.toLowerCase(),
                            record.category,
                            remoteIcao.toLowerCase(),
                            record.serviceClass.toLowerCase(),
                            String(sequence).padStart(3, '0')
                        ].join('-'),
                        scheduledTime: '00:00',
                        category: record.category,
                        originIcao: record.category === 'arrival' ? remoteIcao : airportIcao,
                        destinationIcao: record.category === 'arrival' ? airportIcao : remoteIcao
                    };
                    flight.airlineIcao = airlineIcao;
                    synthesized.push(flight);
                }
            });
        });
    });

    assignTimes(synthesized, baseSchedule.flights);
    assignFlightNumbers(synthesized, baseSchedule.flights);

    const flights = [...baseSchedule.flights.map((flight) => ({ ...flight })), ...synthesized]
        .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime) || a.id.localeCompare(b.id));

    const enrichedSchedule = {
        ...baseSchedule,
        source: {
            name: 'US DOT BTS On-Time Performance + T-100 Segment (All Carriers)',
            url: sourceUrl,
            retrievedAt,
            license: baseSchedule.source.license,
            coverage:
                `Exact On-Time movements are retained; ${synthesized.length} representative movements ` +
                `were deterministically synthesized from ${year}-${String(month).padStart(2, '0')} T-100 ` +
                `performed-departure aggregates. General aviation is excluded.`
        },
        flights
    };
    assertScheduleContract('enriched schedule', enrichedSchedule, airlineIcaoExists);
    return enrichedSchedule;
}

function loadAirlineMap(mapPath, airlinesDirectory) {
    const airlineMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    if (!airlineMap || typeof airlineMap !== 'object' || Array.isArray(airlineMap)) {
        throw new Error('T-100 airline map must be an object');
    }

    Object.entries(airlineMap).forEach(([externalCode, airlineIcao]) => {
        if (!/^[A-Z0-9]{2,3}$/.test(externalCode) || !/^[a-z0-9]{3}$/.test(airlineIcao)) {
            throw new Error(`invalid T-100 airline mapping: ${externalCode} -> ${airlineIcao}`);
        }
        const assetPath = path.join(airlinesDirectory, `${airlineIcao}.json`);
        if (!fs.existsSync(assetPath)) {
            throw new Error(`T-100 airline mapping ${externalCode} references missing asset: ${airlineIcao}`);
        }
        const asset = JSON.parse(fs.readFileSync(assetPath, 'utf8'));
        if (asset.icao !== airlineIcao) {
            throw new Error(
                `T-100 airline mapping ${externalCode} references ${airlineIcao}, but the asset contains ${asset.icao}`
            );
        }
    });

    return airlineMap;
}

function parseIntegerOption(value, label) {
    if (!/^\d+$/.test(value)) {
        throw new Error(`${label} must be an integer`);
    }
    return Number(value);
}

function importEnrichedSchedule({
    basePath,
    t100Path,
    airportsPath,
    airlineMapPath,
    airlinesDirectory,
    outputPath,
    airportIata,
    airportIcao,
    year,
    month,
    retrievedAt,
    sourceUrl
}) {
    const baseSchedule = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    const t100Csv = fs.readFileSync(t100Path, 'utf8');
    const airportMap = buildAirportIcaoMap(fs.readFileSync(airportsPath, 'utf8'));
    const airlineMap = loadAirlineMap(airlineMapPath, airlinesDirectory);
    const schedule = enrichScheduleWithT100({
        baseSchedule,
        t100Csv,
        airportMap,
        airportIata,
        airportIcao,
        year: parseIntegerOption(year, 'year'),
        month: parseIntegerOption(month, 'month'),
        retrievedAt,
        sourceUrl,
        airlineMap,
        airlineIcaoExists: (icao) => Object.values(airlineMap).includes(icao)
    });
    const contents = `${JSON.stringify(schedule, null, 2)}\n`;
    const temporaryPath = `${outputPath}.tmp-${process.pid}`;

    try {
        fs.writeFileSync(temporaryPath, contents);
        fs.renameSync(temporaryPath, outputPath);
    } catch (error) {
        try {
            fs.rmSync(temporaryPath, { force: true });
        } catch {
            // Preserve the primary write failure.
        }
        throw error;
    }

    return schedule;
}

const USAGE = [
    'Usage: node tools/schedules/enrich-bts-schedule-with-t100.js \\',
    '  --base <schedule.json> --t100 <t100.csv> --airports <ourairports.csv> \\',
    '  --airline-map <map.json> --airlines-dir <assets/airlines> \\',
    '  --iata <SEA> --icao <KSEA> --year <YYYY> --month <M> \\',
    '  --retrieved <YYYY-MM-DD> --source-url <url> --out <schedule.json>'
].join('\n');

const CLI_FLAGS = {
    '--base': 'basePath',
    '--t100': 't100Path',
    '--airports': 'airportsPath',
    '--airline-map': 'airlineMapPath',
    '--airlines-dir': 'airlinesDirectory',
    '--iata': 'airportIata',
    '--icao': 'airportIcao',
    '--year': 'year',
    '--month': 'month',
    '--retrieved': 'retrievedAt',
    '--source-url': 'sourceUrl',
    '--out': 'outputPath'
};

function parseCliArguments(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        const key = CLI_FLAGS[flag];
        if (!key) {
            throw new Error(`unknown argument: ${flag}\n${USAGE}`);
        }
        const value = argv[index + 1];
        if (value === undefined) {
            throw new Error(`missing value for ${flag}\n${USAGE}`);
        }
        if (options[key] !== undefined) {
            throw new Error(`duplicate argument: ${flag}\n${USAGE}`);
        }
        options[key] = value;
        index += 1;
    }

    const missing = Object.entries(CLI_FLAGS)
        .filter(([, key]) => options[key] === undefined)
        .map(([flag]) => flag);
    if (missing.length > 0) {
        throw new Error(`missing required arguments: ${missing.join(', ')}\n${USAGE}`);
    }
    return options;
}

function main(argv) {
    const options = parseCliArguments(argv);
    const schedule = importEnrichedSchedule(options);
    console.log(`wrote ${options.outputPath} with ${schedule.flights.length} flights`);
}

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    aggregateT100,
    allocateByWeight,
    capCarrierQuotas,
    enrichScheduleWithT100,
    importEnrichedSchedule,
    loadAirlineMap,
    parseCliArguments,
    rebalanceDirectionAllocations,
    main
};
