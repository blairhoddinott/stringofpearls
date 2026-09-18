import ava from 'ava';
import $ from 'jquery';
import sinon from 'sinon';
import TrafficModeSelectionView from '../../src/assets/scripts/client/ui/TrafficModeSelectionView';

const buildViewElement = () => $(
    '<section aria-hidden="true">' +
        '<button data-traffic-mode="arrivals">Arrivals</button>' +
        '<button data-traffic-mode="departures">Departures</button>' +
        '<button data-traffic-mode="both">Both</button>' +
    '</section>'
);

ava.afterEach.always(() => {
    $('section[data-test-traffic-mode]').remove();
});

ava('.show() opens the choice and focuses the first traffic mode', (t) => {
    const $element = buildViewElement().attr('data-test-traffic-mode', '').appendTo('body');
    const view = new TrafficModeSelectionView($element);

    const result = view.show(() => {});

    t.is(result, view);
    t.true($element.hasClass('open'));
    t.is($element.attr('aria-hidden'), 'false');
    t.is(window.document.activeElement, $element.find('[data-traffic-mode="arrivals"]')[0]);
});

ava('selecting a mode calls back once, closes the choice, and disables further selection', (t) => {
    const $element = buildViewElement().attr('data-test-traffic-mode', '').appendTo('body');
    const onSelect = sinon.stub().returns('started');
    const view = new TrafficModeSelectionView($element);
    view.show(onSelect);

    $element.find('[data-traffic-mode="departures"]').trigger('click');
    $element.find('[data-traffic-mode="arrivals"]').trigger('click');

    t.true(onSelect.calledOnceWithExactly('departures'));
    t.false($element.hasClass('open'));
    t.is($element.attr('aria-hidden'), 'true');
});

ava('Tab and Shift+Tab keep keyboard focus within the traffic choices', (t) => {
    const $element = buildViewElement().attr('data-test-traffic-mode', '').appendTo('body');
    const $buttons = $element.find('[data-traffic-mode]');
    const view = new TrafficModeSelectionView($element);
    view.show(() => {});

    $buttons.last().trigger('focus').trigger($.Event('keydown', { key: 'Tab' }));
    t.is(window.document.activeElement, $buttons.first()[0]);

    $buttons.first().trigger('focus').trigger($.Event('keydown', { key: 'Tab', shiftKey: true }));
    t.is(window.document.activeElement, $buttons.last()[0]);
});
