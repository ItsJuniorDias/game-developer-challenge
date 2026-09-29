# Architecture

This document explains how Pirate Battle is put together and why. For setup, commands, controls and network scenarios, see the [README](README.md).

## 1. Overview

```
┌──────────────────────────── React (menus, forms, dialogs, HUD) ─────────────────────────────┐
│  App (hash router) ─ MainMenu · OptionsScreen · GameScreen · ResultScreen · CaptainsLog     │
│        │                          │                                   │                     │
│        │ useSyncExternalStore     │ creates/destroys                  │ TanStack Query      │
│        ▼                          ▼                                   ▼                     │
│  settings / lastResult /    ┌─────────────┐                     queries · outbox worker     │
│  pending stores (storage)   │ GameSession │◀── InputState ◀── keyboard · joystick · buttons │
└─────────────────────────────┤  (session/) ├─────────────────────────────┬───────────────────┘
                              │  fixed-step │                             │ Axios
                    HudStore ◀┤  clock      │                             ▼
                              └──┬───────┬──┘                   MSW Service Worker (mocks/)
                   steps + intent│       │ world + events        handlers · scenarios · mock DB
                                 ▼       ▼
                        ┌────────────┐ ┌──────────────┐
                        │ Simulation │ │ GameRenderer │ ── PixiJS Application (WebGL)
                        │  (sim/)    │ │  (render/)   │
                        └────────────┘ └──────────────┘
```

Responsibilities are split into four layers that only talk through narrow interfaces:

| Layer | Folder | Knows about | Never touches |
| --- | --- | --- | --- |
| Rules (simulation) | `src/game/sim`, `src/game/config`, `src/game/core` | numbers, entities, events | Pixi, DOM, React, time |
| Rendering | `src/game/render`, `src/game/assets` | Pixi, textures, simulation state (read-only) | rules, React |
| Input | `src/game/input` | DOM key events, an intent object | rules, rendering |
| Interface state | `src/features`, `src/ui`, `src/api`, `src/storage` | React, TanStack Query, localStorage | Pixi objects, per-frame state |

`GameSession` (`src/game/session/gameSession.ts`) is the only place that wires the four layers together for a match.

## 2. React ↔ PixiJS integration

**Loading the combat screen.** The battle route (`app/GameRoute.tsx`) lazy-loads `GameScreen`, so the menus never download PixiJS or the simulation. While that chunk downloads, `focusTracker` records any focus loss, and the session reads it when it starts, so the match still starts paused. If the chunk fails to download, a local error boundary shows the same **Retry** / **Main Menu** overlay as a texture failure and retries the import with a fresh `React.lazy`.

**Ownership.** React owns the page layout, the HUD, the touch controls (joystick and buttons) and every dialog. `GameSession` owns the canvas, the Pixi `Application`, its ticker and the simulation. `GameScreen` mounts an empty `<div>` and hands it to a new `GameSession` inside `useEffect`; the effect cleanup calls `session.destroy()`. A new match is always a new session, so a restart cannot inherit state from the previous one.

**Strict Mode and async init.** Starting a session is asynchronous (textures, then `Application.init`), and Strict Mode mounts, unmounts and remounts the effect. The session is safe to destroy at any point:

- `start()` takes a `loadToken`; if `destroy()` bumps the token or disposes the session while textures load, the pending start returns without creating a renderer.
- `GameRenderer.init()` checks its own `destroyed` flag after `await app.init()` and immediately tears the freshly created `Application` down if it was disposed meanwhile.
- `isDisposed()` is a method (not a getter) on purpose, so TypeScript does not narrow the phase across `await`.

**Layout contract.** `GameScreen` measures the HUD with a `ResizeObserver` and passes its height to `session.setViewportInsets()`. The arena is fitted below that band, so the HUD never covers a ship, while the sea still fills the whole screen.

**UI sync without per-frame React renders.** The session publishes a small `HudState` (`phase`, `score`, `timeLeft` in whole seconds, `health`, `pauseReason`, `endReason`, weapon readiness, load progress) through `HudStore`, an external store consumed with `useSyncExternalStore`. `HudStore.update()` compares every field and only notifies when something visible changed, so React renders a handful of times per second at most (typically once per second for the clock), never per frame. Continuous state (positions, velocities, projectiles, cooldown timers) stays in the simulation.

