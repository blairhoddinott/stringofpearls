'use strict';

const fs = require('fs');
const path = require('path');
const {
    parseCsv,
    buildAirportIcaoMap,
    normalizeSchedule,
    loadAirlineMap
} = require('./import-bts-schedule');
const { enrichScheduleWithT100 } = require('./enrich-bts-schedule-with-t100');
const { writeCorpusAtomically } = require('./generate-authored-schedule-corpus');

const DEFAULTS = Object.freeze({
    btsAirports: path.join(__dirname, 'bts-airports.json'),
    timezones: path.join(__dirname, 'airport-timezones.json'),
    airportAliases: path.join(__dirname, 'airport-code-aliases.json'),
    excludedAirportCodes: path.join(__dirname, 't100-excluded-airport-codes.json'),
    excludedCarrierCodes: path.join(__dirname, 't100-excluded-carrier-codes.json'),
    reportingAirlines: path.join(__dirname, 'reporting-airline-icao.json'),
    t100Airlines: path.join(__dirname, 't100-airline-icao.json'),
    assetsRoot: path.resolve(__dirname, '../../assets')
});

function parseCliArguments(argv) {
    const values = {};
    for (let index = 0; index < argv.length; index += 2) {
        const flag = argv[index];
        const value = argv[index + 1];
        if (!/^--[a-z0-9-]+$/.test(flag || '') || value === undefined || value.startsWith('--')) {
            throw new Error(`invalid argument sequence at ${JSON.stringify(flag)}`);
        }
        if (Object.prototype.hasOwnProperty.call(values, flag)) {
            throw new Error(`duplicate argument: ${flag}`);
        }
        values[flag] = value;
    }
    return values;
}

function selectOnTimeRows(table, selectedIatas, sampleDate) {
    if (!Array.isArray(table) || table.length === 0) {
        throw new Error('BTS On-Time CSV has no header row');
    }
    const header = table[0];
    const flightDateIndex = header.indexOf('FlightDate');
    const originIndex = header.indexOf('Origin');
    const destinationIndex = header.indexOf('Dest');
    if ([flightDateIndex, originIndex, destinationIndex].includes(-1)) {
        throw new Error('BTS On-Time CSV is missing FlightDate, Origin, or Dest');
    }
    return [
        header,
        ...table.slice(1).filter((row) => row[flightDateIndex] === sampleDate &&
            (selectedIatas.has(row[originIndex]) || selectedIatas.has(row[destinationIndex])))
    ];
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function generateBtsScheduleCorpus(options) {
    const airports = readJson(options.btsAirportsPath || DEFAULTS.btsAirports);
    const timezones = readJson(options.timezonesPath || DEFAULTS.timezones);
    const aliases = readJson(options.airportAliasesPath || DEFAULTS.airportAliases);
    const exclusions = readJson(options.excludedAirportCodesPath || DEFAULTS.excludedAirportCodes);
    const carrierExclusions = readJson(options.excludedCarrierCodesPath || DEFAULTS.excludedCarrierCodes);
    const reportingAirlines = readJson(options.reportingAirlinesPath || DEFAULTS.reportingAirlines);
    const t100Airlines = readJson(options.t100AirlinesPath || DEFAULTS.t100Airlines);
    const assetsRoot = options.assetsRoot || DEFAULTS.assetsRoot;
    const airlinesDirectory = path.join(assetsRoot, 'airlines');
    const airlineIcaoExists = (icao) => fs.existsSync(path.join(airlinesDirectory, `${icao}.json`));
    loadAirlineMap(options.reportingAirlinesPath || DEFAULTS.reportingAirlines, airlinesDirectory);
    loadAirlineMap(options.t100AirlinesPath || DEFAULTS.t100Airlines, airlinesDirectory);

    const airportDetails = airports.map((airport) => {
        const asset = readJson(path.join(assetsRoot, 'airports', `${airport}.json`));
        return { airport, icao: airport.toUpperCase(), iata: asset.iata.toUpperCase() };
    });
    const selectedIatas = new Set(airportDetails.map(({ iata }) => iata));
    const sourceTable = parseCsv(fs.readFileSync(options.btsPath, 'utf8'));
    const selectedTable = selectOnTimeRows(sourceTable, selectedIatas, options.sampleDate);
    const airportMap = buildAirportIcaoMap(
        fs.readFileSync(options.ourAirportsPath, 'utf8'),
        aliases
    );
    const t100Csv = fs.readFileSync(options.t100Path, 'utf8');
    const documents = airportDetails.map(({ airport, icao, iata }) => {
        if (typeof timezones[airport] !== 'string') {
            throw new Error(`missing timezone for ${icao}`);
        }
        const baseSchedule = normalizeSchedule({
            bts: selectedTable,
            airportMap,
            airlineMap: reportingAirlines,
            airportIata: iata,
            airportIcao: icao,
            timezone: timezones[airport],
            sampleDate: options.sampleDate,
            retrievedAt: options.retrievedAt,
            sourceUrl: options.onTimeSourceUrl,
            airlineIcaoExists
        });
        const schedule = enrichScheduleWithT100({
            baseSchedule,
            t100Csv,
            airportMap,
            airportIata: iata,
            airportIcao: icao,
            year: options.t100Year,
            month: options.t100Month,
            retrievedAt: options.retrievedAt,
            sourceUrl: options.t100SourceUrl,
            airlineMap: t100Airlines,
            airlineIcaoExists,
            excludedAirportCodes: exclusions,
            excludedCarrierCodes: carrierExclusions
        });
        return { airport, schedule };
    });
    const corpus = Object.fromEntries(documents.map(({ airport, schedule }) => [airport, schedule]));
    writeCorpusAtomically(corpus, options.outputDirectory, 2);
    return documents;
}

function requireArgument(args, flag) {
    if (!args[flag]) {
        throw new Error(`missing required argument: ${flag}`);
    }
    return args[flag];
}

if (require.main === module) {
    try {
        const args = parseCliArguments(process.argv.slice(2));
        const documents = generateBtsScheduleCorpus({
            btsPath: requireArgument(args, '--bts'),
            t100Path: requireArgument(args, '--t100'),
            ourAirportsPath: requireArgument(args, '--ourairports'),
            outputDirectory: requireArgument(args, '--output-dir'),
            sampleDate: requireArgument(args, '--sample-date'),
            retrievedAt: requireArgument(args, '--retrieved-at'),
            onTimeSourceUrl: requireArgument(args, '--ontime-source-url'),
            t100SourceUrl: requireArgument(args, '--t100-source-url'),
            t100Year: Number(requireArgument(args, '--t100-year')),
            t100Month: Number(requireArgument(args, '--t100-month'))
        });
        const totals = documents.reduce((result, { schedule }) => ({
            airports: result.airports + 1,
            flights: result.flights + schedule.flights.length
        }), { airports: 0, flights: 0 });
        process.stdout.write(`${JSON.stringify(totals)}\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    generateBtsScheduleCorpus,
    parseCliArguments,
    selectOnTimeRows
};
