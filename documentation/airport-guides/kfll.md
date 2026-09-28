# KFLL - Fort Lauderdale–Hollywood International Airport

## Overview

This simulator asset models Fort Lauderdale–Hollywood International Airport and its practical terminal control area. It is not an aeronautical publication and must not be used for navigation.

## Runways

The modeled runway pairs are: `10L/28R, 10R/28L`. Low-number runway designators retain their leading zero because runway identifiers are strings, not integers wearing a cheap disguise.

## Procedures

- SIDs: AGERS1, BNICE1, DORRL1, FEALX2, FLL9, FRSBE1, GLADZ2, HROCK1, LIFRR1, MAYNR1, REGAE2, SNAPR2
- STARs: BHHIA3, BLUFI1, CUUDA2, DEKAL8, DVALL3, FORTL9, KYAKS3, OLAHS3, TARPN3, TEEKY3

The routes are normalized from the historical openScope contribution and all committed route references resolve locally. Controllers remain responsible for vectors, climb gradients, runway eligibility, and operational restrictions the legacy route grammar cannot express.

## Traffic and handoff

The representative random traffic model totals approximately 45 arrivals and 120 departures per hour. Every arrival has an explicit route-entry centre-handoff boundary (`ACORI`, `EYW`, `HIBAC`, `MAXIM`, `MLB`, `PEACH`, `PIE`, `ZQA`). The deterministic daily schedule uses `America/New_York` and is synthesized from those route weights; it is not a copied airline timetable.

## Maps and terrain

The package includes the contributed terminal maps and normalized GeoJSON terrain. Exact duplicate and degenerate geometry is removed at publication time.

## Data limitations

This independent community-fork asset uses an MIT-licensed historical implementation baseline. Procedure currency and legal airspace remain subject to current official publications. See [the source dossier](../sources/kfll.md) for exact provenance and publication limits.
