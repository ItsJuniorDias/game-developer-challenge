import { it } from 'vitest';
import { createMatchConfig } from '../src/game/config/gameConfig';
import { angleDelta } from '../src/game/core/math';
import { Simulation } from '../src/game/sim/simulation';
import type { PlayerIntent } from '../src/game/sim/types';

/** Simple heuristic captain used to sanity-check balancing numbers. */
function bot(sim: Simulation): PlayerIntent {
  const w = sim.world;
  const p = w.player;
  let target = null as null | { x: number; y: number; d: number };
  for (const e of w.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (!target || d < target.d) target = { x: e.x, y: e.y, d };
  }
  const intent: PlayerIntent = { forward: true, turnLeft: false, turnRight: false, fireFront: false, fireLeft: false, fireRight: false };
  if (!target) return intent;
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
  const delta = angleDelta(p.rotation, angle);
  if (delta > 0.05) intent.turnRight = true;
  else if (delta < -0.05) intent.turnLeft = true;
  if (Math.abs(delta) < 0.2 && target.d < 700) intent.fireFront = true;
  if (target.d < 450 && Math.abs(Math.abs(delta) - Math.PI / 2) < 0.35) {
    if (delta > 0) intent.fireRight = true;
    else intent.fireLeft = true;
  }
  intent.forward = target.d > 250;
  return intent;
}

it.skipIf(!process.env.BALANCE)('balance report', () => {
  for (const [duration, interval] of [
    [120, 3],
    [180, 1],
    [60, 10],
  ] as const) {
    const rows: string[] = [];
    let scoreSum = 0;
    let survived = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const sim = new Simulation({ config: createMatchConfig({ sessionTimeSeconds: duration, spawnIntervalSeconds: interval }), seed });
      while (sim.world.status === 'running') sim.step(1 / 60, bot(sim));
      scoreSum += sim.world.score;
      if (sim.world.endReason === 'time_up') survived++;
      rows.push(`${sim.world.endReason}@${sim.world.time.toFixed(0)}s:${sim.world.score}`);
    }
    process.stdout.write(`${duration}s/${interval}s  avgScore=${(scoreSum / 12).toFixed(1)} survived=${survived}/12  ${rows.join(' ')}\n`);
  }
});
