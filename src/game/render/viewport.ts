import type { Vec2 } from '../core/math';

export interface ViewportFit {
  scale: number;
  offsetX: number;
  offsetY: number;
  screenWidth: number;
  screenHeight: number;
}

export interface ViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: ViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Fits a fixed-size world into the screen area left free by the insets (e.g.
 * the HUD band), preserving its aspect ratio and centring it. All gameplay
 * happens in world units, so input and bounds never depend on the canvas size
 * or pixel density.
 */
export function fitWorld(
  worldWidth: number,
  worldHeight: number,
  screenWidth: number,
  screenHeight: number,
  insets: ViewportInsets = NO_INSETS,
): ViewportFit {
  const availableWidth = Math.max(1, screenWidth - insets.left - insets.right);
  const availableHeight = Math.max(1, screenHeight - insets.top - insets.bottom);
  const scale = Math.max(0.0001, Math.min(availableWidth / worldWidth, availableHeight / worldHeight));
  return {
    scale,
    offsetX: insets.left + (availableWidth - worldWidth * scale) / 2,
    offsetY: insets.top + (availableHeight - worldHeight * scale) / 2,
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
