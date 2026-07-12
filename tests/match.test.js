import { describe, expect, it } from 'vitest';
import { FIELD } from '../src/game/config.js';
import { Match } from '../src/game/match/Match.js';

const advance = (match, seconds, step = 1 / 60) => {
  const frames = Math.ceil(seconds / step);
  for (let frame = 0; frame < frames; frame += 1) match.update(step);
};

describe('Match', () => {
  it('starts a five-minute match with USA in possession', () => {
    const match = new Match({ seed: 6 });

    expect(match.state).toBe('ready');
    expect(match.timeRemaining).toBe(300);
    expect(match.ball.owner?.team).toBe('usa');
    expect(match.activePlayerId).toBe('usa-6');

    match.start();
    match.update(1 / 60);
    expect(match.state).toBe('playing');
    expect(match.timeRemaining).toBeLessThan(300);
  });

  it('passes to a moving teammate and transfers control', () => {
    const match = new Match({ seed: 10 });
    match.start();
    const receiver = match.findPlayer('usa-11');
    const opponents = match.opponentPlayers.filter((player) => player.role === 'field');
    receiver.x = 655;
    receiver.y = 245;
    receiver.targetX = 700;
    receiver.targetY = 245;
    opponents.forEach((player, index) => {
      player.x = 980;
      player.y = 190 + index * 150;
      player.targetX = player.x;
      player.targetY = player.y;
    });

    expect(match.passTo(receiver.id)).toBe(true);
    advance(match, 1.25);

    expect(match.ball.owner?.id).toBe(receiver.id);
    expect(match.activePlayerId).toBe(receiver.id);
  });

  it('does not allow an opponent to steal during USA receipt protection', () => {
    const match = new Match({ seed: 12 });
    match.start();
    const owner = match.ball.owner;
    const challenger = match.findPlayer('opp-10');
    challenger.x = owner.x + 8;
    challenger.y = owner.y;
    challenger.targetX = challenger.x;
    challenger.targetY = challenger.y;
    match.possessionGrace = 0.7;

    advance(match, 0.45);
    expect(match.ball.owner?.team).toBe('usa');
  });

  it('counts one goal, pauses the clock, then gives kickoff to the conceding team', () => {
    const match = new Match({ seed: 15 });
    match.start();
    match.ball.release();
    match.ball.x = FIELD.right + 20;
    match.ball.y = FIELD.centerY;
    match.ball.vx = 300;
    match.ball.lastTouchTeam = 'usa';
    const timeAtGoal = match.timeRemaining;

    match.update(1 / 60);
    expect(match.score.usa).toBe(1);
    expect(match.state).toBe('goal');
    expect(match.timeRemaining).toBeCloseTo(timeAtGoal - 1 / 60, 2);

    advance(match, 4.3);
    expect(match.state).toBe('playing');
    expect(match.score.usa).toBe(1);
    expect(match.ball.owner?.team).toBe('opponent');
  });

  it('finishes honestly when the timer reaches zero', () => {
    const match = new Match({ duration: 15, seed: 18 });
    match.start();
    advance(match, 15.1);

    expect(match.state).toBe('finished');
    expect(match.timeRemaining).toBe(0);
    const events = match.drainEvents();
    expect(events.some((event) => event.type === 'match-finished')).toBe(true);
  });

  it('stays finite and inside the playable world through a long simulation', () => {
    const match = new Match({ duration: 60, seed: 22 });
    match.start();
    for (let frame = 0; frame < 110 * 60 && match.state !== 'finished'; frame += 1) {
      if (frame % 120 === 0 && match.isLive) {
        const active = match.activePlayer;
        if (match.ball.owner === active && active.team === 'usa' && active.x > 720) {
          match.shootAt(FIELD.centerY + Math.sin(frame) * 55, 0.95);
        } else if (match.ball.owner === active && active.team === 'usa') {
          match.setMoveTarget(Math.min(FIELD.right - 150, active.x + 180), FIELD.centerY + Math.sin(frame * 0.1) * 150);
        } else {
          match.setMoveTarget(match.ball.x, match.ball.y, { tracking: 'ball' });
        }
      }
      match.update(1 / 60);
      for (const player of match.players) {
        expect(Number.isFinite(player.x)).toBe(true);
        expect(Number.isFinite(player.y)).toBe(true);
        expect(player.x).toBeGreaterThanOrEqual(FIELD.left - 1);
        expect(player.x).toBeLessThanOrEqual(FIELD.right + 1);
        expect(player.y).toBeGreaterThanOrEqual(FIELD.top - 1);
        expect(player.y).toBeLessThanOrEqual(FIELD.bottom + 1);
      }
      expect(Number.isFinite(match.ball.x)).toBe(true);
      expect(Number.isFinite(match.ball.y)).toBe(true);
    }
    expect(match.state).toBe('finished');
  });
});
