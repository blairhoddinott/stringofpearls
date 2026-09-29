# KIAH - George Bush Intercontinental Airport

## Overview

This simulator asset models George Bush Intercontinental Airport and its practical terminal control area. It is not an aeronautical publication and must not be used for navigation.

## Runways

The modeled runway pairs are: `08L/26R, 08R/26L, 09/27, 15L/33R, 15R/33L`. Low-number runway designators retain their leading zero because runway identifiers are strings, not integers wearing a cheap disguise.

## Procedures

- SIDs: BLTWY7, BNDTO5, FLYZA5, GUMBY3, HOODO7, INDIE8, LURIC8, MMUGS4, PITZZ4, RITAA7, STRYA8, STYCK8, WYLSN8
- STARs: DOOBI2, DRLLR5, LINKK1, MSCOT4, NNCEE1, SKNRD4, SOULL1, TEJAS4, TTORO3, ZEEKK2

The routes are normalized from the historical openScope contribution and all committed route references resolve locally. Controllers remain responsible for vectors, climb gradients, runway eligibility, and operational restrictions the legacy route grammar cannot express.

## Traffic and handoff

The representative random traffic model totals approximately 25.5417 arrivals and 25.5 departures per hour. Every arrival has an explicit route-entry centre-handoff boundary (`AEX`, `DIESL`, `MQP`, `SJI`, `SWB`, `YEEHA`). The deterministic daily schedule uses `America/Chicago` and is synthesized from those route weights; it is not a copied airline timetable.

## Maps and terrain

The package includes the contributed terminal maps and normalized GeoJSON terrain. Exact duplicate and degenerate geometry is removed at publication time.

## Data limitations

This independent community-fork asset uses an MIT-licensed historical implementation baseline. Procedure currency and legal airspace remain subject to current official publications. See [the source dossier](../sources/kiah.md) for exact provenance and publication limits.
