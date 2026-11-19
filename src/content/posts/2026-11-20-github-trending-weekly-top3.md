---
title: "금주 GitHub Trending Top 3 설치·설정기 (실제 검증)"
description: "2026년 11월 셋째 주 GitHub Trending(weekly) 상위 3개 저장소를 직접 설치·설정해 본 기록. 공식 설치법과 함께 현재 시스템(Windows·Node)에서의 설치 가능성을 검토하고, modern-web-guidance로 실제 동작 예제를 검증한다."
date: 2026-11-20
category: Dev
tags: [github-trending, cli, agent-skills, nodejs, tools]
draft: false
---

GitHub Trending(weekly)에서 금주 상위에 오른 세 저장소를 **직접 설치·설정**해 봤다. 모든 명령과 결과는 **실제 실행으로 검증**했고, 실행이 불가한 부분은 **"무엇이 막혔는지"를 그대로** 적었다(지어내지 않음).

- 검증 환경: Windows 11, Node.js v26, npm 11
- 확인 시점의 Trending 순위(노출 순)

| # | 저장소 | 한 줄 소개 | 언어 | 이번 주 ★ |
| --- | --- | --- | --- | --- |
| 1 | **backnotprop/plannotator** | 에이전트 작업을 받아보고·주석·리뷰하는 워크스페이스 | TypeScript | +3,290 |
| 2 | **google-labs-code/stitch-skills** | Google Stitch용 에이전트 스킬 모음 | TypeScript | +1,567 |
| 3 | **GoogleChrome/modern-web-guidance-src** | 코딩 에이전트에 최신 웹 베스트프랙티스를 주입 | TypeScript | +7,257 |

> 결론부터: **#3는 이 시스템에서 설치·실행·예제까지 전부 검증**됐다. #1·#2는 **공식 설치 절차는 명확하나 실제 "실행 예제"에는 별도 조건**(에이전트 GUI·전용 계정)이 필요해, 이 글에서는 설치 절차와 **시스템 설치 가능성 검토 결과**까지만 검증했다.

## 3. GoogleChrome/modern-web-guidance-src ✅ (설치·예제 검증 완료)

코딩 에이전트가 `float` 레이아웃 같은 **낡은 패턴 대신 최신 웹 플랫폼 기능**을 쓰도록 안내하는 스킬/CLI다. Chrome·Edge·Firefox·MDN 팀이 함께 관리한다.

### 설치

Node.js 22 이상이면 설치 없이 바로 쓸 수 있고, 에이전트에 영구 설치하려면 설치 마법사를 쓴다.

```bash
# 에이전트에 설치(대화형 마법사)
npx modern-web-guidance@latest install

# 또는 설치 없이 즉시 사용
npx modern-web-guidance@latest search "<검색어>"
```

### 예제 — 실제 실행 결과

**① 가이드 검색** (`search`): "모달 다이얼로그 배경 애니메이션"을 검색하면 관련 가이드 ID 목록이 나온다.

```text
$ npx modern-web-guidance@latest search "animate a dialog modal backdrop"
[{"id":"animate-to-from-top-layer","description":"Animate elements such as dialogs, popovers... "},
 {"id":"light-dismiss-a-dialog","description":"Create a modal dialog that can be closed via light dismiss..."},
 {"id":"dialog","description":"Build a modal or non-modal dialog component that is accessible..."},
 ... ]
```

**② 가이드 조회** (`retrieve`): ID로 실제 지침을 받는다.

```text
$ npx modern-web-guidance@latest retrieve "light-dismiss-a-dialog"
--- Guide for light-dismiss-a-dialog ---
# Light-Dismiss a Dialog
...
1. Add `closedby="any"` to the <dialog> element.
2. Open the dialog using dialog.showModal().
```

`closedby="any"` 한 줄로 **JS 없이** 배경 클릭·Esc 닫기를 구현하라는, 검증된 최신 지침이다.

**③ 레거시 스캔** (`legacy-scan`): 코드베이스에서 낡은 패턴을 찾는다. (샘플 디렉터리 스캔이 정상 동작)

```text
$ npx modern-web-guidance@latest legacy-scan ./src
Modern Web Guidance Analyzer — ./src
0 findings from 38 qualified guides.
```

→ `search`·`retrieve`·`legacy-scan` 세 명령 모두 **정상 동작 확인**. 에이전트에 붙이면 코드 제안이 최신 표준을 따르게 된다.

## 1. backnotprop/plannotator (설치 절차 검증)

에이전트가 만든 **계획·명세·diff·PR을 사람이 받아보고 주석·승인**한 뒤 피드백을 에이전트로 돌려보내는 워크스페이스다. Claude Code·Codex·Gemini CLI 등 다수 에이전트를 지원한다.

