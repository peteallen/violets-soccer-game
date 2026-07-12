import { describe, expect, it, vi } from 'vitest';
import { FIELD, WORLD } from '../src/game/config.js';
import { VOICE_CLIPS } from '../src/game/core/audioManifest.js';
import {
  ATTACKING_GOAL_TARGET,
  Game,
  isAttackingGoalTap,
} from '../src/game/Game.js';
import { Match, VIOLET_ID } from '../src/game/match/Match.js';

function createGameHarness({ ownerId = VIOLET_ID } = {}) {
  const match = new Match({ seed: 6 });
  match.start();
  if (ownerId === null) match.ball.release();
  else match.ball.attach(match.findPlayer(ownerId));
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    match,
    introTimer: 0,
    viewport: { scale: 1 },
    screen: 'match',
    pointer: { id: 1, mode: 'none', targetId: null },
    targetMarker: null,
    highlightPlayerId: null,
    sound: { play: vi.fn() },
    spawnRing: vi.fn(),
    tutorial: { step: 'shoot', completed: new Set(), voiced: new Set(), lastCueAt: 0 },
    time: 2,
  });
  return { game, match };
}

describe('goal-tap shooting', () => {
  it('covers the visible right goal with a generous tablet target', () => {
    expect(isAttackingGoalTap({ x: FIELD.right, y: FIELD.centerY })).toBe(true);
    expect(isAttackingGoalTap({ x: FIELD.right + FIELD.goalDepth, y: FIELD.centerY })).toBe(true);
    expect(isAttackingGoalTap({ x: ATTACKING_GOAL_TARGET.left, y: ATTACKING_GOAL_TARGET.top })).toBe(true);
    expect(isAttackingGoalTap({ x: WORLD.width, y: ATTACKING_GOAL_TARGET.bottom })).toBe(true);
    expect(isAttackingGoalTap({ x: ATTACKING_GOAL_TARGET.left - 1, y: FIELD.centerY })).toBe(false);
    expect(isAttackingGoalTap({ x: FIELD.centerX, y: FIELD.centerY })).toBe(false);
  });

  it('shoots deterministically after Violet taps the goal, even with finger drift', () => {
    const { game, match } = createGameHarness();
    const shoot = vi.spyOn(match, 'shootAtOpenGoal');
    const goalPoint = { x: ATTACKING_GOAL_TARGET.cueX, y: ATTACKING_GOAL_TARGET.cueY };

    game.handleMatchDown(goalPoint);
    expect(game.pointer.mode).toBe('goal-shot');
    expect(game.spawnRing).toHaveBeenCalledWith(goalPoint.x, goalPoint.y, expect.any(String), 0.42);

    game.toWorld = vi.fn(() => ({ x: FIELD.centerX, y: FIELD.centerY }));
    game.onPointerUp({ pointerId: 1, preventDefault: vi.fn() });

    expect(shoot).toHaveBeenCalledOnce();
    expect(match.events).toContainEqual(expect.objectContaining({
      type: 'kick',
      kind: 'shot',
      team: 'usa',
      playerId: VIOLET_ID,
    }));
    expect(match.ball.owner).toBeNull();
    expect(match.ball.vx).toBeGreaterThan(0);
    expect(game.tutorial.step).toBe('done');
    expect(match.usaPlayers.filter((player) => player.controlled).map((player) => player.id)).toEqual([VIOLET_ID]);
    expect(game.pointer).toBeNull();
  });

  it.each([
    ['a USA teammate', 'usa-11'],
    ['an opponent', 'opp-10'],
    ['nobody', null],
  ])('treats the goal tap as movement when %s owns the ball', (_label, ownerId) => {
    const { game, match } = createGameHarness({ ownerId });
    const shoot = vi.spyOn(match, 'shootAtOpenGoal');
    const move = vi.spyOn(match, 'setMoveTarget');
    const goalPoint = { x: ATTACKING_GOAL_TARGET.cueX, y: ATTACKING_GOAL_TARGET.cueY };

    game.handleMatchDown(goalPoint);

    expect(game.pointer.mode).toBe('move');
    expect(shoot).not.toHaveBeenCalled();
    expect(move).toHaveBeenCalledWith(goalPoint.x, goalPoint.y, { tracking: null });
  });

  it.each([
    ['ordinary grass', { x: FIELD.centerX + 180, y: FIELD.centerY + 95 }],
    ['the former kick-button position', { x: 1105, y: 563 }],
  ])('does not retain an invisible shooting target at %s', (_label, point) => {
    const { game, match } = createGameHarness();
    const shoot = vi.spyOn(match, 'shootAtOpenGoal');
    const move = vi.spyOn(match, 'setMoveTarget');

    game.handleMatchDown(point);

    expect(game.pointer.mode).toBe('move');
    expect(shoot).not.toHaveBeenCalled();
    expect(move).toHaveBeenCalledWith(point.x, point.y, { tracking: null });
    expect(match.ball.owner?.id).toBe(VIOLET_ID);
  });

  it('voices the goal instruction only after Violet regains possession', () => {
    const { game, match } = createGameHarness({ ownerId: 'usa-11' });
    game.sound.speak = vi.fn();

    game.updateTutorialAudio();
    expect(game.sound.speak).not.toHaveBeenCalled();
    expect(game.tutorial.voiced.has('shoot')).toBe(false);

    match.ball.attach(match.findPlayer(VIOLET_ID));
    game.updateTutorialAudio();
    game.updateTutorialAudio();

    expect(game.sound.speak).toHaveBeenCalledOnce();
    expect(game.sound.speak).toHaveBeenCalledWith('tapGoal');
    expect(game.tutorial.voiced.has('shoot')).toBe(true);
  });

  it('ships only the matching goal tutorial voice key', () => {
    expect(VOICE_CLIPS.tapGoal).toBe('assets/voice/tap_goal.mp3');
    expect(VOICE_CLIPS).not.toHaveProperty('tapKick');
  });
});
