import { COLORS } from '../config.js';
import { clamp, lerp } from '../core/math.js';

const TAU = Math.PI * 2;
const INK = COLORS.ink || '#071b3a';

const DEFAULT_KITS = Object.freeze({
  usa: Object.freeze({
    shirt: COLORS.navy || '#092a63',
    shorts: COLORS.white || '#fffdf5',
    socks: COLORS.red || '#e73b4b',
    trim: COLORS.white || '#fffdf5',
    accent: COLORS.red || '#e73b4b',
    numberColor: COLORS.white || '#fffdf5',
    shoes: COLORS.gold || '#ffd75a',
    gloves: COLORS.white || '#fffdf5',
  }),
  opponent: Object.freeze({
    shirt: '#f2c94c',
    shorts: '#14573a',
    socks: '#f2c94c',
    trim: '#14573a',
    accent: '#fff8ce',
    numberColor: '#103f31',
    shoes: '#fff8e8',
    gloves: '#f4fbff',
  }),
  usaKeeper: Object.freeze({
    shirt: COLORS.brightBlue || '#2b82ff',
    shorts: COLORS.navy || '#092a63',
    socks: COLORS.brightBlue || '#2b82ff',
    trim: COLORS.white || '#fffdf5',
    accent: COLORS.red || '#e73b4b',
    numberColor: COLORS.white || '#fffdf5',
    shoes: COLORS.gold || '#ffd75a',
    gloves: '#f5ff8b',
  }),
  opponentKeeper: Object.freeze({
    shirt: '#8d4cdf',
    shorts: '#3f276c',
    socks: '#8d4cdf',
    trim: '#fff4a8',
    accent: '#ffce55',
    numberColor: '#fffdf5',
    shoes: '#fff8e8',
    gloves: '#aef3ff',
  }),
});

const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

const smoothstep = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

const damp = (current, target, rate, dt) =>
  lerp(current, target, 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt)));

const firstColor = (...values) => values.find((value) => typeof value === 'string' && value.length > 0);

const normalizeTeam = (team) => (String(team).toLowerCase() === 'opponent' ? 'opponent' : 'usa');
const normalizeRole = (role) => (String(role).toLowerCase() === 'keeper' ? 'keeper' : 'field');

function resolveKit(team, role, supplied = {}) {
  const source = supplied && typeof supplied === 'object' ? supplied : {};
  const defaults = role === 'keeper'
    ? DEFAULT_KITS[team === 'usa' ? 'usaKeeper' : 'opponentKeeper']
    : DEFAULT_KITS[team];

  return {
    ...defaults,
    ...source,
    shirt: firstColor(source.shirt, source.jersey, source.primary, defaults.shirt),
    shorts: firstColor(source.shorts, source.secondary, defaults.shorts),
    socks: firstColor(source.socks, source.sock, source.accent, defaults.socks),
    trim: firstColor(source.trim, source.detail, defaults.trim),
    accent: firstColor(source.accent, source.stripe, defaults.accent),
    numberColor: firstColor(source.numberColor, source.number, defaults.numberColor),
    shoes: firstColor(source.shoes, source.cleats, defaults.shoes),
    gloves: firstColor(source.gloves, defaults.gloves),
  };
}

function normalizeFacing(value, team = 'usa') {
  if (Number.isFinite(value)) return value;
  switch (String(value || '').toLowerCase()) {
    case 'left': return Math.PI;
    case 'up': return -Math.PI / 2;
    case 'down': return Math.PI / 2;
    case 'right': return 0;
    default: return team === 'usa' ? 0 : Math.PI;
  }
}

