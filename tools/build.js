'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const { spawn } = require('child_process');
const path = require('path');
const autoprefixer = require('autoprefixer');
const CleanCSS = require('clean-css');
const esbuild = require('esbuild');
const Handlebars = require('handlebars');
const handlebarsLayouts = require('handlebars-layouts');
const less = require('less');
const postcss = require('postcss');
const showdown = require('showdown');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SOURCE_DIR = path.join(ROOT, 'src');
const ASSET_DIR = path.join(ROOT, 'assets');
const CLIENT_ENTRY = path.join(SOURCE_DIR, 'assets/scripts/client/index.js');
const SERVER_SOURCE = path.join(SOURCE_DIR, 'assets/scripts/server');
const STYLE_ENTRY = path.join(SOURCE_DIR, 'assets/style/main.less');
const TEMPLATE_DIR = path.join(SOURCE_DIR, 'templates');
const GUIDE_SOURCE = path.join(ROOT, 'documentation/airport-guides');
const COPY_DIRECTORIES = ['fonts', 'images', 'tutorial', 'autocomplete'];

async function listDirectory(directory) {
    return (await fsp.readdir(directory, { withFileTypes: true }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

async function listFiles(directory) {
    const files = [];

    for (const entry of await listDirectory(directory)) {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...await listFiles(entryPath));
        } else if (entry.isFile()) {
            files.push(entryPath);
        }
    }

    return files;
}

async function writeFile(filename, contents) {
    await fsp.mkdir(path.dirname(filename), { recursive: true });
    await fsp.writeFile(filename, contents);
}

function getBuildDate() {
    const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;

    if (sourceDateEpoch === undefined) {
        return new Date();
    }

    if (!/^\d+$/.test(sourceDateEpoch)) {
        throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer');
    }

    const date = new Date(Number(sourceDateEpoch) * 1000);

    if (Number.isNaN(date.getTime())) {
        throw new Error('SOURCE_DATE_EPOCH is outside the supported date range');
    }

    return date;
}

async function buildClient({ production, publicDirectory }) {
    const outputDirectory = path.join(publicDirectory, 'assets/scripts/client');
    await fsp.mkdir(outputDirectory, { recursive: true });

    await esbuild.build({
        absWorkingDir: ROOT,
        alias: {
            fs: path.join(__dirname, 'build-shims/empty.js')
        },
        bundle: true,
        define: {
            global: 'window'
        },
        entryPoints: [CLIENT_ENTRY],
        format: 'iife',
        legalComments: 'none',
        logLevel: 'warning',
        minifyIdentifiers: false,
        minifySyntax: production,
        minifyWhitespace: production,
        outfile: path.join(outputDirectory, 'bundle.min.js'),
        platform: 'browser',
        sourcemap: 'linked',
        target: ['chrome109', 'firefox115', 'safari16']
    });
}

async function buildServer(publicDirectory) {
    await fsp.cp(SERVER_SOURCE, path.join(publicDirectory, 'assets/scripts/server'), { recursive: true });
}

async function buildStyles(publicDirectory) {
    const outputDirectory = path.join(publicDirectory, 'assets/style');
    const outputFilename = path.join(outputDirectory, 'main.min.css');
    const source = await fsp.readFile(STYLE_ENTRY, 'utf8');
    const lessResult = await less.render(source, {
        filename: STYLE_ENTRY,
        math: 'always',
        sourceMap: {
            outputSourceFiles: true,
            sourceMapBasepath: path.dirname(STYLE_ENTRY),
            sourceMapRootpath: '../../../src/assets/style/'
        }
    });
    const prefixed = await postcss([
        autoprefixer({
            cascade: false,
            overrideBrowserslist: ['last 2 versions']
        })
    ]).process(lessResult.css, {
        from: 'main.css',
        map: {
            annotation: false,
            inline: false,
            prev: lessResult.map
        },
        to: 'main.min.css'
    });
    const minified = new CleanCSS({
        compatibility: 'ie11',
        sourceMap: true,
        sourceMapInlineSources: true
    }).minify({
        'main.min.css': {
            sourceMap: prefixed.map.toString(),
            styles: prefixed.css
        }
    });

    if (minified.errors.length > 0) {
        throw new Error(`CSS minification failed: ${minified.errors.join('; ')}`);
    }

    const sourceMap = JSON.parse(minified.sourceMap.toString());
    const styleSourceMarker = 'src/assets/style/';
    sourceMap.file = 'main.min.css';
    sourceMap.sources = sourceMap.sources.map((sourceFilename) => {
        const normalized = sourceFilename.split(path.sep).join('/');
        const markerIndex = normalized.indexOf(styleSourceMarker);

        if (markerIndex === -1) {
            return 'main.css';
        }

        const absoluteSource = path.join(ROOT, normalized.slice(markerIndex));
        return path.relative(outputDirectory, absoluteSource).split(path.sep).join('/');
    });

    await writeFile(
        outputFilename,
        `${minified.styles}\n/*# sourceMappingURL=main.min.css.map */\n`
    );
    await writeFile(path.join(outputDirectory, 'main.min.css.map'), JSON.stringify(sourceMap));
}

async function buildMarkup(publicDirectory) {
    handlebarsLayouts.register(Handlebars);

    for (const filename of await listFiles(TEMPLATE_DIR)) {
        if (path.extname(filename) !== '.hbs') {
            continue;
        }

        const partialName = path.basename(filename, '.hbs');
        Handlebars.registerPartial(partialName, await fsp.readFile(filename, 'utf8'));
    }

    const pkg = JSON.parse(await fsp.readFile(path.join(ROOT, 'package.json'), 'utf8'));
    const template = Handlebars.compile(await fsp.readFile(path.join(SOURCE_DIR, 'index.hbs'), 'utf8'));
    const html = template({
        buildDate: getBuildDate().toUTCString(),
        version: pkg.version
    });

    await writeFile(path.join(publicDirectory, 'index.html'), html);
}

async function buildAggregate(directory, outputFilename, publicDirectory) {
    const sourceDirectory = path.join(ASSET_DIR, directory);
    const records = [];

    for (const entry of await listDirectory(sourceDirectory)) {
        if (!entry.isFile() || entry.name.includes(outputFilename)) {
            continue;
        }

        records.push(JSON.parse(await fsp.readFile(path.join(sourceDirectory, entry.name), 'utf8')));
    }

    const rootKey = path.parse(outputFilename).name;
    await writeFile(
        path.join(publicDirectory, 'assets', directory, outputFilename),
        JSON.stringify({ [rootKey]: records })
    );
}

async function buildGuides(publicDirectory) {
    const converter = new showdown.Converter({
        simpleLineBreaks: true,
        tables: true
    });
    const guides = {};

    for (const entry of await listDirectory(GUIDE_SOURCE)) {
        if (!entry.isFile() || entry.name.includes('airport-guide-directory')) {
            continue;
        }

        const markdown = await fsp.readFile(path.join(GUIDE_SOURCE, entry.name), 'utf8');

        if (markdown.length === 0) {
            continue;
        }

        guides[path.parse(entry.name).name] = converter.makeHtml(markdown);
    }

    await writeFile(path.join(publicDirectory, 'assets/guides/guides.json'), JSON.stringify(guides));
}

async function buildChangelog(publicDirectory) {
    const markdown = await fsp.readFile(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    const sections = markdown.split(/# [0-9]\.[0-9]+\.[0-9] \(.*\)/g);

    if (sections.length < 2) {
        throw new Error('CHANGELOG.md does not contain a version heading');
    }

    const converter = new showdown.Converter({ simpleLineBreaks: true });
    const output = JSON.stringify({ changelog: converter.makeHtml(sections[1]) });
    await writeFile(path.join(publicDirectory, 'assets/changelog.json'), output);
}

async function copyStaticAssets(publicDirectory) {
    for (const directory of COPY_DIRECTORIES) {
        await fsp.cp(
            path.join(ASSET_DIR, directory),
            path.join(publicDirectory, 'assets', directory),
            { recursive: true }
        );
    }
}

async function buildAirports(publicDirectory) {
    const sourceDirectory = path.join(ASSET_DIR, 'airports');
    const outputDirectory = path.join(publicDirectory, 'assets/airports');

    for (const sourceFilename of await listFiles(sourceDirectory)) {
        const relative = path.relative(sourceDirectory, sourceFilename);
        const outputFilename = path.join(outputDirectory, relative);
        const basename = path.basename(sourceFilename);
        const extension = path.extname(sourceFilename);

        if (/^airportLoadList.*\.json$/.test(basename)) {
            await writeFile(outputFilename, await fsp.readFile(sourceFilename));
            continue;
        }

        if (extension === '.json' || extension === '.geojson') {
            const parsed = JSON.parse(await fsp.readFile(sourceFilename, 'utf8'));
            await writeFile(outputFilename, JSON.stringify(parsed));
            continue;
        }

        await writeFile(outputFilename, await fsp.readFile(sourceFilename));
    }
}

async function pathExists(filename, filesystem = fsp) {
    try {
        await filesystem.access(filename);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }

        throw error;
    }
}

async function recoverBuildDirectories(options = {}) {
    const filesystem = options.filesystem || fsp;
    const publicDirectory = options.publicDirectory || PUBLIC_DIR;
    const rootDirectory = options.rootDirectory || ROOT;
    const entries = await filesystem.readdir(rootDirectory, { withFileTypes: true });
    const stagingDirectories = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('.public-build-'))
        .map((entry) => path.join(rootDirectory, entry.name));
    const backupPrefix = `${path.basename(publicDirectory)}.previous-`;
    let backupDirectories = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(backupPrefix))
        .map((entry) => path.join(rootDirectory, entry.name))
        .sort();

    if (!await pathExists(publicDirectory, filesystem) && backupDirectories.length > 0) {
        const recoveryDirectory = backupDirectories.pop();
        await filesystem.rename(recoveryDirectory, publicDirectory);
    }

    for (const directory of [...stagingDirectories, ...backupDirectories]) {
        await filesystem.rm(directory, { force: true, recursive: true });
    }
}

