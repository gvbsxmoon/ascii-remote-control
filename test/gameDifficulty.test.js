import assert from "node:assert/strict";
import test from "node:test";
import {
  getLevelProfile,
  LEVEL_PROFILES,
  MAX_LEVEL,
} from "../src/lib/gameDifficulty.js";

test("difficulty curve has ten bounded, increasingly difficult levels", () => {
  assert.equal(LEVEL_PROFILES.length, 10);
  assert.equal(MAX_LEVEL, 10);
  assert.deepEqual(
    {
      lifetime: getLevelProfile(1).bugLifetime,
      spawn: getLevelProfile(1).spawnInterval,
      penalty: getLevelProfile(1).missPenalty,
    },
    { lifetime: 5_800, spawn: 3_200, penalty: 100 },
  );
  assert.deepEqual(
    {
      lifetime: getLevelProfile(10).bugLifetime,
      spawn: getLevelProfile(10).spawnInterval,
      penalty: getLevelProfile(10).missPenalty,
    },
    { lifetime: 3_800, spawn: 1_300, penalty: 280 },
  );

  LEVEL_PROFILES.slice(1).forEach((profile, index) => {
    const previous = LEVEL_PROFILES[index];
    assert.ok(profile.bugLifetime <= previous.bugLifetime);
    assert.ok(profile.spawnInterval <= previous.spawnInterval);
    assert.ok(profile.maxConcurrent >= previous.maxConcurrent);
    assert.equal(profile.missPenalty, previous.missPenalty + 20);
  });
});

test("out-of-range level requests clamp to the playable range", () => {
  assert.equal(getLevelProfile(0), LEVEL_PROFILES[0]);
  assert.equal(getLevelProfile(999), LEVEL_PROFILES[MAX_LEVEL - 1]);
});