function hashString(value) {
  const text = String(value || 'player');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function drawStar(ctx, x, y, outerRadius, innerRadius, rotation = -Math.PI / 2) {
  ctx.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = rotation + point * Math.PI / 5;
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function pathTorso(ctx) {
  ctx.beginPath();
  ctx.moveTo(-14, -49);
  ctx.quadraticCurveTo(-19, -47, -19, -41);
  ctx.lineTo(-14, -23);
  ctx.quadraticCurveTo(-12, -20, -8, -20);
  ctx.lineTo(8, -20);
  ctx.quadraticCurveTo(12, -20, 14, -23);
  ctx.lineTo(19, -41);
  ctx.quadraticCurveTo(19, -47, 14, -49);
  ctx.quadraticCurveTo(0, -53, -14, -49);
  ctx.closePath();
}

function strokeSegment(ctx, fromX, fromY, toX, toY, color, width, outlineWidth = 2.5) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + outlineWidth;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}

function drawCircle(ctx, x, y, radius, fill, stroke = INK, lineWidth = 2) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  if (lineWidth > 0) ctx.stroke();
}

function drawControlledMarker(ctx, time, depthScale) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 4.8);
  const radius = 28 + pulse * 3;

  ctx.save();
  ctx.scale(1, 0.42);
  ctx.fillStyle = `rgba(43, 130, 255, ${0.12 + pulse * 0.06})`;
  ctx.strokeStyle = `rgba(255, 253, 245, ${0.7 + pulse * 0.24})`;
  ctx.lineWidth = 3 / Math.max(0.7, depthScale);
  ctx.beginPath();
  ctx.arc(0, 4, radius, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.rotate(time * 0.35);
  ctx.fillStyle = `rgba(255, 253, 245, ${0.78 + pulse * 0.2})`;
  drawStar(ctx, 0, 4, 12, 5.5);
  ctx.fill();
  ctx.restore();
}

