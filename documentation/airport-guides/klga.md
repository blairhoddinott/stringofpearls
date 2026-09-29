# KLGA - LaGuardia Airport

## Overview

This simulator asset models LaGuardia Airport and its practical terminal control area. It is not an aeronautical publication and must not be used for navigation.

## Runways

The modeled runway pairs are: `04/22, 13/31`. Low-number runway designators retain their leading zero because runway identifiers are strings, not integers wearing a cheap disguise.

## Procedures

- SIDs: GLDMN7, HOPEA3, JUTES3, LGA7, NTHNS5, TNNIS6
- STARs: APPLE1, HAARP3, KORRY4, MIP4, NOBBI5

The routes are normalized from the historical openScope contribution and all committed route references resolve locally. Controllers remain responsible for vectors, climb gradients, runway eligibility, and operational restrictions the legacy route grammar cannot express.

## Traffic and handoff

The representative random traffic model totals approximately 20.1667 arrivals and 20.1667 departures per hour. Every arrival has an explicit route-entry centre-handoff boundary (`GERBS`, `PATSS`, `RDU`). The deterministic daily schedule uses `America/New_York` and is synthesized from those route weights; it is not a copied airline timetable.

## Maps and terrain

The package includes the contributed terminal maps and normalized GeoJSON terrain. Exact duplicate and degenerate geometry is removed at publication time.

## Data limitations

This independent community-fork asset uses an MIT-licensed historical implementation baseline. Procedure currency and legal airspace remain subject to current official publications. See [the source dossier](../sources/klga.md) for exact provenance and publication limits.
