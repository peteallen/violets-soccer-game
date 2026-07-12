const TAU = Math.PI * 2;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const lerp = (start, end, amount) => start + (end - start) * amount;

function buildGeometry({ goalX, centerY, goalWidth, goalDepth, side }) {
  const outward = side === 'right' ? 1 : -1;
  const mouthHalf = goalWidth / 2;
  const backInset = Math.min(mouthHalf * 0.22, Math.max(7, goalDepth * 0.38));
  const backHalf = Math.max(mouthHalf * 0.68, mouthHalf - backInset);

  return {
    goalX,
    centerY,
    goalWidth,
    goalDepth,
    outward,
    mouthHalf,
    backHalf,
    backX: goalX + outward * goalDepth,
    mouthTop: centerY - mouthHalf,
    mouthBottom: centerY + mouthHalf,
    backTop: centerY - backHalf,
    backBottom: centerY + backHalf,
  };
}

function pocketPoint(geometry, depthAmount, widthAmount, time = 0, rippleStrength = 0) {
  const depth = clamp(depthAmount, 0, 1);
  const width = clamp(widthAmount, 0, 1);
  const halfWidth = lerp(geometry.mouthHalf, geometry.backHalf, depth);
  let x = geometry.goalX + geometry.outward * geometry.goalDepth * depth;
  let y = geometry.centerY + (width * 2 - 1) * halfWidth;

  // All four edges stay firmly tied to the frame. Only the loose middle of
  // the net moves, so even a strong goal celebration cannot bend the posts.
  const anchoredRipple = Math.sin(Math.PI * depth) * Math.sin(Math.PI * width);
  if (rippleStrength > 0 && anchoredRipple > 0) {
    const amplitude = Math.min(4, Math.max(1.2, geometry.goalDepth * 0.06)) * rippleStrength;
    const wave = time * 19 - depth * 8.5 + width * TAU * 1.35;
    x += geometry.outward * Math.sin(wave) * amplitude * anchoredRipple;
    y += Math.cos(wave * 0.82) * amplitude * 0.42 * anchoredRipple;
  }

  return { x, y };
}

function tracePocket(ctx, geometry, offsetX = 0, offsetY = 0) {
  ctx.beginPath();
  ctx.moveTo(geometry.goalX + offsetX, geometry.mouthTop + offsetY);
  ctx.lineTo(geometry.backX + offsetX, geometry.backTop + offsetY);
  ctx.lineTo(geometry.backX + offsetX, geometry.backBottom + offsetY);
  ctx.lineTo(geometry.goalX + offsetX, geometry.mouthBottom + offsetY);
  ctx.closePath();
}

function tracePolyline(ctx, points) {
  if (points.length === 0) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }
}

function drawPocketShadow(ctx, geometry) {
  const shadowX = geometry.outward * 4;
  const shadowY = 5;

  ctx.save();
  ctx.fillStyle = 'rgba(2, 20, 35, 0.32)';
  tracePocket(ctx, geometry, shadowX, shadowY);
  ctx.fill();

  ctx.strokeStyle = 'rgba(2, 18, 30, 0.26)';
  ctx.lineWidth = 9;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(geometry.goalX + shadowX, geometry.mouthTop + shadowY);
  ctx.lineTo(geometry.backX + shadowX, geometry.backTop + shadowY);
  ctx.lineTo(geometry.backX + shadowX, geometry.backBottom + shadowY);
  ctx.lineTo(geometry.goalX + shadowX, geometry.mouthBottom + shadowY);
  ctx.stroke();
  ctx.restore();
}

function drawNetFloor(ctx, geometry) {
  let floorFill = 'rgba(222, 242, 250, 0.17)';
  if (typeof ctx.createLinearGradient === 'function') {
    const floorGradient = ctx.createLinearGradient(
      geometry.goalX,
      geometry.centerY,
      geometry.backX,
      geometry.centerY,
    );
    floorGradient.addColorStop(0, 'rgba(248, 253, 255, 0.07)');
    floorGradient.addColorStop(0.58, 'rgba(225, 244, 252, 0.16)');
    floorGradient.addColorStop(1, 'rgba(194, 225, 239, 0.29)');
    floorFill = floorGradient;
  }

  ctx.fillStyle = floorFill;
  tracePocket(ctx, geometry);
  ctx.fill();

  // A narrow cool strip at the back gives the pocket visible depth even over
  // a very dark stadium background.
  const backBandDepth = Math.min(8, geometry.goalDepth * 0.18);
  const backBandX = geometry.backX - geometry.outward * backBandDepth;
  ctx.fillStyle = 'rgba(173, 211, 228, 0.13)';
  ctx.beginPath();
  ctx.moveTo(backBandX, geometry.backTop - 1.5);
  ctx.lineTo(geometry.backX, geometry.backTop);
  ctx.lineTo(geometry.backX, geometry.backBottom);
  ctx.lineTo(backBandX, geometry.backBottom + 1.5);
  ctx.closePath();
  ctx.fill();
}

