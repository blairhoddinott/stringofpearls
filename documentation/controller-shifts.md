# Controller shifts

String of Pearls sessions are organized as controller shifts. The start screen lets you choose the airport, controller position, and scheduled duration before traffic begins.

## Configure a shift

Choose one of the following positions:

- **Approach** generates arrivals and shows arrival flight strips.
- **Departure** generates departures and shows departure flight strips.
- **Both** generates both traffic flows and shows both flight-strip sections.

Select any enabled airport, a **30-minute** or **60-minute** shift, and a traffic volume of **25%**, **50%**, **75%**, or **100%**. The configuration screen defaults to **Approach** and resets traffic volume to **100%** each time it opens. Runway/fix labels are enabled for every shift; STARs are enabled for Approach, SIDs for Departure, and both procedure displays for Both. Pilot speech defaults on for players who have not saved a preference, while an explicit off preference remains respected. The configured airport loads before the shift clock and traffic generation begin. The airport cannot be changed while a shift is pending or active.

## Scheduled traffic

Airports use one reviewed representative schedule as the sole traffic plan for the shift. All 65 currently selectable airports are covered. The 35 U.S. profiles combine exact BTS On-Time records with aggregate-derived T-100 additions where qualified evidence supports them; the other 30 profiles are deterministic compilations of their airport-authored traffic patterns. Each profile starts at the airport's current IANA-local time and repeats every 24 simulation hours. Pausing pauses scheduled traffic, and timewarp advances it with the rest of simulation time.

The volume control selects deterministic, nested subsets of the schedule: every flight present at 25% is also present at 50%, every 50% flight is present at 75%, and every 75% flight is present at 100%. Repeating the same volume does not roll a new random subset.

Scheduled identity and timing are kept when the airline and optional aircraft type can be resolved. Airport-authored spawn patterns remain authoritative for local routes, positions, altitudes, and movement behavior. If a scheduled identity cannot be mapped completely, the simulator generates a compatible replacement in the exact scheduled slot instead of constructing a hybrid scheduled/generated identity. If no compatible local pattern exists, plan construction fails rather than silently dropping the movement.

Airports without a reviewed schedule continue to use their existing generated traffic. Scheduled and legacy random timers are never run in parallel for the same shift.

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

The representative profile is currently fixed. Choosing a historical date, weekday/weekend profile, season, holiday profile, or custom local start time is deferred. Those controls will require additional reviewed assets; the simulator models plausible traffic rather than pretending one mixed-source profile is a literal day of aviation.

The application currently has an internal leaderboard integration boundary, but it does not publish results to an external leaderboard.

## Pilot speech after handoff

Center-owned arrivals offer the handoff when they reach the player-controlled airspace rather than when they approach an authored route fix farther outside the boundary.

Once a center or tower handoff is accepted, that aircraft is no longer controlled by the player and produces no further player-facing transmissions. Active and queued transmissions from that aircraft are canceled or discarded without interrupting transmissions from other aircraft. Normal terminal announcements remain audible when no accepted handoff transferred the aircraft away.
