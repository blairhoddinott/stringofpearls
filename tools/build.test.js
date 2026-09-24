'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { SourceMapConsumer } = require('source-map');
const showdown = require('showdown');
const {
    cleanupAfterBuild,
    recoverBuildDirectories,
    replacePublicDirectory
} = require('./build');
const { newestReleaseBody } = require('./release/changelog');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const BUILD_SCRIPT = path.join(__dirname, 'build.js');
const COPY_DIRECTORIES = ['fonts', 'images', 'tutorial', 'autocomplete'];
const FIXED_BUILD_EPOCH = '0';

async function listFiles(directory) {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...await listFiles(entryPath));
        } else if (entry.isFile()) {
            files.push(entryPath);
        }
    }

    return files;
}

function relativeTo(directory, filename) {
    return path.relative(directory, filename).split(path.sep).join('/');
}

async function expectedOutputPaths() {
    const expected = new Set([
        'index.html',
        'assets/aircraft/aircraft.json',
        'assets/airlines/airlines.json',
        'assets/changelog.json',
        'assets/guides/guides.json',
        'assets/scripts/client/bundle.min.js',
        'assets/scripts/client/bundle.min.js.map',
        'assets/style/main.min.css',
        'assets/style/main.min.css.map'
    ]);

    for (const directory of COPY_DIRECTORIES) {
        const sourceDirectory = path.join(ROOT, 'assets', directory);

        for (const filename of await listFiles(sourceDirectory)) {
            expected.add(`assets/${directory}/${relativeTo(sourceDirectory, filename)}`);
        }
    }

    const airportDirectory = path.join(ROOT, 'assets', 'airports');

    for (const filename of await listFiles(airportDirectory)) {
        expected.add(`assets/airports/${relativeTo(airportDirectory, filename)}`);
    }

    const serverDirectory = path.join(ROOT, 'src', 'assets', 'scripts', 'server');

    for (const filename of await listFiles(serverDirectory)) {
        expected.add(`assets/scripts/server/${relativeTo(serverDirectory, filename)}`);
    }

    return [...expected].sort();
}

async function assertCopiedDirectory(directory) {
    const sourceDirectory = path.join(ROOT, 'assets', directory);

    for (const sourceFilename of await listFiles(sourceDirectory)) {
        const outputFilename = path.join(PUBLIC_DIR, 'assets', directory, relativeTo(sourceDirectory, sourceFilename));
        const [source, output] = await Promise.all([
            fsp.readFile(sourceFilename),
            fsp.readFile(outputFilename)
        ]);

        assert.deepStrictEqual(output, source, `${relativeTo(ROOT, outputFilename)} was not copied byte-for-byte`);
    }
}

async function assertServerOutput() {
    const sourceDirectory = path.join(ROOT, 'src', 'assets', 'scripts', 'server');

    for (const sourceFilename of await listFiles(sourceDirectory)) {
        const relative = relativeTo(sourceDirectory, sourceFilename);
        const outputFilename = path.join(PUBLIC_DIR, 'assets', 'scripts', 'server', relative);
        const [source, output] = await Promise.all([
            fsp.readFile(sourceFilename),
            fsp.readFile(outputFilename)
        ]);

        assert.deepStrictEqual(output, source, `${relative} server output was not copied byte-for-byte`);
    }
}

async function assertAirportOutputs() {
    const sourceDirectory = path.join(ROOT, 'assets', 'airports');

    for (const sourceFilename of await listFiles(sourceDirectory)) {
        const relative = relativeTo(sourceDirectory, sourceFilename);
        const outputFilename = path.join(PUBLIC_DIR, 'assets', 'airports', relative);
        const [source, output] = await Promise.all([
            fsp.readFile(sourceFilename, 'utf8'),
            fsp.readFile(outputFilename, 'utf8')
        ]);

        const extension = path.extname(sourceFilename);

        if (/^airportLoadList.*\.json$/.test(path.basename(sourceFilename)) || (extension !== '.json' && extension !== '.geojson')) {
            assert.strictEqual(output, source, `${relative} must remain byte-for-byte unchanged`);
            continue;
        }

        assert.deepStrictEqual(JSON.parse(output), JSON.parse(source), `${relative} changed semantically`);
        assert.strictEqual(output, JSON.stringify(JSON.parse(source)), `${relative} was not deterministically minified`);
    }
}

