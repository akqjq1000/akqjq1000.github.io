# LeJus Blog

정보보안과 IT 기술을 직접 실험하고 기록하는 블로그.
**https://akqjq1000.github.io/**

- Framework: [Astro](https://astro.build) 5 (정적 사이트 생성)
- Hosting: GitHub Pages (GitHub Actions 자동 배포)
- 코드 하이라이트: Shiki (라이트 `github-light` / 다크 `github-dark-dimmed`)
- 부가 기능: 카테고리·태그 분류, RSS 피드, 사이트맵, 다크 모드

## 로컬 개발

```bash
npm install
npm run dev        # http://localhost:4321/
npm run build      # astro check(타입 검사) + astro build → dist/
npm run preview    # 빌드 결과 미리보기
```

## 글 쓰기

```bash
npm run new -- "포스트 제목"
```

`src/content/posts/YYYY-MM-DD-포스트-제목.md` 가 `draft: true` 상태로 생성된다.
작성을 마치면 `draft: false`로 바꾸고 `main`에 push 하면 자동 배포된다.

### 로컬 편집기

```bash
npm install        # 최초 1회 (미리보기에 필요)
npm run editor     # http://127.0.0.1:4322
```

브라우저에서 글을 생성·수정·삭제할 수 있는 로컬 전용 편집기다. 저장·삭제 시 해당 파일만 자동으로 commit + push 하며(`main`이면 바로 배포), 로컬 git 인증을 사용하고 외부 접속은 받지 않는다.
새 글 본문은 `scripts/post-template.md`로 시작하고(수정 가능), 제목·본문에 나온 기존 태그와 코드 블록 언어를 태그로 추천한다. 미리보기는 블로그와 같은 Markdown 설정(`astro.config.mjs`)으로 렌더링한다.

### Frontmatter

`src/content.config.ts`의 스키마를 따른다.

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `title` | ✓ | 제목 |
| `description` | ✓ | 목록·SEO용 요약 |
| `date` | ✓ | 작성일 (`YYYY-MM-DD`) |
| `updated` | | 수정일 |
| `category` | | 카테고리 이름 (기본 `Note`). 새 이름을 쓰면 카테고리가 생긴다 |
| `tags` | | 문자열 배열 |
| `draft` | | `true`면 배포되지 않음 (dev 서버에서는 보임) |

## 배포 파이프라인

`.github/workflows/deploy.yml` (Node 22)

1. `main` push · PR · 수동 실행(`workflow_dispatch`) → `npm ci` → `npm run build`(`astro check` + `astro build`)
2. `main` push(및 수동 실행)일 때만 `dist/`를 GitHub Pages에 배포
3. PR에서는 빌드·타입 검증만 수행

> 최초 1회: GitHub 저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 설정해야 한다.

## 구조

```
src/
  pages/
    index.astro            # 홈 (글 목록)
    about.astro            # 소개
    404.astro              # Not Found
    rss.xml.ts             # RSS 피드
    posts/[...slug].astro  # 글 상세
    categories/            # 카테고리 목록 · 카테고리별 글
    tags/                  # 태그 목록 · 태그별 글
  content/
    posts/                 # 글 (Markdown)
  content.config.ts        # posts 컬렉션 frontmatter 스키마
  components/              # Header · Footer · Sidebar · PostCard · Calendar
  layouts/Base.astro       # 공통 레이아웃 (메타·OG·테마)
  lib/
    posts.ts               # 글 조회(getPosts) · 태그 슬러그
    site.ts                # 사이트 메타 · URL · 날짜·읽기시간 포맷
  styles/global.css        # 전역 스타일
public/                    # 정적 파일 (favicon, 이미지, ads.txt 등)
scripts/                   # new-post.mjs · editor.mjs · post-template.md
astro.config.mjs           # site · base · sitemap · Markdown(Shiki) 설정
```

사이트 메타데이터(제목·작성자·설명·GitHub 링크 등)는 `src/lib/site.ts`의 `SITE`에서 관리한다.
