import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { expect, test, type CDPSession, type Page } from '@playwright/test';

const REPORT_DIR = 'reports/perf';
const MATCH_SECONDS = Number(process.env.PERF_MATCH_SECONDS ?? 180);
const CYCLES = 5;
const CYCLE_PLAY_MS = Number(process.env.PERF_CYCLE_MS ?? 20_000);

interface Sample {
  t: number;
  enemies: number;
  projectiles: number;
  particles: number;
  texts: number;
  ships: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

function environment(page: Page, gpu: string) {
  let cpu = os.cpus()[0]?.model ?? 'unknown';
  try {
    if (process.platform === 'darwin') cpu = execSync('sysctl -n machdep.cpu.brand_string').toString().trim();
  } catch {
    // keep os.cpus() value
  }
  return {
    cpu,
    cores: os.cpus().length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    os: `${os.type()} ${os.release()} (${process.platform}/${process.arch})`,
    browser: `${page.context().browser()?.browserType().name()} ${page.context().browser()?.version()}`,
    gpu,
    viewport: page.viewportSize(),
    deviceScaleFactor: 1,
  };
}

async function gpuName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
}

/** Drives the ship with real keyboard events from inside the page (same path as a player). */
async function startAutopilot(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Ship = { x: number; y: number; rotation: number };
    const w = window as unknown as {
      __pirate: { state(): { player: Ship; enemies: Ship[]; phase: string } | null };
      __autopilot?: number;
    };
    const held = new Set<string>();
    const set = (code: string, down: boolean) => {
      if (down === held.has(code)) return;
      if (down) held.add(code);
      else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    };
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    w.__autopilot = window.setInterval(() => {
      const s = w.__pirate.state();
      if (!s || s.phase !== 'running') return;
      const p = s.player;
      let target: Ship | null = null;
      let best = Infinity;
      for (const e of s.enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < best) {
          best = d;
          target = e;
        }
      }
      set('KeyW', true);
      if (!target) {
        set('KeyA', false);
        set('KeyD', true);
        return;
      }
      const delta = wrap(Math.atan2(target.y - p.y, target.x - p.x) - p.rotation);
      set('KeyD', delta > 0.08);
      set('KeyA', delta < -0.08);
      set('Space', Math.abs(delta) < 0.35);
      set('KeyE', best < 500 && Math.abs(delta - Math.PI / 2) < 0.5);
      set('KeyQ', best < 500 && Math.abs(delta + Math.PI / 2) < 0.5);
    }, 50);
  });
}

/** Collects every requestAnimationFrame interval (independent of the game loop). */
async function startFrameRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __frameRecorder: boolean };
    w.__frames = [];
    w.__frameRecorder = true;
    let last = performance.now();
    const tick = (now: number) => {
      if (!w.__frameRecorder) return;
      w.__frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function heapMetrics(client: CDPSession): Promise<Record<string, number>> {
  await client.send('HeapProfiler.collectGarbage');
  await client.send('HeapProfiler.collectGarbage');
  const { metrics } = await client.send('Performance.getMetrics');
  const pick = ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'JSEventListeners', 'Documents', 'Frames', 'LayoutObjects'];
  return Object.fromEntries(metrics.filter((m) => pick.includes(m.name)).map((m) => [m.name, m.value]));
}

async function setup(page: Page, extra: Record<string, unknown>, options: { sessionTimeSeconds: number; spawnIntervalSeconds: number }) {
  await page.addInitScript(
    ({ extra, options }) => {
      (window as unknown as { __PIRATE_TEST__: unknown }).__PIRATE_TEST__ = { manualClock: false, disableSound: true, seed: 777, ...extra };
      if (!sessionStorage.getItem('__perf_seeded')) {
        sessionStorage.setItem('__perf_seeded', '1');
        localStorage.setItem('pirate-battle:options:v1', JSON.stringify({ ...options, soundEnabled: false }));
      }
    },
    { extra, options },
  );
}

