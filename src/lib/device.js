const FIRE_TV_PATTERN =
  /(?:\bAFT[A-Z0-9]*\b|Fire[\s/-]?TV|AmazonWebAppPlatform)/i;
const MOBILE_PATTERN = /Android|iPhone|iPad|iPod|Mobile/i;

export function detectDevice({
  userAgent = "",
  platform = "",
  maxTouchPoints = 0,
} = {}) {
  if (FIRE_TV_PATTERN.test(userAgent)) return "fire-tv";

  const iPadDesktopMode = platform === "MacIntel" && maxTouchPoints > 1;
  if (MOBILE_PATTERN.test(userAgent) || iPadDesktopMode) return "mobile";

  return "desktop";
}
