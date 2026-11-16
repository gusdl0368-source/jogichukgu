import { describe, expect, it } from 'vitest';
import { jobFitsAge } from '../src/data/nations';
import { generatePlayer } from '../src/game/players';
import { Rng } from '../src/game/rng';

describe('선수 직업과 나이', () => {
  it('모든 등급에서 직업이 나이와 어울린다', () => {
    const rng = new Rng(7);
    for (let tier = 0; tier <= 8; tier++) {
      for (let i = 0; i < 400; i++) {
        const p = generatePlayer(rng, tier, 'ST');
        expect(jobFitsAge(p.job, p.age), `${tier}등급 ${p.age}세 ${p.job}`).toBe(true);
      }
    }
  });
});