**React → game.** The touch joystick and buttons write directly into the session's `InputState` (the joystick moves its knob through the DOM, so dragging never re-renders React); the pause dialog calls `session.pause()` / `session.resume()`. React never reads or writes simulation entities.

**Game → React.** Besides `HudStore`, the session calls `onEnd(result)` exactly once. `GameScreen` persists the result and the pending record (`recordFinishedMatch`) before any network call, then shows the end banner.

## 3. Simulation cycle

**Fixed step.** `FixedStepClock` accumulates real frame time (clamped to `maxFrameCatchUpSeconds` = 0.25 s so a long stall cannot trigger a spiral of catch-up steps) and returns how many 1/60 s steps to run. The renderer interpolates between the previous and current transforms of every entity with the leftover `alpha`, so motion is smooth on 120 Hz screens and identical at 30 Hz. Movement, cooldowns, spawns and the match timer are all expressed in simulation seconds and advance only inside `Simulation.step`. The result is independent of the frame rate.

**Manual clock.** With `manualClock` (tests), the ticker is stopped entirely and time only moves through `session.advance(ms)`, which runs `round(ms / step)` steps and optionally draws one frame. The same rules, collisions and rendering code run in both modes.

**Step order** (`Simulation.step`):

1. Store previous transforms (for interpolation).
2. Advance time. The last step is shortened so the effective duration is exactly the configured one.
3. `updatePlayer`: rotation (keys, or joystick target heading), thrust with acceleration/deceleration, weapons (bow + both broadsides, each with its own `readyAt`).
4. `updateEnemies`: Chaser and Shooter steering, Shooter fire.
5. `CollisionSystem`: player vs enemies (rams / separation), enemy vs enemy separation, then islands and arena bounds.
6. `updateProjectiles`: move, bounds, obstacles, hits, then expiry by range or lifetime (`WeaponConfig.range` / `lifetimeSeconds`, whichever comes first). Skipped entirely if a ram just sank the player, and the loop stops as soon as the player sinks: once the player is down, nothing else can hit or score in that step.
7. Compact dead projectiles and enemies out of the arrays.
8. `updateSpawner`, only while the player is alive and before the final step of the match.
9. End check: `defeated` if the player's health is zero, otherwise `time_up` when the clock reaches the duration. Once `status` is `ended`, `step()` returns immediately, so movement, attacks, damage, spawns and scoring all stop.

**Events.** Systems push plain events (`shot`, `projectile_end`, `ship_hit`, `ship_destroyed`, `rammed`, `enemy_spawned`, `score_changed`, `match_ended`…) into a queue that the session drains after each step and forwards to the renderer (visual feedback) and the audio manager. The simulation never calls into presentation code.

**Determinism.** The simulation uses its own seeded PRNG (`core/rng.ts`, mulberry32) and never reads `Math.random` or wall-clock time. The same seed and the same inputs produce the same snapshot (covered by a unit test). Cosmetic randomness (debris, screen shake) uses separate seeded generators in the renderer.

