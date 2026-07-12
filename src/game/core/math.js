export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const lerp = (start, end, amount) => start + (end - start) * amount;

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

