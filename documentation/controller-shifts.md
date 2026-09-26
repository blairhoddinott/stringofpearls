# Controller shifts

String of Pearls sessions are organized as controller shifts. The start screen lets you choose the airport, controller position, and scheduled duration before traffic begins.

## Configure a shift

Choose one of the following positions:

- **Approach** generates arrivals and shows arrival flight strips.
- **Departure** generates departures and shows departure flight strips.
- **Both** generates both traffic flows and shows both flight-strip sections.

Select any enabled airport and a **30-minute** or **60-minute** shift. The configured airport loads before the shift clock and traffic generation begin. The airport cannot be changed while a shift is active.

## Shift timing

The countdown uses simulation time rather than wall-clock time:

- pausing the simulation pauses the shift clock;
- increasing timewarp advances the shift clock at the same accelerated rate;
- new aircraft generation stops five simulation minutes before the scheduled end;
- at `00:00`, the shift enters **CLEARING** and no new aircraft are generated.

Clearing is overtime for finishing aircraft already under your control. The shift ends automatically once no player-owned radar targets or active player-owned flight strips remain.

## Ending a shift manually

The **End shift** button ends the shift immediately without a confirmation prompt. Any remaining player-owned aircraft are counted in the results, active traffic and scope artifacts are cleared, and the simulation pauses.

## Results

The results screen contains:

- final score;
- selected airport and controller position;
- scheduled duration and actual simulation time worked;
- unique aircraft handled;
- completed arrivals and handed-off departures;
- collision-alert, separation-loss, collision, and missed-handoff counts;
- aircraft remaining when the shift ended;
- score per aircraft; and
- a chronological log of scoring events and point changes.

Select **Start another shift** to reset the score and session state and return to the shift configuration screen.

The application currently has an internal leaderboard integration boundary, but it does not publish results to an external leaderboard.

## Pilot speech after handoff

Once a center or tower handoff is accepted, that aircraft is no longer controlled by the player and produces no further player-facing transmissions. Active and queued transmissions from that aircraft are canceled or discarded without interrupting transmissions from other aircraft. Normal terminal announcements remain audible when no accepted handoff transferred the aircraft away.