**Damage rules.** `applyDamage` is the single entry point: it ignores dead ships and ended matches, applies damage once, and on death calls `destroyShip`. Only a kill caused by `player_fire` increments the score. When a Shooter sinks, its cannonballs still in flight are removed too (see [Limitations](#11-limitations-and-trade-offs)).

## 4. Collisions and navigation

**Arena.** A 16 × 9 grid of 128-unit tiles (2048 × 1152 world units, 16:9). `src/game/sim/arena.ts` holds the layout shared by the simulation and the renderer. Islands become rounded rectangles inset 8 units to match the visible sand; rocks become circles.

**Signed distance fields.** Every obstacle exposes a signed distance and an outward normal. That gives cheap, exact answers for:

- *Ship vs island/rock/bounds:* the hull is three circles of radius `hitHalfWidth` (26) along the keel, at the stern, centre and bow, so the bow tip (`hitHalfLength` = 50) can neither enter a shore nor leave the arena. `resolveCircle` pushes each circle out along the obstacle normal and clamps it inside the arena, and the ship moves by that correction (up to three passes, for corners between two obstacles). Only the part of the correction pointing against the heading reduces speed: sliding along a shore keeps momentum, sailing head-on into it stops the ship, and pushes from other ships never slow anyone down.
- *Projectile vs island:* a projectile stops as soon as its centre is inside an obstacle.
- *Line of sight:* sphere tracing along the segment, stepping by the distance to the nearest obstacle (at least 4 units). Used for AI steering, Shooter fire decisions and path smoothing.

**Ship vs ship.** Contacts use a circle of radius 30. Player vs Chaser overlap is a ram: the Chaser is destroyed (`cause: 'ram'`, no score) and the player takes `ramDamage`. Player vs Shooter and enemy vs enemy overlaps are separated (`playerPushShare` 0.3 moves the player, 50/50 between enemies). Islands and bounds are resolved last, so a push can never leave a ship inside an island.

**Projectile vs ship.** Hits are tested against an oriented ellipse matching the hull (half-length 50, half-width 26, plus the 5-unit ball radius). A projectile can only hit ships of the opposing faction. It is marked dead on its first hit, so it can never apply damage twice.

**Navigation.** `NavGrid` rasterises the arena into 32-unit cells, blocking any cell where a ship would touch an obstacle or the edge. When an enemy cannot see its target (`hasLineOfSight` with its own radius), it runs A* (8-neighbour, consistent octile heuristic, no corner cutting). The binary heap stores each cell with the priority frozen at push time, and stale entries are skipped when popped, so paths are optimal on the grid (a unit test compares costs with Dijkstra). The path is then smoothed by line of sight, and enemies re-plan every ~0.5 s (staggered by id so they do not all plan on the same step).

**Spawn points.** At start, every walkable cell with extra clearance becomes a candidate. The spawner tries up to 40 random candidates that are at least 700 units from the player and clear of other ships. If none qualifies it falls back to the farthest free point, and skips the spawn if even that is closer than ~495 units. A new enemy faces the player and cannot attack during a 1 s grace period.

## 5. Enemy behaviour

- **Chaser.** Steers toward the player (directly when the lane is clear, otherwise along the A* path). It slows down while turning hard (`minTurnThrottle`) so it rounds islands instead of drifting into them, and rams on contact.
- **Local avoidance (both types).** When another enemy sits in the lane ahead (within `avoidanceLookahead`), the steering heading is biased sideways, harder the closer the blocker is. So a Chaser behind a Shooter that is holding position sails around it instead of pushing into it.
- **Shooter.** Approaches the same way until it has a clear shot within `holdDistance` (380). It then stops and turns its bow toward a lead point: the player's position plus `leadFactor` (70%) × the projectile's travel time × the player's velocity. Between `holdDistance` and `attackRange`, with a clear shot, it keeps closing in while already steering at that lead point, so a player crossing sideways gets shot at. It fires when the target is within `attackRange` (560), the line of fire is clear, its aim is within `aimTolerance` and the cannon is off cooldown.

## 6. Rendering

`GameRenderer` creates a Pixi `Application` sized to the host element. Scene graph:

```
stage
└── world (scaled + centred; the sea sprite is stretched to the screen edges)
    ├── ArenaView       water TilingSprite, shallow halos, island tiles, rocks, plants, border
    ├── effects.under   wakes, splashes, sinking wrecks
    ├── ships           ShipView per ship (hull sprite by colour × damage tier, fire sprites)
    ├── projectiles     pooled cannonball + tracer sprites
    ├── effects.over    muzzle flashes, explosions, debris
    └── health bars     HealthBar per ship (frame + cropped fill from the HUD atlas)
```

- **Damage feedback.** Hull textures switch between the 4 tiers of the sprite set (healthy, damaged, heavily damaged, wreck). Fires appear on damaged hulls, and ships flash red when hit. The screen shakes when the player is hit or rammed. Destroyed ships leave a sinking wreck, an animated explosion (3 frames) and wood debris.
- **Viewport.** `fitWorld()` scales the fixed world into the host while keeping its aspect ratio, and centres it. There are no visible bars: on every resize the water `TilingSprite` is stretched over the whole visible area (plus a margin for screen shake), and its tile offset is compensated so the pattern stays anchored to world space. The playable arena stays the fixed 16:9 rectangle. The renderer resolution follows `devicePixelRatio` (capped at 2) with `autoDensity`, and a `ResizeObserver` refits on any size or DPR change. Gameplay never sees screen pixels: input is intent-based and every rule runs in world units, so bounds and collisions are identical at any size. `screenToWorld()` is available for pointer mapping.
- **One render per frame.** In realtime mode the session updates the scene inside the ticker and Pixi's own ticker hook presents it right after (`render(…, present = false)`). Only manual `advance()` calls present explicitly. The ticker's `minFPS` is set from `maxFrameCatchUpSeconds`, so Pixi does not clamp frame time at 100 ms before the fixed-step clock applies its own 0.25 s limit. Frame statistics use the raw `elapsedMS`.
- **Health bars** sit above their ship, or below it when the ship hugs the top edge of the arena.
- **Pixel density.** Besides the `ResizeObserver`, a `matchMedia('(resolution: …dppx)')` listener re-applies the resolution when the window moves to a display with another scale factor.
- **Cost-conscious choices.** No MSAA (sprites are already filtered) and no world mask. Projectiles and particles are pooled (up to 700 particles). Health-bar fill textures are cropped once per 2% step and shared. With the manual test clock there are no animation frames at all.

## 7. Resource management

| Resource | Lifetime | Released by |
| --- | --- | --- |
| Textures (ship atlas, tile sheet, UI atlas, water) and generated FX textures | App lifetime, shared by every match | kept in Pixi's `Assets` cache and a module-level promise, so the next match starts without downloading |
| Pixi `Application`, WebGL context, display objects, pools | One match | `GameRenderer.destroy()` → `app.destroy({ removeView: true }, { children: true, texture: false })`. Pixi loses the WebGL context explicitly |
| Ticker callback | One match | `ticker.remove()` + `ticker.stop()` |
| Window/document listeners (`keydown`, `keyup`, `blur`, `pagehide`, `visibilitychange`) | While the match is mounted | `detachListeners()` / `keyboard.detach()` |
| `ResizeObserver` | One match | `resizeObserver.disconnect()` |
| Result timer (end banner → result screen) | Until navigation | cleared in the `GameScreen` effect cleanup |
| Audio loops (ocean, sailing) | While a match is mounted | the sailing loop stops on pause and at the end; `sounds.stopAllLoops()` on destroy. A loop whose sample finishes decoding after that is never started (loops are tracked as "wanted") |

**Loading.** `loadGameTextures()` loads the four textures in parallel with progress (shown in the loading overlay) and a 20 s timeout per file. It builds spritesheets from the provided atlases: the ships' Starling XML is converted at runtime, the tile sheet gets computed 128 px frames, and the UI atlas JSON is imported as data so hashed file names still resolve. Concurrent callers share one download and all receive its real progress (a session that joins a load started by a disposed one, as under Strict Mode, still sees accurate percentages). A failure clears the cached promise, so **Retry** downloads again; textures that did load stay cached. Decoding happens on the main thread (`preferWorkers = false`) so network failures surface reliably and go through the same network layer as the rest of the app. Audio is best-effort: samples decode lazily and failures are swallowed, so audio never blocks combat. Mobile browsers only start an `AudioContext` inside a user gesture, and iOS also interrupts it when the app goes to the background. `sounds.installAutoUnlock()` therefore retries the unlock on every activation event (`pointerup`, `touchend`, `click`, `keydown`, `mousedown`) while output is not running. The unlock resumes the context, starts a one-sample silent buffer (required by iOS Safari), and on iOS 17+ sets `navigator.audioSession.type = 'playback'` so the silent switch does not mute the game.

## 8. Input, pause and focus

- **Bindings** use `KeyboardEvent.code`, so they follow physical keys regardless of layout. `InputState` tracks every source separately (`key:KeyW`, `touch:7`…), so releasing one key never cancels an action still held by another key or finger. Moving and firing combine freely.
- **Taps.** A press shorter than one simulation step is buffered until the next step reads it, then dropped.
- **Joystick (touch-first devices).** `PlayerIntent` also carries analog steering: `targetHeading` (world radians, or `null`) and `throttle` (0..1). The joystick converts the stick vector into those values; screen and world share orientation, so the angle maps directly. A dead zone of 18% of the travel is ignored. In the simulation, held turn keys take precedence. Otherwise the bow rotates towards `targetHeading` at the normal `turnSpeed` and the speed approaches `maxSpeed × throttle`, reduced by `steeringMinThrottle` while the bow is still far from the requested heading. The ship keeps its two degrees of freedom (sail forward, turn), so the rules match the keyboard. `InputState.generation` increases on every clear: a finger that stays on the stick through a pause must be lifted before it steers again.
- **Capture scope.** The keyboard controller only handles keys while the match is running and no dialog is open. It ignores editable targets and modifier combinations, calls `preventDefault` only for bound keys, and ignores auto-repeat events.
- **Pause.** Triggered manually (`P`/`Esc`/HUD button) or automatically (`blur`, `pagehide`, hidden tab, portrait orientation on touch devices). Focus listeners are installed before assets load: losing focus during loading makes the match start paused. In the pause dialog `P` only resumes on a fresh press (no auto-repeat, no modifiers), and initial focus goes to the heading. On pause the clock accumulator resets and every held input is cleared. Cooldowns are stored as absolute simulation time, so they freeze with the clock. Resuming needs an explicit action, and since auto-repeat is ignored, a key held through the pause does nothing until it is pressed again.

## 9. Local persistence

All storage goes through `storage/localStore.ts`: versioned keys (`pirate-battle:<name>:v1`), deep validators on every read (`storage/validators.ts`; invalid data falls back to defaults, and a single corrupted record in the mock database or outbox is dropped on its own), and writes that fail silently when storage is unavailable. The outbox and the mock database write with read-modify-write against storage and listen to the `storage` event, so several open tabs never erase each other's entries. A root error boundary shows a recovery screen instead of unmounting the app on an unexpected error. Observable values use a tiny `ExternalStore` read with `useSyncExternalStore`.

| Key | Written when | Read when |
| --- | --- | --- |
| `options:v1` | Options → Save | app start, every new match (snapshot) |
| `profile:v1` | first run (UUID) / captain name saved | registration payloads, "You" highlighting |
| `last-result:v1` | a match ends | result screen (also after refresh) |
| `pending-matches:v1` | a match ends (outbox), status updates | submission worker, banners |
| `mock-db:v1` | mock API confirms a record | mock API queries |
| `mock-scenario:v1` | Network lab or `?scenario=` | mock handlers |

Abandoned matches write nothing: persistence happens only in the `onEnd` callback of a finished match.

## 10. Ranking and match history

**Contracts.** `src/api/contracts.ts` defines the DTOs (`MatchRecordInput`, `MatchRecord`, `RankingPage`, `HistoryPage`, `SubmitMatchResponse`, `ApiErrorBody`), the routes, and the deterministic ranking comparator shared by the mock server: score ↓, effective duration ↓, `playedAt` ↑, `matchId` ↑. Rankings only compare matches with the same `{ sessionTimeSeconds, spawnIntervalSeconds }`.

**HTTP.** One Axios instance (`api/http.ts`) sets the timeout per request (env or test override) and maps every failure to an `ApiError` with a `kind` (`timeout`, `network`, `http`, `canceled`, `unknown`), a status and a `retryable` flag (timeouts, network errors, 5xx, 408, 429).

**Queries** (`api/queries.ts`):
- Keys: `['captains-log', 'ranking', sessionTime, spawnInterval, page]` and `['captains-log', 'history', playerId, page]`.
- `queryFn` passes TanStack's `AbortSignal` to Axios, so superseded requests are cancelled.
- `keepNewest()` compares the server `revision` of the incoming page with the cached one and keeps the newer data. Together with per-key caching and cancellation, a late response can never overwrite newer data.
- `placeholderData` keeps the previous page on screen only when the key prefix (configuration or player) is the same, so pagination is smooth but a different configuration never shows another configuration's rows. A background "Updating…" state is exposed.
- `refetchOnMount: 'always'` refreshes a tab every time it is shown again. `staleTime` is 15 s, and window focus and reconnect also refetch.
- Retries only happen for retryable errors (up to 2, exponential backoff capped at 5 s). 4xx errors fail fast.
- The UI distinguishes first load (skeleton), empty (message), error without data (alert + "Try again"), and error with cached data ("Showing saved results" + retry).

**Registration and pending records** (`api/matchSubmission.ts`, `api/pendingMatches.ts`):

```
match ends ─▶ recordFinishedMatch()
               ├─ lastResult.set({ result, saved: false })      (localStorage)
               └─ pendingMatches.enqueue(input)                 (localStorage outbox, deduped by matchId)
                        │
useMatchSubmissionWorker (mounted once at the app root)
  effect over the outbox ─▶ for each 'pending' entry not in flight ─▶ useMutation(submitMatch)
      onMutate  → attempts + 1
      onSuccess → remove from outbox, lastResult.saved = true, invalidate ranking + history
      onError   → 'rejected' for 400/409/413/422 (the record itself is invalid), otherwise 'failed', with the message and HTTP status
  'failed' entries go back to 'pending' every 15 s, on `online`, and when the network scenario changes;
  on app start every stored entry (rejected included) goes back to 'pending'
  "Retry" buttons mark an entry 'pending' again (manual retry also works for 'rejected')
```

- **No duplicates.** `matchId` is created on the client when the match ends and sent as both the body id and the `Idempotency-Key`. The server stores it once and answers replays with `200 { created: false }` and the stored record, so a timeout after commit, a refresh during a request or repeated clicks all converge to one record. On the client, a synchronous in-flight `Set` stops the same id from being sent twice concurrently (Strict Mode, rapid clicks).
- **Survives refresh.** The outbox lives in `localStorage`, and the worker resumes pending entries on the next load. Starting a new match never waits for the outbox.
- **Status on screen.** `useSubmissionState()` combines the outbox with the live mutation state (`useMutationState`) into `sending`, `pending`, `failed`, `rejected` or `saved` for the result screen and banners.

**Mock server** (`src/mocks`). The handlers implement the same contracts over a mock database persisted in `localStorage`, bump a monotonic `revision` on every write, validate payloads (`422`), and return `409` for a conflicting reuse of a `matchId`. A reset increments an epoch; a registration that was in flight during a reset is refused (`503`) instead of re-inserting its record. Response bodies are computed when the request arrives and only then delayed, so a slow response realistically carries an older revision. Scenarios (see README) are selected at runtime, and latency and generated data come from a seeded PRNG. The worker also starts in the production build (`public/mockServiceWorker.js`). If it fails to register, the app still works and the API panels show their error states.

**Keeping the mock server attached.** MSW's worker only answers pages listed in its in-memory `activeClientIds`. A browser that stops and restarts an idle worker empties that list, and requests then go to the hosting server (on Vercel, `404` for `/api/*`). Two safeguards handle this. First, `ensureMockClient()` runs in an Axios request interceptor: it posts `MOCK_ACTIVATE` to the controlling worker and waits for `MOCKING_ENABLED` (cached for 1 s), and re-registers the worker if it unregistered itself. Second, every mocked response carries `x-pirate-mock`: a response without it is converted into a retryable network error, so the outbox keeps the record and sends it again later.

## 11. Limitations and trade-offs

- **Ranking granularity.** Rankings list matches, not each player's best, which matches "one ranking entry per finished match".
- **In-flight cannonballs.** They are removed when their Shooter sinks. This keeps "destroyed enemies no longer deal damage" strict, at the cost of some realism.
- **Spawn cap.** Spawns are skipped while 10 enemies are alive, so the interval is honoured but the arena never becomes unreadable. The skipped slot is not queued.
- **HUD band.** The arena is fitted below the HUD, which makes it about 9% smaller at 16:9 than a full-height fit, in exchange for never hiding a ship.
- **Headless rendering.** In headless Chromium WebGL runs on the CPU, so gameplay tests use the manual clock and the suite runs with limited parallelism. Profiling must run in a real browser (see the performance report).
- **Mock scope.** The mock API is per browser (`localStorage`). "Other players" are fixtures.

## 12. Balancing decisions

All gameplay numbers, including enemy acceleration, aim lead, AI and collision tuning, live in `BASE_GAME_CONFIG` and are only read through the frozen per-match snapshot. They were tuned with a headless bot (`npm run balance`). The default 120 s / 3 s match averages about 28 points for a naive bot, which usually sinks between 46 s and 117 s. The easy 60 s / 10 s configuration is always survived, and the hard 180 s / 1 s one never is. The main changes from the first version made rams and Shooter fire less punishing and capped living enemies at 10; the README has the full table.
