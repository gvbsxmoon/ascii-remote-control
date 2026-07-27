import assert from "node:assert/strict";
import test from "node:test";
import {
  smoothMotionAxis,
  tiltToTarget,
} from "../src/lib/remoteMotion.js";

test("small orientation noise stays inside the center dead zone", () => {
  assert.deepEqual(tiltToTarget(1, -1), { x: 0.5, y: 0.5 });
});

test("motion smoothing caps sudden cursor jumps", () => {
  const next = smoothMotionAxis(0.5, 1, 1_000 / 60);
  assert.ok(next > 0.5);
  assert.ok(next <= 0.52);

  const afterPause = smoothMotionAxis(0.5, 1, 5_000);
  assert.ok(afterPause <= 0.62);
});

test("tilt mapping remains responsive across the useful range", () => {
  const target = tiltToTarget(30, -35);
  assert.ok(target.x > 0.88 && target.x < 0.92);
  assert.ok(target.y > 0.08 && target.y < 0.12);
});
