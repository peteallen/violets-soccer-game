export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const lerp = (start, end, amount) => start + (end - start) * amount;

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export const normalize = (x, y) => {
  const length = Math.hypot(x, y);
  if (length < 0.0001) return { x: 0, y: 0, length: 0 };
  return { x: x / length, y: y / length, length };
};

export const angleDelta = (from, to) => {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};

export const moveTowards = (value, target, maxDelta) => {
  if (Math.abs(target - value) <= maxDelta) return target;
  return value + Math.sign(target - value) * maxDelta;
};

export const seededRandom = (seed = 1) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
