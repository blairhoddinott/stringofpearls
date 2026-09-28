# MKJP source and provenance dossier

## Published scope

This dossier covers the MKJP airport JSON, terrain, maps, procedures, representative traffic patterns, and deterministic schedule. The data is for simulation only and is not suitable for navigation.

## Reusable implementation baseline

The byte-level implementation baseline is the unmerged MKJP contribution in [openScope pull request 2082](https://github.com/openscope/openscope/pull/2082) at exact head commit `0c31df84e4a45765d0e00b6b3d10779c23f357a9`. At that head, a misplaced closing brace parses `spawnPatterns` and `maps` as members of `stars`; [earlier PR commit `7d078f174e15007e5daba1b3fa53fd254c7ed0a2`](https://github.com/openscope/openscope/tree/7d078f174e15007e5daba1b3fa53fd254c7ed0a2/assets/airports) is the exact structural-provenance snapshot showing those retained entries at their intended top level. The openScope repository publishes the contributed files under the MIT licence. String of Pearls is an independent community fork; this publication is not an official adoption by openScope.

The historical baseline was ingested file-by-file rather than by importing its obsolete load-list patch. Runways were canonicalized, procedure and spawn references were audited, explicit centre-handoff boundaries were added, constructor fields were normalized, and duplicate or degenerate map/terrain geometry was removed.

## Current factual review

Jamaica Civil Aviation Authority eAIP publications are the controlling sources for current operational use. They were used as the factual review boundary for airport identity and runway context; no restricted chart artwork, bulk proprietary navigation database, API key, token, password, credential, or connection string is committed. The historical procedure encodings remain an attributed simulation baseline and are not represented as a current AIRAC database.

The Airports Authority of Jamaica's current airport specification confirms the single `12/30` runway pair modeled by the asset. Current procedure legs were not available under a selected reusable bulk-data licence, so the historical procedure set remains explicitly versioned and attributed rather than silently presented as current.

## Publication inventory

- runway pairs: 1
- SIDs: 13
- STARs: 2
- named fixes: 85
- spawn patterns: 20
- centre-handoff fixes: `BEREX`, `GIVPE`, `KENTA`, `KOBIS`, `OZARK`, `PULKA`, `RABAG`
- timezone: `America/Jamaica`

## Simulator simplifications

- The modeled airspace is a practical gameplay volume, not a reproduction of every legal controlled-airspace layer.
- The legacy route grammar cannot enforce all chart prose, equipment eligibility, climb gradients, or temporary restrictions.
- Representative airline weights and generated schedule events do not claim an observed historical day.
- Terrain is a normalized copy of the reusable contribution and is not a certified elevation product.

## Sources

1. https://github.com/openscope/openscope/pull/2082 — historical MIT implementation baseline
2. https://github.com/openscope/openscope/blob/develop/LICENSE.md — openScope MIT licence
3. https://github.com/openscope/openscope/tree/7d078f174e15007e5daba1b3fa53fd254c7ed0a2/assets/airports — exact PR snapshot establishing intended top-level map and spawn structure
4. https://www.jcaa.gov.jm/ — Jamaica Civil Aviation Authority
5. https://airportsauthorityjamaica.aero/airports-aerodromes/normal-manley-international-airport/ — current airport identity and runway specification
