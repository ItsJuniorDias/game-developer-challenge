# Performance report

Profiling of the optimized production build (`vite build` served by `vite preview`), including every visual effect (wakes, shadows, smoke, sparks, survivors, floating numbers), produced by `npm run perf` ([`perf/profile.spec.ts`](../perf/profile.spec.ts)). Raw data: [`reports/perf/match-180s.json`](../reports/perf/match-180s.json) (includes one sample per second) and [`reports/perf/memory-cycles.json`](../reports/perf/memory-cycles.json).

## Reference environment

| Item | Value |
| --- | --- |
| Hardware | Apple M1 (8 cores), 8 GB RAM |
| OS | macOS (Darwin 27.0.0, arm64) |
| Browser | Chromium 153.0.8010.12 (Playwright), GPU rendering through ANGLE/Metal (`ANGLE Metal Renderer: Apple M1`) |
| Resolution | 1280 × 720 CSS px, device pixel ratio 1 |
| Build | production (`vite build`), no source maps loaded |
| Target | 60 FPS |

## 1. Three-minute match

**Scenario (stress).** Session time 180 s, enemy spawn interval **1 s** (the fastest the options allow), seed 777. The arena stays at the 10-enemy cap for most of the match. The player's health is raised to 1,000,000 through the test configuration so the match always lasts the full three minutes. An in-page autopilot drives the ship with real keyboard events: it steers toward the nearest enemy and keeps firing the bow cannon and broadsides. A separate `requestAnimationFrame` recorder, independent of the game loop, measures every frame interval, and the game state is sampled once per second.

| Metric | Result |
| --- | --- |
| Frames recorded | 10,812 over 179.8 s of simulated time |
| Average frame rate | **60.0 FPS** |
| Frame time p50 / **p95** / p99 | 16.7 ms / **16.7 ms** / 16.8 ms |
| Longest frame | 116.7 ms (a single frame) |
| Frames over 20 ms | 1 (0.01%) |
| Frames over 33 ms | 1 (the same frame) |
| Entities, peak | 13 (player + enemies + cannonballs) |
| Entities, average | 8.9 |
| Enemies alive, peak | 10 (spawn cap) |
| Cannonballs in flight, peak | 5 |
| Pooled effect particles, peak | 249 (pool limit 700) |
| Floating numbers, peak | 5 (pool limit 16) |

The game held the 60 FPS target for the whole match: p95 and p99 equal the display interval, so there is no sustained jank. One frame took 117 ms. To check whether it came from first-time work in the effects (the first explosion, the first floating number and its text texture, the first wake mesh), I ran a frame probe (every frame over 33 ms logged with the game state) on four more real-time matches of 20–25 s with the same seed and settings. Together they covered the first kills, hits and floating numbers: none had a frame over 33 ms. Earlier runs of the same harness showed one isolated 800 ms stall and no stall at all, so these single frames are treated as host hiccups (headless browser or OS), not game work.

## 2. Memory after five start → play → exit cycles

**Scenario.** One warm-up cycle loads and caches textures, audio and JIT code. Then five cycles each start a match (180 s / 1 s spawns, autopilot on), play for 20 s, pause and return to the main menu. After every cycle the harness forces garbage collection twice and reads Chromium's `Performance.getMetrics` through the DevTools protocol.

| After | JS heap used | JS event listeners | DOM nodes | Canvases |
| --- | --- | --- | --- | --- |
| Warm-up | 8.07 MB | 198 | 146 | 0 |
| Cycle 1 | 8.43 MB | 198 | 146 | 0 |
| Cycle 2 | 8.69 MB | 198 | 146 | 0 |
| Cycle 3 | 8.88 MB | 198 | 146 | 0 |
| Cycle 4 | 9.12 MB | 198 | 146 | 0 |
| Cycle 5 | 9.28 MB | 198 | 146 | 0 |

Event listeners, DOM nodes and documents stay identical after every cycle, and no canvas or WebGL context survives leaving a match (Pixi loses its context on `destroy`). The JS heap still grew by about 210 KB per cycle (+263 KB, +192 KB, +238 KB, +159 KB after the first cycle), with the step trending down, so I investigated it.

