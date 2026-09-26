import ava from 'ava';
import $ from 'jquery';
import sinon from 'sinon';
import ShiftStatusView from '../../src/assets/scripts/client/ui/ShiftStatusView';
import { SHIFT_STATE } from '../../src/assets/scripts/client/shift/shiftConstants';

const buildViewElement = () => $(
    '<div data-test-shift-status>' +
        '<span data-shift-countdown></span>' +
        '<button type="button" data-shift-end-button>End shift</button>' +
    '</div>'
);

ava.afterEach.always(() => {
    $('[data-test-shift-status]').remove();
});

ava('.setEndShiftHandler() invokes the handler when the End shift button is clicked', (t) => {
    const $element = buildViewElement().appendTo('body');
    const handler = sinon.stub();
    const view = new ShiftStatusView($element);

    view.setEndShiftHandler(handler);
    $element.find('[data-shift-end-button]').trigger('click');

    t.true(handler.calledOnce);
});

ava('.destroy() unbinds the End shift handler', (t) => {
    const $element = buildViewElement().appendTo('body');
    const handler = sinon.stub();
    const view = new ShiftStatusView($element);
    view.setEndShiftHandler(handler);

    view.destroy();
    $element.find('[data-shift-end-button]').trigger('click');

    t.true(handler.notCalled);
});

ava('.update() renders a running countdown as MM:SS and marks the status active', (t) => {
    const $element = buildViewElement().appendTo('body');
    const view = new ShiftStatusView($element);

    view.update({ state: SHIFT_STATE.RUNNING, remainingSeconds: 125 });

    t.is($element.find('[data-shift-countdown]').text(), '02:05');
    t.true($element.hasClass('shift-status_active'));
});

ava('.update() shows the clearing status during overtime', (t) => {
    const $element = buildViewElement().appendTo('body');
    const view = new ShiftStatusView($element);

    view.update({ state: SHIFT_STATE.CLEARING, remainingSeconds: 0 });

    t.true($element.hasClass('shift-status_clearing'));
    t.is($element.find('[data-shift-countdown]').text(), 'CLEARING');
});

ava('.reset() clears the readout and deactivates the status', (t) => {
    const $element = buildViewElement().appendTo('body');
    const view = new ShiftStatusView($element);
    view.update({ state: SHIFT_STATE.RUNNING, remainingSeconds: 60 });

    view.reset();

    t.false($element.hasClass('shift-status_active'));
    t.false($element.hasClass('shift-status_clearing'));
    t.is($element.find('[data-shift-countdown]').text(), '');
});
