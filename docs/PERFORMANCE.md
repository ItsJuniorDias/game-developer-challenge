# Performance report

Profiling of the optimized production build (`vite build` served by `vite preview`), produced by `npm run perf` ([`perf/profile.spec.ts`](../perf/profile.spec.ts)). Raw data: [`reports/perf/match-180s.json`](../reports/perf/match-180s.json) (includes one sample per second) and [`reports/perf/memory-cycles.json`](../reports/perf/memory-cycles.json).

> These measurements were taken before the last optimizations: one redundant render per frame was removed and the combat screen became a lazily loaded chunk (the initial bundle dropped from 1.1 MB to 0.77 MB). Both only reduce work, so the numbers below are an upper bound for the current build. Run `npm run perf` to refresh them.

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
| Frames recorded | 10,803 over 179.9 s of simulated time |
| Average frame rate | **59.7 FPS** |
| Frame time p50 / **p95** / p99 | 16.7 ms / **16.8 ms** / 16.8 ms |
| Frames over 20 ms | 2 (0.02%) |
| Frames over 33 ms | 1 (a single 800 ms hitch) |
| Entities, peak | 14 (player + enemies + cannonballs) |
| Entities, average | 9.3 |
| Enemies alive, peak | 10 (spawn cap) |
| Cannonballs in flight, peak | 5 |
| Pooled effect particles, peak | 225 (pool limit 700) |

The game held the 60 FPS target for the whole match. p95 and p99 equal the display interval, so there is no sustained jank. The single 800 ms frame did not happen again in an earlier 50 s run of the same harness (maximum 16.8 ms). It lines up with no gameplay event in the samples and is most likely a one-off stall of the host (headless browser or OS). It is listed below as an observed limitation.

## 2. Memory after five start → play → exit cycles

**Scenario.** One warm-up cycle loads and caches textures, audio and JIT code. Then five cycles each start a match (180 s / 1 s spawns, autopilot on), play for 20 s, pause and return to the main menu. After every cycle the harness forces garbage collection twice and reads Chromium's `Performance.getMetrics` through the DevTools protocol.

| After | JS heap used | JS event listeners | DOM nodes | Canvases |
| --- | --- | --- | --- | --- |
| Warm-up | 7.83 MB | 196 | 150 | 0 |
| Cycle 1 | 8.11 MB | 196 | 150 | 0 |
| Cycle 2 | 8.34 MB | 196 | 150 | 0 |
| Cycle 3 | 8.51 MB | 196 | 150 | 0 |
| Cycle 4 | 8.70 MB | 196 | 150 | 0 |
| Cycle 5 | 8.80 MB | 196 | 150 | 0 |

Event listeners, DOM nodes and documents stay identical after every cycle, and no canvas or WebGL context survives leaving a match (Pixi loses its context on `destroy`). The JS heap still grew by about 170 KB per cycle, with a shrinking step each time (+232 KB, +163 KB, +190 KB, +102 KB), so I investigated it.

### Investigation

1. **Heap snapshot diff.** Snapshots were taken (after forced GC) after cycle 2 and after cycle 6, and compared by constructor. The object growth was only about 22 KB per cycle: 48 `Generator`, 96 `Promise`, 144 closures, 42 `ArrayBuffer` headers and 259 plain objects over 4 cycles. No game type (ships, sprites, textures, Pixi containers, sessions, stores) grew. The rest of the ~170 KB is engine metadata (compiled code, type feedback), which is not retained game data.
2. **Retainers.** Following the retainer paths of the new `Generator`/`Promise` objects leads to a chain of `PromiseReaction`s on MSW's internal `workerPromise`. That is the channel MSW uses to post its keep-alive message to the Service Worker every 5 seconds.
3. **Confirmation without gameplay.** Leaving the app idle on the main menu for 60 s, without starting any match, adds exactly +12 `Generator`, +24 `Promise` and +24 promise reactions (≈ 8 KB), one set per 5-second keep-alive.

**Conclusion.** The game releases everything it allocates for a match: the Pixi application and WebGL context, display objects, pools, ticker, listeners, observers, timers and audio loops. The small steady growth is time-based and comes from the mock network layer (the MSW Service Worker keep-alive), not from playing: about 0.5 MB per hour, well within limits. It only exists because the backend is simulated in the browser.

## How to reproduce

```bash
npm run perf
```

The command builds the app, starts the preview server and writes `reports/perf/*.json`. On macOS it uses the Metal GPU (`--use-angle=metal`). Optional environment variables: `PERF_MATCH_SECONDS` (default 180) and `PERF_CYCLE_MS` (play time per memory cycle, default 20000). The live frame statistics of any match are also available with `?debug=1` → `__pirate.perf()` in the console.

## Limitations of these measurements

- Measured in Playwright's headless Chromium with the GPU enabled, not in a visible browser window. The frame pacing matches a 60 Hz display, but a real window adds compositing that is not measured here.
- One reference machine (Apple M1). Mobile devices were not profiled on real hardware. The mobile layout was only exercised through emulation in the E2E suite.
- The stress scenario raises the player's health so the match lasts three minutes; everything else (spawn rate, AI, weapons, effects) uses the normal rules.
- The autopilot fires less than a skilled player (peak 5 cannonballs in flight). Projectile and particle rendering is pooled, so a busier match changes draw counts but not allocations.
- The heap numbers include the mock network layer described above. Chromium's `JSHeapUsedSize` also counts engine metadata, which is why the object-level snapshot diff is the more precise measure.
