# Supported browsers

String of Pearls is a desktop browser application. Browser support is deliberately narrow while the inherited frontend is modernized; promising every browser would be marketing, not engineering.

## Supported

The latest stable desktop releases of Chromium-based browsers are supported:

- Google Chrome
- Microsoft Edge
- Chromium

The automated acceptance baseline uses **Google Chrome for Testing 153.0.8010.12** from the digest-pinned Playwright `1.63.0` container. Every change should preserve startup and core interaction behavior against that baseline.

## Best effort

Firefox and Safari may work, but they are not yet part of the automated acceptance matrix. Bugs are welcome, but compatibility is not guaranteed until those engines have repository-owned smoke coverage.

Mobile and tablet browsers are unsupported. The simulator assumes a desktop-sized viewport, keyboard command input, pointer interaction, and canvas rendering.

## Acceptance test

Run the browser acceptance test with:

```sh
npm run browser:smoke
```

The test builds the production image and verifies:

1. the application returns a successful response;
2. startup reaches the first completed animation frame;
3. the loading overlay closes;
4. both simulator canvases have non-zero dimensions;
5. the airport selector is populated;
6. KPDX can be fetched and selected;
7. the selection is persisted and shown as active; and
8. no uncaught exceptions, console errors, or failed same-origin requests occur.

The runner uses [`compose.browser-smoke.yaml`](../../compose.browser-smoke.yaml) and a separate, digest-pinned Playwright image. It does not add modern browser tooling to the legacy root dependency graph.

## Expanding support

Add an engine to the supported list only after the same acceptance path runs against it in automation. A successful manual launch is useful evidence, but it is not a support policy.
