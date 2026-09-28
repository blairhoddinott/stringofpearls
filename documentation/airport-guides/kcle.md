# KCLE - Cleveland Hopkins International Airport

## Overview

This simulator asset models Cleveland Hopkins International Airport and its practical terminal control area. It is not an aeronautical publication and must not be used for navigation.

## Runways

The modeled runway pairs are: `06L/24R, 06R/24L, 10/28`. Low-number runway designators retain their leading zero because runway identifiers are strings, not integers wearing a cheap disguise.

## Procedures

- SIDs: CAVVS4, GTLKE4, KKIDS1, PFLYD1, ZAAPA5
- STARs: BRWNZ4, ROKNN3, ROLLN2, TRYBE4

The routes are normalized from the historical openScope contribution and all committed route references resolve locally. Controllers remain responsible for vectors, climb gradients, runway eligibility, and operational restrictions the legacy route grammar cannot express.

## Traffic and handoff

The representative random traffic model totals approximately 24 arrivals and 42 departures per hour. Every arrival has an explicit route-entry centre-handoff boundary (`JANYS`, `OLYEE`, `TALKN`, `THOME`). The deterministic daily schedule uses `America/New_York` and is synthesized from those route weights; it is not a copied airline timetable.

## Maps and terrain

The package includes the contributed terminal maps and normalized GeoJSON terrain. Exact duplicate and degenerate geometry is removed at publication time.

## Data limitations

This independent community-fork asset uses an MIT-licensed historical implementation baseline. Procedure currency and legal airspace remain subject to current official publications. See [the source dossier](../sources/kcle.md) for exact provenance and publication limits.
