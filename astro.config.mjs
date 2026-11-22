// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 글 frontmatter의 date/updated를 읽어 sitemap <lastmod>를 채운다.
// (@astrojs/sitemap은 기본적으로 lastmod를 넣지 않는다.)
const POSTS_DIR = fileURLToPath(new URL('./src/content/posts', import.meta.url));
/** @type {Map<string, string>} key: "/posts/<slug>" (후행 슬래시 없음), value: ISO 날짜 */
const lastmodBySlug = new Map();
let newestPostIso = '';
try {
  for (const file of readdirSync(POSTS_DIR)) {
    if (!/\.(md|mdx)$/.test(file)) continue;
    const slug = file.replace(/\.(md|mdx)$/, '');
    const src = readFileSync(`${POSTS_DIR}/${file}`, 'utf8');
    const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    const body = fm[1];
    if (/^draft:\s*true\s*$/m.test(body)) continue;
    const date = body.match(/^date:\s*['"]?(\d{4}-\d{2}-\d{2})/m)?.[1];
    const updated = body.match(/^updated:\s*['"]?(\d{4}-\d{2}-\d{2})/m)?.[1];
    const stamp = updated || date;
    if (!stamp) continue;
    const iso = new Date(`${stamp}T00:00:00Z`).toISOString();
    lastmodBySlug.set(`/posts/${slug}`, iso);
    if (iso > newestPostIso) newestPostIso = iso;
  }
} catch {
  // 글 디렉터리를 읽지 못해도 sitemap 생성은 계속한다(lastmod만 생략).
}

export default defineConfig({
  site: 'https://akqjq1000.github.io',
  base: '/',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/\/$/, '') || '/';
        const postIso = lastmodBySlug.get(path);
        if (postIso) {
          item.lastmod = postIso;
        } else if ((path === '' || path === '/' || path === '/posts' || path === '/categories') && newestPostIso) {
          // 글 목록 성격의 페이지는 가장 최근 글 날짜로 lastmod 설정
          item.lastmod = newestPostIso;
        }
        return item;
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark-dimmed' },
      wrap: false,
    },
  },
});
