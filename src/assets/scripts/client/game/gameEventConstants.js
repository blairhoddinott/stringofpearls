export const GAME_EVENTS_POINT_VALUES = {
    AIRSPACE_BUST: -200,
    ARRIVAL: 10,
    COLLISION: -1000,
    DEPARTURE: 10,
    EXTREME_CROSSWIND_OPERATION: -15,
    EXTREME_TAILWIND_OPERATION: -75,
    GO_AROUND: -50,
    HIGH_CROSSWIND_OPERATION: -5,
    HIGH_TAILWIND_OPERATION: -25,
    ILLEGAL_APPROACH_CLEARANCE: -10,
    LOCALIZER_INTERCEPT_ABOVE_GLIDESLOPE: -10,
    MISSED_HANDOFF: -25,
    NOT_CLEARED_ON_ROUTE: -25,
    SEPARATION_LOSS: -200,
    NO_TAKEOFF_SEPARATION: -200
};

export const GAME_EVENTS = {
    AIRSPACE_BUST: 'AIRSPACE_BUST',
    ARRIVAL: 'ARRIVAL',
    COLLISION: 'COLLISION',
    DEPARTURE: 'DEPARTURE',
    EXTREME_CROSSWIND_OPERATION: 'EXTREME_CROSSWIND_OPERATION',
    EXTREME_TAILWIND_OPERATION: 'EXTREME_TAILWIND_OPERATION',
    GO_AROUND: 'GO_AROUND',
    HIGH_CROSSWIND_OPERATION: 'HIGH_CROSSWIND_OPERATION',
    HIGH_TAILWIND_OPERATION: 'HIGH_TAILWIND_OPERATION',
    ILLEGAL_APPROACH_CLEARANCE: 'ILLEGAL_APPROACH_CLEARANCE',
    LOCALIZER_INTERCEPT_ABOVE_GLIDESLOPE: 'LOCALIZER_INTERCEPT_ABOVE_GLIDESLOPE',
    MISSED_HANDOFF: 'MISSED_HANDOFF',
    NOT_CLEARED_ON_ROUTE: 'NOT_CLEARED_ON_ROUTE',
    SEPARATION_LOSS: 'SEPARATION_LOSS',
    NO_TAKEOFF_SEPARATION: 'NO_TAKEOFF_SEPARATION'
};

export const GAME_EVENTS_DESCRIPTION = {
    AIRSPACE_BUST: 'Aircraft left radar coverage as arrival',
    ARRIVAL: 'Aircraft landed successfully',
    COLLISION: 'Multiple aircraft collided',
    DEPARTURE: 'Departing aircraft switched to center',
    EXTREME_CROSSWIND_OPERATION: 'Aircraft operated with extreme crosswind',
    EXTREME_TAILWIND_OPERATION: 'Aircraft operated with extreme tailwind',
    GO_AROUND: 'Aircraft had to go around',
    HIGH_CROSSWIND_OPERATION: 'Aircraft operated with high crosswind',
    HIGH_TAILWIND_OPERATION: 'Aircraft operated with high tailwind',
    ILLEGAL_APPROACH_CLEARANCE: 'Aircraft intercept angle was > 30 degrees',
    LOCALIZER_INTERCEPT_ABOVE_GLIDESLOPE: 'Aircraft intercepted localizer above glidescope',
    MISSED_HANDOFF: 'Center handoff was not accepted before the decision point',
    NOT_CLEARED_ON_ROUTE: 'Aircraft left airspace without being on route',
    SEPARATION_LOSS: 'Aircraft violated separation requirements',
    NO_TAKEOFF_SEPARATION: 'Aircraft violated same runway separation requirements'
};