function traceSquareMesh(ctx, geometry, time, rippleStrength) {
  const depthCells = clamp(Math.round(geometry.goalDepth / 10), 4, 8);
  const widthCells = clamp(Math.round(geometry.goalWidth / 14), 9, 18);
  const curveSteps = depthCells * 2;

  ctx.beginPath();

  // Threads running from the goal mouth into the pocket.
  for (let widthIndex = 1; widthIndex < widthCells; widthIndex += 1) {
    const width = widthIndex / widthCells;
    const points = [];
    for (let step = 0; step <= curveSteps; step += 1) {
      points.push(pocketPoint(geometry, step / curveSteps, width, time, rippleStrength));
    }
    tracePolyline(ctx, points);
  }

  // Cross threads follow the narrowing perspective of the back of the net.
  for (let depthIndex = 1; depthIndex < depthCells; depthIndex += 1) {
    const depth = depthIndex / depthCells;
    const points = [];
    for (let step = 0; step <= widthCells; step += 1) {
      points.push(pocketPoint(geometry, depth, step / widthCells, time, rippleStrength));
    }
    tracePolyline(ctx, points);
  }
}

function traceDiagonalWeave(ctx, geometry, time, rippleStrength) {
  const depthCells = clamp(Math.round(geometry.goalDepth / 10), 4, 8);
  const widthCells = clamp(Math.round(geometry.goalWidth / 14), 9, 18);

  ctx.beginPath();
  for (let depthIndex = 0; depthIndex < depthCells; depthIndex += 1) {
    const depthStart = depthIndex / depthCells;
    const depthEnd = (depthIndex + 1) / depthCells;
    for (let widthIndex = 0; widthIndex < widthCells; widthIndex += 1) {
      // Alternating diagonals are enough to make the net look woven without
      // turning the small goal into an opaque checkerboard.
      if ((depthIndex + widthIndex) % 2 !== 0) continue;
      const widthStart = widthIndex / widthCells;
      const widthEnd = (widthIndex + 1) / widthCells;
      const rising = (depthIndex + Math.floor(widthIndex / 2)) % 2 === 0;
      const from = pocketPoint(
        geometry,
        depthStart,
        rising ? widthStart : widthEnd,
        time,
        rippleStrength,
      );
      const to = pocketPoint(
        geometry,
        depthEnd,
        rising ? widthEnd : widthStart,
        time,
        rippleStrength,
      );
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
  }
}

function drawMesh(ctx, geometry, time, rippleStrength) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  traceSquareMesh(ctx, geometry, time, rippleStrength);
  ctx.strokeStyle = 'rgba(7, 39, 61, 0.42)';
  ctx.lineWidth = 2.45;
  ctx.stroke();

  traceSquareMesh(ctx, geometry, time, rippleStrength);
  ctx.strokeStyle = 'rgba(246, 252, 255, 0.72)';
  ctx.lineWidth = 1.15;
  ctx.stroke();

  traceDiagonalWeave(ctx, geometry, time, rippleStrength);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
  ctx.lineWidth = 0.85;
  ctx.stroke();
  ctx.restore();
}

function tracePocketFrame(ctx, geometry) {
  ctx.beginPath();
  ctx.moveTo(geometry.goalX, geometry.mouthTop);
  ctx.lineTo(geometry.backX, geometry.backTop);
  ctx.lineTo(geometry.backX, geometry.backBottom);
  ctx.lineTo(geometry.goalX, geometry.mouthBottom);
}

