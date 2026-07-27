import assert from "node:assert/strict";
import test from "node:test";
import {
  EXTRACTION_DISTANCE,
  getProximityStrength,
  GRAB_DISTANCE,
  hasExtractedBug,
  isBugInGrabRange,
  PROXIMITY_DISTANCE,
} from "../src/lib/gameInteraction.js";

test("proximity feedback begins before the stricter grab range", () => {
  assert.equal(PROXIMITY_DISTANCE, 145);
  assert.equal(GRAB_DISTANCE, 96);
  assert.equal(getProximityStrength(PROXIMITY_DISTANCE), 0);
  assert.ok(getProximityStrength(GRAB_DISTANCE) > 0);
  assert.equal(isBugInGrabRange(GRAB_DISTANCE), true);
  assert.equal(isBugInGrabRange(GRAB_DISTANCE + 1), false);
});

test("a captured bug must move before release to count", () => {
  assert.equal(EXTRACTION_DISTANCE, 64);
  assert.equal(hasExtractedBug(100, 100, 140, 130), false);
  assert.equal(hasExtractedBug(100, 100, 164, 100), true);
});