function drawHairBack(ctx, style, color, personalAccent) {
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.3;

  if (style === 'ponytail' || style === 'pony' || style === 'braid') {
    ctx.beginPath();
    ctx.moveTo(-9, -72);
    ctx.bezierCurveTo(-25, -73, -29, -58, -20, -49);
    ctx.bezierCurveTo(-14, -44, -9, -51, -13, -58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = personalAccent;
    ctx.beginPath();
    ctx.arc(-13, -67, 4.3, 0, TAU);
    ctx.fill();
  } else if (style === 'bun') {
    drawCircle(ctx, -8, -78, 9, color, INK, 2.2);
  } else if (style === 'bob' || style === 'long') {
    ctx.beginPath();
    ctx.ellipse(0, -62, 18.5, 21, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(-16, -64, 32, 19);
  } else if (style === 'afro' || style === 'curls' || style === 'curly') {
    const curls = [
      [-12, -72, 9], [-3, -79, 10], [8, -77, 9], [14, -68, 9],
      [-15, -62, 9], [13, -58, 8], [-5, -64, 12], [5, -66, 11],
    ];
    for (const [x, y, radius] of curls) drawCircle(ctx, x, y, radius, color, INK, 1.7);
  }
}

function drawHairFront(ctx, style, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;

  if (style === 'afro' || style === 'curls' || style === 'curly') {
    const curls = [[-11, -72], [-4, -77], [5, -77], [12, -71]];
    for (const [x, y] of curls) drawCircle(ctx, x, y, 6.8, color, INK, 1.5);
    return;
  }

  if (style === 'buzz' || style === 'bald') {
    ctx.globalAlpha = style === 'bald' ? 0.15 : 0.75;
    ctx.beginPath();
    ctx.arc(0, -64, 14.4, Math.PI * 1.02, Math.PI * 1.98);
    ctx.lineWidth = style === 'bald' ? 2 : 5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  ctx.beginPath();
  ctx.moveTo(-14, -66);
  ctx.quadraticCurveTo(-10, -80, 3, -79);
  ctx.quadraticCurveTo(15, -77, 15, -65);
  ctx.quadraticCurveTo(9, -69, 5, -64);
  ctx.quadraticCurveTo(0, -70, -4, -65);
  ctx.quadraticCurveTo(-10, -69, -14, -66);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function actionPose(player) {
  const action = String(player.action || 'idle').toLowerCase();
  const time = Math.max(0, finite(player.actionTime, 0));
  const phase = finite(player.gaitPhase, 0);
  const movement = clamp(finite(player._moveAmount, 0), 0, 1.15);
  const gait = Math.sin(phase);
  const liftA = Math.max(0, Math.sin(phase)) * 5.5 * movement;
  const liftB = Math.max(0, -Math.sin(phase)) * 5.5 * movement;

  const pose = {
    bodyLift: -Math.abs(Math.sin(phase * 2)) * 1.6 * movement,
    bodyLean: movement * 0.055,
    bodyScaleX: 1,
    bodyScaleY: 1,
    strideA: gait * 11.5 * movement,
    strideB: -gait * 11.5 * movement,
    liftA,
    liftB,
    armSwingA: -gait * 8 * movement,
    armSwingB: gait * 8 * movement,
    armsRaised: 0,
    armsWide: 0,
    handsTogether: 0,
    crouch: 0,
    openMouth: 0,
    wholeRotation: 0,
    wholeOffsetX: 0,
    wholeOffsetY: 0,
  };

  const kicking = action.includes('kick') || action.includes('shoot') || action.includes('pass');
  if (kicking) {
    let reach = 0;
    let lift = 0;
    if (time < 0.14) {
      const t = smoothstep(time / 0.14);
      reach = lerp(0, -9, t);
      lift = 3 * t;
      pose.bodyLean = -0.06 * t;
    } else if (time < 0.26) {
      const t = smoothstep((time - 0.14) / 0.12);
      reach = lerp(-9, action.includes('shoot') ? 31 : 25, t);
      lift = lerp(3, 7, Math.sin(t * Math.PI));
      pose.bodyLean = lerp(-0.06, 0.12, t);
      pose.bodyScaleX = 1 + 0.045 * t;
      pose.bodyScaleY = 1 - 0.035 * t;
    } else {
      const t = smoothstep((time - 0.26) / 0.3);
      reach = lerp(action.includes('shoot') ? 31 : 25, 2, t);
      lift = lerp(7, 0, t);
      pose.bodyLean = lerp(0.12, 0, t);
    }
    pose.strideA = reach;
    pose.liftA = lift;
    pose.strideB = -4;
    pose.liftB = 0;
    pose.armSwingA = -reach * 0.24;
    pose.armSwingB = reach * 0.3;
  }

  if (action.includes('receive') || action.includes('trap')) {
    const reach = Math.sin(clamp(time / 0.42, 0, 1) * Math.PI);
    pose.strideA = 17 * reach;
    pose.liftA = 3 * reach;
    pose.bodyScaleY = 1 - 0.05 * reach;
    pose.bodyScaleX = 1 + 0.04 * reach;
    pose.bodyLift += 2 * reach;
  }

  if (action.includes('tackle') || action.includes('intercept') || action.includes('poke')) {
    const reach = Math.sin(clamp(time / 0.45, 0, 1) * Math.PI);
    pose.strideA = 25 * reach;
    pose.liftA = 2 * reach;
    pose.strideB = -7 * reach;
    pose.bodyLean = 0.14 * reach;
    pose.armsWide = 0.65 * reach;
  }

  if (action.includes('catch') || action.includes('save')) {
    const catchAmount = smoothstep(Math.min(1, time / 0.2));
    pose.handsTogether = catchAmount;
    pose.crouch = 0.2 * (1 - catchAmount);
    pose.bodyScaleY = 1 - 0.05 * catchAmount;
    pose.bodyScaleX = 1 + 0.04 * catchAmount;
  }

  if (action.includes('dive')) {
    const dive = smoothstep(Math.min(1, time / 0.28));
    const settle = time > 0.28 ? smoothstep((time - 0.28) / 0.35) : 0;
    pose.wholeRotation = lerp(0, 0.88, dive) - settle * 0.08;
    pose.wholeOffsetX = 18 * dive;
    pose.wholeOffsetY = 9 * dive;
    pose.armsWide = 0.7;
    pose.handsTogether = 0.45;
    pose.bodyScaleY = 1 - 0.08 * dive;
    pose.openMouth = 0.45;
  }

  if (action.includes('stumble')) {
    const settle = 1 - smoothstep(time / 0.7);
    pose.wholeRotation = Math.sin(time * 15) * 0.24 * settle;
    pose.armsWide = 0.9 * settle;
    pose.bodyLift -= Math.sin(clamp(time / 0.7, 0, 1) * Math.PI) * 3;
    pose.openMouth = 0.35 * settle;
  }

  if (action.includes('celebr')) {
    const variant = action.includes('airplane')
      ? 0
      : action.includes('knee')
        ? 1
        : player._celebrationVariant;
    pose.openMouth = 1;
    if (variant === 0) {
      pose.armsWide = 1;
      pose.bodyLean = 0.08;
      pose.bodyLift -= Math.abs(Math.sin(time * 5.5)) * 2.5;
      pose.wholeRotation = Math.sin(time * 3.2) * 0.06;
    } else if (variant === 1) {
      const slide = smoothstep(Math.min(1, time / 0.34));
      pose.crouch = 0.75 * slide;
      pose.armsRaised = 0.85;
      pose.armsWide = 0.55;
      pose.wholeOffsetX = 8 * slide;
      pose.wholeOffsetY = 5 * slide;
      pose.bodyLean = 0.18 * slide;
    } else {
      pose.armsRaised = 1;
      pose.armsWide = 0.28 + Math.sin(time * 5) * 0.12;
      pose.bodyLift -= Math.abs(Math.sin(time * 7)) * 7;
      pose.wholeRotation = Math.sin(time * 7) * 0.055;
      pose.strideA = Math.sin(time * 7) * 4;
      pose.strideB = -pose.strideA;
    }
  }

  return pose;
}

function drawLeg(ctx, side, stride, footLift, crouch, skinTone, kit) {
  const hipX = side * 7;
  const hipY = -22 + crouch * 5;
  const kneeX = hipX + stride * 0.42;
  const kneeY = -12 + crouch * 6 - footLift * 0.4;
  const footX = hipX + stride;
  const footY = -2 + crouch * 7 - footLift;

  strokeSegment(ctx, hipX, hipY, kneeX, kneeY, skinTone, 7.2, 2.4);
  strokeSegment(ctx, kneeX, kneeY, footX, footY, kit.socks, 7.5, 2.4);

  ctx.save();
  ctx.translate(footX + 2.5, footY + 1.5);
  ctx.rotate(clamp(stride * 0.018, -0.3, 0.3));
  ctx.fillStyle = kit.shoes;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(2, 0, 8, 4.2, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.56)';
  ctx.beginPath();
  ctx.ellipse(4.5, -1, 2.8, 1, -0.15, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function armJoints(side, swing, pose) {
  const shoulder = { x: side * 15, y: -44 + pose.crouch * 4 };
  let elbow = {
    x: side * 20 + swing * 0.38,
    y: -32 - Math.abs(swing) * 0.08 + pose.crouch * 4,
  };
  let hand = {
    x: side * 19 + swing,
    y: -20 + pose.crouch * 5,
  };

  if (pose.armsWide > 0) {
    const wide = pose.armsWide;
    elbow = {
      x: lerp(elbow.x, side * 28, wide),
      y: lerp(elbow.y, -43, wide),
    };
    hand = {
      x: lerp(hand.x, side * 42, wide),
      y: lerp(hand.y, -43, wide),
    };
  }

  if (pose.armsRaised > 0) {
    const raised = pose.armsRaised;
    const spread = finite(pose.armsWide, 0);
    elbow = {
      x: lerp(elbow.x, side * (19 + spread * 7), raised),
      y: lerp(elbow.y, -55, raised),
    };
    hand = {
      x: lerp(hand.x, side * (17 + spread * 12), raised),
      y: lerp(hand.y, -70, raised),
    };
  }

  if (pose.handsTogether > 0) {
    const together = pose.handsTogether;
    elbow = {
      x: lerp(elbow.x, side * 13, together),
      y: lerp(elbow.y, -39, together),
    };
    hand = {
      x: lerp(hand.x, side * 6, together),
      y: lerp(hand.y, -34, together),
    };
  }

  return { shoulder, elbow, hand };
}

function drawArm(ctx, side, swing, pose, skinTone, kit, keeper) {
  const { shoulder, elbow, hand } = armJoints(side, swing, pose);
  strokeSegment(ctx, shoulder.x, shoulder.y, elbow.x, elbow.y, kit.shirt, 8.2, 2.5);
  strokeSegment(ctx, elbow.x, elbow.y, hand.x, hand.y, keeper ? kit.gloves : skinTone, keeper ? 8 : 6.2, 2.3);

  const handRadius = keeper ? 5.8 : 4.1;
  drawCircle(ctx, hand.x, hand.y, handRadius, keeper ? kit.gloves : skinTone, INK, 1.8);
  if (keeper) {
    ctx.strokeStyle = kit.accent;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(hand.x - side * 3.2, hand.y - 2.2);
    ctx.lineTo(hand.x + side * 2.4, hand.y + 2.1);
    ctx.stroke();
  }
}

function drawTorso(ctx, player, mirror) {
  const { kit } = player;
  pathTorso(ctx);
  ctx.fillStyle = kit.shirt;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.7;
  ctx.stroke();

  ctx.save();
  pathTorso(ctx);
  ctx.clip();
  if (player.team === 'usa') {
    ctx.fillStyle = kit.trim;
    ctx.beginPath();
    ctx.moveTo(-19, -47);
    ctx.lineTo(-6, -50);
    ctx.lineTo(-2, -42);
    ctx.lineTo(-17, -38);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(19, -47);
    ctx.lineTo(6, -50);
    ctx.lineTo(2, -42);
    ctx.lineTo(17, -38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = kit.accent;
    ctx.fillRect(-2.2, -48, 4.4, 27);
  } else {
    ctx.fillStyle = kit.trim;
    ctx.beginPath();
    ctx.moveTo(-19, -47);
    ctx.lineTo(-12, -46);
    ctx.lineTo(-8, -21);
    ctx.lineTo(-15, -21);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(19, -47);
    ctx.lineTo(12, -46);
    ctx.lineTo(8, -21);
    ctx.lineTo(15, -21);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const label = player.number == null ? '' : String(player.number);
  if (label) {
    ctx.save();
    ctx.translate(0, -28);
    ctx.scale(mirror, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 13px "Avenir Next", "Arial Rounded MT Bold", system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(7, 27, 58, 0.55)';
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = kit.numberColor;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

function drawShorts(ctx, kit, crouch) {
  ctx.fillStyle = kit.shorts;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-13, -24 + crouch * 3);
  ctx.lineTo(13, -24 + crouch * 3);
  ctx.lineTo(12, -13 + crouch * 6);
  ctx.quadraticCurveTo(7, -11 + crouch * 6, 2, -16 + crouch * 4);
  ctx.quadraticCurveTo(-3, -11 + crouch * 6, -12, -13 + crouch * 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = kit.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -22 + crouch * 3);
  ctx.lineTo(-9, -14 + crouch * 5);
  ctx.moveTo(10, -22 + crouch * 3);
  ctx.lineTo(9, -14 + crouch * 5);
  ctx.stroke();
}

function drawHead(ctx, player, time, lookY, mirror, pose) {
  const headX = 0;
  const headY = -64 + pose.crouch * 4;
  const skin = player.skinTone;

  drawHairBack(ctx, player.hairStyle, player.hairColor, player.personalAccent);

  strokeSegment(ctx, 0, -52 + pose.crouch * 4, 0, -48 + pose.crouch * 4, skin, 7, 2);
  drawCircle(ctx, headX, headY, 14.6, skin, INK, 2.4);

  const lookX = 1.8;
  const eyeY = headY - 1 + clamp(lookY, -1, 1) * 1.3;
  const blinkCycle = (time + player._blinkOffset) % 4.4;
  const blinking = blinkCycle > 4.24;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  if (blinking) {
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-5 + lookX, eyeY);
    ctx.lineTo(-1 + lookX, eyeY);
    ctx.moveTo(4 + lookX, eyeY);
    ctx.lineTo(8 + lookX, eyeY);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(-3 + lookX, eyeY, 1.65, 0, TAU);
    ctx.arc(6 + lookX, eyeY, 1.65, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-2.5 + lookX, eyeY - 0.55, 0.55, 0, TAU);
    ctx.arc(6.5 + lookX, eyeY - 0.55, 0.55, 0, TAU);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(231, 92, 103, 0.24)';
  ctx.beginPath();
  ctx.ellipse(8, headY + 4.5, 3.2, 1.8, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#6f2d37';
  ctx.fillStyle = '#6f2d37';
  ctx.lineWidth = 1.8;
  if (pose.openMouth > 0.2) {
    ctx.beginPath();
    ctx.ellipse(2.5, headY + 7, 3.2, 2.4 + pose.openMouth, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff9fa8';
    ctx.beginPath();
    ctx.ellipse(2.5, headY + 8, 1.6, 0.7, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(2.5, headY + 4.7, 4.6, 0.25, Math.PI - 0.2);
    ctx.stroke();
  }

  drawHairFront(ctx, player.hairStyle, player.hairColor);

  if (player.controlled && player.team === 'usa' &&
      (player.hairStyle === 'ponytail' || player.hairStyle === 'pony' || player.hairStyle === 'braid')) {
    ctx.fillStyle = player.personalAccent;
    ctx.strokeStyle = COLORS.white || '#fffdf5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-12.5, -67, 3.4, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Undo the body's reflection only around readable facial asymmetry when a
  // future kit adds text or symbols near the head. Keeping this transform here
  // also makes the intended facing convention explicit for callers.
  void mirror;
}

export class Player {
  constructor(data = {}) {
    const source = data && typeof data === 'object' ? data : {};
    this.id = source.id == null ? 'player' : String(source.id);
    this.team = normalizeTeam(source.team);
    this.role = normalizeRole(source.role);
    this.number = source.number ?? (this.team === 'usa' ? 6 : 9);
    this.name = source.name == null ? '' : String(source.name);

    this.x = finite(source.x, 0);
    this.y = finite(source.y, 0);
    this.homeX = finite(source.homeX, this.x);
    this.homeY = finite(source.homeY, this.y);
    this.skinTone = firstColor(source.skinTone, source.skin, '#a96845');
    this.hairColor = firstColor(source.hairColor, '#3d241b');
    this.controlled = Boolean(source.controlled);
    this.hairStyle = String(
      source.hairStyle || (this.controlled && this.team === 'usa' ? 'ponytail' : 'short'),
    ).toLowerCase();
    this.kit = resolveKit(this.team, this.role, source.kit);
    this.personalAccent = firstColor(
      source.personalAccent,
      this.kit.personalAccent,
      COLORS.violet,
      '#8d4cdf',
    );

    this.vx = finite(source.vx, 0);
    this.vy = finite(source.vy, 0);
    this.facing = normalizeFacing(source.facing, this.team);
    this.targetX = finite(source.targetX, this.x);
    this.targetY = finite(source.targetY, this.y);
    this.speed = Math.max(0, finite(source.speed, 0));
    this.hasBall = Boolean(source.hasBall);
    this.action = source.action == null ? 'idle' : String(source.action);
    this.actionTime = Math.max(0, finite(source.actionTime, 0));
    this.gaitPhase = finite(source.gaitPhase, 0);

    const hash = hashString(this.id);
    this._moveAmount = clamp(Math.hypot(this.vx, this.vy) / 175, 0, 1);
    this._mirror = Math.cos(this.facing) < 0 ? -1 : 1;
    this._blinkOffset = (hash % 380) / 100;
    this._celebrationVariant = hash % 3;
    this._lastDepthScale = 1;
  }

  updateAnimation(dt) {
    const delta = clamp(finite(dt, 0), 0, 0.1);
    const velocityX = finite(this.vx, 0);
    const velocityY = finite(this.vy, 0);
    const velocity = Math.hypot(velocityX, velocityY);
    const action = String(this.action || 'idle').toLowerCase();
    const movementAction = action.includes('run') || action.includes('dribble') ||
      action.includes('chase') || action.includes('return') || action.includes('move');
    const animationSpeed = velocity > 1 ? velocity : movementAction ? Math.max(0, finite(this.speed, 0)) : 0;
    const targetMovement = clamp(animationSpeed / 175, 0, 1.15);

    this._moveAmount = damp(finite(this._moveAmount, 0), targetMovement, 10, delta);
    if (velocity > 2) {
      this.facing = Math.atan2(velocityY, velocityX);
    } else if (movementAction) {
      const targetDx = finite(this.targetX, this.x) - finite(this.x, 0);
      const targetDy = finite(this.targetY, this.y) - finite(this.y, 0);
      if (Math.hypot(targetDx, targetDy) > 3) this.facing = Math.atan2(targetDy, targetDx);
    }

    const angle = normalizeFacing(this.facing, this.team);
    if (Math.abs(Math.cos(angle)) > 0.12) this._mirror = Math.cos(angle) < 0 ? -1 : 1;
    this.gaitPhase = finite(this.gaitPhase, 0) +
      delta * (4.8 + clamp(animationSpeed, 0, 280) * 0.055) * clamp(this._moveAmount, 0, 1);
    this.actionTime = Math.max(0, finite(this.actionTime, 0) + delta);
  }

  draw(ctx, time = 0, depthScale = 1) {
    if (!ctx || typeof ctx.save !== 'function') return;

    const drawTime = finite(time, this.actionTime);
    const scale = clamp(finite(depthScale, 1), 0.58, 1.55);
    const x = finite(this.x, 0);
    const y = finite(this.y, 0);
    const facing = normalizeFacing(this.facing, this.team);
    const directionX = Math.cos(facing);
    const directionY = Math.sin(facing);
    if (Math.abs(directionX) > 0.12) this._mirror = directionX < 0 ? -1 : 1;
    const mirror = this._mirror || 1;
    const pose = actionPose(this);
    this._lastDepthScale = scale;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    if (this.controlled) drawControlledMarker(ctx, drawTime, scale);

    const airHeight = Math.max(0, -pose.bodyLift - 1.5);
    const shadowSqueeze = clamp(1 - airHeight / 80, 0.7, 1);
    ctx.fillStyle = `rgba(3, 24, 25, ${0.25 * shadowSqueeze})`;
    ctx.beginPath();
    ctx.ellipse(1 + pose.wholeOffsetX * 0.15, 3, 19 * shadowSqueeze, 6.5 * shadowSqueeze, 0, 0, TAU);
    ctx.fill();

    ctx.translate(pose.wholeOffsetX, pose.wholeOffsetY + pose.bodyLift);
    ctx.rotate(pose.wholeRotation + pose.bodyLean);
    ctx.scale(mirror * pose.bodyScaleX, pose.bodyScaleY);

    const keeper = this.role === 'keeper';
    drawLeg(ctx, -1, pose.strideB, pose.liftB, pose.crouch, this.skinTone, this.kit);
    drawArm(ctx, -1, pose.armSwingB, pose, this.skinTone, this.kit, keeper);
    drawLeg(ctx, 1, pose.strideA, pose.liftA, pose.crouch, this.skinTone, this.kit);
    drawShorts(ctx, this.kit, pose.crouch);
    drawTorso(ctx, this, mirror);
    drawArm(ctx, 1, pose.armSwingA, pose, this.skinTone, this.kit, keeper);
    drawHead(ctx, this, drawTime, directionY, mirror, pose);

    if (this.hasBall) {
      ctx.globalAlpha = 0.72 + Math.sin(drawTime * 6) * 0.12;
      ctx.fillStyle = this.team === 'usa' ? COLORS.brightBlue : this.kit.accent;
      drawStar(ctx, 0, -88, 5.2, 2.3, -Math.PI / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  containsPoint(point, radius = 48) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const touchRadius = Math.max(0, finite(radius, 48)) * clamp(finite(this._lastDepthScale, 1), 0.58, 1.55);
    const centerX = finite(this.x, 0);
    const centerY = finite(this.y, 0) - 30 * clamp(finite(this._lastDepthScale, 1), 0.58, 1.55);
    if (touchRadius === 0) return point.x === centerX && point.y === centerY;
    const dx = (point.x - centerX) / touchRadius;
    const dy = (point.y - centerY) / (touchRadius * 1.18);
    return dx * dx + dy * dy <= 1;
  }
}
