export const MAX_LEVEL = 10;
export const FIXES_PER_LEVEL = 5;
export const MAX_MISSES = 5;

const CURVE_STRENGTH = 2;
const MAX_BUG_LIFETIME = 5_800;
const MIN_BUG_LIFETIME = 3_800;
const MAX_SPAWN_INTERVAL = 3_200;
const MIN_SPAWN_INTERVAL = 1_300;

function interpolate(start, end, progress) {
  return start + (end - start) * progress;
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function exponentialProgress(level) {
  const progress = (level - 1) / (MAX_LEVEL - 1);
  const maximum = Math.exp(CURVE_STRENGTH) - 1;
  return (Math.exp(CURVE_STRENGTH * progress) - 1) / maximum;
}

export const LEVEL_PROFILES = Array.from({ length: MAX_LEVEL }, (_, index) => {
  const level = index + 1;
  const difficulty = exponentialProgress(level);
  const spawnInterval = roundTo(
    interpolate(MAX_SPAWN_INTERVAL, MIN_SPAWN_INTERVAL, difficulty),
    100,
  );

  return Object.freeze({
    level,
    bugLifetime: roundTo(
      interpolate(MAX_BUG_LIFETIME, MIN_BUG_LIFETIME, difficulty),
      100,
    ),
    spawnInterval,
    maxConcurrent: Math.min(4, 1 + Math.ceil(index / 3)),
    missPenalty: 100 + index * 20,
    captureReward: 100 + index * 20,
    successDelay: roundTo(Math.max(550, spawnInterval * 0.4), 50),
    missRecoveryDelay: roundTo(Math.max(400, spawnInterval * 0.24), 50),
  });
});

export function getLevelProfile(level) {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  return LEVEL_PROFILES[safeLevel - 1];
}