test('three-minute stress match: frame rate, p95 frame time and entities', async ({ page }) => {
  mkdirSync(REPORT_DIR, { recursive: true });
  // Stress profile: fastest spawn rate and a ship that cannot sink, so the arena
  // stays at the enemy cap for the whole match while the autopilot fires constantly.
  await setup(page, { playerMaxHealth: 1_000_000 }, { sessionTimeSeconds: MATCH_SECONDS, spawnIntervalSeconds: 1 });
  await page.goto('/');
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'running', { timeout: 30_000 });
  const gpu = await gpuName(page);
  await startFrameRecorder(page);
  await startAutopilot(page);

  const samples: Sample[] = [];
  const started = Date.now();
  for (;;) {
    await page.waitForTimeout(1000);
    const sample = await page.evaluate(() => {
      const w = window as unknown as {
        __pirate: {
          state(): { time: number; enemies: unknown[]; projectiles: unknown[]; phase: string } | null;
          perf(): { render: { ships: number; projectiles: number; particles: number; texts: number } | null } | null;
        };
      };
      const s = w.__pirate.state();
      const perf = w.__pirate.perf();
      return s
        ? { t: s.time, phase: s.phase, enemies: s.enemies.length, projectiles: s.projectiles.length, particles: perf?.render?.particles ?? 0, texts: perf?.render?.texts ?? 0, ships: perf?.render?.ships ?? 0 }
        : null;
    });
    if (!sample || sample.phase !== 'running') break;
    samples.push(sample);
    if (Date.now() - started > (MATCH_SECONDS + 30) * 1000) break;
  }

  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __frameRecorder: boolean };
    w.__frameRecorder = false;
    return w.__frames.slice(5);
  });
  const sorted = [...frames].sort((a, b) => a - b);
  const total = frames.reduce((sum, f) => sum + f, 0);
  const entities = samples.map((s) => 1 + s.enemies + s.projectiles);
  const result = {
    kind: 'three-minute-match',
    environment: environment(page, gpu),
    config: { sessionTimeSeconds: MATCH_SECONDS, spawnIntervalSeconds: 1, seed: 777, maxAliveEnemies: 10, playerMaxHealth: 1_000_000, build: 'vite build (production)' },
    frames: {
      count: frames.length,
      avgFps: frames.length / (total / 1000),
      avgFrameMs: total / frames.length,
      p50FrameMs: percentile(sorted, 0.5),
      p95FrameMs: percentile(sorted, 0.95),
      p99FrameMs: percentile(sorted, 0.99),
      maxFrameMs: sorted[sorted.length - 1] ?? 0,
      framesOver20ms: frames.filter((f) => f > 20).length,
      framesOver33ms: frames.filter((f) => f > 33.4).length,
    },
    entities: {
      peak: Math.max(...entities),
      average: entities.reduce((a, b) => a + b, 0) / entities.length,
      peakEnemies: Math.max(...samples.map((s) => s.enemies)),
      peakProjectiles: Math.max(...samples.map((s) => s.projectiles)),
      peakParticles: Math.max(...samples.map((s) => s.particles)),
      peakFloatingTexts: Math.max(...samples.map((s) => s.texts)),
    },
    simulatedSeconds: samples[samples.length - 1]?.t ?? 0,
    samples,
  };
  writeFileSync(`${REPORT_DIR}/match-${MATCH_SECONDS}s.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ frames: result.frames, entities: result.entities, env: result.environment }, null, 2));
  expect(frames.length).toBeGreaterThan(MATCH_SECONDS * 20);
});

test('memory after five start / play / exit cycles', async ({ page }) => {
  mkdirSync(REPORT_DIR, { recursive: true });
  await setup(page, { playerMaxHealth: 1_000_000 }, { sessionTimeSeconds: 180, spawnIntervalSeconds: 1 });
  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');
  await page.goto('/');
  await expect(page.getByTestId('menu-play')).toBeVisible();
  const gpu = await gpuName(page);
  // Warm-up cycle: loads and caches textures, decodes sounds, JIT-compiles.
  const cycle = async () => {
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'running', { timeout: 30_000 });
    await startAutopilot(page);
    await page.waitForTimeout(CYCLE_PLAY_MS);
    await page.evaluate(() => {
      const w = window as unknown as { __autopilot?: number };
      if (w.__autopilot) window.clearInterval(w.__autopilot);
      for (const code of ['KeyW', 'KeyA', 'KeyD', 'Space', 'KeyQ', 'KeyE']) window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    });
    await page.getByTestId('hud-pause').click();
    await page.getByTestId('pause-main-menu').click();
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await page.waitForTimeout(1000);
  };
  await cycle();
  const baseline = await heapMetrics(client);
  const perCycle: Record<string, number>[] = [];
  for (let i = 0; i < CYCLES; i++) {
    await cycle();
    perCycle.push({ cycle: i + 1, canvases: await page.locator('canvas').count(), ...(await heapMetrics(client)) });
  }
  const heap = perCycle.map((m) => m.JSHeapUsedSize ?? 0);
  const growthPerCycle = heap.length > 1 ? ((heap[heap.length - 1] ?? 0) - (heap[0] ?? 0)) / (heap.length - 1) : 0;
  const result = {
    kind: 'memory-cycles',
    environment: environment(page, gpu),
    config: { cycles: CYCLES, playMsPerCycle: CYCLE_PLAY_MS, sessionTimeSeconds: 180, spawnIntervalSeconds: 1 },
    baselineAfterWarmup: baseline,
    perCycle,
    heapGrowthPerCycleBytes: growthPerCycle,
  };
  writeFileSync(`${REPORT_DIR}/memory-cycles.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ baseline, perCycle, growthPerCycle }, null, 2));
  for (const m of perCycle) expect(m.canvases).toBe(0);
});
