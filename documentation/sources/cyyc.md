# CYYC source and provenance dossier

## Published scope

This dossier covers the CYYC airport JSON, terrain, maps, procedures, representative traffic patterns, and deterministic schedule. The data is for simulation only and is not suitable for navigation.

## Reusable implementation baseline

The implementation baseline is the unmerged CYYC contribution in [openScope pull request 2056](https://github.com/openscope/openscope/pull/2056) at exact head commit `47c1a0753f6d7fcbc3e1894397d953a5a5adbac6`. The openScope repository publishes the contributed files under the MIT licence. String of Pearls is an independent community fork; this publication is not an official adoption by openScope.

The historical baseline was ingested file-by-file rather than by importing its obsolete load-list patch. Runways were canonicalized, procedure and spawn references were audited, explicit centre-handoff boundaries were added, constructor fields were normalized, and duplicate or degenerate map/terrain geometry was removed.

## Current factual review

NAV CANADA aeronautical publications are the controlling sources for current operational use. They were used as the factual review boundary for airport identity and runway context; no restricted chart artwork, bulk proprietary navigation database, API key, token, password, credential, or connection string is committed. The historical procedure encodings remain an attributed simulation baseline and are not represented as a current AIRAC database.

The current-source review included NAV CANADA's 2026 CYYC publications. The first two historical airspace paths contained repeated vertices and non-adjacent intersections; publication replaces each malformed path with the convex hull of its own contributed vertices. This creates deterministic containment geometry without inventing coordinates, but it is explicitly a simulator control volume rather than a legal TCA boundary.

### Representative traffic calibration

Transport Canada reports 197,000 aircraft movements at Calgary International in 2024. The simulator rounds that reviewed scale upward to `540` deterministic movements per representative day, balances arrivals and departures to within one movement, then distributes each direction across the contributed route patterns in proportion to their authored weights. These are synthesized gameplay slots, not a claim that every source movement was a scheduled airline flight.

## Publication inventory

- runway pairs: 4
- SIDs: 4
- STARs: 4
- named fixes: 124
- spawn patterns: 14
- centre-handoff fixes: `ANTAK`, `MATIR`, `UDPAV`, `VESDO`
- timezone: `America/Edmonton`

## Simulator simplifications

- The modeled airspace is a practical gameplay volume, not a reproduction of every legal controlled-airspace layer.
- The legacy route grammar cannot enforce all chart prose, equipment eligibility, climb gradients, or temporary restrictions.
- Representative airline weights and generated schedule events do not claim an observed historical day.
- Terrain is a normalized copy of the reusable contribution and is not a certified elevation product.

## Sources

1. https://github.com/openscope/openscope/pull/2056 — historical MIT implementation baseline
2. https://github.com/openscope/openscope/blob/develop/LICENSE.md — openScope MIT licence
3. https://www.navcanada.ca/en/aeronautical-information.aspx — NAV CANADA aeronautical publications
4. https://navcanada.ca/en/031sup2026en.pdf — 2026 CYYC operational context and runway 11 threshold reference
5. https://tdih-cdit.tc.canada.ca/sites/default/files/addendum-tables/2024/A6-en.pdf — Transport Canada 2024 aircraft-movement table
