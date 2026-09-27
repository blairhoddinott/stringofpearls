'use strict';

const AUTHORED_PATTERN_KEYS = [
    '_name',
    'airlines',
    'altitude',
    'category',
    'centerHandoffFix',
    'commands',
    'destination',
    'entrail',
    'heading',
    'method',
    'offset',
    'origin',
    'period',
    'radial',
    'route',
    'speed',
    'variation'
];

function stableSerialize(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function fnv1a32(value) {
    let hash = 0x811c9dc5;

    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    return hash >>> 0;
}

function authoredSpawnPatternKey(spawnPattern) {
    if (spawnPattern === null || typeof spawnPattern !== 'object' || Array.isArray(spawnPattern)) {
        throw new TypeError('spawnPattern must be an object');
    }

    const unsupportedKeys = Object.keys(spawnPattern).filter((key) => key !== 'rate' && !AUTHORED_PATTERN_KEYS.includes(key));
    if (unsupportedKeys.length > 0) {
        throw new TypeError(`spawnPattern has unsupported key ${unsupportedKeys[0]}`);
    }

    const operationalPattern = {};
    AUTHORED_PATTERN_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(spawnPattern, key)) {
            operationalPattern[key] = spawnPattern[key];
        }
    });

    return fnv1a32(stableSerialize(operationalPattern)).toString(16).padStart(8, '0');
}

module.exports = { AUTHORED_PATTERN_KEYS, authoredSpawnPatternKey, fnv1a32, stableSerialize };
