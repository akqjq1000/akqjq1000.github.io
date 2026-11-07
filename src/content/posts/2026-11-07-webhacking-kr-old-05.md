---
title: "webhacking.kr old-05 풀이 — 클라이언트로만 막은 회원가입과 공백 한 칸의 빈틈"
description: "webhacking.kr old-05를 통해, 자바스크립트로만 가로막은 회원가입을 직접 POST로 우회하고, 이미 존재하는 admin을 '선행 공백 한 칸'으로 피해 가입한 뒤 admin으로 로그인하는 과정을 정리한다. MySQL의 후행 공백 무시(=) 비교와, 가입·로그인에서 문자열을 서로 다르게 정규화하는 불일치가 어떻게 권한 상승으로 이어지는지 직접 검증해 설명한다."
date: 2026-11-07
category: Web
tags: [webhacking.kr, web, wargame, access-control, client-side, authentication, mysql, php]
---

[webhacking.kr](https://webhacking.kr)의 **old-05** 문제를 풀었다.
앞서 다룬 old-19가 "클라이언트가 들고 있는 쿠키를 믿는 인증", old-45가 "이스케이프 후 문자셋 변환"이었다면,
old-05는 **"보안을 클라이언트에만 걸어 두고, 서버의 문자열 비교가 경로마다 다른 경우"** 가 주제다.

회원가입은 버튼이 자바스크립트로 막혀 있고 `admin`은 이미 존재한다.
그런데 **가입 단계의 중복 검사와 로그인 단계의 신원 판별이 문자열을 서로 다르게 다룬다.**
그 틈을 **선행 공백 한 칸**으로 비집고 들어가 admin이 된다.

이 글은 추측이 아니라 **실제로 서버에 값을 넣어 가며 각 경로의 동작을 관찰하고, `admin`으로 로그인해 통과(`Pwned`)를 확인**한 과정을 그대로 정리한다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-05 (`/challenge/web-05/`) |
| 배점 | 30점 |
| 유형 | 접근 제어 우회 / 클라이언트 신뢰 + 문자열 정규화 불일치 |
| 목표 | `admin`으로 로그인되게 만들어 통과 |

첫 화면에는 버튼 두 개뿐이다 — **Login** 과 **Join**.

```html
<input type=button value='Login' ... onclick=move('login');>
<input type=button value='Join'  ... onclick=no();>
<script>
function no(){ alert('Access_Denied'); }        // Join은 그냥 막혀 있다
function move(page){ if(page=='login') location.href='mem/login.php'; }
</script>
```

Login은 `mem/login.php`로 가고, **Join은 눌러도 `Access_Denied` 경고만 뜬다.**
즉 "가입은 금지"가 **버튼의 자바스크립트** 로만 걸려 있다.

## 2. 정보 수집 — 가입 폼은 어디에 있나

`mem/join.php`를 직접 열어 보면, 난독화된 자바스크립트가 폼을 **조건부로** 그려 준다.
변수들은 `l`의 개수로 알파벳을 만든 뒤(`l`='a', `ll`='b', … `llll`='d' …) 문자열을 조립하는 형태다. 풀어 보면 핵심은 이렇다.

```js
// 난독화를 복원한 의미
if (document.cookie.indexOf("oldzombie") == -1) { alert('bye'); throw "stop"; }
if (document.URL.indexOf("mode=1")    == -1) { alert('access_denied'); throw "stop"; }
else {
  // 여기서야 가입 폼을 document.write 로 그린다
  //   <form method=post action=join.php> 아이디(name=id) / 비밀번호(name=pw)
}
```

정리하면 `mem/join.php`는 **(1) 쿠키에 `oldzombie`가 있고 (2) URL에 `mode=1`이 있을 때만** 가입 폼을 보여 준다.
그런데 이 조건들은 전부 **브라우저에서 돌아가는 자바스크립트** 일 뿐이다.
폼이 최종적으로 보내는 곳은 `join.php`에 `id`·`pw`를 POST하는 것뿐이고, **그 요청을 직접 만들면 자바스크립트는 아무것도 막지 못한다.**

## 3. 문제점 ① — 클라이언트에서만 막은 회원가입

그래서 자바스크립트를 전부 건너뛰고 `mem/join.php`로 바로 POST해 봤다.

```text
POST /challenge/web-05/mem/join.php    (id=clz_test_1&pw=...)
→ "sign up as clz_test_1 success"
```

**가입이 된다.** 쿠키도 `mode=1`도 없이, 버튼의 `no()`도 거치지 않고 바로 계정이 만들어진다.
"Join 금지"는 **서버의 규칙이 아니라 화면의 장식** 이었던 것이다. (접근 제어를 클라이언트에만 둔 전형적인 실수다.)

목표는 `admin` 계정이니 그대로 `admin`으로 가입을 시도하면?

```text
POST .../join.php    (id=admin&pw=...)
→ <script>alert('id already existed');</script>
```

`admin`은 **이미 존재한다.** 중복 검사(서버 측)는 살아 있다. 여기서부터가 진짜 문제다.

## 4. 문제점 ② — "이미 있다"를 판단하는 비교의 빈틈

중복 검사가 `admin`을 어떻게 비교하는지 알아보려고, **공백과 탭을 섞어** 여러 변형을 가입시켜 응답을 비교했다.
아래는 전부 **서버가 실제로 돌려준 응답** 이다.

| 입력 `id` | 서버 응답 |
| --- | --- |
| `admin` | `id already existed` |
| `admin ` (후행 공백 1칸) | `id already existed` |
| `admin`+공백 여러 칸(후행) | `id already existed` |
| ` admin` (**선행** 공백 1칸) | `sign up as  admin success` ✅ |
| `admin\t` (탭) | `sign up as admin\t success` ✅ |

결과가 선명하게 갈린다.

- **후행 공백**을 붙인 `admin `은 여전히 "이미 존재"로 막힌다.
- 그런데 **선행 공백**을 붙인 ` admin`은 **새 계정으로 가입이 된다.**

이유는 중복 검사가 `select ... where id='$id'` 꼴로 돌아가고, **MySQL의 문자열 `=` 비교가 "후행 공백"을 무시** 하기 때문이다.
표준 SQL과 마찬가지로 MySQL에서 `'admin' = 'admin '`은 **참** 이다 — 그래서 `admin `은 기존 `admin`과 같다고 판정돼 막힌다.
반면 **선행 공백은 무시되지 않는다.** `' admin' = 'admin'`은 **거짓** 이라, ` admin`은 "새로운 아이디"로 통과한다.

> 즉 중복 검사 입장에서 ` admin`은 **admin이 아닌, 비어 있던 새 아이디** 다.

## 5. 익스플로잇 — ` admin`으로 가입하고, `admin`으로 로그인

그렇다면 ` admin`으로 **내가 아는 비밀번호** 를 걸어 가입한 뒤, 그 계정으로 로그인하면 된다.
`mem/login.php`는 `id`·`pw`를 `login.php`로 POST하는 단순한 폼이다.

```text
1) 가입:   POST .../mem/join.php    id=%20admin   pw=clz999
           → "sign up as  admin success"
2) 로그인: POST .../mem/login.php   id=%20admin   pw=clz999
```

여기서 두 경로의 **문자열 처리가 다르다는 점** 이 결정타가 된다.

- **가입(중복 검사)** 에서 ` admin`은 `admin`과 **다른 값** 으로 취급돼 통과했다. → 내가 비밀번호를 쥔 계정이 생긴다.
- **로그인(신원 판별)** 에서는 ` admin`이 **`admin`으로 수렴** 한다. 로그인 쿼리는 내가 넣은 ` admin`·비밀번호로 **내 행** 을 정확히 찾아 인증하고, 서버는 그 사용자를 **admin으로 인식** 한다.

관찰된 동작을 의사 코드로 재구성하면 이렇다. (webhacking.kr은 이 문제의 서버 소스를 공개하지 않는다 — 아래는 **관찰로부터 복원한** 코드다.)

```php
<?php
// --- join.php (가입) ---
$id = $_POST['id'];  $pw = $_POST['pw'];
// 중복 검사: MySQL '=' 는 후행 공백만 무시 → ' admin' 은 'admin' 과 다른 값으로 통과
if (row_exists("select id from chall5 where id='$id'")) {
  echo "<script>alert('id already existed');</script>";
} else {
  insert_user($id, $pw);                 // ' admin' 이 그대로 저장된다
  echo "sign up as $id success";
}

// --- login.php (로그인) ---
$id = $_POST['id'];  $pw = $_POST['pw'];
$row = row("select id from chall5 where id='$id' and pw='$pw'");  // ' admin' 행을 찾음
if ($row) {
  $who = trim($row['id']);               // 신원은 '정규화'해서 판단 → "admin"
  echo "Hello $who";
  if ($who === "admin") solve(5);        // ← admin 으로 인정되어 통과
}
?>
```

취약점의 본질은 **"같은 아이디를 두 경로가 다르게 정규화한다"** 는 것이다.
가입은 ` admin`을 **새 아이디** 로 받아들이고, 로그인/신원 판별은 그 ` admin`을 **admin** 으로 되돌린다.
공격자는 그 사이에 끼어들어 **"내가 비밀번호를 아는 admin"** 을 손에 넣는다.

## 6. 결과

` admin`으로 가입하고 그 계정으로 로그인한 순간, 서버가 나를 admin으로 맞이했다.

```text
Hello admin
old-05 Pwned. You got 30point. Congratz!
```

`alert('old-05 Pwned!')`가 뜨고 점수가 올라갔으며, `chall.php`에서도 **`✔️ old-05`** 로 풀린 것을 확인했다.
(이미 푼 뒤 같은 방법으로 다시 로그인하면 `Hello admin` 과 함께 `already solved` 가 뜬다 — 우회 자체가 반복 재현된다는 뜻이다.)

> 후행 공백(`admin `)으로는 끝내 뚫리지 않았고, **선행 공백(` admin`)** 만이 통했다.
> "후행 공백은 무시, 선행 공백은 유효"라는 MySQL 비교 규칙이 공격의 지렛대였다.

## 7. 왜 취약한가 — 그리고 올바른 방어

**(1) 접근 제어를 클라이언트에 두면 그것은 방어가 아니다.**
Join 버튼의 `no()`, 가입 폼을 숨긴 `oldzombie`·`mode=1` 검사는 모두 브라우저 안에서만 돈다.
요청은 누구나 직접 만들 수 있으므로, **권한·접근 판단은 반드시 서버에서** 해야 한다.

**(2) 식별자는 "하나의 정규형"으로 통일해 다뤄야 한다.**
이 문제의 근본 원인은 가입과 로그인이 아이디를 **서로 다른 기준으로 비교·정규화** 한 데 있다.
사용자명 같은 식별자는 **저장 전에 정규화(trim, 공백·제어문자 제거, 필요시 소문자화)** 하고,
**그 정규형에 유니크 제약을 걸어** 가입·로그인·권한 판단이 **전부 같은 값** 을 보게 해야 한다.

```php
// 좋음: 한 곳에서 정규화하고, 그 결과에만 유니크 제약을 건다
function canon($id){ return strtolower(trim($id)); }   // 공백/대소문자 등 한 번에 정규화
$id = canon($_POST['id']);
if ($id === '' || !preg_match('/^[a-z0-9_]{3,20}$/', $id)) fail();  // 화이트리스트 검증
// DB: username_canon 컬럼에 UNIQUE. 가입도 로그인도 username_canon 으로만 조회
$stmt = $db->prepare("select pw_hash from users where username_canon=?");
$stmt->bind_param("s", $id);
```

**(3) 비밀번호는 평문/단순 비교가 아니라 해시로.**
로그인 쿼리에 비밀번호를 직접 끼워 넣는 구조(`and pw='$pw'`)는 인젝션과 평문 노출의 위험을 함께 안는다.
비밀번호는 **`password_hash()`로 저장하고 `password_verify()`로 검증** 하며, 쿼리에는 **바인딩** 으로만 값을 넣는다.

## 8. 정리

- old-05의 Join 금지는 **자바스크립트에만 걸린 장식** 이라, `join.php`로 직접 POST하면 그대로 가입된다.
- `admin`은 이미 존재하고 `admin `(후행 공백)도 **MySQL `=`가 후행 공백을 무시** 해 "이미 존재"로 막힌다. 그러나 **` admin`(선행 공백)** 은 다른 값으로 취급돼 **가입된다.**
- 가입은 ` admin`을 새 아이디로 받고 로그인/신원 판별은 그것을 **admin으로 수렴** 시킨다 — 이 **정규화 불일치** 가 권한 상승의 핵심이다.
- 방어는 **서버 측 접근 제어**, **식별자의 단일 정규형 + 유니크 제약**, **해시 기반 비밀번호 + 파라미터 바인딩**.

> "이 아이디를 가입에서 보는 값과 로그인에서 보는 값이 정말로 같은가"를 먼저 묻는다.
> 두 경로가 같은 문자열을 다르게 읽는 순간, `admin`은 공백 한 칸으로 복제된다.
