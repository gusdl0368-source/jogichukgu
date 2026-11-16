// vite build 결과(dist/)를 하나의 HTML 조각으로 합쳐 claude.ai 아티팩트로 올릴 수 있게 만든다.
// 아티팩트는 <!doctype>/<head>/<body>를 자동으로 감싸므로 내용만 쓴다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const js = html.match(/<script[^>]*src="\.?\/?([^"]+\.js)"[^>]*><\/script>/);
const css = html.match(/<link[^>]*rel="stylesheet"[^>]*href="\.?\/?([^"]+\.css)"[^>]*>/);
if (!js || !css) throw new Error('dist/index.html에서 js/css를 찾지 못했습니다');

const script = readFileSync(join(dist, js[1]), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = readFileSync(join(dist, css[1]), 'utf8');

const page = `<title>새벽 조기축구</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Jua&display=swap">
<style>${style}</style>
<div id="app"></div>
<script type="module">${script}</script>
`;

mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/index.html', page);
console.log(`dist-artifact/index.html ${(page.length / 1024).toFixed(1)} KB`);

// 게임 사이트(saaskr 등)에 올리는 완성된 HTML 한 장: doctype, 모바일 viewport, 공유 미리보기 태그 포함
const DESC = '동네 운동장에서 세계 결승 무대까지, 한 손으로 즐기는 축구 구단 키우기';
const OG_IMAGE =
  'https://raw.githubusercontent.com/gusdl0368-source/jogichukgu/claude/game-playthrough-analysis-l7rtqj/docs/contest/keyart/%EB%8C%80%ED%91%9C%EC%9D%B4%EB%AF%B8%EC%A7%80_2.jpg';
const [headPart, bodyPart] = page.split('<div id="app"></div>');
const standalone = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#1b2440">
<meta name="description" content="${DESC}">
<meta property="og:title" content="새벽 조기축구">
<meta property="og:description" content="${DESC}">
<meta property="og:image" content="${OG_IMAGE}">
${headPart}</head>
<body>
<div id="app"></div>${bodyPart}</body>
</html>
`;
writeFileSync('dist-artifact/standalone.html', standalone);
console.log(`dist-artifact/standalone.html ${(standalone.length / 1024).toFixed(1)} KB (게임 사이트 업로드용)`);
