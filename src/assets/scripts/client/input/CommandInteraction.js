import _has from 'lodash/has';
import { COMMAND_CONTEXT, PARSED_COMMAND_NAME } from '../constants/inputConstants';
import { INVALID_NUMBER } from '../constants/globalConstants';
import { TRACKABLE_EVENT } from '../constants/trackableEvents';

export default class CommandInteraction {
    constructor(dependencies) {
        for (const [name, dependency] of Object.entries(dependencies)) {
            this[`_${name}`] = dependency;
        }
    }

    process(commandBarContext, { processAircraft, processScope, deselect }) {
        let response = [];

        if (commandBarContext === COMMAND_CONTEXT.AIRCRAFT) {
            response = processAircraft();
        } else if (commandBarContext === COMMAND_CONTEXT.SCOPE) {
            response = processScope();
        }

        deselect();

        return response;
    }

    processAircraft({ processSystem, processTransmit }) {
        const userCommand = this._commandInput.val().trim().toLowerCase();
        let parsedCommand;

        try {
            const parser = new this._CommandParserClass(userCommand);
            parsedCommand = parser.parse();
        } catch (error) {
            this._uiController.ui_log('Command not understood', true);
            throw error;
        }

        if (parsedCommand.command !== PARSED_COMMAND_NAME.TRANSMIT) {
            return processSystem(parsedCommand);
        }

        this._inputState.history.unshift(this._inputState.callsign);
        this._inputState.history_item = null;

        return processTransmit(parsedCommand);
    }

    processScope() {
        const userCommand = this._commandInput.val().trim().toLowerCase();
        let scopeCommandModel;

        try {
            scopeCommandModel = new this._ScopeCommandModelClass(userCommand);
        } catch (error) {
            this._uiController.ui_log('ERROR: BAD SYNTAX', true);
            throw error;
        }

        const [successful, response] = this._scopeModel.runScopeCommand(scopeCommandModel);
        const isWarning = !successful;

        this._uiController.ui_log(response, isWarning);
    }

    processSystem(parsedCommand) {
        switch (parsedCommand.command) {
            case PARSED_COMMAND_NAME.TUTORIAL:
                this._uiController.onToggleTutorial();

                return true;
            case PARSED_COMMAND_NAME.AUTO:
                return true;
            case PARSED_COMMAND_NAME.PAUSE:
                this._gameController.game_pause_toggle();

                return true;
            case PARSED_COMMAND_NAME.TIMEWARP: {
                let nextTimewarpValue = 0;

                if (parsedCommand.args) {
                    [nextTimewarpValue] = parsedCommand.args;
                }

                this._gameController.updateTimescale(nextTimewarpValue);
                this._eventTracker.recordEvent(
                    TRACKABLE_EVENT.OPTIONS,
                    'timewarp-maunal-entry',
                    `${nextTimewarpValue}`
                );

                return true;
            }
            case PARSED_COMMAND_NAME.CLEAR:
                if (this._clearStorageAndReload != null) {
                    this._clearStorageAndReload.execute();
                }

                break;
            case PARSED_COMMAND_NAME.AIRPORT: {
                const airportIcao = parsedCommand.args[0];

                if (_has(this._airportController.airports, airportIcao)) {
                    this._airportController.airport_set(airportIcao);
                }

                return true;
            }
            case PARSED_COMMAND_NAME.AIRAC: {
                const airportIcao = this._airportController.current.icao.toUpperCase();
                const airacCycle = this._airportController.getAiracCycle();

                if (!airacCycle) {
                    this._uiController.ui_log(`${airportIcao} AIRAC cycle: unknown`);

                    return true;
                }

                this._uiController.ui_log(`${airportIcao} AIRAC cycle: ${airacCycle}`);

                return true;
            }
            case PARSED_COMMAND_NAME.RATE:
                this._uiController.ui_log('this command has been deprecated', true);

                return true;
            default:
                return true;
        }
    }

    processTransmit(parsedCommand) {
        let matches = 0;
        let match = INVALID_NUMBER;

        for (let i = 0; i < this._aircraftController.aircraft.list.length; i++) {
            const aircraft = this._aircraftController.aircraft.list[i];

            if (aircraft.matchCallsign(parsedCommand.callsign)) {
                matches += 1;
                match = i;
            }
        }

        if (matches > 1) {
            this._uiController.ui_log('multiple aircraft match the callsign, say again', true);

            return true;
        }

        if (match === INVALID_NUMBER) {
            this._uiController.ui_log('no such aircraft, say again', true);

            return true;
        }

        const aircraft = this._aircraftController.aircraft.list[match];

        return this._aircraftController.aircraftCommander.runCommands(aircraft, parsedCommand.args);
    }
}
