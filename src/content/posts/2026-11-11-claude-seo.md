---
title: "claude-seo 직접 써보기 — Claude Code용 SEO 플러그인으로 내 블로그 감사하고 고치기"
description: "Claude Code용 오픈소스 SEO 플러그인 claude-seo를 실제로 설치하고, 그 감사 도구로 이 블로그(akqjq1000.github.io)를 점검한 뒤 지적된 항목(robots.txt·llms.txt·구조화 데이터)을 직접 고쳐 적용한 과정을 정리한다. 설치 로그, 런타임 상태, 실제 감사 결과(JSON), 적용 후 빌드 검증까지 전부 직접 실행해 확인한 내용으로만 적는다."
date: 2026-11-11
category: Dev
tags: [claude-seo, seo, claude-code, llms-txt, structured-data, schema, astro]
---

[claude-seo](https://github.com/AgriciDaniel/claude-seo)는 Claude Code 안에서 도는 오픈소스 SEO 감사 플러그인이다(MIT).
URL 하나를 주면 기술 SEO·콘텐츠(E-E-A-T)·구조화 데이터·AI 검색(GEO)·에이전트 가독성 등을 점검하고, 우선순위가 매겨진 수정 계획을 돌려준다.
26개의 서브스킬과 19개의 전문 에이전트로 구성되며, 감사 자동화를 위해 격리된 Python 런타임과 헤드리스 Chromium을 함께 설치한다.

이 글은 소개에서 그치지 않고, claude-seo를 직접 설치해 이 블로그를 감사하고, 도구가 지적한 항목을 실제로 고쳐 넣기까지를 전부 실행해 확인한 과정으로 적는다.
설치 로그·런타임 상태·감사 결과(JSON)·적용 후 빌드 검증은 모두 추측이 아니라 돌려서 얻은 것이다.

## 1. 무엇인가

| 항목 | 값 |
| --- | --- |
| 저장소 | [github.com/AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) |
| 형태 | Claude Code 플러그인 / 스킬 (슬래시 명령 `/seo …`) |
| 라이선스 | MIT |
| 구성 | 26 서브스킬 + 19 에이전트, 격리 Python 런타임 + Chromium |
| 요구 | Claude Code 1.0.33+, Python 3.11–3.14, Git |

점검 범위는 한 명의 SEO 컨설턴트가 볼 법한 것들이다 — 크롤링·인덱싱·sitemap·robots.txt·속도(Core Web Vitals), E-E-A-T, Schema.org 구조화 데이터, AI 검색 인용 가능성(GEO), 에이전트 가독성(llms.txt·Lighthouse Agentic Browsing) 등.

## 2. 설치

설치 방법은 두 가지다.

```bash
# (A) Claude Code 플러그인 마켓플레이스
/plugin marketplace add AgriciDaniel/claude-seo
/plugin install claude-seo@agricidaniel-claude-seo
/seo setup

# (B) 수동 설치 (Windows PowerShell)
git clone --depth 1 https://github.com/AgriciDaniel/claude-seo.git
powershell -ExecutionPolicy Bypass -File claude-seo\install.ps1
```

이 글에서는 (B) 수동 설치를 썼다. 먼저 요구 런타임인 Python을 설치했다(이 환경은 Python 3.13.17 / Git 사용).
`install.ps1`은 실행 전에 전문을 읽어 확인했는데, 하는 일은 명확했다 — 저장소를 특정 릴리스 태그(`v2.6.0`)로 임시 폴더에 받아 스킬·에이전트·스크립트를 `~/.claude/skills/seo`와 `~/.claude/agents`로 복사하고, 격리된 Python venv와 Chromium을 만든다. 시스템 전역은 건드리지 않는다.

실제 설치 로그:

```text
========================================
|   Claude SEO - Installer             |
========================================
[+] Python 3.13.17 detected
[+] Git detected
>> Downloading Claude SEO (v2.6.0)...
=> Installing skill files...
=> Installing subagents...
=> Installing extensions...
=> Creating isolated Python runtime...
Creating isolated Claude SEO environment...
Claude SEO runtime is ready.

[+] Claude SEO installed successfully!
```

설치 후 `~/.claude/skills/seo`(SKILL.md, scripts, schema, references, `.venv`, Chromium)와 `~/.claude/agents`의 `seo-*.md` 에이전트 파일 20개가 자리 잡았다.
런타임 상태는 claude-seo의 doctor로 확인한다.

```text
$ (claude-seo) doctor
Runtime: ready
Install mode: manual
Python: 3.13
Chromium: ready
```

## 3. 사용 방법

설치 후에는 Claude Code 안에서 슬래시 명령으로 쓴다.

```bash
/seo audit https://example.com      # 전체 감사(병렬 에이전트) + 우선순위 수정 계획
/seo agentic https://example.com    # 에이전트 가독성: robots.txt·llms.txt·Markdown·WebMCP
/seo schema https://example.com     # 구조화 데이터 탐지·검증·생성
/seo technical https://example.com  # 기술 SEO 9개 범주
/seo geo https://example.com        # AI Overviews / 생성형 엔진 최적화
```

`/seo audit`는 여러 에이전트가 동시에 사이트를 훑고 Markdown·PDF·JSON 리포트를 남긴다.
내부적으로는 `~/.claude/skills/seo/scripts/`의 Python 스크립트들(예: `agentic_check.py`, `schema_generate.py`, `page_checks.py`)이 격리 venv에서 돌아가고, 결과 JSON을 모아 보고서를 만든다. 아래 감사도 그 스크립트를 직접 실행해 얻은 것이다.

## 4. 내 블로그에 적용

### 감사 (before)

에이전트 가독성 점검(`agentic_check`)을 이 블로그 라이브 주소에 돌렸다. 핵심만 추린 실제 결과(JSON)다.

```json
// agentic_check https://akqjq1000.github.io  (before)
{ "id": "robots-reachable", "priority": "P0", "status": "warn",
  "evidence": { "status": 404 },
  "fix": "No robots.txt means everything is allowed and no AI-usage preference is declared. Publish one deliberately." }

{ "id": "server-rendered", "priority": "P0", "status": "pass",
  "evidence": { "words_without_js": 1011 } }

{ "id": "llms-txt", "priority": "P1", "status": "info",
  "evidence": { "status": 404 },
  "fix": "No /llms.txt. Publishing a valid one adds a counted Lighthouse pass. Include an H1, a '>' summary and Markdown links." }
```

정리하면, 콘텐츠는 자바스크립트 없이도 잘 렌더된다(1,011단어, pass). 반면 두 가지가 비어 있었다.

- `robots.txt` 없음 (P0): 크롤러 정책과 sitemap 위치를 선언하지 못한다.
- `llms.txt` 없음 (P1): AI 에이전트용 요약 파일이 없다.

여기에 더해, 글 페이지에 `JSON-LD` 구조화 데이터가 전혀 없었다(Base 레이아웃 점검으로 확인). claude-seo의 schema 스킬은 블로그에 `WebSite`·`BlogPosting`을 권장한다.

### 수정 (적용한 것)

도구가 지적한 항목을 이 저장소에 직접 반영했다.

1. `public/robots.txt` — 모든 크롤러 허용 + sitemap 선언.

```text
User-agent: *
Allow: /

Sitemap: https://akqjq1000.github.io/sitemap-index.xml
```

2. `public/llms.txt` — llmstxt.org 형식(H1 + `>` 요약 + Markdown 링크)으로 블로그 요약과 주요 글 목록.

3. 구조화 데이터 — `Base.astro`에 모든 페이지 공통 `WebSite`, 글 페이지에는 `BlogPosting`을 JSON-LD로 주입하고, `article:published_time`·`article:author` 등 OG 메타를 더했다. 글 페이지가 내보내는 `BlogPosting`은 이렇게 생겼다.

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "webhacking.kr old-05 풀이 …",
  "datePublished": "2026-11-07T00:00:00.000Z",
  "dateModified": "2026-11-07T00:00:00.000Z",
  "author": { "@type": "Person", "name": "LeJus", "url": "https://github.com/akqjq1000" },
  "mainEntityOfPage": { "@type": "WebPage", "@id": "https://akqjq1000.github.io/posts/2026-11-07-webhacking-kr-old-05/" },
  "inLanguage": "ko-KR",
  "articleSection": "Web",
  "keywords": "webhacking.kr, web, wargame, access-control, …"
}
```

### 검증 (after)

적용본을 빌드해 결과를 확인했다. 타입 검사와 빌드 모두 통과한다.

```text
$ npm run build        # astro check && astro build
[check] Result (22 files): 0 errors, 0 warnings, 0 hints
[build] 78 page(s) built
[@astrojs/sitemap] sitemap-index.xml created at dist
```

로컬 빌드 서버로 새 파일이 실제로 서빙되는지 확인했다.

```text
$ curl -I http://localhost:4321/robots.txt   → HTTP 200  text/plain
$ curl -I http://localhost:4321/llms.txt      → HTTP 200  text/plain

