---
title: "Astryx 직접 써보기 — Meta의 오픈소스 React 디자인 시스템 설치부터 렌더링까지"
description: "Meta가 공개한 React 19 디자인 시스템 Astryx를 Vite 프로젝트에 직접 설치하고, 테마 프로바이더와 컴포넌트로 화면을 렌더링하기까지의 과정을 정리한다. 패키지 설치, CSS·프로바이더 설정, CLI로 컴포넌트 탐색, 그리고 버튼·배지·입력·스위치를 올린 데모를 실제로 띄워 찍은 결과 화면까지, 전부 직접 실행해 확인한 내용으로만 적는다."
date: 2026-11-11
category: Dev
tags: [astryx, react, design-system, meta, stylex, vite, frontend]
---

[Astryx](https://github.com/meta/astryx)는 Meta가 공개한 오픈소스 React 디자인 시스템이다.
Meta 내부에서 8년간 자라 13,000개 이상의 앱에 쓰이던 시스템을 떼어내 공개한 것으로, 150개가 넘는 접근성 컴포넌트와 테마·다크 모드·CLI를 하나로 묶어 제공한다.
문서가 말하는 특징은 "사람과 AI 에이전트가 같은 도구로 같은 방식으로 만든다"는 점이다 — API·문서·CLI가 함께 설계돼 있다.

이 글은 소개에서 그치지 않고, Astryx를 Vite 프로젝트에 직접 설치해 화면을 띄우기까지를 전부 실행해 확인한 과정으로 적는다.
버전·설치 로그·컴포넌트 목록·결과 화면은 모두 추측이 아니라 실제로 돌려 얻은 것이다.

## 1. 무엇인가 — 한눈에

| 항목 | 값 |
| --- | --- |
| 저장소 | [github.com/meta/astryx](https://github.com/meta/astryx) (`facebook/astryx`는 이쪽으로 리다이렉트) |
| 문서 | [astryx.atmeta.com](https://astryx.atmeta.com) |
| 기반 | React 19+ · [StyleX](https://stylexjs.com) |
| 라이선스 | MIT |
| 상태 | Beta |
| 구성 | `@astryxdesign/core`(컴포넌트·테마), `@astryxdesign/cli`, `@astryxdesign/theme-*`(테마 7종), `@astryxdesign/build` |

핵심 성격을 정리하면 이렇다.

- 스타일링 락인이 없다. 내부적으로 StyleX로 작성됐지만 소비자에겐 보이지 않고, `className`으로 Tailwind·CSS 모듈·순수 CSS를 그대로 덮어쓸 수 있다.
- 빌드 플러그인이 필요 없다. 미리 빌드된 CSS와 JS를 그대로 import 하는 방식이라, PostCSS·Babel 설정 없이 스타일시트 몇 개와 테마 프로바이더만 있으면 동작한다.
- 테마는 CSS 커스텀 프로퍼티 override의 묶음이다. 컴포넌트 소스를 포크하거나 감싸지 않고 토큰만 바꿔 브랜드를 입힌다.
- 사람과 에이전트가 같은 CLI를 쓴다. `astryx` CLI로 컴포넌트 문서·템플릿·테마를 조회하고 스캐폴딩한다.

## 2. 설치

React 19가 필요하므로, Vite의 React + TypeScript 템플릿으로 새 프로젝트를 만들고 Astryx 패키지를 얹었다.
(먼저 Node를 설치했다 — 이 글은 Node `v26.13.0` / npm `11.20.0` 환경에서 진행했다.)

```bash
# 1) Vite + React 19 프로젝트 생성
npm create vite@latest astryx-demo -- --template react-ts
cd astryx-demo
npm install

# 2) Astryx 런타임 패키지 + 테마 + StyleX
npm install @astryxdesign/core @astryxdesign/theme-neutral @stylexjs/stylex

# 3) CLI (개발 의존성)
npm install -D @astryxdesign/cli
```

실제로 설치된 버전은 다음과 같다(이 글 작성 시점).

```text
@astryxdesign/core          0.7.13
@astryxdesign/theme-neutral 0.7.13
@astryxdesign/cli           0.7.13
@stylexjs/stylex            0.19.1
react / react-dom           19.3.1
vite                        8.x
```

> 설치 중 npm이 "`@astryxdesign/core`의 postinstall 스크립트가 차단됐다"는 경고를 띄운다.
> 확인해 보니 이 postinstall은 `astryx init` 실행을 권하는 안내 메시지일 뿐이라, 차단돼도 렌더링에는 지장이 없었다.
> 실제로 `@astryxdesign/core/astryx.css`·`reset.css`, `@astryxdesign/theme-neutral/theme.css`·`/built`는 전부 미리 빌드돼 패키지에 들어 있어 그대로 import로 해석된다.

## 3. 사용 — CSS 세 줄과 테마 프로바이더

Astryx의 설정은 단순하다. 스타일시트 세 개를 순서대로 import 하고, 앱을 테마 프로바이더로 감싸면 끝이다.

### 스타일 import (`src/index.css`)

```css
@import '@astryxdesign/core/reset.css';
@import '@astryxdesign/core/astryx.css';
@import '@astryxdesign/theme-neutral/theme.css';
```

import 순서가 그대로 CSS 레이어 캐스케이드에 대응한다: `reset.css`(`@layer reset`) → `astryx.css` 컴포넌트 스타일(`@layer astryx-base`) → `theme.css` 토큰 override(`@layer astryx-theme`). 순서가 바뀌면 캐스케이드가 뒤집힌다.

### 테마 프로바이더 (`src/main.tsx`)

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme theme={neutralTheme}>
      <App />
    </Theme>
  </StrictMode>,
);
```

(공식 문서의 Next.js 예시에는 `LinkProvider`로 `next/link`를 연결하는 줄이 더 있지만, 순수 Vite 앱에서는 `Theme`만으로 충분하다.)

### 컴포넌트 (`src/App.tsx`)

컴포넌트는 `@astryxdesign/core/<Name>` 경로에서 하나씩 import 한다. 버튼·배지·입력·스위치와 레이아웃용 `VStack`·`HStack`·`Grid`·`Card`를 올려 데모 화면을 만들었다.

```tsx
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Switch } from '@astryxdesign/core/Switch';
import { TextInput } from '@astryxdesign/core/TextInput';

export default function App() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');
  const [notify, setNotify] = useState(true);

  return (
    <div className="page">
      <VStack gap={6}>
        <Heading level={1}>Astryx 데모</Heading>

        <Card>
          <VStack gap={3}>
            <Heading level={3}>Buttons</Heading>
            <HStack gap={2} vAlign="center">
              <Button label="Primary" variant="primary" />
              <Button label="Secondary" variant="secondary" />
              <Button label="Ghost" variant="ghost" />
              <Button label="Destructive" variant="destructive" />
            </HStack>
            <Button
              label={`클릭 ${count}회`}
              variant="primary"
              onClick={() => setCount((c) => c + 1)}
            />
          </VStack>
        </Card>

        <Card>
          <HStack gap={2} vAlign="center">
            <Badge label="Neutral" />
            <Badge label="Success" variant="success" />
            <Badge label="Warning" variant="warning" />
            <Badge label="Error" variant="error" />
          </HStack>
        </Card>

        <Grid columns={2} gap={4}>
          <Card>
            <TextInput label="이름" placeholder="홍길동" value={name} onChange={setName} />
          </Card>
          <Card>
            <Switch label="알림 받기" value={notify} onChange={setNotify} />
          </Card>
        </Grid>
      </VStack>
    </div>
  );
}
```

몇 가지 직접 확인한 API 규칙이 있다.

- `Button`은 `label`이 필수이고 `variant`는 `primary | secondary | ghost | destructive`다. 텍스트는 `children`이 아니라 `label`로 넣는다.
- `Badge`의 `variant`는 `neutral | success | warning | error`와 `blue | purple | teal` 같은 분류용 색을 가진다.
- `TextInput`의 `onChange`는 이벤트가 아니라 바뀐 문자열 값을 바로 넘겨준다(`onChange={setName}`이 그대로 동작).
- `Switch`는 `value: boolean`과 `onChange(checked)`로 제어한다.

### CLI로 컴포넌트 찾기

CLI는 사람과 에이전트가 함께 쓰라고 만든 도구다. 설치된 컴포넌트를 실제로 뽑아 보면 174개가 나온다.

```text
$ node node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs component
Components (174)

name:   Button
import: @astryxdesign/core/Button

name:   Badge
import: @astryxdesign/core/Badge

name:   Switch
import: @astryxdesign/core/Switch
... (Card, Dialog, Table, Toast, TopNav, Chat 등)
```

특정 컴포넌트의 전체 props·예제·접근성 지침은 `astryx component <Name>`으로 바로 읽을 수 있어, 위 App의 prop들도 이 문서를 보고 맞췄다.
문서는 `README.md`에 적힌 대로 `package.json`에 스크립트를 하나 넣어 두면 더 안정적으로 부른다.

```json
"scripts": {
  "astryx": "node node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs"
}
```

## 4. 예제 결과 화면

`npm run dev`로 Vite 개발 서버를 띄우고 브라우저에서 연 실제 화면이다. 버튼·배지·입력·스위치가 모두 테마 스타일로 렌더링됐고, 상호작용도 동작한다 — 카운터 버튼을 세 번 눌러 "클릭 3회"가 됐고, 입력창에 넣은 "홍길동"이 아래 "입력값"에 그대로 반영됐으며, 스위치는 "켜짐" 상태다.

<figure style="margin:28px 0">
<img src="/images/astryx-demo.png" alt="Astryx 컴포넌트로 만든 데모 화면: 버튼 variant 4종, 카운터 버튼(클릭 3회), 배지 색상, 이름 입력 필드(홍길동), 알림 스위치" style="width:100%;height:auto;border:1px solid var(--border);border-radius:10px" />
<figcaption style="text-align:center;color:var(--muted);font-size:13px;margin-top:6px">Astryx + Vite + React 19 데모 — 직접 실행해 찍은 화면</figcaption>
</figure>

눈으로 확인한 것들:

- Button의 `primary`는 채워진 검정, `secondary`는 연회색, `ghost`는 배경 없는 텍스트, `destructive`는 붉은 톤으로 variant마다 또렷이 구분된다.
- Badge는 `success`(초록)·`warning`(노랑)·`error`(빨강)처럼 상태 색이 바로 입혀진다.
- 테마 토큰이 적용돼 카드 테두리·라운드·여백·타이포가 일관된다. 추가 CSS는 레이아웃용 `.page`(가운데 정렬·여백)뿐이고, 컴포넌트 외형은 전부 Astryx가 그렸다.

## 5. 정리

- Astryx는 Meta가 공개한 React 19 디자인 시스템으로, 미리 빌드된 CSS를 import 하고 `Theme` 프로바이더로 감싸는 것만으로 빌드 플러그인 없이 동작한다.
- 설치는 `@astryxdesign/core` + 테마 + `@stylexjs/stylex`에 CLI(`@astryxdesign/cli`)를 더하는 구성이며, 이 글은 실제로 Vite 프로젝트에 올려 174개 컴포넌트 중 버튼·배지·입력·스위치를 렌더링해 확인했다.
- 컴포넌트 API는 `label`·`variant`처럼 규칙이 일관돼, CLI 문서(`astryx component <Name>`)만 보고도 예측 가능하게 쓸 수 있었다.
- 아직 Beta라 패키지 버전(0.7.x)과 일부 컴포넌트는 변할 수 있으니, 실제 도입 전에는 문서의 해당 버전 기준을 확인하는 편이 좋다.

> "미리 빌드된 CSS + 테마 프로바이더"라는 단순한 진입점 덕분에, 설정에 시간을 쓰지 않고 첫 화면을 바로 띄울 수 있었다.
> 다음엔 테마를 `theme-neutral` 대신 다른 7종(butter·chocolate·matcha 등) 중 하나로 바꾸거나, `astryx swizzle`로 컴포넌트 소스를 꺼내 커스터마이즈해 볼 만하다.
