'use strict';

const fs = require('fs');
const path = require('path');
const {
    authoredSpawnPatternKey,
    fnv1a32
} = require('../../src/assets/scripts/client/trafficGenerator/schedule/authoredSpawnPatternKey');
const { validateScheduleDocument } = require('../validate-assets');

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertCalendarDate(value, name) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value : '');
    if (match === null) {
        throw new TypeError(`${name} must be a real YYYY-MM-DD calendar date`);
    }
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new TypeError(`${name} must be a real YYYY-MM-DD calendar date`);
    }
}

function assertTimeZone(timezone) {
    if (typeof timezone !== 'string' || timezone.trim() === '') {
        throw new TypeError('timezone must be a valid IANA time zone');
    }
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    } catch {
        throw new TypeError('timezone must be a valid IANA time zone');
    }
}

function minuteToClock(minute) {
    const normalized = ((minute % 1440) + 1440) % 1440;
    return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function compileAuthoredSchedule({ airportJson, airportIcao, timezone, sampleDate, source }) {
    if (!isObject(airportJson) || !Array.isArray(airportJson.spawnPatterns)) {
        throw new TypeError('airportJson.spawnPatterns must be an array');
    }
    if (typeof airportIcao !== 'string' || !/^[A-Z]{4}$/.test(airportIcao)) {
        throw new TypeError('airportIcao must contain four uppercase letters');
    }
    if (typeof airportJson.icao !== 'string' || airportJson.icao.toUpperCase() !== airportIcao) {
        throw new TypeError(`airportJson.icao must match ${airportIcao}`);
    }
    assertTimeZone(timezone);
    assertCalendarDate(sampleDate, 'sampleDate');

    const patternRecords = airportJson.spawnPatterns.map((pattern, index) => {
        if (!isObject(pattern)) {
            throw new TypeError(`spawnPatterns[${index}] must be an object`);
        }
        if (pattern.category !== 'arrival' && pattern.category !== 'departure') {
            throw new TypeError(`spawnPatterns[${index}] category must be arrival or departure`);
        }
        if (typeof pattern.rate !== 'number' || !Number.isFinite(pattern.rate) || pattern.rate <= 0) {
            throw new TypeError(`spawnPatterns[${index}] rate must be a positive finite number`);
        }
        const dailyQuota = pattern.rate * 24;
        return {
            category: pattern.category,
            count: Math.floor(dailyQuota),
            dailyQuota,
            key: authoredSpawnPatternKey(pattern)
        };
    });

    ['arrival', 'departure'].forEach((category) => {
        if (!patternRecords.some((record) => record.category === category)) {
            throw new RangeError(`airport must contain at least one ${category} spawn pattern`);
        }
    });

    const seenKeys = new Set();
    patternRecords.forEach(({ key }) => {
        if (seenKeys.has(key)) {
            throw new RangeError(`duplicate spawn pattern key ${key}`);
        }
        seenKeys.add(key);
    });

    ['arrival', 'departure'].forEach((category) => {
        const categoryRecords = patternRecords.filter((record) => record.category === category);
        const targetCount = Math.round(categoryRecords.reduce((sum, record) => sum + record.dailyQuota, 0));
        const floorCount = categoryRecords.reduce((sum, record) => sum + record.count, 0);
        const residualCount = targetCount - floorCount;
        const residualOrder = categoryRecords.slice().sort((left, right) =>
            ((right.dailyQuota - right.count) - (left.dailyQuota - left.count)) || left.key.localeCompare(right.key)
        );

        for (let index = 0; index < residualCount; index++) {
            residualOrder[index].count++;
        }
    });

    const flights = [];
    patternRecords.sort((left, right) => left.key.localeCompare(right.key)).forEach(({ category, count, key }) => {
        const phase = fnv1a32(`${airportIcao}\u0000${key}`) % 1440;
        const width = Math.max(4, String(count).length);
        for (let index = 0; index < count; index++) {
            const minute = Math.floor((phase + (index * 1440 / count)) % 1440);
            flights.push({
                id: `auth-${airportIcao.toLowerCase()}-${key}-${String(index + 1).padStart(width, '0')}`,
                category,
                scheduledTime: minuteToClock(minute),
                spawnPatternKey: key
            });
        }
    });
    flights.sort((left, right) => left.scheduledTime.localeCompare(right.scheduledTime) || left.id.localeCompare(right.id));

    const document = {
        schemaVersion: 2,
        profileType: 'authored',
        airportIcao,
        timezone,
        sampleDate,
        source,
        flights
    };
    const errors = [];
    validateScheduleDocument('/assets', `/assets/schedules/${airportIcao.toLowerCase()}.json`, document, new Set(), errors);
    if (errors.length > 0) {
        throw new TypeError(`authored schedule failed validation: ${errors.join('; ')}`);
    }

    return document;
}

function publishAuthoredSchedule(options) {
    if (typeof options.destination !== 'string' || options.destination.trim() === '') {
        throw new TypeError('destination must be a non-empty path');
    }
    const document = compileAuthoredSchedule(options);
    const output = `${JSON.stringify(document, null, 4)}\n`;
    const directory = path.dirname(options.destination);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(directory, `.${path.basename(options.destination)}.${process.pid}.tmp`);

    try {
        fs.writeFileSync(temporary, output, { flag: 'wx' });
        fs.renameSync(temporary, options.destination);
    } finally {
        if (fs.existsSync(temporary)) {
            fs.unlinkSync(temporary);
        }
    }

    return document;
}

module.exports = { compileAuthoredSchedule, publishAuthoredSchedule };
