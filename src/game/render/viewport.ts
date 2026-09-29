import type { Vec2 } from '../core/math';

export interface ViewportFit {
  scale: number;
  offsetX: number;
  offsetY: number;
  screenWidth: number;
  screenHeight: number;
}

/**
 * Letterboxes a fixed-size world into the screen while preserving its aspect
 * ratio. All gameplay happens in world units, so input and bounds never
 * depend on the canvas size or pixel density.
 */
export function fitWorld(worldWidth: number, worldHeight: number, screenWidth: number, screenHeight: number): ViewportFit {
  const scale = Math.max(0.0001, Math.min(screenWidth / worldWidth, screenHeight / worldHeight));
  return {
    scale,
    offsetX: (screenWidth - worldWidth * scale) / 2,
    offsetY: (screenHeight - worldHeight * scale) / 2,
    screenWidth,
    screenHeight,
  };
}

export function screenToWorld(fit: ViewportFit, x: number, y: number): Vec2 {
  return { x: (x - fit.offsetX) / fit.scale, y: (y - fit.offsetY) / fit.scale };
}

export function worldToScreen(fit: ViewportFit, x: number, y: number): Vec2 {
  return { x: x * fit.scale + fit.offsetX, y: y * fit.scale + fit.offsetY };
}