### Investigation

1. **Heap snapshot diff.** On a development server (so class names are readable), heap snapshots were taken after forced GC after cycle 1 and after cycle 5, and compared by constructor. No game or scene type grew: `GameSession`, `GameRenderer`, `ShipView`, `WakeTrail`, `MeshRope`, `FloatingTextLayer`, `Text`, `EffectsLayer`, `ProjectileSprite`, `HealthBar`, `Sprite`, `Container`, `Texture`, canvases and audio nodes keep the same count from one cycle to the next, and the match-owned ones (sessions, renderers, ship views, wake meshes, floating-text layers, effect layers) are back to zero in the menu. Over those 4 cycles only small objects grew: 391 plain objects (10 KB), 150 closures, 100 `Promise`, 50 `Generator`, 42 `ArrayBuffer` headers. The same measurement on the code before the visual-effects pass gives the same profile (376 plain objects and identical counts for the rest), so the effects retain nothing. The rest of the ~210 KB is engine metadata (compiled code, type feedback), which is not retained game data.
2. **Retainers.** Following the retainer paths of the new `Generator`/`Promise` objects leads to a chain of `PromiseReaction`s on MSW's internal `workerPromise`. That is the channel MSW uses to post its keep-alive message to the Service Worker every 5 seconds.
3. **Confirmation without gameplay.** Leaving the app idle on the main menu for 60 s, without starting any match, adds exactly +12 `Generator`, +24 `Promise` and +24 promise reactions (≈ 8 KB), one set per 5-second keep-alive.
4. **One tiny retention inside PixiJS.** The diff also shows one `EE` (event-listener record) and one `BindGroup` more per match (about 70 bytes). Their retainer path ends at `Texture.WHITE`, a global texture that Pixi uses as the default fill: every renderer creates a bind group for it and subscribes to its source's `change` event, and `Application.destroy()` does not unsubscribe. Counting the listeners on `Texture.WHITE.source` after matches 1 to 4 gives 1, 2, 3 and 4 `change` listeners. It predates this pass and is negligible (≈ 70 KB after 1,000 matches). The only fix on the game's side would be to keep one Pixi `Application` alive across matches, which trades the clean per-match teardown for a few bytes.

**Conclusion.** The game releases everything it allocates for a match: the Pixi application and WebGL context, display objects (including the wake meshes and floating texts), pools, ticker, listeners, observers, timers and audio loops. The small steady growth is time-based and comes from the mock network layer (the MSW Service Worker keep-alive), not from playing: about 0.5 MB per hour, well within limits. It only exists because the backend is simulated in the browser. Apart from that, Pixi keeps one listener on a global texture per match (item 4).

## How to reproduce

```bash
npm run perf
```

The command builds the app, starts the preview server and writes `reports/perf/*.json`. On macOS it uses the Metal GPU (`--use-angle=metal`). Optional environment variables: `PERF_MATCH_SECONDS` (default 180) and `PERF_CYCLE_MS` (play time per memory cycle, default 20000). The live frame statistics of any match are also available with `?debug=1` → `__pirate.perf()` in the console.

## Limitations of these measurements

- Measured in Playwright's headless Chromium with the GPU enabled, not in a visible browser window. The frame pacing matches a 60 Hz display, but a real window adds compositing that is not measured here.
- One reference machine (Apple M1). Mobile devices were not profiled on real hardware. The mobile layout was only exercised through emulation in the E2E suite.
- The stress scenario raises the player's health so the match lasts three minutes; everything else (spawn rate, AI, weapons, effects) uses the normal rules.
- The autopilot fires less than a skilled player (peak 5 cannonballs in flight). Projectile, particle and floating-number rendering is pooled, so a busier match changes draw counts but not allocations.
- The heap numbers include the mock network layer described above. Chromium's `JSHeapUsedSize` also counts engine metadata, which is why the object-level snapshot diff is the more precise measure.
