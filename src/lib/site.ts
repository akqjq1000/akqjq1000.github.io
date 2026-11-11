export const SITE = {
  title: 'LeJus Blog',
  author: 'LeJus',
  tagline: '웹해킹 워게임 풀이와 보안·IT 기술 기록',
  description:
    '정보보안과 IT 기술을 직접 실험하고 기록하는 블로그. webhacking.kr·pwnable.kr 워게임 풀이와 웹·네트워크·시스템 보안, 리버싱까지 예측이 아닌 실제 검증 결과로 정리합니다.',
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