### 설치 (공식)

하나의 설치기가 `plannotator` 바이너리를 깔고, 설치된 에이전트를 감지해 훅·스킬·슬래시 명령을 구성한다.

```bash
# macOS / Linux
curl -fsSL https://plannotator.ai/install.sh | bash
```
```powershell
# Windows (PowerShell)
irm https://plannotator.ai/install.ps1 | iex
```

- 바이너리만 원하면 `--minimal`(또는 `PLANNOTATOR_MINIMAL=1`) → 에이전트 설정을 건드리지 않고 `~/.local/bin`에만 설치.
- Claude Code는 설치 후 `/plugin marketplace add backnotprop/plannotator` → `/plugin install plannotator@plannotator`.

### 이 시스템 설치 가능성 검토

- 최신 릴리스 **v0.29.1** 존재 확인(바이너리 배포 중).
- ⚠️ 설치기는 **원격 스크립트 실행 + 사용자의 실제 에이전트 설정을 자동 변경**한다. **네이티브 Windows에서는 Codex 훅이 실험적**이라 설치기가 수동 설정 안내를 출력한다(저장소 문서 기준).
- 이 글에서는 사용자의 에이전트 구성을 바꾸지 않기 위해 **전체 설치는 수행하지 않았다.** 실제 "주석 리뷰" 예제는 에이전트 세션이 계획을 만들어낼 때 동작하므로, 바이너리 설치 후 에이전트에서 확인하는 것이 맞다.

## 2. google-labs-code/stitch-skills (설치 검토)

[Google Stitch](https://stitch.withgoogle.com)와 연동되는 **에이전트 스킬/플러그인 모음**이다. [Agent Skills](https://agentskills.io) 표준을 따르며 `stitch-design`·`stitch-build`·`stitch-utilities` 세 플러그인으로 구성된다(각 `plugin.json` + `skills/`).

### 설치 (공식 권장)

```bash
# Claude Code (현재 프로젝트에 설치)
npx plugins add google-labs-code/stitch-skills --scope project --target claude-code
```

### 이 시스템 설치 가능성 검토

- ⚠️ 위 권장 명령을 실제 실행하니 **이 시스템에서는 실패**했다:
  ```text
  Warning: Claude Code was not detected on this system.
  Could not complete the command.
  Scope "project" is not supported for Claude Code with this source.
  ```
  `plugins` 설치기가 **독립 실행형 Claude Code CLI를 찾지 못해** project 스코프 설치가 거부된다.
- 대안은 **수동 설치**다. 저장소를 받아 원하는 스킬 폴더(`plugins/stitch-*/skills/`)를 에이전트의 스킬 경로에 복사하면 된다(README의 OpenCode 수동 설치 방식).
- 단, 스킬의 **실제 기능은 Stitch MCP 서버 + Google Stitch 접근**을 전제로 하므로, 계정·MCP 설정 없이는 "동작 예제"까지는 만들 수 없다. 그래서 이 글에서는 **구조 확인까지만** 검증했다.

## 정리

| 저장소 | 이 시스템 설치 | 동작 예제 | 비고 |
| --- | --- | --- | --- |
| modern-web-guidance | ✅ (npx) | ✅ search/retrieve/legacy-scan | Node 22+면 즉시 사용 |
| plannotator | △ 바이너리 설치 가능 | ⛔(에이전트 필요) | Win 네이티브 훅 실험적 |
| stitch-skills | △ 수동만 | ⛔(Stitch 계정 필요) | 권장 설치기 실패 |

- **지금 당장 써 볼 수 있는 건 modern-web-guidance**다. `npx` 한 줄로 최신 웹 표준 지침을 검색·주입할 수 있어 설치 장벽이 가장 낮다.
- plannotator·stitch-skills는 "에이전트 생태계" 도구라, **에이전트/계정이 갖춰진 환경**에서 진짜 가치가 나온다. 설치 절차 자체는 명확하니, 조건이 맞는 환경에서 적용하면 된다.
- 트렌딩 상위라고 아무 데서나 바로 돌아가는 건 아니다. **"내 시스템/워크플로에 설치 가능한가"를 먼저 확인**하는 습관이 결국 시간을 아낀다.

---

*검증 환경: Windows 11 · Node.js v26 · npm 11. 모든 명령 출력은 직접 실행 결과이며, 실행하지 못한 부분(에이전트/계정 전제)은 그 사유를 명시했다. 별표 수치는 확인 시점의 GitHub Trending(weekly) 기준.*
