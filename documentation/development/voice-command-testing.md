# Voice Command Testing

## Purpose

Voice commands convert an explicit push-to-talk recording into text entirely in
the browser, normalize that text against the current simulation, and place an
accepted command in the existing command input. Recognition must never submit a
command. The controller still presses **Enter** to execute it.

This plan covers the local Whisper implementation based on
`@huggingface/transformers@4.3.0` and `onnx-community/whisper-tiny.en`.

## Non-negotiable acceptance criteria

- Loading the game does not download a speech model or request microphone
  permission.
- Clicking **Enable voice** starts model loading, but does not request microphone
  permission.
- Starting push-to-talk is the only action that may request microphone
  permission.
- Audio is processed locally. No microphone samples, transcripts, or normalized
  commands are sent to an external speech service.
- WebGPU may accelerate inference when a usable adapter exists. WASM is the
  required baseline.
- Releasing push-to-talk ends recording. Pointer cancellation, lost pointer
  capture, focus loss, airport changes, and teardown cancel safely.
- The raw transcript and the normalization result or rejection reason are
  visible.
- Recognition never presses Enter or otherwise executes a command.
- Invalid, ambiguous, stale, cancelled, or unsupported speech does not replace
  text already present in the command input.
- Callsigns, fixes, and runways resolve only against exact current simulation
  context. The normalizer does not guess.
- Model weights are downloaded only after opt-in and are not included in the
  generated application files.

## Automated gates

Run these from the repository root:

```sh
npm test
npm run lint
npm run build:dev
node tools/build.test.js
npm audit --omit=dev --audit-level=low
```

The focused voice suite includes:

- PCM channel conversion and exact 16 kHz resampling;
- microphone permission, start, stop, cancellation, and late-permission races;
- strict worker protocol validation and transferable-buffer ownership;
- model lifecycle, progress, stale-result suppression, and local backend
  selection;
- usable-WebGPU probing and WASM fallback selection;
- exact callsign, fix, runway, number, and phrase normalization;
- rejection of ambiguity, unknown context, malformed input, and unsupported
  trailing text;
- view state, accessible status, keyboard and pointer push-to-talk, pointer
  capture, and event-listener cleanup;
- application composition, airport-change cancellation, and teardown;
- generated worker/runtime assets and exclusion of model weights.

A packaged browser smoke must additionally prove that the built module worker
loads, the local ONNX WASM runtime is fetched from the application origin, a
fake microphone recording reaches local Whisper, a transcript is displayed,
and no command is auto-submitted.

## Manual browser matrix

Test the latest stable releases and the project's minimum targets:

- Chromium/Chrome: current stable and Chrome 109;
- Firefox: current stable and Firefox 115;
- Safari: current stable and Safari 16.

Record for every run:

- browser and exact version;
- operating system and hardware;
- WebGPU or WASM backend shown by the UI;
- first-load and warm-load model time;
- speech-to-preview latency;
- peak browser memory where available;
- pass, rejection, or incorrect normalization for each phrase;
- console errors and unexpected network destinations.

## Human voice phrase set

Use an aircraft, fix, and runway that are visible in the currently loaded
simulation. Replace the examples below rather than speaking identifiers that do
not exist in the live context.

1. `<callsign> turn left heading two seven zero`
2. `<callsign> turn right heading zero niner zero`
3. `<callsign> climb and maintain one two thousand`
4. `<callsign> descend and maintain five thousand`
5. `<callsign> reduce speed two one zero`
6. `<callsign> direct <visible-fix>`
7. `<callsign> cleared I L S runway <active-runway> approach`
8. `<callsign> contact tower one one eight point one`
9. `<callsign> turn left heading two seven zero, descend and maintain five
   thousand`

For each phrase, verify the transcript, normalized preview, command input, and
lack of execution before Enter.

Repeat the set with:

