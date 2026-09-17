import ava from 'ava';
import $ from 'jquery';
import sinon from 'sinon';
import AutocompleteController from '../../../src/assets/scripts/client/ui/autocomplete/AutocompleteController';
import { AssetLoadError } from '../../../src/assets/scripts/client/platform/AssetLoader';

const AUTOCOMPLETE_CONFIG_URL = 'assets/autocomplete/commandAutocompleteConfig.json';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const buildElement = () => $(
    '<div>' +
        '<div id="autocomplete">' +
            '<input id="autocomplete-input" />' +
            '<input id="autocomplete-output" />' +
            '<span id="autocomplete-spacer"></span>' +
            '<div id="autocomplete-suggests"></div>' +
        '</div>' +
    '</div>'
);

const buildConfig = () => ({
    transmit: [
        {
            id: 'climb',
            variants: [
                { aliases: ['climb'], altkeys: [], explain: 'climb' }
            ],
            paramsets: [
                { candidate: '\\d+', validate: '\\d+' }
            ]
        }
    ]
});

ava('ingests fetched configuration through the injected asset loader', async (t) => {
    const config = buildConfig();
    const assetLoader = { loadJson: sinon.stub().resolves(config) };

    const controller = new AutocompleteController(buildElement(), {}, {}, assetLoader);

    await flushPromises();

    t.true(assetLoader.loadJson.calledOnceWithExactly(AUTOCOMPLETE_CONFIG_URL));
    t.true(controller.ready);
    t.is(controller.commandDefs, config);
});

ava.serial('logs a diagnostic and stays unready when the injected asset loader rejects', async (t) => {
    const assetError = new AssetLoadError({ status: 404, statusText: 'Not Found' }, 'error', null);
    const assetLoader = { loadJson: sinon.stub().rejects(assetError) };
    const consoleError = sinon.stub(console, 'error');

    try {
        const controller = new AutocompleteController(buildElement(), {}, {}, assetLoader);

        await flushPromises();

        t.true(consoleError.calledOnceWithExactly('Failed to load autocomplete configuration: 404: Not Found'));
        t.false(controller.ready);
    } finally {
        consoleError.restore();
    }
});

ava.serial('reports configuration ingestion errors without mislabeling them as load failures', async (t) => {
    const ingestionError = new Error('invalid command definition');
    const assetLoader = { loadJson: sinon.stub().resolves(buildConfig()) };
    const reportError = sinon.stub();
    const consoleError = sinon.stub(console, 'error');

    try {
        const controller = new AutocompleteController(buildElement(), {}, {}, assetLoader, reportError);
        sinon.stub(controller, 'onConfigFetchedHandler').throws(ingestionError);

        await flushPromises();

        t.true(reportError.calledOnceWithExactly(ingestionError));
        t.false(consoleError.called);
    } finally {
        consoleError.restore();
    }
});
