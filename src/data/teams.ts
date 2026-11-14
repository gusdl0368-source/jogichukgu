// 가상의 동네 팀 이름. 실존 구단 이름이나 그 패러디는 쓰지 않는다.

import type { Rng } from '../game/rng';

const PREFIX = [
  '새벽', '한강', '달동네', '골목', '시장통', '약수', '은행나무', '느티나무', '뒷산', '개나리', '꽃밭', '버들', '산들',
  '모래내', '방앗간', '학교앞', '저수지', '역전', '돌다리', '감나무', '해돋이', '별빛', '무지개', '둑방', '소나무',
];
const SUFFIX = ['FC', '유나이티드', '조기회', '축구회', '레인저스', '시티', '스타즈', '클럽', '형제들', '어벤져스'];
const FUNNY = [
  '막걸리 유나이티드', '아침밥 먹고 FC', '무릎 보호대 FC', '파스 냄새 FC', '회비 미납 FC', '골대 지킴이',
  '헛발질 클럽', '족발 FC', '대충 차 FC', '라면 한 그릇 FC', '노키퍼 FC', '오늘도 지각 FC',
];
/** 대회에 나오는 "다른 유저" 느낌의 팀 이름 */
const USER_LIKE = [
  '우리동네최강', '골키퍼구함', '아재축구단', '월요일싫어FC', '김부장FC', '퇴근하고공차자', '9시출근', '헬린이FC',
  '토요일새벽', '발목조심', '공만차면돼', '새벽이슬FC', '닭강정FC', '오늘은이긴다', '삼겹살원정대', '잠꾸러기FC',
];

const CREST_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#34495e', '#d35400', '#c0392b', '#16a085', '#8e44ad'];
const CREST_ICONS = ['🦁', '🐯', '🦅', '🐻', '🐺', '🦊', '🐗', '🐉', '🦬', '🐴', '🐓', '🐟', '⭐', '🌙', '🔥', '⚓'];

export interface Crest {
  color: string;
  icon: string;
}


/** 3부·2부: 도시 구단 */
const CITY = ['해안', '북부', '남강', '동진', '서림', '청솔', '백산', '금호', '은하', '한빛', '새솔', '태백', '가람', '누리', '다온', '솔빛'];
const CITY_SUFFIX = ['시민구단', '시티', 'FC', '유나이티드', '레이커스', '드래곤즈', '울브스', '스틸러스'];
/** 세미프로부터: 세계 각지의 가상 클럽 */
const WORLD_PREFIX = ['레알', 'AC', '스포르팅', '아틀레티코', '올림피크', 'FC', '디나모', '인테르', 'SV', '라싱', '데포르티보', '로열'];
const WORLD_CITY = ['몬테비스타', '발도로', '루나리스', '노르드하븐', '생마렐', '리오아줄', '산타루스', '아이젠탈', '크라스나', '포르토베로', '알타마르', '베르겐하임', '카스텔로', '솔레아', '브리스톤', '라고네그로', '페라디아', '오스트란드'];

export function randomTeamName(rng: Rng, used: Set<string>, level = 0): string {
  for (let i = 0; i < 50; i++) {
    const name =
      level >= 4 ? `${rng.pick(WORLD_PREFIX)} ${rng.pick(WORLD_CITY)}`
      : level >= 2 ? `${rng.pick(CITY)} ${rng.pick(CITY_SUFFIX)}`
      : rng.chance(0.2) ? rng.pick(FUNNY) : `${rng.pick(PREFIX)} ${rng.pick(SUFFIX)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return `동네 ${used.size + 1} FC`;
}

export function randomUserTeamName(rng: Rng, used: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const name = rng.pick(USER_LIKE);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return randomTeamName(rng, used);
}

export function randomCrest(rng: Rng): Crest {
  return { color: rng.pick(CREST_COLORS), icon: rng.pick(CREST_ICONS) };
}
