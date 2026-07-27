import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXES_PER_LEVEL,
  getLevelProfile,
  getSpawnBatchSize,
  getSpawnDelay,
  LEVEL_PROFILES,
  MAX_LEVEL,
} from "../src/lib/gameDifficulty.js";

test("difficulty curve has ten bounded, increasingly difficult levels", () => {
  assert.equal(LEVEL_PROFILES.length, 10);
  assert.equal(MAX_LEVEL, 10);
  assert.equal(FIXES_PER_LEVEL, 3);
  assert.deepEqual(
    {
      lifetime: getLevelProfile(1).bugLifetime,
      spawn: getLevelProfile(1).spawnInterval,
      penalty: getLevelProfile(1).missPenalty,
    },
    { lifetime: 5_000, spawn: 2_800, penalty: 100 },
  );
  assert.deepEqual(
    {
      lifetime: getLevelProfile(10).bugLifetime,
      spawn: getLevelProfile(10).spawnInterval,
      penalty: getLevelProfile(10).missPenalty,
    },
    { lifetime: 3_000, spawn: 650, penalty: 280 },
  );

  LEVEL_PROFILES.slice(1).forEach((profile, index) => {
    const previous = LEVEL_PROFILES[index];
    assert.ok(profile.bugLifetime <= previous.bugLifetime);
    assert.ok(profile.spawnInterval <= previous.spawnInterval);
    assert.ok(profile.maxConcurrent >= previous.maxConcurrent);
    assert.ok(profile.burstChance >= previous.burstChance);
    assert.equal(profile.missPenalty, previous.missPenalty + 20);
  });
});

test("out-of-range level requests clamp to the playable range", () => {
  assert.equal(getLevelProfile(0), LEVEL_PROFILES[0]);
  assert.equal(getLevelProfile(999), LEVEL_PROFILES[MAX_LEVEL - 1]);
});

test("late levels add jittered cadence and controlled two-bug bursts", () => {
  const first = getLevelProfile(1);
  const last = getLevelProfile(10);

  assert.equal(first.maxConcurrent, 1);
  assert.equal(first.burstChance, 0);
  assert.equal(last.maxConcurrent, 6);
  assert.equal(last.burstChance, 0.48);
  assert.equal(getSpawnDelay(last, 0), 500);
  assert.equal(getSpawnDelay(last, 1), 750);
  assert.equal(getSpawnBatchSize(first, 3, 0), 1);
  assert.equal(getSpawnBatchSize(last, 3, 0), 2);
  assert.equal(getSpawnBatchSize(last, 1, 0), 1);
});
