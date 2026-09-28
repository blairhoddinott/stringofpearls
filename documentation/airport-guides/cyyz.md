# CYYZ - Toronto Pearson International Airport

## Overview

Toronto Pearson is Canada's largest airport by passenger volume and the main international gateway for the Greater Toronto Area. The String of Pearls asset models Pearson plus a practical Toronto Terminal control volume; it does not attempt to reproduce the entire Toronto FIR.

The airport has five physical runway pairs:

- `05/23`
- `06L/24R`
- `06R/24L`
- `15L/33R`
- `15R/33L`

All ten runway ends have ILS capability in the simulator.

## Default operation

The default is a representative west-flow configuration:

- arrivals: runway `24L`
- departures: runway `24R`
- controller position: Toronto Terminal
- initial altitude: 5,000 feet
- transition to centre: Toronto Centre

Pearson uses several runway configurations in real operations. Change the active runways when the wind or traffic exercise calls for it rather than treating the default as holy scripture delivered on a stone tablet.

## Controller positions

The modeled radar positions are:

- **Toronto Arrival** — sequence and descend inbound traffic.
- **Toronto Departure** — climb and separate outbound traffic.
- **Toronto Terminal** — combined arrival/departure position used as the simulator default.

Aircraft leaving the modeled terminal volume should be handed to Toronto Centre near the airspace boundary. The asset's routes and controller defaults support that handoff; the polygon intentionally represents useful gameplay space rather than every legal layer of the Toronto TCA.

## Standard instrument departures

The asset includes 28 SID identifiers:

- ANCOL5, ARROW4, AVSEP7, BETES3, BOMET8, DEDKI5, DUSOM3
- EBKIN4, GOPUP4, IKLEN3, KEPTA3, KISEP4, LAKES4, MATES6
- MAVAN3, MIXUT7, NOSIK4, NUGOP6, OAKVL3, PEMBA6, PERLO5
- RIGUS5, SEDOG6, TEVAD3, TRNTO4, TULEK4, URSAL4, VERDO7

Most are RNAV procedures with runway-specific feeders and named exit transitions. `ARROW4` and `TRNTO4` are vector departures. The simulator retains their published initial heading or outbound radial, but radial/DME termination points are not fabricated because the legacy route grammar has no native DME-leg primitive. Controllers should issue the subsequent vectors onto the filed route. Those two vector procedures are intentionally excluded from the authored random-departure patterns, leaving 26 generated departure routes for the 28 published SID identifiers.

Watch the altitude and speed tokens displayed on the route. The asset encodes procedural restrictions that the simulator can represent, but published climb gradients, aircraft eligibility, lost-communications text, and quiet-hour rules remain controller responsibilities rather than runtime enforcement.

## Standard terminal arrivals

The asset includes ten STAR identifiers:

- BOXUM7
- DUVOS4
- IMEBA9
- LINNG3
- NAKBO6
- NUBER6
- RAGID6
- UDNOX5
- VERKO1
- VIBLI6

Each STAR provides all ten published runway branches. Arrival routes include the current altitude and speed restrictions supported by the route-token grammar. In west flow, use the `24L` branches unless you have intentionally selected another runway configuration.

## Traffic and schedule

Random traffic patterns are weighted across the current named procedures and sum to approximately:

- 22.4 arrivals per hour
- 22.4 departures per hour

The bundled deterministic schedule contains 1,076 synthesized daily events in `America/Toronto`. It is based on the scale of 2025 airport movements, not a copied airline timetable. Callsigns, times, and aircraft are representative simulation data.

## Terrain and videomaps

The terrain layer contains Lake Ontario and 1,000-foot terrain bands. The default maps show:

- airport layout;
- runway centerlines and local fixes;
- terminal airspace boundaries;
- nearby controlled-airspace context;
- terrain and water.

The terrain resolution is deliberately coarse because the legacy simulator consumes elevation bands, not a modern mesh. It is enough to make terrain awareness useful without pretending the browser has become a certified terrain display overnight.

## Data limitations

- This asset is for simulation only and must not be used for navigation.
- The procedure package contains charts with several revision dates; the publication snapshot is the 3 September 2026 cycle.
- Screenshot source material is private evidence and is not redistributed.
- The modeled terminal polygon is operationally useful but legally simplified.
- For source provenance, licensing, coordinate checks, and exact simulator simplifications, see [the CYYZ source dossier](../sources/cyyz.md).