async function expectedAggregate(directory, outputFilename) {
    const sourceDirectory = path.join(ROOT, 'assets', directory);
    const filenames = (await fsp.readdir(sourceDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && !entry.name.includes(outputFilename))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
    const records = [];

    for (const filename of filenames) {
        records.push(JSON.parse(await fsp.readFile(path.join(sourceDirectory, filename), 'utf8')));
    }

    return { [path.parse(outputFilename).name]: records };
}

async function expectedGuides() {
    const converter = new showdown.Converter({ simpleLineBreaks: true, tables: true });
    const guideDirectory = path.join(ROOT, 'documentation', 'airport-guides');
    const guides = {};

    for (const entry of (await fsp.readdir(guideDirectory, { withFileTypes: true }))
        .sort((left, right) => left.name.localeCompare(right.name))) {
        if (!entry.isFile() || entry.name.includes('airport-guide-directory')) {
            continue;
        }

        const markdown = await fsp.readFile(path.join(guideDirectory, entry.name), 'utf8');

        if (markdown.length > 0) {
            guides[path.parse(entry.name).name] = converter.makeHtml(markdown);
        }
    }

    return guides;
}

async function expectedChangelog() {
    const markdown = await fsp.readFile(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    const converter = new showdown.Converter({ simpleLineBreaks: true });

    // Cross-check against the shared release/changelog parser rather than a
    // duplicated regex, so the newest-release extraction has a single source of
    // truth for both the modern and inherited heading formats.
    return { changelog: converter.makeHtml(newestReleaseBody(markdown)) };
}

async function hashOutput() {
    const files = await listFiles(PUBLIC_DIR);
    const hashes = {};

    for (const filename of files) {
        hashes[relativeTo(PUBLIC_DIR, filename)] = crypto.createHash('sha256')
            .update(await fsp.readFile(filename))
            .digest('hex');
    }

    return hashes;
}

function runBuild() {
    const result = spawnSync(process.execPath, [BUILD_SCRIPT, '--production'], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, SOURCE_DATE_EPOCH: FIXED_BUILD_EPOCH }
    });

    assert.strictEqual(
        result.status,
        0,
        `build failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
}

function assertBuildFailure(arguments_, environment, expectedMessage) {
    const result = spawnSync(process.execPath, [BUILD_SCRIPT, ...arguments_], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, ...environment }
    });

    assert.notStrictEqual(result.status, 0, `build unexpectedly accepted ${arguments_.join(' ') || 'invalid environment'}`);
    assert.match(result.stderr, expectedMessage);
}

async function assertStylesheetSourceMap(stylesheet) {
    const mapFilename = path.join(PUBLIC_DIR, 'assets/style/main.min.css.map');
    const mapDirectory = path.dirname(mapFilename);
    const rawMap = JSON.parse(await fsp.readFile(mapFilename, 'utf8'));
    const consumer = await new SourceMapConsumer(rawMap);
    const lessSources = rawMap.sources.filter((source) => source.endsWith('.less'));

    assert.strictEqual(rawMap.file, 'main.min.css');
    assert.ok(rawMap.sources.includes('main.css'), 'CSS source map does not name its generated intermediate source');
    assert.ok(consumer.sourceContentFor('main.css').includes('@font-face'), 'CSS source map does not embed intermediate CSS');
    assert.strictEqual(
        lessSources.some((source) => source.endsWith('/main.less')),
        false,
        'imports-only main.less must not be assigned generated CSS mappings'
    );
    assert.ok(lessSources.length > 0, 'CSS source map contains no LESS sources');

    for (const source of lessSources) {
        assert.strictEqual(path.isAbsolute(source), false, `CSS source map contains absolute source ${source}`);
        assert.doesNotMatch(source, /\.public-build-/, `CSS source map leaked staging path ${source}`);

        const sourceFilename = path.resolve(mapDirectory, source);
        assert.ok(sourceFilename.startsWith(path.join(ROOT, 'src/assets/style') + path.sep), `CSS source escaped style sources: ${source}`);
        assert.strictEqual(
            consumer.sourceContentFor(source),
            await fsp.readFile(sourceFilename, 'utf8'),
            `CSS source map embeds incorrect content for ${source}`
        );
    }

    consumer.eachMapping((mapping) => {
        if (!mapping.source || !mapping.source.endsWith('.less')) {
            return;
        }

        const sourceFilename = path.resolve(mapDirectory, mapping.source);
        const sourceLines = fs.readFileSync(sourceFilename, 'utf8').split('\n');
        assert.ok(mapping.originalLine >= 1 && mapping.originalLine <= sourceLines.length, `CSS mapping points outside ${mapping.source}`);
        assert.ok(
            mapping.originalColumn >= 0 && mapping.originalColumn <= sourceLines[mapping.originalLine - 1].length,
            `CSS mapping column points outside ${mapping.source}:${mapping.originalLine}`
        );
    });

    const fontRuleIndex = stylesheet.indexOf('@font-face');
    assert.notStrictEqual(fontRuleIndex, -1, 'compiled stylesheet has no @font-face rule');
    const beforeFontRule = stylesheet.slice(0, fontRuleIndex);
    const fontPosition = {
        column: fontRuleIndex - beforeFontRule.lastIndexOf('\n') - 1,
        line: beforeFontRule.split('\n').length
    };
    const fontOrigin = consumer.originalPositionFor(fontPosition);
    assert.ok(fontOrigin.source && fontOrigin.source.endsWith('src/assets/style/base/font.less'));
    assert.strictEqual(fontOrigin.line, 2);
    assert.strictEqual(fontOrigin.column, 0);
}

async function assertUppercaseAirportExtensionIsCopied() {
    const fixtures = new Map([
        ['__build-contract-passthrough.JSON', Buffer.from('uppercase JSON passthrough\n')],
        ['__build-contract-passthrough.GEOJSON', Buffer.from('uppercase GeoJSON passthrough\n')],
        ['__build-contract-passthrough.txt', Buffer.from('non-JSON airport passthrough\n')]
    ]);

    await Promise.all([...fixtures].map(([filename, contents]) => (
        fsp.writeFile(path.join(ROOT, 'assets/airports', filename), contents)
    )));

    try {
        runBuild();

        for (const [filename, contents] of fixtures) {
            const outputFilename = path.join(PUBLIC_DIR, 'assets/airports', filename);
            assert.deepStrictEqual(await fsp.readFile(outputFilename), contents, `${filename} was rewritten`);
        }
    } finally {
        await Promise.all([...fixtures].map(([filename]) => (
            fsp.rm(path.join(ROOT, 'assets/airports', filename), { force: true })
        )));
        runBuild();
    }
}

function filesystemWithFailures({ removeBackup = false, renameCalls = [] }) {
    let renameCall = 0;

    return {
        ...fsp,
        async rename(...arguments_) {
            renameCall += 1;

            if (renameCalls.includes(renameCall)) {
                const error = new Error(`injected rename failure ${renameCall}`);
                error.code = 'EIO';
                throw error;
            }

            return fsp.rename(...arguments_);
        },
        async rm(filename, options) {
            if (removeBackup && filename.includes('.previous-')) {
                const error = new Error('injected backup cleanup failure');
                error.code = 'EACCES';
                throw error;
            }

            return fsp.rm(filename, options);
        }
    };
}

async function assertPublicationFailureSemantics() {
    const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'stringofpearls-publication-'));

    try {
        const publicDirectory = path.join(fixtureRoot, 'public');
        const stagedDirectory = path.join(fixtureRoot, '.public-build-test');
        const backupDirectory = path.join(fixtureRoot, 'public.previous-test');

        await fsp.mkdir(publicDirectory);
        await fsp.writeFile(path.join(publicDirectory, 'marker'), 'old');
        await fsp.mkdir(stagedDirectory);
        await fsp.writeFile(path.join(stagedDirectory, 'marker'), 'new');

        await assert.rejects(
            replacePublicDirectory(stagedDirectory, {
                backupDirectory,
                filesystem: filesystemWithFailures({ renameCalls: [1] }),
                publicDirectory
            }),
            /injected rename failure 1/
        );
        assert.strictEqual(await fsp.readFile(path.join(publicDirectory, 'marker'), 'utf8'), 'old');
        assert.strictEqual(await fsp.readFile(path.join(stagedDirectory, 'marker'), 'utf8'), 'new');

        await assert.rejects(
            replacePublicDirectory(stagedDirectory, {
                backupDirectory,
                filesystem: filesystemWithFailures({ renameCalls: [2] }),
                publicDirectory
            }),
            /injected rename failure 2/
        );
        assert.strictEqual(await fsp.readFile(path.join(publicDirectory, 'marker'), 'utf8'), 'old');

        const firstPublicDirectory = path.join(fixtureRoot, 'first-public');
        const firstStagedDirectory = path.join(fixtureRoot, '.public-build-first');
        await fsp.mkdir(firstStagedDirectory);
        await fsp.writeFile(path.join(firstStagedDirectory, 'marker'), 'first');
        await replacePublicDirectory(firstStagedDirectory, {
            backupDirectory: path.join(fixtureRoot, 'first-public.previous-test'),
            publicDirectory: firstPublicDirectory
        });
        assert.strictEqual(await fsp.readFile(path.join(firstPublicDirectory, 'marker'), 'utf8'), 'first');

        await fsp.rm(stagedDirectory, { force: true, recursive: true });
        await fsp.mkdir(stagedDirectory);
        await fsp.writeFile(path.join(stagedDirectory, 'marker'), 'new');
        const warnings = [];
        await replacePublicDirectory(stagedDirectory, {
            backupDirectory,
            filesystem: filesystemWithFailures({ removeBackup: true }),
            onWarning: (warning) => warnings.push(warning),
            publicDirectory
        });
        assert.strictEqual(await fsp.readFile(path.join(publicDirectory, 'marker'), 'utf8'), 'new');
        assert.strictEqual(warnings.length, 1);
        assert.strictEqual(fs.existsSync(backupDirectory), true);
        await recoverBuildDirectories({ publicDirectory, rootDirectory: fixtureRoot });
        assert.strictEqual(fs.existsSync(backupDirectory), false);

        await fsp.rm(publicDirectory, { recursive: true });
        await fsp.mkdir(publicDirectory);
        await fsp.writeFile(path.join(publicDirectory, 'marker'), 'old');
        await fsp.mkdir(stagedDirectory);
        await fsp.writeFile(path.join(stagedDirectory, 'marker'), 'new');
        await assert.rejects(
            replacePublicDirectory(stagedDirectory, {
                backupDirectory,
                filesystem: filesystemWithFailures({ renameCalls: [2, 3] }),
                publicDirectory
            }),
            (error) => error instanceof AggregateError && error.message.includes(backupDirectory)
        );
        assert.strictEqual(fs.existsSync(publicDirectory), false);
        assert.strictEqual(fs.existsSync(backupDirectory), true);
        await recoverBuildDirectories({ publicDirectory, rootDirectory: fixtureRoot });
        assert.strictEqual(await fsp.readFile(path.join(publicDirectory, 'marker'), 'utf8'), 'old');
        assert.strictEqual(fs.existsSync(stagedDirectory), false);
    } finally {
        await fsp.rm(fixtureRoot, { force: true, recursive: true });
    }
}

async function assertFailedBuildPreservesPreviousOutput() {
    const sourceFilename = path.join(ROOT, 'assets/airports/__build-contract-invalid.json');
    const previousOutput = await hashOutput();

    await fsp.writeFile(sourceFilename, '{ definitely not valid JSON');

    try {
        const result = spawnSync(process.execPath, [BUILD_SCRIPT, '--production'], {
            cwd: ROOT,
            encoding: 'utf8',
            env: { ...process.env, SOURCE_DATE_EPOCH: FIXED_BUILD_EPOCH }
        });

        assert.notStrictEqual(result.status, 0, 'build unexpectedly accepted malformed airport JSON');
        assert.match(result.stderr, /SyntaxError/);
        assert.deepStrictEqual(await hashOutput(), previousOutput, 'failed build replaced the previous public output');

        const leakedBuildDirectories = (await fsp.readdir(ROOT))
            .filter((filename) => filename.startsWith('.public-build-'));
        assert.deepStrictEqual(leakedBuildDirectories, [], 'failed build leaked a staging directory');
    } finally {
        await fsp.rm(sourceFilename, { force: true });
        runBuild();
    }
}

function runBuildArgumentsAsync(arguments_) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [BUILD_SCRIPT, ...arguments_], {
            cwd: ROOT,
            env: { ...process.env, SOURCE_DATE_EPOCH: FIXED_BUILD_EPOCH }
        });
        let stderr = '';
        let stdout = '';

        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.on('close', (status, signal) => resolve({ signal, status, stderr, stdout }));
    });
}

function runBuildAsync() {
    return runBuildArgumentsAsync(['--production']);
}

async function assertWatchQueuesInitialChanges() {
    const child = spawn(process.execPath, [BUILD_SCRIPT, '--watch'], {
        cwd: ROOT,
        env: { ...process.env, SOURCE_DATE_EPOCH: FIXED_BUILD_EPOCH }
    });
    let output = '';
    let touched = false;

    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`watch startup timed out:\n${output}`)), 20000);
            const inspect = (chunk) => {
                output += chunk;

                if (!touched && output.includes('watching source')) {
                    touched = true;
                    fs.utimesSync(path.join(ROOT, 'src/assets/style/main.less'), new Date(), new Date());
                }

                if ((output.match(/built public\//g) || []).length >= 2) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            child.stdout.on('data', inspect);
            child.stderr.on('data', inspect);
            child.on('close', (status) => {
                clearTimeout(timeout);
                reject(new Error(`watch exited with ${status}:\n${output}`));
            });
        });
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
        }
        await waitForChildExit(child).catch(() => {});
    }

    assert.ok(touched, 'watch never reported registered source watchers');
    assert.ok(
        output.indexOf('watching source') < output.indexOf('built public/'),
        'watchers were registered only after the initial build'
    );
}

async function waitForChildExit(child, timeoutMilliseconds = 5000) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return { signal: child.signalCode, status: child.exitCode };
    }

    return Promise.race([
        new Promise((resolve) => child.once('close', (status, signal) => resolve({ signal, status }))),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('child process did not exit')), timeoutMilliseconds))
    ]);
}

async function findInternalBuildWorker(parent) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
        if (parent.exitCode !== null || parent.signalCode !== null) {
            throw new Error('locked build exited before starting an internal worker');
        }

        const childrenFilename = `/proc/${parent.pid}/task/${parent.pid}/children`;
        const contents = await fsp.readFile(childrenFilename, 'utf8').catch(() => '');

        for (const processId of contents.trim().split(/\s+/).filter(Boolean)) {
            const commandLine = await fsp.readFile(`/proc/${processId}/cmdline`, 'utf8').catch(() => '');

            if (commandLine.replace(/\0/g, ' ').includes('--internal-build')) {
                return Number(processId);
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error('locked build did not start an internal worker');
}

async function findWorkerStagingDirectory(workerProcessId) {
    const prefix = `.public-build-${workerProcessId}-`;

    for (let attempt = 0; attempt < 500; attempt += 1) {
        const match = (await fsp.readdir(ROOT)).find((filename) => filename.startsWith(prefix));

        if (match) {
            return path.join(ROOT, match);
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error('internal build worker did not create staging output');
}

async function assertInternalWorkerRequiresKernelLock() {
    const result = await runBuildArgumentsAsync(['--internal-build', '--production']);
    assert.notStrictEqual(result.status, 0, 'internal build worker ran without owning the kernel lock');
    assert.match(result.stderr, /does not own the build lock/);
}

async function assertActualBuildWorkerOwnsLock() {
    const child = spawn(process.execPath, [BUILD_SCRIPT, '--production'], {
        cwd: ROOT,
        detached: true,
        env: { ...process.env, SOURCE_DATE_EPOCH: FIXED_BUILD_EPOCH },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    try {
        const workerProcessId = await findInternalBuildWorker(child);
        const stagingDirectory = await findWorkerStagingDirectory(workerProcessId);
        process.kill(workerProcessId, 'SIGKILL');
        const result = await waitForChildExit(child);
        assert.notStrictEqual(result.status, 0, 'wrapper reported success after its locked build worker died');
        assert.strictEqual(fs.existsSync(stagingDirectory), true, 'worker death did not preserve the interrupted staging fixture');

        const contender = await runBuildAsync();
        assert.strictEqual(contender.status, 0, `contender failed after locked worker died: ${contender.stderr}`);
        const leakedBuildDirectories = (await fsp.readdir(ROOT))
            .filter((filename) => filename.startsWith('.public-build-'));
        assert.deepStrictEqual(leakedBuildDirectories, [], 'killed worker left unrecovered staging output');
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            process.kill(-child.pid, 'SIGKILL');
            await waitForChildExit(child).catch(() => {});
        }
    }
}

async function assertBuildLockSerializesProcesses() {
    const lockFilename = path.join(ROOT, '.public-build.lock');

    await fsp.writeFile(lockFilename, 'stale pathname data is not lock ownership');

    const results = await Promise.all(Array.from({ length: 12 }, () => runBuildAsync()));
    const successes = results.filter((result) => result.status === 0);
    assert.strictEqual(successes.length, 1, `stale-lock race allowed ${successes.length} successful builds`);
    assert.ok(
        results.filter((result) => result.status !== 0).every((result) => /another build is already running/.test(result.stderr)),
        'stale-lock contenders failed for an unexpected reason'
    );
    assert.strictEqual(fs.existsSync(lockFilename), true, 'advisory lock inode unexpectedly disappeared');
}

async function assertStagingCleanupFailureIsReported() {
    await assert.rejects(
        cleanupAfterBuild('/injected-staging-directory', {
            async rm() {
                throw new Error('injected staging cleanup failure');
            }
        }),
        /staging cleanup failed: injected staging cleanup failure/
    );
}

async function assertRecoveryChoosesNewestBackup() {
    const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'stringofpearls-recovery-'));
    const publicDirectory = path.join(fixtureRoot, 'public');
    const olderBackup = path.join(fixtureRoot, 'public.previous-100-1');
    const newerBackup = path.join(fixtureRoot, 'public.previous-200-1');

    try {
        await fsp.mkdir(olderBackup);
        await fsp.writeFile(path.join(olderBackup, 'marker'), 'old');
        await fsp.mkdir(newerBackup);
        await fsp.writeFile(path.join(newerBackup, 'marker'), 'new');
        await recoverBuildDirectories({ publicDirectory, rootDirectory: fixtureRoot });
        assert.strictEqual(await fsp.readFile(path.join(publicDirectory, 'marker'), 'utf8'), 'new');
        assert.strictEqual(fs.existsSync(olderBackup), false, 'older backup was not removed');
    } finally {
        await fsp.rm(fixtureRoot, { force: true, recursive: true });
    }
}

async function main() {
    assert.strictEqual(fs.existsSync(BUILD_SCRIPT), true, 'tools/build.js must provide the Phase 1 build pipeline');

    runBuild();

    const actualPaths = (await listFiles(PUBLIC_DIR)).map((filename) => relativeTo(PUBLIC_DIR, filename)).sort();
    assert.deepStrictEqual(actualPaths, await expectedOutputPaths(), 'the public URL set changed');

    for (const directory of COPY_DIRECTORIES) {
        await assertCopiedDirectory(directory);
    }

    await assertServerOutput();
    await assertAirportOutputs();

    const aircraft = JSON.parse(await fsp.readFile(path.join(PUBLIC_DIR, 'assets/aircraft/aircraft.json'), 'utf8'));
    const airlines = JSON.parse(await fsp.readFile(path.join(PUBLIC_DIR, 'assets/airlines/airlines.json'), 'utf8'));
    assert.deepStrictEqual(aircraft, await expectedAggregate('aircraft', 'aircraft.json'));
    assert.deepStrictEqual(airlines, await expectedAggregate('airlines', 'airlines.json'));
    assert.deepStrictEqual(
        JSON.parse(await fsp.readFile(path.join(PUBLIC_DIR, 'assets/guides/guides.json'), 'utf8')),
        await expectedGuides()
    );
    assert.deepStrictEqual(
        JSON.parse(await fsp.readFile(path.join(PUBLIC_DIR, 'assets/changelog.json'), 'utf8')),
        await expectedChangelog()
    );

    const manifest = JSON.parse(await fsp.readFile(path.join(ROOT, 'package.json'), 'utf8'));
    const index = await fsp.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    assert.match(index, /Build Date: Thu, 01 Jan 1970 00:00:00 GMT/);
    assert.ok(
        index.includes(`assets/style/main.min.css?=${manifest.version}`),
        'stylesheet cache key does not match package.json version'
    );
    assert.ok(
        index.includes(`assets/scripts/client/bundle.min.js?v=${manifest.version}`),
        'client bundle cache key does not match package.json version'
    );
    assert.doesNotMatch(index, /{{[#/>!]?[^}]+}}/);

    const bundle = await fsp.readFile(path.join(PUBLIC_DIR, 'assets/scripts/client/bundle.min.js'), 'utf8');
    const stylesheet = await fsp.readFile(path.join(PUBLIC_DIR, 'assets/style/main.min.css'), 'utf8');
    assert.match(bundle, /sourceMappingURL=bundle\.min\.js\.map/);
    assert.match(stylesheet, /sourceMappingURL=main\.min\.css\.map/);
    JSON.parse(await fsp.readFile(path.join(PUBLIC_DIR, 'assets/scripts/client/bundle.min.js.map'), 'utf8'));
    await assertStylesheetSourceMap(stylesheet);
    await assertUppercaseAirportExtensionIsCopied();
    await assertPublicationFailureSemantics();
    await assertRecoveryChoosesNewestBackup();
    await assertFailedBuildPreservesPreviousOutput();
    await assertStagingCleanupFailureIsReported();
    await assertWatchQueuesInitialChanges();
    await assertInternalWorkerRequiresKernelLock();
    await assertActualBuildWorkerOwnsLock();
    await assertBuildLockSerializesProcesses();

    const firstHashes = await hashOutput();
    runBuild();
    assert.deepStrictEqual(await hashOutput(), firstHashes, 'identical inputs did not produce identical output');

    assertBuildFailure(['--invent-a-build-mode'], {}, /unknown build option/);
    assertBuildFailure(['--production'], { SOURCE_DATE_EPOCH: 'yesterday-ish' }, /SOURCE_DATE_EPOCH must be a non-negative integer/);

    console.log(`build contract passed for ${actualPaths.length} public files`);
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
