// 라이벌 구단: 매 시즌 같은 리그에서 한 팀이 앙숙이 된다.
// 이기면 회비 2배 + 보석. 상대 감독이 경기 전후로 한마디씩 한다.

export const RIVAL = {
  /** 라이벌전 승리 시 경기 회비 배수 (기본 회비에 더해 이만큼 추가) */
  winCashBonus: 1,
  winGems: 5,
};

const SURNAMES = ['박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신'];

/** 팀 id로 정해지는 상대 감독 이름 (같은 팀이면 늘 같은 이름) */
export function rivalManager(teamId: string, season: number): string {
  let h = season * 31;
  for (const c of teamId) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return `${SURNAMES[h % SURNAMES.length]} 감독`;
}

export const RIVAL_LINES = {
  before: [
    '이번엔 막걸리 내기다. 지는 쪽이 한 상자!',
    '지난번엔 운이 좋았지? 오늘은 다를 거야.',
    '우리 동네에서 너희 이름 나오는 거, 오늘로 끝이다.',
    '새벽부터 몸 풀고 왔다. 각오해.',
    '이 리그에 1위는 하나야.',
  ],
  win: [
    '…다음엔 안 봐준다. 진짜로.',
    '심판이 좀… 아니다, 잘했다. 인정.',
    '오늘 막걸리는 우리가 산다. 다음 판에 두 배로 받아 간다.',
  ],
  loss: [
    '봤지? 이게 실력 차이야.',
    '막걸리 한 상자, 잘 마시겠습니다~',
    '다음 시즌엔 한 리그 아래서 보자고.',
  ],
  draw: [
    '이번엔 비긴 걸로 해 두지.',
    '다음 판에서 결판내자.',
  ],
};

export function pickLine(list: string[], seed: number): string {
  return list[Math.abs(seed) % list.length];
}
