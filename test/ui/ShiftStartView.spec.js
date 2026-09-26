import ava from 'ava';
import $ from 'jquery';
import sinon from 'sinon';
import ShiftStartView from '../../src/assets/scripts/client/ui/ShiftStartView';

const AIRPORT_OPTIONS = [
    { icao: 'ksea', name: 'Seattle-Tacoma' },
    { icao: 'klas', name: 'Las Vegas' }
];

const buildViewElement = () => $(
    '<section aria-hidden="true">' +
        '<form data-shift-start-form>' +
            '<select data-shift-sector>' +
                '<option value="approach">Approach</option>' +
                '<option value="departure">Departure</option>' +
                '<option value="both" selected>Both</option>' +
            '</select>' +
            '<select data-shift-airport></select>' +
            '<select data-shift-length>' +
                '<option value="30" selected>30</option>' +
                '<option value="60">60</option>' +
            '</select>' +
            '<button type="submit" data-shift-start-button>Start shift</button>' +
        '</form>' +
    '</section>'
);

ava.afterEach.always(() => {
    $('section[data-test-shift-start], [data-test-modal-background]').remove();
});

ava('.show() populates airports, selects the default, and opens the modal focused', (t) => {
    const $element = buildViewElement().attr('data-test-shift-start', '').appendTo('body');
    const view = new ShiftStartView($element);

    const result = view.show(AIRPORT_OPTIONS, 'ksea', () => {});

    t.is(result, view);
    t.true($element.hasClass('open'));
    t.is($element.attr('aria-hidden'), 'false');
    t.is($element.find('[data-shift-airport] option').length, 2);
    t.is($element.find('[data-shift-airport]').val(), 'ksea');
    t.is(window.document.activeElement, $element.find('[data-shift-sector]')[0]);
});

ava('show isolates background content and hide restores focus and native hidden state', (t) => {
    const $background = $('<main data-test-modal-background><button>Scope control</button></main>').appendTo('body');
    const backgroundButton = $background.find('button')[0];
    const $element = buildViewElement()
        .attr({ 'data-test-shift-start': '', hidden: '' })
        .appendTo('body');
    const view = new ShiftStartView($element);
    backgroundButton.focus();

    view.show(AIRPORT_OPTIONS, 'ksea', () => {});

    t.false($element.prop('hidden'));
    t.true($background.prop('inert'));

    view.hide();

    t.true($element.prop('hidden'));
    t.falsy($background.prop('inert'));
    t.is(window.document.activeElement, backgroundButton);
});

ava('.show() populates airports as text without interpreting airport metadata as markup', (t) => {
    const $element = buildViewElement().attr('data-test-shift-start', '').appendTo('body');
    const view = new ShiftStartView($element);
    const maliciousOptions = [{ icao: 'kxss" onmouseover="alert(1)', name: '<img src=x onerror=alert(1)>' }];

    view.show(maliciousOptions, maliciousOptions[0].icao, () => {});

    t.is($element.find('[data-shift-airport] img').length, 0);
    t.is($element.find('[data-shift-airport] option').text(), '<img src=x onerror=alert(1)> (KXSS" ONMOUSEOVER="ALERT(1))');
    t.is($element.find('[data-shift-airport]').val(), maliciousOptions[0].icao);
});

ava('a rejected configuration leaves the landing dialog open', (t) => {
    const $element = buildViewElement().attr('data-test-shift-start', '').appendTo('body');
    const rejection = new RangeError('bad config');
    const view = new ShiftStartView($element);
    view.show(AIRPORT_OPTIONS, 'ksea', () => { throw rejection; });

    t.throws(() => $element.find('[data-shift-start-form]').trigger('submit'), {
        is: rejection
    });
    t.true($element.hasClass('open'));
    t.is($element.attr('aria-hidden'), 'false');
});

ava('submitting the form reports the chosen config once and closes the modal', (t) => {
    const $element = buildViewElement().attr('data-test-shift-start', '').appendTo('body');
    const onStart = sinon.stub();
    const view = new ShiftStartView($element);
    view.show(AIRPORT_OPTIONS, 'ksea', onStart);

    $element.find('[data-shift-sector]').val('approach');
    $element.find('[data-shift-airport]').val('klas');
    $element.find('[data-shift-length]').val('60');
    $element.find('[data-shift-start-form]').trigger('submit');

    t.true(onStart.calledOnceWithExactly({
        sector: 'approach',
        airportIcao: 'klas',
        shiftLengthMinutes: 60
    }));
    t.false($element.hasClass('open'));
    t.is($element.attr('aria-hidden'), 'true');
});

ava('Tab and Shift+Tab keep keyboard focus within the form controls', (t) => {
    const $element = buildViewElement().attr('data-test-shift-start', '').appendTo('body');
    const view = new ShiftStartView($element);
    view.show(AIRPORT_OPTIONS, 'ksea', () => {});
    const focusable = $element.find('select, button').toArray();

    $(focusable[focusable.length - 1]).trigger('focus').trigger($.Event('keydown', { key: 'Tab' }));
    t.is(window.document.activeElement, focusable[0]);

    $(focusable[0]).trigger('focus').trigger($.Event('keydown', { key: 'Tab', shiftKey: true }));
    t.is(window.document.activeElement, focusable[focusable.length - 1]);
});
