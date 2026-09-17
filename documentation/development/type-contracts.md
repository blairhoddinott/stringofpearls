# Targeted TypeScript contracts

## Status

Accepted for incremental use after the Phase 5 input-boundary spike.

## Decision

Use TypeScript's JavaScript checking mode for narrow, already-characterized boundaries before considering source-file conversion. The repository owns a strict, no-emit contract gate:

```sh
npm run typecheck:contracts
```

The gate uses the exactly pinned TypeScript compiler and [`tsconfig.contracts.json`](../../tsconfig.contracts.json). It currently checks:

- `InputEventBindings`
- `ViewportGestureInteraction`
- compile-time consumer probes in `test/types/input-contracts.spec.ts`

Both modules retain JavaScript runtime syntax. Their constructor capabilities, event shapes, handler collections, viewport operations, mutable input state, and provider return values are expressed as JSDoc structural contracts and checked with `allowJs`, `checkJs`, `strict`, and `noEmit`.

Compile-time probes cover both browser wheel families registered by `InputEventBindings`: a `mousewheel`-style payload may provide only `wheelDelta`, while a `DOMMouseScroll`-style payload may provide only `detail`. The contract deliberately accepts either shape and retains the runtime OR short-circuit.

## Spike evidence

Two approaches were exercised with TypeScript 7.0.2:

1. **Broad `checkJs` over all six extracted input services.** This produced 232 diagnostics across the larger dependency bags and transitive legacy imports. Most were undeclared properties and implicit parameters, not evidence that a mass conversion was safe. This approach was rejected for the first slice; weakening strictness or excluding reported source would have manufactured a green badge rather than a useful contract.
2. **Strict `checkJs` over the two self-contained boundaries.** The initial repository-owned run failed on 15 implicit parameters. Adding explicit structural JSDoc contracts resolved every diagnostic without changing runtime semantics, using `any`, ignoring errors, weakening strictness, adding source exclusions, or generating declarations. The focused runtime suite remained green.

TypeScript documents `allowJs` as an incremental adoption mechanism for JavaScript projects and `checkJs` as its error-reporting companion: <https://www.typescriptlang.org/tsconfig/#JavaScript_Support_6247>.

## Expansion rules

A module may enter `tsconfig.contracts.json` only when:

1. its behavior is already characterized;
2. its external capabilities are explicit;
3. strict checking passes without `any`, `@ts-ignore`, weakened compiler options, or source exclusions;
4. runtime tests prove annotations did not alter behavior; and
5. the complete repository gate remains green.

Prefer boundaries, asset schemas, command/event payloads, and domain DTOs. Do not convert files merely to improve a TypeScript percentage. Percentages are how migrations become religions.

## Deferred work

`MeasurementInteraction`, `AircraftSelectionInteraction`, `CommandInteraction`, and `KeyboardInteraction` remain JavaScript. Asset schemas, remaining adapter contracts, commands/events, and domain DTOs also remain follow-on work. These contracts should be added one independently reviewed slice at a time, beginning with shared event and command payload types rather than annotating large dependency bags wholesale. Phase 5 established the strict mechanism; it did not claim those later fronts were complete.
