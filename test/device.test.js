import assert from "node:assert/strict";
import test from "node:test";
import { detectDevice } from "../src/lib/device.js";

test("Fire TV wins over the generic Android mobile classification", () => {
  const userAgent =
    "Mozilla/5.0 (Linux; Android 9; AFTSSS Build/PS7633.3550N) " +
    "AppleWebKit/537.36 Silk/112.5 Safari/537.36";

  assert.equal(detectDevice({ userAgent }), "fire-tv");
  assert.equal(
    detectDevice({ userAgent: "AmazonWebAppPlatform/3.0 Fire TV" }),
    "fire-tv",
  );
});

test("phones and iPads remain mobile remotes", () => {
  assert.equal(
    detectDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" }),
    "mobile",
  );
  assert.equal(
    detectDevice({
      userAgent: "Mozilla/5.0",
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
    "mobile",
  );
});

test("desktop browsers remain display experiences", () => {
  assert.equal(
    detectDevice({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 0,
    }),
    "desktop",
  );
});
