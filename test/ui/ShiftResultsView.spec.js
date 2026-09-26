import ava from 'ava';
import $ from 'jquery';
import sinon from 'sinon';
import ShiftResultsView from '../../src/assets/scripts/client/ui/ShiftResultsView';

const SUMMARY = Object.freeze({
    finalScore: -15,
    endType: 'manual',
    aircraftRemaining: 2,
    shiftDurationSeconds: 1800,
    scheduledShiftDurationSeconds: 1800,
    elapsedShiftDurationSeconds: 975,
    config: { sector: 'approach', trafficMode: 'arrivals', airportIcao: 'ksea', shiftLengthMinutes: 30 },
    stats: {
        uniqueAircraftHandled: 4,
        arrivalsCompleted: 3,
        departuresHandedOff: 0,
        caAlarms: 2,
        separationLosses: 1,
        collisions: 0,
        missedHandoffs: 1,
        aircraftRemaining: 2,
        scorePerAircraft: -3.75
    },
    scoreEvents: [
        { event: 'ARRIVAL', description: 'Aircraft landed successfully', points: 10, simulationTime: 65 },
        { event: 'MISSED_HANDOFF', description: 'Center handoff was not accepted before the decision point', points: -25, simulationTime: 130 }
    ]
});

const buildViewElement = () => $(
    '<section aria-hidden="true">' +
        '<div data-shift-final-score></div>' +
        '<dl data-shift-config-root>' +
            '<div data-shift-config="airport"><dt>Airport</dt><dd></dd></div>' +
            '<div data-shift-config="sector"><dt>Sector</dt><dd></dd></div>' +
            '<div data-shift-config="scheduledDuration"><dt>Scheduled</dt><dd></dd></div>' +
            '<div data-shift-config="elapsedDuration"><dt>Time worked</dt><dd></dd></div>' +
        '</dl>' +
        '<div data-shift-stats></div>' +
        '<ol data-shift-log></ol>' +
        '<button type="button" data-shift-start-another>Start another shift</button>' +
    '</section>'
);

ava.afterEach.always(() => {
    $('section[data-test-shift-results], [data-test-modal-background]').remove();
});

ava('.show() renders the final score, stats, and a chronological event log', (t) => {
    const $element = buildViewElement().attr('data-test-shift-results', '').appendTo('body');
    const view = new ShiftResultsView($element);

    const result = view.show(SUMMARY, () => {});

    t.is(result, view);
    t.true($element.hasClass('open'));
    t.is($element.attr('aria-hidden'), 'false');
    t.is($element.find('[data-shift-final-score]').text(), '-15');
    t.is($element.find('[data-shift-config="airport"] dd').text(), 'KSEA');
    t.is($element.find('[data-shift-config="sector"] dd').text(), 'Approach');
    t.is($element.find('[data-shift-config="scheduledDuration"] dd').text(), '30:00');
    t.is($element.find('[data-shift-config="elapsedDuration"] dd').text(), '16:15');
    t.is($element.find('[data-stat="caAlarms"] dd').text(), '2');
    t.is($element.find('[data-stat="separationLosses"] dd').text(), '1');
    t.is($element.find('[data-stat="uniqueAircraftHandled"] dd').text(), '4');
    t.is($element.find('[data-shift-log] li').length, 2);
    t.true($element.find('[data-shift-log] li').first().text().includes('Aircraft landed successfully'));
    t.true($element.find('[data-shift-log] li').first().text().includes('+10'));
    t.is(window.document.activeElement, $element.find('[data-shift-start-another]')[0]);
});

ava('show isolates background content and hide restores focus and native hidden state', (t) => {
    const $background = $('<main data-test-modal-background><button>Scope control</button></main>').appendTo('body');
    const backgroundButton = $background.find('button')[0];
    const $element = buildViewElement()
        .attr({ 'data-test-shift-results': '', hidden: '' })
        .appendTo('body');
    const view = new ShiftResultsView($element);
    backgroundButton.focus();

    view.show(SUMMARY, () => {});

    t.false($element.prop('hidden'));
    t.true($background.prop('inert'));

    view.hide();

    t.true($element.prop('hidden'));
    t.falsy($background.prop('inert'));
    t.is(window.document.activeElement, backgroundButton);
});

ava('clicking Start another shift reports once and closes the results', (t) => {
    const $element = buildViewElement().attr('data-test-shift-results', '').appendTo('body');
    const onStartAnother = sinon.stub();
    const view = new ShiftResultsView($element);
    view.show(SUMMARY, onStartAnother);

    $element.find('[data-shift-start-another]').trigger('click');

    t.true(onStartAnother.calledOnce);
    t.false($element.hasClass('open'));
    t.is($element.attr('aria-hidden'), 'true');
});

ava('.show() renders an empty-log message and N/A score-per-aircraft when nothing was handled', (t) => {
    const $element = buildViewElement().attr('data-test-shift-results', '').appendTo('body');
    const view = new ShiftResultsView($element);
    const emptySummary = {
        ...SUMMARY,
        scoreEvents: [],
        stats: { ...SUMMARY.stats, uniqueAircraftHandled: 0, scorePerAircraft: null }
    };

    view.show(emptySummary, () => {});

    t.is($element.find('[data-shift-log] li').length, 1);
    t.true($element.find('[data-shift-log] li').text().includes('No scoring events'));
    t.is($element.find('[data-stat="scorePerAircraft"] dd').text(), 'N/A');
});

ava('Tab keeps focus within the results dialog', (t) => {
    const $element = buildViewElement().attr('data-test-shift-results', '').appendTo('body');
    const view = new ShiftResultsView($element);
    view.show(SUMMARY, () => {});
    const button = $element.find('[data-shift-start-another]')[0];

    $(button).trigger('focus').trigger($.Event('keydown', { key: 'Tab' }));

    t.is(window.document.activeElement, button);
});
