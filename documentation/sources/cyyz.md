# CYYZ source and provenance dossier

## Published scope

This dossier covers the CYYZ airport asset, its terrain, procedures, maps, representative traffic patterns, and deterministic schedule. The asset models Toronto Pearson and useful Toronto Terminal airspace rather than the whole Toronto FIR. It is a simulator dataset, not an aeronautical publication and not suitable for navigation.

The publication snapshot is identified as `2609`, corresponding to the 3 September 2026 cycle used for the airport diagram, Canada Flight Supplement, and Designated Airspace Handbook. Individual procedure plates retain older revision dates when the chart publisher did not revise that page in the September 2026 package.

## Source matrix

### Reusable implementation baseline

The airport geometry, original fix table, videomaps, terminal polygon, procedure encoding conventions, and terrain started from the CYYZ contribution in openScope pull request 2107 at commit `57be85763b8215d9dd09856f248b1ffb46e5d971`.[1] The source repository states that its files are MIT-licensed unless specifically noted otherwise.[2] Those normalized assets are therefore the redistributable baseline; they were audited and updated rather than treated as current aeronautical authority.

The committed terrain is the normalized GeoJSON from that MIT-licensed contribution, used as a separate reusable elevation/geographic dataset rather than derived from chart artwork. It contains a water polygon at 0 metres and 304.8-metre terrain bands. The Canadian Digital Elevation Model was evaluated as an independent Canadian elevation source, but no CDEM raster or bulk derivative is committed.[5]

### Current private chart evidence

The user supplied 96 PNG chart screenshots in a private `cyyz_charts.zip` archive. The archive is retained outside the repository and has SHA-256:

```text
02d91bfa8b36796dcf8e95dcb6c68d05d4929135b450445e4e7adf7555b18d22
```

The screenshots were inventoried, visually inspected at full resolution, and OCRed in private scratch storage. They were used to reconcile procedure identifiers, routes, runway branches, headings, and restrictions. No screenshot, chart artwork, OCR dump, or bulk normalized chart transcription is committed. Possession and reference use are not being confused with redistribution rights. A tiny FINGL restriction that OCR and the historical baseline rendered ambiguously was resolved from the full-resolution image as **at or below FL190** and is encoded as `A190-`.

Visible source-page revisions span 5 July 2024 through 28 August 2026. That variation is expected for pages that remained effective without being redrawn; it does not mean all plates were revised on one day.

### Official publications used as reference

- NAV CANADA Designated Airspace Handbook, issue 323, effective 3 September 2026, was used to check Toronto terminal/control-zone scope and vertical limits.[3]
- NAV CANADA Canada Flight Supplement, effective 3 September 2026, was used to check airport identity, runway, frequency, and operational context.[4]
- NAV CANADA aeronautical data is commercially licensed; consequently these publications are reference evidence, not a licence basis for republishing chart pages or a bulk aeronautical database.[9]

### Supplemental waypoint coordinates

The historical MIT fix table resolved nearly the entire current route corpus. Eight newly referenced SID fixes and the SSM transition navaid were absent. No coordinate was estimated from label placement on a raster chart. SSM was checked against the FAA Chart Supplement record for the Sault Ste Marie VOR/DME.[20]

The supplemental coordinate checks were deliberately recorded in small, auditable groups:

- MATES, MEMPA, and SIDVU.[12][13][14]
- IGTUL, NADUM, and TEVAD.[15][16][17]
- AHPAH and IKMOK.[18][19]

The last pair received an additional sanity check because similarly named or geographically implausible candidates are an easy way to manufacture a very convincing bug.

openAIP exports were evaluated but excluded from the committed dataset because their non-commercial licence was not selected as a redistribution basis.[10]

OurAirports was evaluated for airport-level public-domain data, but it did not provide the complete procedure dataset and contributed no committed procedure data.[6]

FAA CIFP and NASR snapshots were also evaluated privately but did not provide a complete Canadian CYYZ procedure source and contributed no committed data.

### Runway use and traffic

Toronto Pearson documents five operational runway pairs and states that westerly flow is the most common configuration. Its own triple-runway example uses 24R for departures and 24L for arrivals, which is the simulator default used here.[8]

