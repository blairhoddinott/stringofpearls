# KDEN source and provenance dossier

## Published scope

This dossier covers the KDEN airport JSON, terrain, maps, procedures, representative traffic patterns, and deterministic schedule. The data is for simulation only and is not suitable for navigation.

## Reusable implementation baseline

The implementation baseline is the unmerged KDEN contribution in [openScope pull request 1942](https://github.com/openscope/openscope/pull/1942) at exact head commit `11d4e59567b9683846314605c9a307fcacdd8f2f`. The openScope repository publishes the contributed files under the MIT licence. String of Pearls is an independent community fork; this publication is not an official adoption by openScope.

The historical baseline was ingested file-by-file rather than by importing its obsolete load-list patch. Runways were canonicalized, procedure and spawn references were audited, explicit centre-handoff boundaries were added, constructor fields were normalized, and duplicate or degenerate map/terrain geometry was removed.

## Current factual review

FAA NASR and CIFP publications are the controlling sources for current operational use. They were used as the factual review boundary for airport identity and runway context; no restricted chart artwork, bulk proprietary navigation database, API key, token, password, credential, or connection string is committed. The historical procedure encodings remain an attributed simulation baseline and are not represented as a current AIRAC database.

A direct comparison against the FAA CIFP volume `2609`, effective 3 September 2026, confirmed that all 12 runway ends in the asset match the current coded runway inventory. It also found 7 current SID identifiers and 11 current STAR identifiers not represented by exact name in the historical procedure set. Those differences include revised procedure numbers and, in some cases, different procedure families. They are disclosed rather than papered over by renaming old routes: the committed procedures remain playable historical simulations until their current CIFP legs can be converted and reviewed as complete routes.

### Representative traffic calibration

Denver International reports 694,900 aircraft operations in 2024. The simulator rounds that reviewed scale upward to `1904` deterministic movements per representative day, balances arrivals and departures to within one movement, then distributes each direction across the contributed route patterns in proportion to their authored weights. These are synthesized gameplay slots, not a claim that every source movement was a scheduled airline flight.

## Publication inventory

- runway pairs: 6
- SIDs: 21
- STARs: 15
- named fixes: 470
- spawn patterns: 24
- centre-handoff fixes: `BRWRY`, `BUMMP`, `GNDLA`, `HALEN`, `KAMPR`, `OATHE`, `PORDR`, `TOFUU`
- timezone: `America/Denver`

## Simulator simplifications

- The modeled airspace is a practical gameplay volume, not a reproduction of every legal controlled-airspace layer.
- The legacy route grammar cannot enforce all chart prose, equipment eligibility, climb gradients, or temporary restrictions.
- Representative airline weights and generated schedule events do not claim an observed historical day.
- Terrain is a normalized copy of the reusable contribution and is not a certified elevation product.

## Sources

1. https://github.com/openscope/openscope/pull/1942 — historical MIT implementation baseline
2. https://github.com/openscope/openscope/blob/develop/LICENSE.md — openScope MIT licence
3. https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip — FAA CIFP volume 2609, effective 3 September 2026
4. https://cdn.flydenver.com/app/uploads/2025/08/03103959/December-2025-AirlineDashboard-FlyDenver.pdf — official 2025/2024 operations comparison
