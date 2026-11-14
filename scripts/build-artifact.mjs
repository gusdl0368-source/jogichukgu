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
<style>${style}</style>
<div id="app"></div>
<script type="module">${script}</script>
`;

mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/index.html', page);
console.log(`dist-artifact/index.html ${(page.length / 1024).toFixed(1)} KB`);