function drawPocketFrame(ctx, geometry) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  tracePocketFrame(ctx, geometry);
  ctx.strokeStyle = 'rgba(5, 34, 53, 0.58)';
  ctx.lineWidth = 8;
  ctx.stroke();

  tracePocketFrame(ctx, geometry);
  ctx.strokeStyle = 'rgba(221, 239, 247, 0.96)';
  ctx.lineWidth = 4.8;
  ctx.stroke();

  tracePocketFrame(ctx, geometry);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  for (const y of [geometry.backTop, geometry.backBottom]) {
    ctx.fillStyle = '#eff8fb';
    ctx.strokeStyle = 'rgba(31, 66, 83, 0.72)';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(geometry.backX, y, 4.5, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawPostCap(ctx, x, y, outward) {
  ctx.save();

  ctx.fillStyle = 'rgba(3, 25, 42, 0.42)';
  ctx.beginPath();
  ctx.ellipse(x + outward * 2.8, y + 3, 10.2, 9.2, 0, 0, TAU);
  ctx.fill();

  let postFill = '#eef7fa';
  if (typeof ctx.createRadialGradient === 'function') {
    const postGradient = ctx.createRadialGradient(
      x - outward * 2.4,
      y - 2.8,
      0.8,
      x,
      y,
      10,
    );
    postGradient.addColorStop(0, '#ffffff');
    postGradient.addColorStop(0.56, '#f5fbfd');
    postGradient.addColorStop(1, '#b8ced8');
    postFill = postGradient;
  }

  ctx.fillStyle = postFill;
  ctx.strokeStyle = '#496779';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(x, y, 9.1, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.beginPath();
  ctx.ellipse(x - outward * 2.4, y - 2.8, 3.3, 2.5, -0.35 * outward, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawFrontFrame(ctx, geometry) {
  ctx.save();
  ctx.lineCap = 'round';

  // The shadow falls into the net pocket, visually lifting the crossbar above
  // the field and making its vertical-on-screen silhouette unmistakable.
  ctx.strokeStyle = 'rgba(3, 25, 42, 0.5)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(geometry.goalX + geometry.outward * 2.8, geometry.mouthTop + 2.5);
  ctx.lineTo(geometry.goalX + geometry.outward * 2.8, geometry.mouthBottom + 2.5);
  ctx.stroke();

  ctx.strokeStyle = '#b8ced8';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(geometry.goalX, geometry.mouthTop);
  ctx.lineTo(geometry.goalX, geometry.mouthBottom);
  ctx.stroke();

  ctx.strokeStyle = '#fbfefd';
  ctx.lineWidth = 7.8;
  ctx.beginPath();
  ctx.moveTo(geometry.goalX, geometry.mouthTop);
  ctx.lineTo(geometry.goalX, geometry.mouthBottom);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(geometry.goalX - geometry.outward * 1.8, geometry.mouthTop + 4);
  ctx.lineTo(geometry.goalX - geometry.outward * 1.8, geometry.mouthBottom - 4);
  ctx.stroke();

  drawPostCap(ctx, geometry.goalX, geometry.mouthTop, geometry.outward);
  drawPostCap(ctx, geometry.goalX, geometry.mouthBottom, geometry.outward);
  ctx.restore();
}

/**
 * Draws one half of a layered, broadcast-view soccer goal.
 *
 * Call with `front: false` before drawing players and the ball, then call the
 * same goal with `front: true` afterward. This lets a player enter the net
 * while the bright front frame still passes naturally in front of them.
 */
export function drawGoalNet(ctx, options = {}) {
  if (!ctx || typeof ctx.save !== 'function' || typeof ctx.beginPath !== 'function') return;

  const source = options ?? {};
  const goalX = finite(source.goalX, 0);
  const centerY = finite(source.centerY, 0);
  const goalWidth = Math.max(16, Math.abs(finite(source.goalWidth, 188)));
  const goalDepth = Math.max(8, Math.abs(finite(source.goalDepth, 54)));
  const side = source.side === 'right' ? 'right' : 'left';
  const front = Boolean(source.front);
  const time = finite(source.time, 0);
  const rippleStrength = clamp(finite(source.rippleStrength, 0), 0, 1);
  const geometry = buildGeometry({ goalX, centerY, goalWidth, goalDepth, side });

  ctx.save();
  try {
    if (front) {
      drawFrontFrame(ctx, geometry);
    } else {
      drawPocketShadow(ctx, geometry);
      drawNetFloor(ctx, geometry);
      drawMesh(ctx, geometry, time, rippleStrength);
      drawPocketFrame(ctx, geometry);
    }
  } finally {
    ctx.restore();
  }
}
