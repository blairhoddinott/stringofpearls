'use strict';

const fs = require('fs');
const path = require('path');
const { compileAuthoredSchedule } = require('./compile-authored-schedule');

const CLI_FLAGS = ['--assets-root', '--output-dir', '--sample-date', '--retrieved-at'];

function parseCliArguments(args) {
    const values = {};

    for (let index = 0; index < args.length; index += 2) {
        const flag = args[index];
        const value = args[index + 1];
        if (!CLI_FLAGS.includes(flag)) {
            throw new TypeError(`unknown argument: ${flag}`);
        }
        if (Object.prototype.hasOwnProperty.call(values, flag)) {
            throw new TypeError(`duplicate argument: ${flag}`);
        }
        if (typeof value !== 'string' || value.startsWith('--') || value.trim() === '') {
            throw new TypeError(`missing value for argument: ${flag}`);
        }
        values[flag] = value;
    }

    CLI_FLAGS.forEach((flag) => {
        if (!Object.prototype.hasOwnProperty.call(values, flag)) {
            throw new TypeError(`missing required argument: ${flag}`);
        }
    });

    return {
        assetsRoot: values['--assets-root'],
        outputDir: values['--output-dir'],
        sampleDate: values['--sample-date'],
        retrievedAt: values['--retrieved-at']
    };
}

function buildAuthoredScheduleCorpus({
    airportLoadList,
    airportJsonByIcao,
    timezones,
    btsAirports,
    sampleDate,
    source
}) {
    if (!Array.isArray(airportLoadList) || airportLoadList.length === 0) {
        throw new TypeError('airportLoadList must be a non-empty array');
    }
    if (airportJsonByIcao === null || typeof airportJsonByIcao !== 'object' || Array.isArray(airportJsonByIcao)) {
        throw new TypeError('airportJsonByIcao must be an object');
    }
    if (timezones === null || typeof timezones !== 'object' || Array.isArray(timezones)) {
        throw new TypeError('timezones must be an object');
    }
    if (!Array.isArray(btsAirports)) {
        throw new TypeError('btsAirports must be an array');
    }

    const selectableIcaos = airportLoadList
        .filter((entry) => entry.disabled !== true)
        .map((entry) => entry.icao)
        .sort();
    const selectableSet = new Set(selectableIcaos);
    const timezoneIcaos = Object.keys(timezones).sort();
    if (JSON.stringify(timezoneIcaos) !== JSON.stringify(selectableIcaos)) {
        throw new RangeError('timezone policy must contain exactly every selectable airport');
    }

    const btsSet = new Set();
    btsAirports.forEach((icao) => {
        if (!selectableSet.has(icao)) {
            throw new RangeError(`BTS airport ${icao} is not selectable`);
        }
        if (btsSet.has(icao)) {
            throw new RangeError(`duplicate BTS airport ${icao}`);
        }
        btsSet.add(icao);
    });

    const corpus = {};
    selectableIcaos.filter((icao) => !btsSet.has(icao)).forEach((icao) => {
        if (!Object.prototype.hasOwnProperty.call(airportJsonByIcao, icao)) {
            throw new RangeError(`missing airport asset ${icao}`);
        }
        corpus[icao] = compileAuthoredSchedule({
            airportJson: airportJsonByIcao[icao],
            airportIcao: icao.toUpperCase(),
            timezone: timezones[icao],
            sampleDate,
            source
        });
    });

    return corpus;
}

function loadCorpusInputs(assetsRoot) {
    const airportRoot = path.join(assetsRoot, 'airports');
    const airportLoadList = JSON.parse(fs.readFileSync(path.join(airportRoot, 'airportLoadList.json'), 'utf8'));
    const timezones = JSON.parse(fs.readFileSync(path.join(__dirname, 'airport-timezones.json'), 'utf8'));
    const btsAirports = JSON.parse(fs.readFileSync(path.join(__dirname, 'bts-airports.json'), 'utf8'));
    const airportJsonByIcao = {};

    airportLoadList.filter((entry) => entry.disabled !== true && !btsAirports.includes(entry.icao)).forEach((entry) => {
        airportJsonByIcao[entry.icao] = JSON.parse(
            fs.readFileSync(path.join(airportRoot, `${entry.icao}.json`), 'utf8')
        );
    });

    return { airportLoadList, airportJsonByIcao, timezones, btsAirports };
}

function writeCorpusAtomically(corpus, outputDir, indentation = 4) {
    if (!Number.isInteger(indentation) || indentation < 0 || indentation > 10) {
        throw new RangeError('indentation must be an integer from 0 through 10');
    }
    const resolvedOutput = path.resolve(outputDir);
    const expectedFilenames = new Set(Object.keys(corpus).map((icao) => `${icao}.json`));
    if (fs.existsSync(resolvedOutput)) {
        const unmanagedFilename = fs.readdirSync(resolvedOutput).sort()
            .find((filename) => !expectedFilenames.has(filename));
        if (unmanagedFilename) {
            throw new Error(`unmanaged output file: ${unmanagedFilename}`);
        }
    }
    const parent = path.dirname(resolvedOutput);
    fs.mkdirSync(parent, { recursive: true });
    const staging = fs.mkdtempSync(path.join(parent, '.authored-schedules-'));
    const backup = `${resolvedOutput}.backup-${process.pid}`;
    let movedExisting = false;

    try {
        Object.keys(corpus).sort().forEach((icao) => {
            fs.writeFileSync(path.join(staging, `${icao}.json`), `${JSON.stringify(corpus[icao], null, indentation)}\n`);
        });
        if (fs.existsSync(resolvedOutput)) {
            fs.renameSync(resolvedOutput, backup);
            movedExisting = true;
        }
        fs.renameSync(staging, resolvedOutput);
        if (movedExisting) {
            fs.rmSync(backup, { recursive: true, force: true });
        }
    } catch (error) {
        fs.rmSync(staging, { recursive: true, force: true });
        if (movedExisting && !fs.existsSync(resolvedOutput)) {
            fs.renameSync(backup, resolvedOutput);
        }
        throw error;
    }
}

function main(args = process.argv.slice(2)) {
    const options = parseCliArguments(args);
    const inputs = loadCorpusInputs(path.resolve(options.assetsRoot));
    const source = {
        name: 'stringofpearls airport-authored spawn patterns',
        url: 'https://github.com/blairhoddinott/stringofpearls/tree/master/assets/airports',
        retrievedAt: options.retrievedAt,
        license: 'MIT',
        coverage: 'Deterministic representative profile compiled from reviewed airport-authored rates, routes, geometry, and airline rules; movements are generated and are not observed historical flights.'
    };
    const corpus = buildAuthoredScheduleCorpus({
        ...inputs,
        sampleDate: options.sampleDate,
        source
    });
    writeCorpusAtomically(corpus, options.outputDir);
    const movementCount = Object.values(corpus).reduce((sum, document) => sum + document.flights.length, 0);
    console.log(`Published ${Object.keys(corpus).length} authored schedules with ${movementCount} movements to ${options.outputDir}`);
}

if (require.main === module) {
    main();
}

module.exports = {
    buildAuthoredScheduleCorpus,
    loadCorpusInputs,
    main,
    parseCliArguments,
    writeCorpusAtomically
};
