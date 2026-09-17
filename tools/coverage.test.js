'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'src/assets/scripts');
const SUMMARY_PATH = path.join(ROOT, 'coverage/coverage-summary.json');

function collectJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            return collectJavaScriptFiles(entryPath);
        }

        return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
    });
}

function repositoryRelativeSource(filename) {
    const normalized = filename.replaceAll('\\', '/');
    const sourceMarker = '/src/assets/scripts/';
    const markerIndex = normalized.indexOf(sourceMarker);

    assert.notStrictEqual(markerIndex, -1, `Coverage reported a non-source file: ${filename}`);

    return `src/assets/scripts/${normalized.slice(markerIndex + sourceMarker.length)}`;
}

function isEligibleSource(filename) {
    const normalized = filename.replaceAll('\\', '/');

    return !normalized.includes('/client/constants/') &&
        !normalized.includes('/_mocks/') &&
        !normalized.includes('/fixtures/') &&
        !normalized.includes('/testHelpers/');
}

function main() {
    assert.ok(fs.existsSync(SUMMARY_PATH), 'Run npm run test:coverage before coverage:test');

    const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
    const expected = collectJavaScriptFiles(SOURCE_ROOT)
        .filter(isEligibleSource)
        .map((filename) => path.relative(ROOT, filename).replaceAll('\\', '/'))
        .sort();
    const reported = Object.keys(summary)
        .filter((filename) => filename !== 'total')
        .map(repositoryRelativeSource)
        .sort();

    assert.deepStrictEqual(
        reported,
        expected,
        'Coverage must report every eligible source file under its real repository path'
    );

    process.stdout.write(`Coverage manifest passed: ${reported.length} eligible source files\n`);
}

main();
