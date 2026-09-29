# MKJP - Norman Manley International Airport

## Overview

This simulator asset models Norman Manley International Airport and its practical terminal control area. It is not an aeronautical publication and must not be used for navigation.

## Runways

The modeled runway pairs are: `12/30`. Low-number runway designators retain their leading zero because runway identifiers are strings, not integers wearing a cheap disguise.

## Procedures

- SIDs: ALKOL5, ALPEN3, AMEKO2, DATOM3, ENEKA7, GUDIL5, KEYNO2, LEXUV5, MLY7, OMPAL3, RADOK7, TIBEL3, URMAN3
- STARs: ELSER5, KEYNO3

The routes are normalized from the historical openScope contribution and all committed route references resolve locally. Controllers remain responsible for vectors, climb gradients, runway eligibility, and operational restrictions the legacy route grammar cannot express.

## Traffic and handoff

The representative random traffic model totals approximately 1.375 arrivals and 1.33333 departures per hour. Every arrival has an explicit route-entry centre-handoff boundary (`BEREX`, `GIVPE`, `KENTA`, `KOBIS`, `OZARK`, `PULKA`, `RABAG`). The deterministic daily schedule uses `America/Jamaica` and is synthesized from those route weights; it is not a copied airline timetable.

## Maps and terrain

The package includes the contributed terminal maps and normalized GeoJSON terrain. Exact duplicate and degenerate geometry is removed at publication time.

## Data limitations

This independent community-fork asset uses an MIT-licensed historical implementation baseline. Procedure currency and legal airspace remain subject to current official publications. See [the source dossier](../sources/mkjp.md) for exact provenance and publication limits.
