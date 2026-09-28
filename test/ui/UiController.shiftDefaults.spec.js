import ava from 'ava';
import $ from 'jquery';
import sinon from 'sinon';

import UiController from '../../src/assets/scripts/client/ui/UiController';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';
import { SELECTORS } from '../../src/assets/scripts/client/constants/selectors';
import { SHIFT_SECTOR } from '../../src/assets/scripts/client/shift/shiftConstants';

const buildHarness = (t) => {
    const $element = $(
        '<div>' +
            '<button class="toggle-labels"></button>' +
            '<button class="toggle-sids active"></button>' +
            '<button class="toggle-stars"></button>' +
        '</div>'
    ).appendTo('body');
    const previous = {
        eventBus: UiController._eventBus,
        labels: UiController.$toggleLabels,
        sids: UiController.$toggleSids,
        stars: UiController.$toggleStars
    };
    const eventBus = { trigger: sinon.stub() };

    UiController._eventBus = eventBus;
    UiController.$toggleLabels = $element.find('.toggle-labels');
    UiController.$toggleSids = $element.find('.toggle-sids');
    UiController.$toggleStars = $element.find('.toggle-stars');
    t.teardown(() => {
        UiController._eventBus = previous.eventBus;
        UiController.$toggleLabels = previous.labels;
        UiController.$toggleSids = previous.sids;
        UiController.$toggleStars = previous.stars;
        $element.remove();
    });

    return { eventBus };
};

ava.serial('approach shift defaults enable runway labels and STARs while disabling SIDs', (t) => {
    const { eventBus } = buildHarness(t);

    UiController.applyShiftDefaults(SHIFT_SECTOR.APPROACH);

    t.true(UiController.$toggleLabels.hasClass(SELECTORS.CLASSNAMES.ACTIVE));
    t.false(UiController.$toggleSids.hasClass(SELECTORS.CLASSNAMES.ACTIVE));
    t.true(UiController.$toggleStars.hasClass(SELECTORS.CLASSNAMES.ACTIVE));
    t.deepEqual(eventBus.trigger.args, [
        [EVENT.TOGGLE_LABELS, true],
        [EVENT.TOGGLE_SID_MAP, false],
        [EVENT.TOGGLE_STAR_MAP, true]
    ]);
});

ava.serial('departure shift defaults enable runway labels and SIDs while disabling STARs', (t) => {
    const { eventBus } = buildHarness(t);

    UiController.applyShiftDefaults(SHIFT_SECTOR.DEPARTURE);

    t.true(UiController.$toggleLabels.hasClass(SELECTORS.CLASSNAMES.ACTIVE));
    t.true(UiController.$toggleSids.hasClass(SELECTORS.CLASSNAMES.ACTIVE));
    t.false(UiController.$toggleStars.hasClass(SELECTORS.CLASSNAMES.ACTIVE));
    t.deepEqual(eventBus.trigger.args, [
        [EVENT.TOGGLE_LABELS, true],
        [EVENT.TOGGLE_SID_MAP, true],
        [EVENT.TOGGLE_STAR_MAP, false]
    ]);
});

ava.serial('combined shift defaults enable runway labels, SIDs, and STARs', (t) => {
    const { eventBus } = buildHarness(t);

    UiController.applyShiftDefaults(SHIFT_SECTOR.BOTH);

    t.true(UiController.$toggleLabels.hasClass(SELECTORS.CLASSNAMES.ACTIVE));
    t.true(UiController.$toggleSids.hasClass(SELECTORS.CLASSNAMES.ACTIVE));
    t.true(UiController.$toggleStars.hasClass(SELECTORS.CLASSNAMES.ACTIVE));
    t.deepEqual(eventBus.trigger.args, [
        [EVENT.TOGGLE_LABELS, true],
        [EVENT.TOGGLE_SID_MAP, true],
        [EVENT.TOGGLE_STAR_MAP, true]
    ]);
});
