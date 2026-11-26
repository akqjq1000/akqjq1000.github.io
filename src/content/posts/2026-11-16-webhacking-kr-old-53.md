---
title: "webhacking.kr old-53 풀이 — select 없이 테이블 이름을 흘리는 PROCEDURE ANALYSE()"
description: "webhacking.kr old-53을 통해, select와 by가 둘 다 필터된 SQL Injection에서 숨겨진 테이블 이름을 알아내는 과정을 정리한다. 서브쿼리도 information_schema도 쓸 수 없을 때, MySQL의 레거시 함수 PROCEDURE ANALYSE()가 결과 컬럼의 전체 이름(db.table.column)을 그대로 뱉어 내는 성질을 이용한다. 모든 오라클·페이로드는 추측이 아니라 실제 요청·응답으로 검증했다."
date: 2026-11-16
category: Web
tags: [webhacking.kr, web, wargame, sql-injection, procedure-analyse, information-disclosure, php, mysql]
---

> webhacking.kr은 합법적인 웹 보안 학습용 워게임이다. 이 글은 교육 목적의 풀이이며, 마지막에 같은 취약점을 어떻게 막는지도 정리했다.

[webhacking.kr](https://webhacking.kr)의 old-53 문제를 풀었다. old-21·old-50이 "로그인을 뚫어 다른 행을 조회·위조하는" SQL Injection이었다면, old-53은 조금 결이 다르다. 뚫어야 할 대상이 데이터가 아니라 스키마 자체, 정확히는 숨겨진 테이블 이름이다.

게다가 손발이 꽤 묶여 있다. 인젝션 포인트는 있는데 `select`와 `by`가 둘 다 필터된다. 서브쿼리(`(select ...)`)도, 흔히 쓰는 `union`·`order by`·`group by`도 전부 막힌다. 그래서 "테이블 이름을 `information_schema`에서 꺼내 온다"는 교과서적 수법이 통하지 않는다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-53 (`/challenge/web-28/`) |
| 배점 | 35점 |
| 유형 | SQL Injection (정보 유출 / 메타데이터 추출) |
| 목표 | 숨겨진 테이블 이름 `$hidden_table`을 알아내 `answer`로 제출 |

첫 화면에는 `view-source` 링크 하나뿐이다. 소스가 공개되어 있으니(`?view_source=1`) 먼저 읽는다.

## 2. 소스 분석 — 인젝션은 열려 있는데 무기가 없다

```php
<?php
  include "../../config.php";
  if($_GET['view_source']) view_source();
?>
<html>
<head><title>Challenge 53</title></head>
<body>
<?php
  $db = dbconnect();
  include "./tablename.php";                                  // $hidden_table 정의(비공개)
  if($_GET['answer'] == $hidden_table) solve(53);            // ← 테이블 이름을 맞히면 통과
  if(preg_match("/select|by/i",$_GET['val'])) exit("no hack"); // ← select, by 금지
  $result = mysqli_fetch_array(mysqli_query($db,
    "select a from $hidden_table where a={$_GET['val']}"));   // ← val 이 그대로 삽입된다
  echo($result[0]);                                           // ← 첫 컬럼을 출력
?>
<hr><a href=./?view_source=1>view-source</a>
</body>
</html>
```

핵심을 정리하면 이렇다. 통과 조건은 "값"이 아니라 "이름"이다. `$_GET['answer']`가 `$hidden_table`과 같으면 `solve(53)`이니, 비밀번호를 뽑는 게 아니라 테이블 이름 문자열 자체를 알아내야 한다. 인젝션 포인트는 `val`로, `where a={$_GET['val']}`에 따옴표도 없이 숫자 컨텍스트로 그대로 들어간다(따옴표 탈출조차 필요 없다). 블랙리스트는 딱 둘, `/select|by/i`라 대소문자 무시로 `select`와 `by`가 금지다. 출력은 `echo($result[0])`로 조회된 첫 행의 첫 컬럼 하나만 화면에 나온다.

문제는 블랙리스트다. 테이블 이름을 `information_schema.tables`에서 꺼내려면 서브쿼리(`select`)가 필요한데 막혔고, `union select`도 `select`에 걸린다. `order by`·`group by`로 컬럼 수를 세는 길도 `by`에 걸린다. `select` 없이 숨겨진 테이블 이름을 알아내야 한다.

## 3. 먼저 확인한 사실들 (실제 응답)

소스만 믿지 않고, 응답으로 하나씩 확인했다. 아래는 전부 실제 응답이다.

| 요청 | 응답(`echo($result[0])`) | 해석 |
| --- | --- | --- |
| `?val=1` | `1` | `a=1`인 행이 있다 → 그 값(`1`)이 출력됨 |
| `?val=2` | `2` | `a=2`인 행도 있다 |
| `?val=0` | *(빈칸)* | `a=0`인 행은 없다 → 조회 실패 → 출력 없음 |
| `?val=(select 1)` | `no hack` | `select` 필터에 걸려 `exit()` |
| `?val=1 order by 1` | `no hack` | `by` 필터에 걸려 `exit()` |

두 가지가 확정됐다. 오라클 측면에서, `val`에 넣은 조건에 맞는 행이 있으면 그 컬럼 `a`의 값이 그대로 출력되고 없으면 빈 응답이다. 출력 채널이 살아 있으니 조회 결과를 직접 읽어 낼 수 있다(Blind가 아니다). 제약 측면에서, `select`·`by`는 정말로 막혀 있다. 서브쿼리·union·order by 계열은 전부 포기해야 한다. 그러면 질문은 하나로 좁혀진다. `select` 없이, 조회 결과 컬럼으로 "테이블 이름"을 흘려보낼 방법이 있는가?

## 4. PROCEDURE ANALYSE() — 결과 컬럼의 "본명"을 뱉는 함수

MySQL에는 `SELECT ... PROCEDURE ANALYSE()`라는 레거시 구문이 있다. 원래 용도는 "이 쿼리 결과 컬럼에 가장 알맞은 데이터 타입이 무엇인지 분석"해 주는 것인데, 그 분석 결과의 첫 번째 컬럼 `Field_name`에 각 컬럼의 전체 수식 이름이 담긴다.

```text
Field_name 형식 :  <database>.<table>.<column>
```

우리 쿼리는 `select a from <hidden_table> where a=...`로 컬럼 `a` 하나를 조회한다. 여기에 `PROCEDURE ANALYSE()`를 붙이면, 분석 결과의 `Field_name`은 `webhacking.<hidden_table>.a`가 된다. 그리고 소스의 `echo($result[0])`는 그 첫 컬럼(=`Field_name`)을 그대로 화면에 뿌린다. 결정적으로, `PROCEDURE ANALYSE()` 안에는 `select`도 `by`도 들어 있지 않다. 블랙리스트를 자연스럽게 피해 간다. 이걸 그대로 서버에 보냈다. 아래는 실제 응답이다.

```text
GET /challenge/web-28/?val=1 procedure analyse()
→ webhacking.chall53_755fdeb36d873dfdeb2b34487d50a805.a
```

`Field_name` 하나가 통째로 새어 나왔다. 분해하면 database는 `webhacking`, table은 `chall53_755fdeb36d873dfdeb2b34487d50a805`(찾던 숨겨진 테이블 이름), column은 `a`다. 여기서 한 가지 함정도 응답으로 확인했다. WHERE가 한 행이라도 잡아야 분석 결과가 나온다.

```text
?val=1 procedure analyse()   → webhacking.chall53_...a   (a=1 행이 있음 → 분석 결과 1행)
?val=0 procedure analyse()   → (빈칸)                      (a=0 행이 없음 → 분석할 행이 없음)
```

`a=0`은 조회되는 행이 없어 `PROCEDURE ANALYSE()`도 빈손이다. 그래서 반드시 존재하는 값(`a=1`)으로 WHERE를 맞춰야 한다.

## 5. 테이블 이름을 answer로 제출

이제 숨겨진 테이블 이름을 알았으니, 통과 조건 `$_GET['answer'] == $hidden_table`에 그대로 넣는다.

```text
GET /challenge/web-28/?answer=chall53_755fdeb36d873dfdeb2b34487d50a805
```

## 6. 결과 — Pwned

응답으로 통과가 확인됐다.

```html
<script>alert('old-53 Pwned!');</script>
```

`chall.php`를 다시 불러오니 해당 칸이 `✔️ old-53`으로 바뀌어 있었다. 같은 `answer`를 다시 보내면 이미 푼 상태라 `already solved`가 뜬다. `select` 한 번 쓰지 못한 채, 함수 하나가 흘린 메타데이터로 테이블 이름을 그대로 제출해 통과했다.

## 왜 취약한가 — 그리고 올바른 방어

첫째, 근본 원인은 여전히 "입력을 쿼리에 그대로 섞는 것"이다. `where a={$_GET['val']}`처럼 입력을 코드에 직접 끼워 넣으면, 공격자는 `WHERE` 뒤에 구문을 덧붙일 수 있다. 숫자 컨텍스트라 따옴표조차 필요 없었다. 해법은 늘 같다. 파라미터 바인딩(prepared statement)으로 입력을 구조가 아니라 데이터로만 다루는 것이다.

```php
$stmt = $db->prepare("select a from chall53_xxx where a=?");
$stmt->bind_param("i", $_GET['val']);   // val 은 정수 데이터로만 바인딩
$stmt->execute();
```

둘째, 블랙리스트는 "금지어 목록"일 뿐 "안전"이 아니다. `select`·`by`만 막으면 서브쿼리와 `order by`는 봉쇄되지만, `PROCEDURE ANALYSE()` 같은 다른 경로가 그대로 열려 있다. 공격 표면은 키워드 몇 개로 좁혀지지 않는다. "무엇을 금지할지"를 나열하는 방식은 언제나 빠진 구멍으로 샌다. 입력 검증이 필요하면 화이트리스트(예: `val`은 정수만 허용)로 좁혀야 한다.

```php
if (!ctype_digit($_GET['val'])) exit();   // 숫자 외에는 아예 받지 않는다
```

셋째, 스키마(메타데이터)도 비밀이다. 이 문제의 "비밀"은 비밀번호가 아니라 테이블 이름이었다. `PROCEDURE ANALYSE()`나 오류 메시지, `information_schema` 접근을 통해 DB·테이블·컬럼 이름이 새면, 그 자체가 다음 공격의 지도를 그려 준다. 운영 환경에서는 상세 오류를 끄고, 애플리케이션 계정의 메타데이터 접근을 최소화하며, 레거시·불필요한 구문(구버전 `PROCEDURE ANALYSE()` 등)을 쓰지 않는 최신 DB로 유지하는 것이 함께 가야 한다. 참고로 `PROCEDURE ANALYSE()`는 MySQL 5.7에서 deprecated, 8.0에서 제거되어 이 수법 자체가 신버전에서는 통하지 않는다.

## 정리

- old-53의 목표는 데이터가 아니라 숨겨진 테이블 이름으로, 알아내서 `answer`로 제출하면 통과다.
- 인젝션 포인트 `val`은 `where a={val}`에 숫자 그대로 들어가지만, `select`와 `by`가 필터되어 서브쿼리·union·order by 계열이 전부 막힌다.
- 출력 `echo($result[0])`는 조회된 첫 컬럼을 뱉는다. `val=1`은 `1`, `val=0`은 빈칸이라는 읽기 가능한 오라클이다.
- `select` 없이 `SELECT ... PROCEDURE ANALYSE()`를 꽂으면, 결과의 `Field_name`이 `db.table.column` 형태로 새어 나온다. `?val=1 procedure analyse()`로 테이블 이름 `chall53_...`를 그대로 읽어 제출해 통과(`✔️ old-53`)를 확인했다.
- 방어는 prepared statement(정수 바인딩), 화이트리스트(`ctype_digit`), 메타데이터·오류 노출 최소화와 최신 DB 유지다.

이 문제는 "위험한 키워드만 막으면 된다"는 믿음의 반례다. `select`를 지워도 같은 일을 하는 다른 이름의 문이 열려 있으면, 데이터가 아니라 스키마의 이름표부터 조용히 빠져나간다.
