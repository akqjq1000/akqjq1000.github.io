import type { APIRoute } from 'astro';
import { getPosts } from '../lib/posts';
import { url } from '../lib/site';

// 클라이언트 검색용 정적 인덱스. 빌드 시 /search-index.json 으로 생성된다.
export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const data = posts.map((p) => ({
    title: p.data.title,
    description: p.data.description,
    url: url(`/posts/${p.id}/`),
    category: p.data.category,
    tags: p.data.tags,
    date: p.data.date.toISOString().slice(0, 10),
  }));
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
