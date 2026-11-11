---
title: "webhacking.kr old-61 풀이 — SELECT 컬럼 자리에서 결과값을 위조하는 SQL Injection"
description: "webhacking.kr old-61을 통해, WHERE가 아니라 SELECT 컬럼 목록에 입력이 들어가는 SQL 인젝션을 정리한다. select, from, 괄호, 콤마, 점이 모두 막히고 길이도 15자 이내인 좁은 필터 안에서, 따옴표 없이도 문자열을 만드는 16진수 리터럴과 AS 없는 컬럼 별칭만으로 조회 결과의 id 값을 'admin'으로 위조하는 과정을, 실제로 서버에 요청을 보내 확인한 응답으로만 검증해 설명한다."
date: 2026-11-11
category: Web
tags: [webhacking.kr, web, wargame, sql-injection, php, mysql, filter-bypass]
---

[webhacking.kr](https://webhacking.kr)의 **old-61** 문제를 풀었다.
앞서 다룬 old-18이 "입력이 `WHERE` 절에 그대로 들어가는 고전 SQL 인젝션", old-21이 응답 문구만 보고 한 글자씩 뽑아내는 **Blind SQL Injection** 이었다면,
old-61은 입력이 들어가는 **위치가 다르다** — 바로 **`SELECT` 컬럼 목록** 이다.

조건을 참으로 만드는 게 아니라, **조회 결과로 돌아올 값 자체를 공격자가 만들어 낸다.**
게다가 `select`·`from`·괄호·콤마·점이 전부 막혀 있고 길이는 **15자 이내** 라는 아주 좁은 상자 안에서 그걸 해내야 한다.

이 글은 추측이 아니라 **실제로 서버에 각 페이로드를 보내 응답을 관찰하고, 결과값을 `admin`으로 위조해 통과(`Pwned`)까지 확인** 한 과정을 그대로 정리한다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-61 (`/challenge/web-38/`) |
| 배점 | 20점 |
| 유형 | SQL Injection (SELECT 절 삽입 + 필터 우회) |
| 목표 | 조회 결과 `id`를 `admin`으로 만들어 `solve()` 통과 |

처음 페이지를 열면 본문은 거의 비어 있고 `view-source` 링크 하나만 있다. 다행히 이 문제는 **소스가 공개** 돼 있어, `?view_source=1`로 서버 코드를 그대로 볼 수 있다.

## 2. 소스 분석

`?view_source=1` 응답에서 복원한 서버 코드는 다음과 같다. (실제 응답을 그대로 정리한 것이다.)

```php
<?php
  include "../../config.php";
  if($_GET['view_source']) view_source();
  $db = dbconnect();
  if(!$_GET['id']) $_GET['id']="guest";
  echo "<html><head><title>Challenge 61</title></head><body>";
  echo "<a href=./?view_source=1>view-source</a><hr>";
  $_GET['id'] = addslashes($_GET['id']);
  if(preg_match("/\(|\)|select|from|,|by|\./i",$_GET['id'])) exit("Access Denied");
  if(strlen($_GET['id'])>15) exit("Access Denied");
  $result = mysqli_fetch_array(mysqli_query($db,"select {$_GET['id']} from chall61 order by id desc limit 1"));
  echo "<b>{$result['id']}</b><br>";
  if($result['id'] == "admin") solve(61);
  echo "</body></html>";
?>
```

핵심을 한 줄씩 읽으면:

- 쿼리는 `select {입력} from chall61 order by id desc limit 1` — **우리 입력이 SELECT 컬럼 목록 자리에 그대로 들어간다.**
- 통과 조건은 `$result['id'] == "admin"` — 즉 **조회 결과 배열의 `id` 키 값이 문자열 `admin`** 이어야 한다.
- `addslashes()` 로 `'` `"` `\` 가 이스케이프된다 → **따옴표로 문자열 리터럴을 만들기 어렵다.**
- `preg_match` 로 **`(` `)` `select` `from` `,` `by` `.`** 가 (대소문자 무시) 하나라도 있으면 `Access Denied`.
- 길이가 **15자를 넘으면** `Access Denied`.

막아 둔 걸 보면 출제자의 의도가 보인다. 괄호 금지 → `char()`·`concat()` 같은 함수 봉쇄. 콤마 금지 → `substr(x,1,1)`류 봉쇄. 따옴표 이스케이프 → `'admin'` 봉쇄. 그런데도 **문자열 `admin`을, 15자 안에서, 결과의 `id` 컬럼으로** 만들어야 한다.

## 3. 두 가지 문제를 나눠 보기

목표를 둘로 쪼갰다.

1. **값을 `admin`으로** — 따옴표가 막혔으니 문자열 리터럴을 어떻게 만드나?
2. **키를 `id`로** — `$result['id']`로 읽으려면 그 컬럼의 이름(또는 별칭)이 정확히 `id`여야 한다.

### (1) 따옴표 없이 문자열 만들기 — 16진수 리터럴

MySQL은 `0x...` 형태의 **16진수 리터럴** 을 문자열처럼 다룬다. `admin`을 바이트로 풀면 `61 64 6d 69 6e`, 즉 `0x61646d696e`가 곧 `admin`이다. 따옴표가 한 글자도 안 들어가니 `addslashes`도 손대지 못한다.

### (2) `id`라는 이름 붙이기 — AS 없는 별칭

`$result`는 `mysqli_fetch_array`의 결과라, 연관 배열의 키는 **컬럼 이름 또는 별칭** 이다. 그냥 `0x61646d696e`만 쓰면 컬럼 이름이 `0x61646d696e`이 되어 `$result['id']`는 비게 된다. 실제로 확인해 보면 정확히 그렇다.

| 요청 | `<b>...</b>` | 해석 |
| --- | --- | --- |
| `?id=0x61646d696e` | *(빈칸)* | 값은 admin이지만 컬럼명이 `id`가 아니라 `$result['id']`가 빔 |

그러니 **별칭을 `id`로** 달아야 한다. 보통 `0x61646d696e AS id`로 쓰지만 — 길이를 세어 보면 18자라 `Access Denied`다. MySQL은 **`AS`를 생략** 하고 공백만으로 별칭을 붙일 수 있다.

```text
0x61646d696e id
```

- `0x61646d696e` = 12자
- 공백 = 1자
- `id` = 2자
- 합계 = **15자** → `strlen > 15`에 걸리지 않는다. (딱 경계값)
- 금지어(`(`,`)`,`select`,`from`,`,`,`by`,`.`)·따옴표 **하나도 없음.**

## 4. 필터 오라클 먼저 확인

페이로드를 쏘기 전에, 필터가 정말 설명대로 동작하는지 실제 응답으로 못을 박았다. 아래는 전부 **실제 응답** 이다.

| 요청 (`id=`) | 길이 | 응답 |
| --- | --- | --- |
| `select id` | 9 | `Access Denied` (금지어 `select`) |
| `1 from x` | 8 | `Access Denied` (금지어 `from`) |
| `aaaaaaaaaaaaaaaaa` | 17 | `Access Denied` (길이 초과) |
| `0x61646d696e` | 12 | `<b></b>` (통과하지만 `id` 키가 빔) |

금지어가 걸리면 `<hr>` 뒤가 통째로 `Access Denied`로 끝나고, 길이 초과도 같은 문구다. 반면 `0x61646d696e`는 **필터는 통과** 하지만 별칭이 없어 결과가 비는 것 — 3절의 분석과 정확히 일치한다.

참고로 실제 `chall61` 테이블의 `id` 컬럼 맨 위 행을 그대로 뽑아 보면(`?id=id`) 값은 `test`다. **테이블 어디에도 `admin` 행은 없다** — 그래서 실제 컬럼을 읽는 걸로는 절대 못 풀고, 결과값을 **위조** 해야만 한다.

## 5. 결과 — 결과값을 admin으로 위조

이제 완성한 페이로드를 보낸다.

```text
GET /challenge/web-38/?id=0x61646d696e%20id
→ 최종 쿼리: select 0x61646d696e id from chall61 order by id desc limit 1
```

응답은 이랬다.

```html
<hr><b>admin</b><br><script>alert('old-61 Pwned!');</script><hr>old-61 Pwned. You got 20point. Congratz!<hr>
```

`<b>admin</b>` — 조회 결과의 `id`가 `admin`으로 위조됐고, `$result['id'] == "admin"`이 참이 되어 `solve(61)`이 실행됐다.
`alert('old-61 Pwned!')` 가 뜨고 점수가 올랐으며, `chall.php`에서도 **`✔️ old-61`** 로 풀린 것을 확인했다.

## 6. 왜 취약한가 — 그리고 올바른 방어

**(1) 입력이 `SELECT` 컬럼 목록에 들어간 것이 근본 원인이다.**
`WHERE` 절뿐 아니라 **컬럼 목록·`ORDER BY`·테이블명** 같은 식별자 자리도 인젝션 지점이다. 이런 자리는 파라미터 바인딩(`?`)으로 넘길 수 **없는** 영역이라 더 위험하다. 사용자 입력으로 조회할 컬럼을 고르게 해야 한다면, **바인딩이 아니라 허용 목록(allow-list)** 으로 처리해야 한다.

```php
// 식별자는 바인딩이 안 되므로, 미리 정한 값만 허용한다
$allowed = ['id', 'name', 'score'];
$col = in_array($_GET['col'], $allowed, true) ? $_GET['col'] : 'id';
$stmt = $db->prepare("select $col from chall61 order by id desc limit 1");
$stmt->execute();
```

**(2) 블랙리스트 필터는 틈이 난다.**
`select`·`from`·괄호·콤마를 막아도, `0x...` 16진수 리터럴과 `AS` 없는 별칭처럼 **금지 목록에 없는 문법** 이 남는다. 따옴표를 `addslashes`로 막아도 따옴표가 **필요 없는** 표현(16진수)으로 우회된다. 입력을 "무엇을 금지할까"로 거르는 접근은 늘 이렇게 샌다 — **"무엇을 허용할까"** 로 뒤집어야 한다.

**(3) 길이 제한은 방어가 아니다.**
15자 제한은 공격을 **불편하게** 만들 뿐, 막지 못한다. 실제로 정확히 15자짜리 페이로드가 존재했다. 길이·문자 필터는 보조 수단일 뿐, 신뢰 경계는 **쿼리 구조와 입력을 분리** 하는 데서 와야 한다.

## 7. 정리

- old-61은 입력이 **`WHERE`가 아니라 `SELECT` 컬럼 목록** 에 들어가는 SQL 인젝션 — 조건을 참으로 만드는 게 아니라 **조회 결과값 자체를 위조** 한다.
- 통과 조건은 `$result['id'] == "admin"`. 따옴표(`addslashes`)·`select`/`from`/괄호/콤마/점·15자 제한이 막혀 있다.
- 따옴표 없이 문자열을 만드는 **16진수 리터럴** `0x61646d696e`(=`admin`)과, `AS`를 생략한 **공백 별칭** 으로 컬럼명을 `id`로 지정 → `0x61646d696e id`(정확히 15자).
- 테이블에는 `admin` 행이 없어(실제 top 행은 `test`) 실제 컬럼 조회로는 못 풀고, **결과값을 위조** 해야만 통과한다.
- 방어는 **식별자 자리 allow-list**, **블랙리스트가 아닌 화이트리스트**, 그리고 길이 제한에 의존하지 않기.

> 인젝션은 "따옴표를 넣는 기술"이 아니라 "입력이 데이터가 아닌 **구조** 가 되는 순간"의 이름이다.
> 그 구조가 `WHERE`든 `SELECT`든, 틈은 금지어 목록 바깥에서 늘 다시 열린다.
