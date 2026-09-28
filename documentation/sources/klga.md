# KLGA source and provenance dossier

## Published scope

This dossier covers the KLGA airport JSON, terrain, maps, procedures, representative traffic patterns, and deterministic schedule. The data is for simulation only and is not suitable for navigation.

## Reusable implementation baseline

The implementation baseline is the unmerged KLGA contribution in [openScope pull request 1867](https://github.com/openscope/openscope/pull/1867) at exact head commit `667dc94d13145c168e2220cbc2111dcd47153489`. The openScope repository publishes the contributed files under the MIT licence. String of Pearls is an independent community fork; this publication is not an official adoption by openScope.

The historical baseline was ingested file-by-file rather than by importing its obsolete load-list patch. Runways were canonicalized, procedure and spawn references were audited, explicit centre-handoff boundaries were added, constructor fields were normalized, and duplicate or degenerate map/terrain geometry was removed.

## Current factual review

FAA NASR and CIFP publications are the controlling sources for current operational use. They were used as the factual review boundary for airport identity and runway context; no restricted chart artwork, bulk proprietary navigation database, API key, token, password, credential, or connection string is committed. The historical procedure encodings remain an attributed simulation baseline and are not represented as a current AIRAC database.

A direct comparison against the FAA CIFP volume `2609`, effective 3 September 2026, confirmed that all 4 runway ends in the asset match the current coded runway inventory. It also found 3 current SID identifiers and 4 current STAR identifiers not represented by exact name in the historical procedure set. Those differences include revised procedure numbers and, in some cases, different procedure families. They are disclosed rather than papered over by renaming old routes: the committed procedures remain playable historical simulations until their current CIFP legs can be converted and reviewed as complete routes.

## Publication inventory

- runway pairs: 2
- SIDs: 6
- STARs: 5
- named fixes: 204
- spawn patterns: 15
- centre-handoff fixes: `GERBS`, `PATSS`, `RDU`
- timezone: `America/New_York`

## Simulator simplifications

- The modeled airspace is a practical gameplay volume, not a reproduction of every legal controlled-airspace layer.
- The legacy route grammar cannot enforce all chart prose, equipment eligibility, climb gradients, or temporary restrictions.
- Representative airline weights and generated schedule events do not claim an observed historical day.
- Terrain is a normalized copy of the reusable contribution and is not a certified elevation product.

## Sources

1. https://github.com/openscope/openscope/pull/1867 — historical MIT implementation baseline
2. https://github.com/openscope/openscope/blob/develop/LICENSE.md — openScope MIT licence
3. https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip — FAA CIFP volume 2609, effective 3 September 2026
