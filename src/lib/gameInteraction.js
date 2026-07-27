export const PROXIMITY_DISTANCE = 145;
export const GRAB_DISTANCE = 96;
export const EXTRACTION_DISTANCE = 64;

export function getProximityStrength(distance) {
  return Math.max(0, Math.min(1, 1 - distance / PROXIMITY_DISTANCE));
}

export function isBugInGrabRange(distance) {
  return distance <= GRAB_DISTANCE;
}

export function hasExtractedBug(startX, startY, currentX, currentY) {
  return (
    Math.hypot(currentX - startX, currentY - startY) >= EXTRACTION_DISTANCE
  );
}
