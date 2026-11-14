/** 시드 기반 난수 (mulberry32). 경기 재현과 테스트를 위해 Math.random 대신 쓴다. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 가중치 배열에서 인덱스 하나 */
  weighted(weights: readonly number[]): number {
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** 다음 시드로 쓸 정수 */
  seed(): number {
    return Math.floor(this.next() * 2 ** 31);
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
