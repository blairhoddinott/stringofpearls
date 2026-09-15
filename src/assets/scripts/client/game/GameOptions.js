import _isNil from 'lodash/isNil';
import EventBus from '../lib/EventBus';
import EventTracker from '../EventTracker';
import { GAME_OPTION_VALUES } from '../constants/gameOptionConstants';
import { TRACKABLE_EVENT } from '../constants/trackableEvents';

/**
 * Set, store and retrieve game options.
 *
 * @class GameOptions
 */
export default class GameOptions {
    /**
     * @for GameOptions
     * @constructor
     */
    constructor() {
        /**
         * @property _eventBus
         * @type EventBus
         * @private
         */
        this._eventBus = EventBus;

        /**
         * @property _options
         * @type {Object}
         * @default {}
         * @private
         */
        this._options = {};

        /**
         * Persistence boundary used to read and write option values.
         *
         * Remains `null` until a composition root configures it through
         * `initStorage()`, so import-time construction never touches a
         * browser global and every option initializes from its default.
         *
         * @property _storageAdapter
         * @type {StorageAdapter}
         * @default null
         * @private
         */
        this._storageAdapter = null;

        /**
         * Model properties will be added for each game option
         * dynamically via `.addGameOptions()`
         *
         * @property {*}
         * @type {string}
         *
         * this[OPTION_NAME] = OPTION_VALUE;
         */

        this.addGameOptions();
    }

    /**
     * Configure the persistence boundary used for option values.
     *
     * Called by `GameController` during composition-root configuration, before
     * any downstream UI/canvas consumer reads an option. Storing the adapter and
     * rehydrating every known option from it is the only way this instance
     * reaches storage; before this runs it stays browser-global-free.
     *
     * @for GameOptions
     * @method initStorage
     * @param storageAdapter {StorageAdapter}  boundary exposing `get(key)`/`set(key, value)`
     */
    initStorage(storageAdapter) {
        this._storageAdapter = storageAdapter == null ? null : storageAdapter;

        this.addGameOptions();
    }

    /**
     * Add available game options to `_options` dictionary
     *
     * @for GameOptions
     * @method addGameOptions
     */
    addGameOptions() {
        for (let i = 0; i < GAME_OPTION_VALUES.length; i++) {
            const option = GAME_OPTION_VALUES[i];

            this.addOption(option);
        }
    }

    /**
     * @for GameOptions
     * @method addOption
     * @param optionProps {object}
     */
    addOption(optionProps) {
        this._options[optionProps.name] = optionProps;
        let optionValue = optionProps.defaultValue;

        // Only reach for storage once a composition root has configured the
        // adapter. A present raw value (including falsy strings like `''` and
        // `'0'`) is preserved verbatim; `null`/`undefined` mean missing.
        if (this._storageAdapter !== null) {
            const optionStorageKey = this.buildStorageName(optionProps.name);
            const storedOptionValue = this._storageAdapter.get(optionStorageKey);

            if (!_isNil(storedOptionValue)) {
                optionValue = storedOptionValue;
            }
        }

        this[optionProps.name] = optionValue;
    }

    /**
     * @for GameOptions
     * @method getDescriptions
     * @return {object}
     */
    getDescriptions() {
        return this._options;
    }

    /**
     * Gets the value of a given game option
     *
     * @for GameOptions
     * @method getOptionByName
     * @param name {string}
     * @return {object}
     */
    getOptionByName(name) {
        return this[name];
    }

    /**
     * Sets a game option to a given value
     *
     * will fire an event with the `EventBus` is one is registered
     *
     * @for GameOptions
     * @method setOptionByName
     * @param name {string} name of the option to change
     * @param value {string} value to set the option to
     */
    setOptionByName(name, value) {
        this[name] = value;
        const optionStorageKey = this.buildStorageName(name);

        // Persist only when a composition root has configured the adapter; the
        // instance stays usable (and browser-global-free) before that runs.
        if (this._storageAdapter !== null) {
            this._storageAdapter.set(optionStorageKey, value);
        }

        EventTracker.recordEvent(TRACKABLE_EVENT.SETTINGS, name, value);

        if (this._options[name].onChangeEventHandler) {
            this._eventBus.trigger(this._options[name].onChangeEventHandler, value);
        }

        return value;
    }

    /**
     * Build a string that can be used as a key for persisted option data
     *
     * @for GameOptions
     * @method buildStorageName
     * @param optionName {string}
     * @return {string}
     */
    buildStorageName(optionName) {
        return `zlsa.atc.option.${optionName}`;
    }
}
