import ava from 'ava';
import $ from 'jquery';
import TrafficRateController from '../../src/assets/scripts/client/ui/TrafficRateController';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';

ava('setup handlers binds a stable weather change handler', (t) => {
    const controller = Object.create(TrafficRateController.prototype);

    controller._setupHandlers();

    t.is(typeof controller._onWeatherChangeHandler, 'function');
});

ava('enable subscribes the weather change handler', (t) => {
    const calls = [];
    const controller = Object.create(TrafficRateController.prototype);
    controller._eventBus = { on: (...args) => calls.push(args) };
    controller._onAirportChangeHandler = () => {};
    controller._onWeatherChangeHandler = () => {};

    controller.enable();

    t.deepEqual(calls[1], [EVENT.WEATHER_CHANGE, controller._onWeatherChangeHandler]);
});

ava('disable unsubscribes the weather change handler', (t) => {
    const calls = [];
    const controller = Object.create(TrafficRateController.prototype);
    controller._eventBus = { off: (...args) => calls.push(args) };
    controller._onAirportChangeHandler = () => {};
    controller._onWeatherChangeHandler = () => {};

    controller.disable();

    t.deepEqual(calls[1], [EVENT.WEATHER_CHANGE, controller._onWeatherChangeHandler]);
});

ava('wind sliders default enabled before the first weather response', (t) => {
    const controller = Object.create(TrafficRateController.prototype);
    controller._onChangeWindDirectionHandler = () => {};
    controller._onChangeWindSpeedHandler = () => {};

    const $direction = controller._buildWindDirectionSlider(100);
    const $speed = controller._buildWindSpeedSlider(9);

    t.false($direction.find('input').prop('disabled'));
    t.false($speed.find('input').prop('disabled'));
});

ava('wind sliders render disabled while live weather owns wind', (t) => {
    const controller = Object.create(TrafficRateController.prototype);
    controller._manualWindEnabled = false;
    controller._onChangeWindDirectionHandler = () => {};
    controller._onChangeWindSpeedHandler = () => {};

    const $direction = controller._buildWindDirectionSlider(270);
    const $speed = controller._buildWindSpeedSlider(18);

    t.true($direction.find('input').prop('disabled'));
    t.true($speed.find('input').prop('disabled'));
});

ava('wind sliders render enabled during static fallback', (t) => {
    const controller = Object.create(TrafficRateController.prototype);
    controller._manualWindEnabled = true;
    controller._onChangeWindDirectionHandler = () => {};
    controller._onChangeWindSpeedHandler = () => {};

    const $direction = controller._buildWindDirectionSlider(100);
    const $speed = controller._buildWindSpeedSlider(9);

    t.false($direction.find('input').prop('disabled'));
    t.false($speed.find('input').prop('disabled'));
});

ava('weather changes disable existing wind sliders when live weather becomes active', (t) => {
    const controller = Object.create(TrafficRateController.prototype);
    controller._manualWindEnabled = true;
    controller.$dialog = $(`
        <div>
            <input name="wind direction" />
            <input name="wind speed" />
            <input name="arrival" />
        </div>
    `);

    controller.onWeatherChange({ usesLiveWeather: true });

    t.true(controller.$dialog.find('input[name="wind direction"]').prop('disabled'));
    t.true(controller.$dialog.find('input[name="wind speed"]').prop('disabled'));
    t.false(controller.$dialog.find('input[name="arrival"]').prop('disabled'));
});

ava('weather changes enable existing wind sliders during static fallback', (t) => {
    const controller = Object.create(TrafficRateController.prototype);
    controller._manualWindEnabled = false;
    controller.$dialog = $(`
        <div>
            <input name="wind direction" disabled />
            <input name="wind speed" disabled />
        </div>
    `);

    controller.onWeatherChange({ usesLiveWeather: false });

    t.false(controller.$dialog.find('input[name="wind direction"]').prop('disabled'));
    t.false(controller.$dialog.find('input[name="wind speed"]').prop('disabled'));
});
