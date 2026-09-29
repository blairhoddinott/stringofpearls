# KCLE source and provenance dossier

## Published scope

This dossier covers the KCLE airport JSON, terrain, maps, procedures, representative traffic patterns, and deterministic schedule. The data is for simulation only and is not suitable for navigation.

## Reusable implementation baseline

The implementation baseline is the unmerged KCLE contribution in [openScope pull request 2013](https://github.com/openscope/openscope/pull/2013) at exact head commit `3dd2d19392a6cfd4aec498f126c472d6243742fb`. The openScope repository publishes the contributed files under the MIT licence. String of Pearls is an independent community fork; this publication is not an official adoption by openScope.

The historical baseline was ingested file-by-file rather than by importing its obsolete load-list patch. Runways were canonicalized, procedure and spawn references were audited, explicit centre-handoff boundaries were added, constructor fields were normalized, and duplicate or degenerate map/terrain geometry was removed.

## Current factual review

FAA NASR and CIFP publications are the controlling sources for current operational use. They were used as the factual review boundary for airport identity and runway context; no restricted chart artwork, bulk proprietary navigation database, API key, token, password, credential, or connection string is committed. The historical procedure encodings remain an attributed simulation baseline and are not represented as a current AIRAC database.

A direct comparison against the FAA CIFP volume `2609`, effective 3 September 2026, confirmed that all 6 runway ends in the asset match the current coded runway inventory. It also found 3 current SID identifiers and 1 current STAR identifiers not represented by exact name in the historical procedure set. Those differences include revised procedure numbers and, in some cases, different procedure families. They are disclosed rather than papered over by renaming old routes: the committed procedures remain playable historical simulations until their current CIFP legs can be converted and reviewed as complete routes.

### Representative traffic calibration

Cleveland Hopkins reports 115 daily nonstop departures; the representative plan mirrors those with 115 arrivals. The simulator rounds that reviewed scale upward to `230` deterministic movements per representative day, balances arrivals and departures to within one movement, then distributes each direction across the contributed route patterns in proportion to their authored weights. These are synthesized gameplay slots, not a claim that every source movement was a scheduled airline flight.

## Publication inventory

- runway pairs: 3
- SIDs: 5
- STARs: 4
- named fixes: 154
- spawn patterns: 11
- centre-handoff fixes: `JANYS`, `OLYEE`, `TALKN`, `THOME`
- timezone: `America/New_York`

## Simulator simplifications

- The modeled airspace is a practical gameplay volume, not a reproduction of every legal controlled-airspace layer.
- The legacy route grammar cannot enforce all chart prose, equipment eligibility, climb gradients, or temporary restrictions.
- Representative airline weights and generated schedule events do not claim an observed historical day.
- Terrain is a normalized copy of the reusable contribution and is not a certified elevation product.

## Sources

1. https://github.com/openscope/openscope/pull/2013 — historical MIT implementation baseline
2. https://github.com/openscope/openscope/blob/develop/LICENSE.md — openScope MIT licence
3. https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip — FAA CIFP volume 2609, effective 3 September 2026
4. https://clevelandairport.com/about-cle/facts-figures — current official daily-departure benchmark
