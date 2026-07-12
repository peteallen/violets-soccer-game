export const WORLD = Object.freeze({
  width: 1280,
  height: 720,
});

export const FIELD = Object.freeze({
  left: 82,
  right: 1198,
  top: 92,
  bottom: 638,
  centerX: 640,
  centerY: 365,
  goalDepth: 54,
  goalWidth: 188,
});

export const COLORS = Object.freeze({
  navy: '#092a63',
  blue: '#1666d9',
  brightBlue: '#2b82ff',
  red: '#e73b4b',
  white: '#fffdf5',
  violet: '#8d4cdf',
  gold: '#ffd75a',
  grassA: '#39a65a',
  grassB: '#31994f',
  grassDark: '#247d42',
  chalk: 'rgba(255,255,245,0.88)',
  ink: '#071b3a',
});

export const MATCH = Object.freeze({
  durationSeconds: 300,
  playerRadius: 22,
  ballRadius: 12,
  usaControlledSpeed: 178,
  usaAiSpeed: 142,
  opponentSpeed: 126,
  keeperSpeed: 155,
  passSpeed: 485,
  shotSpeed: 675,
  opponentShotSpeed: 500,
});

export const TEAM_KITS = Object.freeze({
  usa: {
    shirt: '#f8fbff',
    shoulder: '#163f86',
    accent: '#e43b50',
    shorts: '#17386f',
    socks: '#e43b50',
    outline: '#071b3a',
    keeperShirt: '#7d4bd4',
    keeperShorts: '#45287d',
  },
  brazil: {
    shirt: '#ffd842',
    shoulder: '#23834a',
    accent: '#23834a',
    shorts: '#2251a0',
    socks: '#ffffff',
    outline: '#123267',
    keeperShirt: '#ef6e3f',
    keeperShorts: '#8f301d',
  },
  netherlands: {
    shirt: '#f47632',
    shoulder: '#132f68',
    accent: '#fff4dd',
    shorts: '#132f68',
    socks: '#f47632',
    outline: '#081b3d',
    keeperShirt: '#57bfa1',
    keeperShorts: '#226c63',
  },
  mexico: {
    shirt: '#198b58',
    shoulder: '#f4f2e9',
    accent: '#d53d42',
    shorts: '#f4f2e9',
    socks: '#d53d42',
    outline: '#073c2d',
    keeperShirt: '#f3be3e',
    keeperShorts: '#765213',
  },
});

export const OPPONENTS = Object.freeze([
  { id: 'brazil', label: 'BRAZIL', kit: TEAM_KITS.brazil, flag: ['#229447', '#ffd83d', '#2350a3'] },
  { id: 'netherlands', label: 'NETHERLANDS', kit: TEAM_KITS.netherlands, flag: ['#ae1c28', '#ffffff', '#21468b'] },
  { id: 'mexico', label: 'MEXICO', kit: TEAM_KITS.mexico, flag: ['#128a52', '#ffffff', '#d13d45'] },
]);
