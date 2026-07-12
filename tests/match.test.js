import { describe, expect, it } from 'vitest';
import { FIELD } from '../src/game/config.js';
import { Match, VIOLET_ID } from '../src/game/match/Match.js';

const expectVioletControl = (match) => {
  expect(match.activePlayerId).toBe(VIOLET_ID);
  expect(match.activePlayer?.id).toBe(VIOLET_ID);
  expect(match.usaPlayers.filter((player) => player.controlled).map((player) => player.id)).toEqual([VIOLET_ID]);
};

const advance = (match, seconds, step = 1 / 60, afterFrame = null) => {
  const frames = Math.ceil(seconds / step);
  for (let frame = 0; frame < frames; frame += 1) {
    match.update(step);
    afterFrame?.(frame);
  }
};

describe('Match', () => {
  it('starts a five-minute match with USA in possession', () => {
    const match = new Match({ seed: 6 });

    expect(match.state).toBe('ready');
    expect(match.timeRemaining).toBe(300);
    expect(match.ball.owner?.team).toBe('usa');
    expectVioletControl(match);

    match.start();
    match.update(1 / 60);
    expect(match.state).toBe('playing');
    expect(match.timeRemaining).toBeLessThan(300);
    expectVioletControl(match);
  });

  it('lets a teammate receive and return Violet’s pass without moving control', () => {
    const match = new Match({ seed: 10 });
    match.start();
    const receiver = match.findPlayer('usa-11');
    const violet = match.findPlayer(VIOLET_ID);
    const opponents = match.opponentPlayers.filter((player) => player.role === 'field');
    receiver.x = 760;
    receiver.y = 245;
    receiver.targetX = 805;
    receiver.targetY = 245;
    opponents.forEach((player, index) => {
      player.x = FIELD.right - 35;
      player.y = FIELD.top + 45 + index * 255;
      player.targetX = player.x;
      player.targetY = player.y;
    });

    expect(match.passTo(receiver.id)).toBe(true);
    expectVioletControl(match);

    let sawTeammateReceive = false;
    let sawReturnPass = false;
    let sawVioletReceiveReturn = false;
    let inspectedEventCount = 0;
    for (let frame = 0; frame < 4 * 60 && !sawVioletReceiveReturn; frame += 1) {
      match.update(1 / 60);
      expectVioletControl(match);
      if (match.ball.owner === receiver) sawTeammateReceive = true;
      for (const event of match.events.slice(inspectedEventCount)) {
        if (event.type === 'kick' && event.kind === 'pass' && event.playerId === receiver.id && event.receiverId === VIOLET_ID) {
          sawReturnPass = true;
        }
      }
      inspectedEventCount = match.events.length;
      if (sawReturnPass && match.ball.owner === violet) sawVioletReceiveReturn = true;
    }

    expect(sawTeammateReceive).toBe(true);
    expect(sawReturnPass).toBe(true);
    expect(sawVioletReceiveReturn).toBe(true);
    expectVioletControl(match);
  });

  it('keeps Violet selected during an opponent kickoff', () => {
    const match = new Match({ seed: 11 });
    match.start();
    match.prepareKickoff('opponent');

    expect(match.ball.owner?.id).toBe('opp-10');
    expectVioletControl(match);
    advance(match, 2, 1 / 60, () => expectVioletControl(match));
  });

  it('rolls a USA keeper catch specifically to Violet without changing control', () => {
    const match = new Match({ seed: 13 });
    match.start();
    const keeper = match.findPlayer('usa-gk');
    match.ball.release();
    match.ball.x = keeper.x;
    match.ball.y = keeper.y;
    match.ball.vx = 120;
    match.ball.vy = 0;
    match.ball.lastTouchTeam = 'opponent';

    match.makeSave(keeper);

    expect(match.ball.owner).toBe(keeper);
    expect(keeper.distributeToId).toBe(VIOLET_ID);
    expectVioletControl(match);

    let rollout = null;
    for (let frame = 0; frame < 2 * 60 && !rollout; frame += 1) {
      match.update(1 / 60);
      expectVioletControl(match);
      rollout = match.events.find((event) => event.type === 'kick' && event.kind === 'rollout');
    }

    expect(rollout).toMatchObject({ team: 'usa', playerId: 'usa-gk', receiverId: VIOLET_ID });
    expect(match.ball.owner).toBeNull();
    expect(match.ball.intendedReceiverId).toBe(VIOLET_ID);
  });

  it('shoots toward the open side of goal when Violet kicks', () => {
    const match = new Match({ seed: 14 });
    match.start();
    const opponentKeeper = match.findPlayer('opp-gk');
    opponentKeeper.y = FIELD.centerY - 70;

    expect(match.shootAtOpenGoal()).toBe(true);

    expect(match.ball.owner).toBeNull();
    expect(match.ball.vx).toBeGreaterThan(0);
    expect(match.ball.vy).toBeGreaterThan(0);
    expect(match.events).toContainEqual(expect.objectContaining({
      type: 'kick',
      kind: 'shot',
      team: 'usa',
      playerId: VIOLET_ID,
    }));
    expectVioletControl(match);
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
    expectVioletControl(match);
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
      expectVioletControl(match);
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