# 글 HTML 안의 구조화 데이터
WebSite: 1 · BlogPosting: 1 · article:published_time: 1
```

before에서 404였던 `robots.txt`·`llms.txt`가 200으로 응답하고, 글마다 `WebSite`+`BlogPosting` JSON-LD가 들어갔다.

> 참고: claude-seo는 안전장치(SSRF 방지)로 `localhost`·사설 IP 감사를 거부한다. 그래서 수정본에 대한 도구 재감사는 변경이 배포된 뒤 라이브 주소로 `/seo agentic https://akqjq1000.github.io`를 다시 돌려야 확인된다. 이 글에서는 배포 전이라, after는 빌드 검증과 로컬 서빙(HTTP 200)으로 확인했다.

## 5. 결과 및 정리

- claude-seo는 Claude Code용 오픈소스 SEO 플러그인으로, 수동 설치(`install.ps1`) 시 스킬·에이전트를 `~/.claude`에 복사하고 격리 Python venv + Chromium을 만든다. `doctor`로 런타임 ready를 확인했다.
- 감사는 `/seo` 슬래시 명령으로 돌리지만, 내부 Python 스크립트(`agentic_check.py` 등)를 직접 실행해도 같은 JSON 결과를 얻는다.
- 이 블로그를 실제로 감사해 `robots.txt`(P0)·`llms.txt`(P1) 부재와 구조화 데이터 부재를 확인했고, 세 가지를 모두 반영해 `astro check` 0 errors로 검증했다.
- 정적 블로그에서 claude-seo가 다루는 항목 상당수(지역 SEO·커머스·WebMCP 등)는 해당 없음(na)으로 빠졌다. 작은 사이트에서도 바로 효과가 있는 건 robots/sitemap·llms.txt·JSON-LD 쪽이었다.

> 도구의 값어치는 "무엇을 고쳐야 하는지"를 근거와 함께 짚어 준다는 데 있었다.
> 다음엔 배포 후 라이브 주소로 `/seo audit`과 `/seo geo`를 돌려, AI 검색 인용 관점의 항목까지 확인해 볼 만하다.
