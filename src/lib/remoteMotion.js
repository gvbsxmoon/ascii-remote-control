const DEAD_ZONE_DEGREES = 1.25;
const HORIZONTAL_RANGE = 72;
const VERTICAL_RANGE = 84;
const FOLLOW_RATE = 7;
const MAX_NORMALIZED_SPEED = 1.2;

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

function applyDeadZone(value) {
  const magnitude = Math.abs(value);
  if (magnitude <= DEAD_ZONE_DEGREES) return 0;
  return Math.sign(value) * (magnitude - DEAD_ZONE_DEGREES);
}

export function tiltToTarget(horizontal, vertical) {
  return {
    x: clamp(0.5 + applyDeadZone(horizontal) / HORIZONTAL_RANGE, 0, 1),
    y: clamp(0.5 + applyDeadZone(vertical) / VERTICAL_RANGE, 0, 1),
  };
}

export function smoothMotionAxis(current, target, elapsedMilliseconds) {
  const elapsed = clamp(
    Number(elapsedMilliseconds) / 1_000 || 1 / 60,
    1 / 120,
    0.1,
  );
  const follow = 1 - Math.exp(-FOLLOW_RATE * elapsed);
  const maximumStep = MAX_NORMALIZED_SPEED * elapsed;
  const step = clamp(
    (target - current) * follow,
    -maximumStep,
    maximumStep,
  );
  return clamp(current + step, 0, 1);
}
