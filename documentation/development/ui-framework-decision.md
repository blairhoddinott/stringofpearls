# ADR: UI framework adoption

- **Status:** Accepted
- **Decision:** Retain the current canvas and DOM stack; do not adopt a component framework during Phase 5.
- **Scope:** Browser presentation and interaction code

## Context

String of Pearls is primarily a canvas simulator with a smaller inherited jQuery-driven DOM shell. Phase 5 separated canvas hosting, viewport ownership, scheduling, domain rendering, event registration, measurement, selection, command, viewport-gesture, and keyboard behavior behind explicit boundaries. The remaining controllers are composition and routing surfaces rather than mandatory framework migration points.

A framework would not replace the custom canvas renderer, simulation model, airport assets, deterministic build, or browser-event contracts. Adopting one now would therefore add a second presentation lifecycle while yielding little immediate user value.

## Options considered

### Retain the current stack

- Lowest behavioral and bundle risk.
- Preserves the deterministic 278-file output and current browser smoke contract.
- Lets feature work use the extracted services without introducing another state owner.
- Leaves inherited DOM code visible rather than hiding it behind adapters with no feature requirement.

### React

React officially supports rendering components into selected parts of an existing page rather than requiring a rewrite: <https://react.dev/learn/add-react-to-an-existing-project>. Incremental adoption is technically viable, but React would add a runtime, rendering ownership, and integration surface without replacing the canvas architecture.

### Vue

Vue explicitly supports incremental adoption, standalone use, and embedded custom elements: <https://vuejs.org/guide/extras/ways-of-using-vue.html>. It is a credible candidate for a future isolated DOM feature, but selecting it before such a feature exists would still be speculative dependency growth.

### Svelte

Svelte can compile components to custom elements for embedding in an existing page: <https://svelte.dev/docs/svelte/custom-elements>. This offers a strong isolation boundary, but it also introduces a compiler-specific source format and build integration. There is no current feature whose value justifies that cost.

### Standards-based custom elements without a framework

Native custom elements could isolate a future DOM feature without a framework runtime. They remain a valid pilot option, but the repository should not invent a component system until a real feature establishes requirements for lifecycle, state, accessibility, and testing.

## Decision

Do not add React, Vue, Svelte, or another UI framework now. Continue using the extracted presentation and interaction services with the existing canvas and DOM composition.

A future framework proposal must begin with one isolated, non-canvas feature and demonstrate:

1. a named user-facing need that is materially harder in the current stack;
2. one authoritative state owner, with no mirrored simulation state;
3. incremental mounting and teardown without taking over the application root;
4. preserved static hosting and deterministic build output;
5. accessible keyboard and focus behavior;
6. no regression in startup, render, airport-selection, or uncaught-error smoke checks;
7. measured bundle and maintenance cost; and
8. a clean removal path if the pilot fails.

The pilot must compare the selected framework with native custom elements and the current stack. Popularity is not an acceptance criterion. Neither is a conference talk with tasteful gradients.

## Consequences

- Phase 5 closes without a framework dependency or UI rewrite.
- Feature development can resume on stable service boundaries.
- Framework adoption remains possible, but must be justified by a concrete isolated feature and evidence.
- Canvas rendering stays outside any future component framework unless a separate rendering decision explicitly replaces it.
