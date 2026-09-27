'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    parseCliArguments,
    selectOnTimeRows
} = require('./generate-bts-schedule-corpus');
const { writeCorpusAtomically } = require('./generate-authored-schedule-corpus');

const table = [
    ['FlightDate', 'Origin', 'Dest', 'value'],
    ['2026-07-15', 'SEA', 'PDX', 'one'],
    ['2026-07-15', 'LAX', 'SFO', 'two'],
    ['2026-07-14', 'SEA', 'LAX', 'wrong-day'],
    ['2026-07-15', 'BOS', 'JFK', 'unselected']
];
assert.deepStrictEqual(
    selectOnTimeRows(table, new Set(['SEA', 'LAX']), '2026-07-15'),
    [table[0], table[1], table[2]],
    'the batch importer parses once and retains rows touching selected airports on the representative day'
);
assert.throws(
    () => parseCliArguments(['--bts', 'a', '--bts', 'b']),
    /duplicate argument: --bts/,
    'duplicate batch flags must fail closed'
);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bts-corpus-'));
try {
    const outputDirectory = path.join(temporaryRoot, 'output');
    writeCorpusAtomically({ ksea: { value: 1 } }, outputDirectory, 2);
    assert.strictEqual(
        fs.readFileSync(path.join(outputDirectory, 'ksea.json'), 'utf8'),
        '{\n  "value": 1\n}\n',
        'BTS publication can retain the canonical two-space sourced-schedule formatting'
    );
    fs.writeFileSync(path.join(outputDirectory, 'schedule.schema.json'), '{}\n');
    assert.throws(
        () => writeCorpusAtomically({ ksea: { value: 2 } }, outputDirectory, 2),
        /unmanaged output file: schedule\.schema\.json/,
        'a corpus generator must not replace a mixed publication directory'
    );
    assert.strictEqual(fs.readFileSync(path.join(outputDirectory, 'ksea.json'), 'utf8'), '{\n  "value": 1\n}\n');
    assert.strictEqual(fs.readFileSync(path.join(outputDirectory, 'schedule.schema.json'), 'utf8'), '{}\n');
} finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log('generate-bts-schedule-corpus tests passed');