GTAA reported 392,500 total aircraft movements for 2025.[11] Dividing that annual total by 365 gives roughly 1,075 movements per day, or 44.8 per hour. The authored asset therefore uses aggregate rates of 22.4 arrivals and 22.4 departures per hour. The compiler produces 1,076 deterministic daily slots because each direction is rounded independently to an integer daily budget. These are synthesized representative events, not observed flights, flight numbers, or a claim of an exact historical day. GTAA separately reported 47.3 million passengers in 2025, useful as a scale check rather than a schedule source.[7]

## Procedure coverage

The published asset contains:

- all five runway pairs: `05/23`, `06L/24R`, `06R/24L`, `15L/33R`, and `15R/33L`;
- 28 current SID identifiers;
- 10 current STAR identifiers;
- all published runway branches present in the supplied package;
- current route restrictions represented by the simulator's altitude/speed token grammar;
- 264 named fixes/navaids, with every named procedure reference resolving locally;
- west-flow representative spawn patterns and a deterministic `America/Toronto` schedule.

## Simulator simplifications

- `ARROW4` and `TRNTO4` are vector departures. The simulator encodes the published initial runway heading or outbound radial, but it has no native radial/DME-leg primitive. D5.7 YTP, D7.9 YTP, D3.9 YTP, and D1.6 YYZ are therefore not fabricated as geographic fixes; the controller must issue the subsequent vector.
- Published climb gradients, aircraft eligibility, quiet-hour windows, and lost-communications prose cannot all be enforced by the legacy airport JSON runtime. They are described in the airport guide but are not presented as runtime guarantees.
- The terminal polygon is a practical controller volume inherited from the MIT baseline and checked against the current DAH. It intentionally does not reproduce the entire layered Toronto FIR/TCA legal description.
- Terrain uses 1,000-foot bands as required by the simulator's legacy terrain model; it is not a high-resolution topographic product.
- Airline weights are authored representatives used by random spawn patterns. They do not claim exact carrier market share.

## Reproduction and audit notes

Private intake and reconciliation artifacts are intentionally outside Git in agent scratch storage. The committed publication boundary is limited to normalized airport JSON, terrain GeoJSON, deterministic schedule JSON, documentation, and tests. The original archive, screenshots, OCR output, source PDFs, downloaded exports, and portable OCR runtime are excluded.

## Sources

[1] https://github.com/openscope/openscope/pull/2107 — openScope CYYZ pull request 2107
[2] https://github.com/openscope/openscope/blob/develop/LICENSE.md — openScope MIT licence
[3] https://www.navcanada.ca/en/dah20260903.pdf — Designated Airspace Handbook issue 323
[4] https://www.navcanada.ca/en/ecfs_07_en.pdf — Canada Flight Supplement effective 3 September 2026
[5] https://open.canada.ca/data/en/dataset/7f245e4d-76c2-4caa-951a-45d1d2051333 — Canadian Digital Elevation Model
[6] https://ourairports.com/data — OurAirports open data downloads
[7] https://www.torontopearson.com/en/corporate/media/press-releases/2026-03-05 — Toronto Pearson 2025 results
[8] https://www.torontopearson.com/en/community/noise-management/understanding-airport-noise/runways — Toronto Pearson runway operations
[9] https://www.navcanada.ca/en/aeronautical-information/data-sales.aspx — NAV CANADA data licensing
[10] https://www.openaip.net — openAIP CC BY-NC 4.0 data
[11] https://cdn.torontopearson.com/-/media/project/pearson/content/corporate/who-we-are/pdfs/Q4%20MDA%20%20Consolidated%20FS%20%20Notes — GTAA 2025 annual flight activity
[12] https://opennav.com/waypoint/CA/MATES
[13] https://opennav.com/waypoint/CA/MEMPA
[14] https://opennav.com/waypoint/CA/SIDVU
[15] https://opennav.com/waypoint/CA/IGTUL
[16] https://opennav.com/waypoint/CA/NADUM
[17] https://opennav.com/waypoint/CA/TEVAD
[18] https://opennav.com/waypoint/CA/AHPAH
[19] https://opennav.com/waypoint/CA/IKMOK
[20] https://aeronav.faa.gov/afd/14MAY2026/EC_242_14MAY2026.pdf — FAA Chart Supplement Sault Ste Marie VOR/DME
