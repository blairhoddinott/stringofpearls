# KDEN - Denver International Airport

## Overview

This simulator asset models Denver International Airport and its practical terminal control area. It is not an aeronautical publication and must not be used for navigation.

## Runways

The modeled runway pairs are: `07/25, 08/26, 16L/34R, 16R/34L, 17L/35R, 17R/35L`. Low-number runway designators retain their leading zero because runway identifiers are strings, not integers wearing a cheap disguise.

## Procedures

- SIDs: BAYLR6, CHUWY1, CONNR7, COORZ6, DDRTH1, DEN2, EEONS8, EMMYS8, EPKEE7, EXTAN7, HHOTH2, PIKES2, PLAIN1, ROCKI5, SABTH2, SLEEK2, SMMUR2, SUDDZ1, XXWNG1, YELLO4, ZIMMR3
- STARs: AALLE3, CLASH4, DANDD1, FLATI3, LANDR2, LARKS2, LAWGR3, LONGZ2, NIIXX3, POWDR1, QUAIL1, RAMMS8, SSKII3, TBARR3, TOMSN8

The routes are normalized from the historical openScope contribution and all committed route references resolve locally. Controllers remain responsible for vectors, climb gradients, runway eligibility, and operational restrictions the legacy route grammar cannot express.

## Traffic and handoff

The representative random traffic model totals approximately 39.6667 arrivals and 39.6667 departures per hour. Every arrival has an explicit route-entry centre-handoff boundary (`BRWRY`, `BUMMP`, `GNDLA`, `HALEN`, `KAMPR`, `OATHE`, `PORDR`, `TOFUU`). The deterministic daily schedule uses `America/Denver` and is synthesized from those route weights; it is not a copied airline timetable.

## Maps and terrain

The package includes the contributed terminal maps and normalized GeoJSON terrain. Exact duplicate and degenerate geometry is removed at publication time.

## Data limitations

This independent community-fork asset uses an MIT-licensed historical implementation baseline. Procedure currency and legal airspace remain subject to current official publications. See [the source dossier](../sources/kden.md) for exact provenance and publication limits.
