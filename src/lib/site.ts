export const SITE = {
  title: 'LeJus Blog',
  author: 'LeJus',
  tagline: '웹해킹 워게임 풀이와 보안·IT 기술 기록',
  description:
    '직접 실험하고 검증한 결과로 기록하는 보안·IT 블로그. 워게임 풀이와 웹·네트워크·시스템 보안을 다룹니다.',
  github: 'https://github.com/akqjq1000',
  ogImage: '/images/og-default.png',
  locale: 'ko-KR',
};

/** base 경로를 붙인 내부 링크 생성 */
export function url(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.\s?/g, '.').replace(/\.$/, '');
}

export function readingTime(body = ''): number {
  const text = body.replace(/```[\s\S]*?```/g, '').replace(/<[^>]+>/g, '');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
