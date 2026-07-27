export const MAX_LEVEL = 10;
export const FIXES_PER_LEVEL = 3;
export const MAX_MISSES = 5;

const CURVE_STRENGTH = 2;
const MAX_BUG_LIFETIME = 5_000;
const MIN_BUG_LIFETIME = 3_000;
const MAX_SPAWN_INTERVAL = 2_800;
const MIN_SPAWN_INTERVAL = 650;
const MAX_BURST_CHANCE = 0.48;
const MIN_SPAWN_JITTER = 0.8;
const MAX_SPAWN_JITTER = 1.12;

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
    50,
  );

  return Object.freeze({
    level,
    bugLifetime: roundTo(
      interpolate(MAX_BUG_LIFETIME, MIN_BUG_LIFETIME, difficulty),
      100,
    ),
    spawnInterval,
    maxConcurrent: Math.min(6, 1 + Math.ceil(index / 2)),
    burstChance: roundTo(difficulty * MAX_BURST_CHANCE, 0.01),
    missPenalty: 100 + index * 20,
    captureReward: 100 + index * 20,
    successDelay: roundTo(Math.max(320, spawnInterval * 0.32), 50),
    missRecoveryDelay: roundTo(Math.max(250, spawnInterval * 0.2), 50),
  });
});

export function getLevelProfile(level) {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  return LEVEL_PROFILES[safeLevel - 1];
}

export function getSpawnDelay(profile, randomValue = Math.random()) {
  const normalizedRandom = Math.max(0, Math.min(1, randomValue));
  const jitter = interpolate(
    MIN_SPAWN_JITTER,
    MAX_SPAWN_JITTER,
    normalizedRandom,
  );
  return roundTo(profile.spawnInterval * jitter, 50);
}

export function getSpawnBatchSize(
  profile,
  availableSlots,
  randomValue = Math.random(),
) {
  if (availableSlots <= 0) return 0;
  const burst = randomValue < profile.burstChance ? 2 : 1;
  return Math.min(availableSlots, burst);
}