- two speakers with different pitch ranges;
- at least two regional accents;
- slow, normal, and hurried cadence;
- a laptop microphone and a headset microphone;
- quiet room, ordinary room noise, and controlled radio-like noise;
- short and long button holds, including a small silence before and after speech.

Do not use synthetic speech results as evidence for human accuracy. Synthetic
fixtures test plumbing, not people. Machines congratulating themselves on
understanding other machines would be a rather circular benchmark.

## Fail-closed cases

Start with known text in the command input. For every case below, verify that it
remains unchanged and that no command executes:

- unknown callsign;
- ambiguous callsign fragment;
- unknown fix;
- runway not present at the current airport;
- unsupported instruction or unsupported trailing words;
- empty recording and silence;
- clipped beginning or ending;
- unintelligible or heavily distorted audio;
- release outside the button;
- pointer cancellation or lost pointer capture;
- browser focus loss while recording;
- airport change during recording or transcription;
- repeated rapid start/stop;
- cancellation while microphone permission is pending;
- permission granted after a cancelled request;
- model, decoder, worker, WebGPU, or WASM failure.

## Permission and device failures

Verify each state has a visible, actionable error and can recover without a page
reload where the platform permits:

- microphone permission denied;
- permission dismissed;
- no input device;
- device disconnected while recording;
- insecure HTTP origin other than loopback;
- microphone already in use or unavailable;
- browser policy blocks microphone access.

After cancellation or failure, inspect browser device indicators and confirm the
microphone track stopped. Repeated runs must not accumulate media tracks, audio
contexts, workers, or event listeners.

## Model delivery, caching, and offline behavior

1. Clear site data and browser cache.
2. Load the game and confirm no model request occurs.
3. Click **Enable voice** and confirm progress is visible.
4. Confirm model files come only from the configured Hugging Face model source;
   ONNX runtime JavaScript and WASM files must come from the application origin.
5. Reload with the network disabled after a successful cached load.
6. Record whether the browser can load the model from cache and report a clear
   error if it cannot.
7. Re-enable the network and confirm retry recovers.
8. Inspect generated output and confirm no model weights are bundled.

Caching behavior differs by browser and storage policy. An offline reload is a
separate result from the core guarantee that inference, once loaded, is local.

## Privacy verification

Use browser developer tools with **Preserve log** enabled:

1. Clear the network log and load the game.
2. Confirm there are no speech-model requests before opt-in.
3. Enable voice and identify every model/runtime request.
4. Clear the log after the model is ready.
5. Record and transcribe all manual phrases.
6. Confirm there are no network requests containing or triggered by microphone
   audio, transcripts, or normalized commands.
7. Inspect WebSocket frames and service-worker activity as well as ordinary
   fetch/XHR requests.

Expected post-load speech traffic is zero. Any unexplained request blocks
release until identified.

## Performance thresholds and reporting

Measure rather than inventing a flattering number. Capture separately for WebGPU
and WASM:

- model-ready time on a cold cache and warm cache;
- release-to-transcript and release-to-preview latency for 3, 6, and 10 second
  recordings;
- peak memory during model load and transcription;
- sustained CPU/GPU utilization;
- frame responsiveness while loading and transcribing.

The UI must remain responsive enough to cancel, change airports, and continue
with typed commands. A performance regression is release-blocking if it freezes
interaction, exhausts ordinary browser memory, leaks resources across repeated
runs, or makes WASM impractical on supported hardware.

## Release evidence

Attach or link the following to the pull request:

- automated command results;
- packaged browser smoke result;
- completed browser/hardware matrix;
- phrase-level human results, including failures;
- privacy network capture summary;
- cold/warm load and inference measurements;
- known limitations and browser-specific behavior.

Voice support is ready for general use only after the automated gates, packaged
browser smoke, privacy check, and at least one real-human run on both Chromium
and a non-Chromium supported browser pass. Until then it is an explicitly tested
feature candidate, not magic.