async function replacePublicDirectory(stagedDirectory, options = {}) {
    const filesystem = options.filesystem || fsp;
    const onWarning = options.onWarning || console.warn;
    const publicDirectory = options.publicDirectory || PUBLIC_DIR;
    const backupDirectory = options.backupDirectory || `${publicDirectory}.previous-${Date.now()}-${process.pid}`;
    let previousOutputMoved = false;

    try {
        await filesystem.rename(publicDirectory, backupDirectory);
        previousOutputMoved = true;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    try {
        await filesystem.rename(stagedDirectory, publicDirectory);
    } catch (promotionError) {
        if (previousOutputMoved) {
            try {
                await filesystem.rename(backupDirectory, publicDirectory);
            } catch (rollbackError) {
                throw new AggregateError(
                    [promotionError, rollbackError],
                    `failed to publish output and restore previous output; recoverable backup remains at ${backupDirectory}`
                );
            }
        }

        throw promotionError;
    }

    if (previousOutputMoved) {
        try {
            await filesystem.rm(backupDirectory, { force: true, recursive: true });
        } catch (error) {
            onWarning(`published output but could not remove backup ${backupDirectory}: ${error.message}`);
        }
    }
}

async function acquireBuildLock(options = {}) {
    const rootDirectory = options.rootDirectory || ROOT;
    const lockFilename = path.join(rootDirectory, '.public-build.lock');
    const holderScript = "process.stdout.write('locked\\n'); process.stdin.resume();";
    const holder = spawn('flock', [
        '--nonblock',
        lockFilename,
        process.execPath,
        '-e',
        holderScript
    ], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    await new Promise((resolve, reject) => {
        let stderr = '';
        const onError = (error) => reject(error);
        const onExit = (status) => {
            const message = status === 1
                ? 'another build is already running'
                : `could not acquire build lock with flock (exit ${status}${stderr ? `: ${stderr.trim()}` : ''})`;
            reject(new Error(message));
        };
        const onData = (chunk) => {
            if (!chunk.toString().includes('locked')) {
                return;
            }

            holder.removeListener('error', onError);
            holder.removeListener('exit', onExit);
            resolve();
        };

        holder.stderr.on('data', (chunk) => { stderr += chunk; });
        holder.once('error', onError);
        holder.once('exit', onExit);
        holder.stdout.on('data', onData);
    }).catch(async (error) => {
        holder.stdin.destroy();
        await new Promise((resolve) => {
            if (holder.exitCode !== null || holder.signalCode !== null) {
                resolve();
                return;
            }

            holder.once('close', resolve);
        });
        throw error;
    });

    let released = false;

    return async () => {
        if (released) {
            throw new Error('build lock was already released');
        }

        released = true;
        const result = holder.exitCode !== null || holder.signalCode !== null
            ? { signal: holder.signalCode, status: holder.exitCode }
            : await new Promise((resolve) => {
                holder.once('exit', (status, signal) => resolve({ signal, status }));
                holder.stdin.end();
            });

        if (holder.stdin.writable) {
            holder.stdin.end();
        }

        if (result.status !== 0) {
            throw new Error(`build lock holder exited abnormally (${result.signal || result.status})`);
        }
    };
}

async function cleanupAfterBuild(stagedDirectory, releaseBuildLock, filesystem = fsp) {
    const operations = [];

    if (stagedDirectory) {
        operations.push(
            filesystem.rm(stagedDirectory, { force: true, recursive: true })
                .catch((error) => { throw new Error(`staging cleanup failed: ${error.message}`, { cause: error }); })
        );
    }

    operations.push(
        releaseBuildLock()
            .catch((error) => { throw new Error(`lock release failed: ${error.message}`, { cause: error }); })
    );

    const results = await Promise.allSettled(operations);
    const failures = results
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason);

    if (failures.length > 0) {
        throw new AggregateError(failures, 'build cleanup failed');
    }
}

async function build(options = {}) {
    const production = options.production === true;
    const startedAt = Date.now();
    const releaseBuildLock = await acquireBuildLock();
    let buildError;
    let stagedDirectory;

    try {
        await recoverBuildDirectories();
        stagedDirectory = await fsp.mkdtemp(path.join(ROOT, `.public-build-${process.pid}-`));
        const results = await Promise.allSettled([
            buildClient({ production, publicDirectory: stagedDirectory }),
            buildServer(stagedDirectory),
            buildStyles(stagedDirectory),
            buildMarkup(stagedDirectory),
            buildAggregate('aircraft', 'aircraft.json', stagedDirectory),
            buildAggregate('airlines', 'airlines.json', stagedDirectory),
            buildGuides(stagedDirectory),
            buildChangelog(stagedDirectory),
            copyStaticAssets(stagedDirectory),
            buildAirports(stagedDirectory)
        ]);
        const failures = results
            .filter((result) => result.status === 'rejected')
            .map((result) => result.reason);

        if (failures.length > 0) {
            throw failures.length === 1 ? failures[0] : new AggregateError(failures, 'build failed');
        }

        await replacePublicDirectory(stagedDirectory);
    } catch (error) {
        buildError = error;
    }

    try {
        await cleanupAfterBuild(stagedDirectory, releaseBuildLock);
    } catch (cleanupError) {
        if (buildError) {
            throw new AggregateError([buildError, ...cleanupError.errors], 'build and cleanup failed');
        }

        throw cleanupError;
    }

    if (buildError) {
        throw buildError;
    }

    console.log(`built public/ in ${Date.now() - startedAt}ms (${production ? 'production' : 'development'})`);
}

function parseArguments(argv) {
    const options = { production: false, watch: false };

    for (const argument of argv) {
        if (argument === '--production') {
            options.production = true;
        } else if (argument === '--watch') {
            options.watch = true;
        } else {
            throw new Error(`unknown build option: ${argument}`);
        }
    }

    return options;
}

async function watch(options) {
    let timer;
    let building = true;
    let rebuildRequested = false;
    const watchers = [];

    const rebuild = async () => {
        if (building) {
            rebuildRequested = true;
            return;
        }

        building = true;

        try {
            await build(options);
        } catch (error) {
            console.error(error.stack || error.message);
            process.exitCode = 1;
        } finally {
            building = false;

            if (rebuildRequested) {
                rebuildRequested = false;
                await rebuild();
            }
        }
    };

    const scheduleRebuild = () => {
        clearTimeout(timer);
        timer = setTimeout(rebuild, 100);
    };

    for (const directory of [SOURCE_DIR, ASSET_DIR, GUIDE_SOURCE]) {
        watchers.push(fs.watch(directory, { recursive: true }, scheduleRebuild));
    }

    for (const filename of [path.join(ROOT, 'CHANGELOG.md'), path.join(ROOT, 'package.json')]) {
        watchers.push(fs.watch(filename, scheduleRebuild));
    }

    console.log('watching source, assets, guides, changelog, and package metadata');

    try {
        await build(options);
    } catch (error) {
        clearTimeout(timer);
        watchers.forEach((watcher) => watcher.close());
        throw error;
    } finally {
        building = false;
    }

    if (rebuildRequested) {
        rebuildRequested = false;
        await rebuild();
    }

    await new Promise(() => {});
}

async function main() {
    const options = parseArguments(process.argv.slice(2));

    if (options.watch) {
        await watch(options);
    } else {
        await build(options);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    acquireBuildLock,
    build,
    cleanupAfterBuild,
    getBuildDate,
    parseArguments,
    recoverBuildDirectories,
    replacePublicDirectory
};
