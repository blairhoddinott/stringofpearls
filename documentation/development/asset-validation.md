# Asset validation

A repository-owned validator protects the aviation data baseline without depending on the obsolete `@openscope/validator` package.

## Commands

```sh
npm run validator:test
npm run validate:assets
```

`npm run validator` remains as a compatibility alias for `npm run validate:assets`.

The validator has no third-party runtime dependencies and runs on both the historical Node 11 baseline and current Node releases.

## Enforced invariants

The validator currently checks that:

- every `.json` and `.geojson` file under `assets/` parses;
- the airport load list contains alphabetized, structurally valid entries with exactly four lowercase ICAO letters, one of the four documented difficulty levels, and no unsupported properties;
- each load-list entry resolves to an airport file;
- every airport file is represented in the load list;
- airport ICAO values match their filenames;
- required top-level airport sections exist;
- positions, wind, range rings, runways, and ILS flags have the expected basic shape;
- default arrival and departure runways exist in the airport's runway definitions;
- airports declaring terrain have a matching terrain file; and
- terrain files are GeoJSON feature collections.

It validates **964 JSON/GeoJSON files and 104 airports** at the Phase 0 baseline.

## Scope

This is a fail-closed structural and referential baseline, not a complete model of every aviation rule. Future format changes should extend validator tests before changing production data. More detailed procedure, route, coordinate, and schema validation can be added incrementally without reviving the old package's outdated assumptions.
