# Center handoff, holding, and airport compliance

This document records how center handoffs use the simulator's existing holding support and which airport assets currently opt into that lifecycle.

## Operational behavior

Arrival ownership follows this sequence for audited routes:

```text
CENTER → PLAYER → TOWER
```

An outside arrival whose spawn pattern has an explicit, validated `centerHandoffFix` still ahead in its active FMS route starts under center ownership. Center offers the aircraft to the player when the remaining active-route distance to that boundary fix reaches 10 NM. If route progression passes the fix without an offer, entering controlled airspace triggers an immediate fallback offer so center-owned traffic cannot silently cross the boundary. If the player ignores the offer until 8 NM remains, center sends the aircraft to the configured fix and activates a hold there. Center always leaves an offer active for at least 10 seconds of simulation time before assigning that hold, including when an arrival first appears inside the 8 NM decision point. Holding traffic is offered again after 60 seconds of simulation time.

Aircraft owned by center or tower use a compact `C - <callsign>` or `T - <callsign>` data block and have no player flight strip. Accepting an inbound handoff replaces the compact block with the full player data block, gives the player command authority, triggers the aircraft's radio check-in, and creates its flight strip even when the aircraft remains outside controlled airspace. A completed outbound handoff removes the player strip and restores the appropriate compact block. A late inbound acceptance changes controller ownership but does not cancel the flight instruction. The aircraft remains in the hold until the player issues the existing `cancelhold`/`continue` instruction. A successfully assigned fallback hold records the missed-handoff scoring penalty; if the FMS rejects the hold, the offer remains active and no penalty is recorded.

All timing uses simulation time, so pause and timewarp affect offer and reoffer timing consistently.

For outbound traffic, a player-owned airborne departure can be handed to center with `<callsign> cc`. The `C` identifier flashes while pending, center accepts after three simulation seconds, and the departure remains commandable until acceptance. Arrivals established on final use `<callsign> ct` for the equivalent tower transfer.

## Existing holding support

Center handoffs reuse the inherited FMS and pilot holding implementation; they do not introduce a second flight-dynamics path.

The simulator already supports:

- manual holding and hold cancellation through the [`hold` and `cancelhold` aircraft commands](../aircraft-commands.md#hold);
- route-string holds such as `@COWBY`;
- procedure-defined holds using the [`@` fix instruction](../airport-format.md#fix-instruction-symbols);
- right or left turns, time- or distance-based legs, and explicit hold radials.

When center assigns the fallback hold, it activates the route waypoint named by `centerHandoffFix`. Existing waypoint hold parameters are retained. If the waypoint has no predefined hold, the normal defaults apply: right turns and one-minute legs, with the inbound course derived from the aircraft's approach to the fix.

## Airport data requirements

A route opts into center ownership only when its arrival spawn pattern defines:

```json
"centerHandoffFix": "FIX"
```

The fix must:

- be a named, non-vector waypoint in the resolved arrival route;
- be immediately outside the controlled-airspace boundary;
- have a following route segment that enters controlled airspace;
- remain ahead of the aircraft in its active FMS route.

Runtime code never guesses or substitutes a fix. Arrival patterns without reviewed data retain legacy player ownership, so incomplete migration does not make an airport unusable or strand an aircraft under center ownership.

Use the audit tool to inspect the asset corpus:

```text
node tools/audit-center-handoff-fixes.js
node tools/audit-center-handoff-fixes.js --write-obvious
```

`--write-obvious` writes only unambiguous candidates. Every entry reported under `reviewRequired` needs human review before its airport pattern is updated.

## Current compliance status

This snapshot reflects the airport assets on `feat/controller-handoffs`:

- 104 airport assets;
- 524 arrival spawn patterns;
- 337 arrival patterns with an explicit handoff fix;
- 187 arrival patterns still requiring review;
- 44 fully compliant airports;
- 55 airports needing at least one arrival-pattern correction;
- 5 airports with no arrival spawn patterns, for which this check is not applicable.

### Fully compliant airports

Every arrival spawn pattern at these airports has an explicit handoff fix:

- `CYOW`, `EDDH`, `EDDL`, `EDDM`, `EDDT`
- `EGCC`, `EGGW`, `EGKK`, `EGNM`, `ENGM`
- `KABQ`, `KATL`, `KBNA`, `KBOS`, `KCLT`, `KCVG`, `KDCA`, `KELP`, `KEWR`
- `KIAD`, `KJAX`, `KLAS`, `KMCI`, `KMCO`, `KMEM`, `KMIA`, `KPDX`, `KPHL`
- `KRDU`, `KRIC`, `KSEA`, `KSFO`, `KSLC`, `KSTL`
- `LIPZ`, `LOWW`, `LROP`, `LSZH`
- `OMDB`, `OTHH`, `RJAA`, `RJTT`, `SBGR`, `UUDD`

### Airports needing review

The ratio after each airport is `patterns with an explicit fix / total arrival patterns`:

- `CYHZ` (2/4), `EBBR` (2/3), `EDDF` (3/4), `EGLC` (1/2), `EGLL` (0/4)
- `EHAM` (0/11), `EICK` (4/5), `EIDW` (7/9), `EINN` (7/8), `EKCH` (0/3), `ESPA` (3/6)
- `GCRR` (0/4)
- `KAUS` (5/7), `KDAB` (6/7), `KDFW` (0/4), `KDTW` (0/5), `KGSO` (4/5), `KJFK` (1/3)
- `KLAX` (5/8), `KOKC` (5/6), `KOMA` (4/5), `KORD` (5/6), `KPHX` (0/4), `KPIT` (2/4)
- `KPVD` (0/2), `KSAT` (3/4), `KSDF` (0/5), `KTPA` (0/5), `KTUS` (0/6)
- `LKPR` (3/4), `LTBA` (7/8)
- `MDSD` (0/8)
- `OMAA` (5/6)
- `PANC` (0/7), `PHNL` (3/4)
- `RJBB` (0/5), `RJOA` (1/2), `RJSS` (2/3), `RKSI` (0/16)
- `SAEZ` (6/8), `SAME` (5/6), `SAWH` (1/4), `SBGL` (3/5), `SUMU` (3/6)
- `TJSJ` (0/4), `TNCM` (6/7)
- `VABB` (0/5), `VECC` (4/10), `VHHH` (2/3), `VIDP` (3/9)
- `WIMM` (2/4), `WMKK` (0/10), `WMKP` (0/5), `WSSS` (0/8)
- `ZSPD` (0/6)

### Not applicable

These airports currently define no arrival spawn patterns:

- `KMSP`, `KSAN`, `OSDI`, `VOBL`, `WIII`

## Updating this list

After airport data changes:

1. run the audit tool;
2. run `npm run validate:assets`;
3. count explicit `centerHandoffFix` values by airport;
4. update the totals and lists above in the same commit as the airport corrections.

Do not mark an airport fully compliant merely because some routes work. Every one of its arrival spawn patterns must have reviewed handoff data.
