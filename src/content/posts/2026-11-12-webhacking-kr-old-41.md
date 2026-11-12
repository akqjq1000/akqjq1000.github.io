---
title: "webhacking.kr old-41 풀이 — 업로드한 파일에 덮어써지는 FLAG, 그리고 에러 메시지가 흘린 경로"
description: "webhacking.kr old-41을 통해, 올린 파일의 내용을 서버가 FLAG로 덮어써 버리는 업로드 로직을 역이용해 플래그를 읽어 내는 과정을 정리한다. 파일명에서 점을 지우는 필터, display_errors가 켜진 채 @로 가려지지 않은 copy()가 흘리는 업로드 경로, 그리고 긴 파일명으로 일부러 에러를 일으켜 비밀 디렉터리를 알아내는 방법을 실제 요청·응답으로만 검증해 설명한다."
date: 2026-11-12
category: Web
tags: [webhacking.kr, web, wargame, file-upload, information-disclosure, error-handling, php]
---

[webhacking.kr](https://webhacking.kr)의 **old-41** 문제를 풀었다.
앞서 다룬 old-21이 "응답 문구 하나가 흘리는 **참/거짓 한 비트**"였고 old-05가 "서버가 경로마다 문자열을 **다르게 정규화**하는 틈"이었다면,
old-41의 주제는 **"서버가 스스로 흘리는 정보"** 다. 두 겹으로 흘린다 — 하나는 **업로드 로직 자체가 FLAG를 파일에 써 주는** 설계 실수, 다른 하나는 **에러 메시지가 비밀 업로드 경로를 그대로 뱉는** 정보 노출이다.

이 문제의 플래그 문자열이 공교롭게도 `error_msg_is_more_userful_than_you_think`였다. 말 그대로 **에러 메시지가 생각보다 쓸모 있다** 는 것이 풀이의 전부다.

이 글은 추측이 아니라 **실제로 서버에 파일을 올려 응답을 관찰하고, 알아낸 경로에서 플래그를 읽어 `/auth.php`에 제출해 통과(`Pwned`)를 확인** 한 과정을 그대로 정리한다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-41 (`/challenge/web-19/`) |
| 배점 | 25점 |
| 유형 | 파일 업로드 / 정보 노출(에러 메시지) |
| 목표 | 서버에 숨겨진 `$flag`를 읽어 제출 |

첫 화면에는 파일 업로드 폼 하나와 `view-source` 링크뿐이다.

```html
<form method=post enctype="multipart/form-data">
  <input type=file name=up><input type=submit value='upload'>
</form>
<a href=./?view_source=1>view-source</a>
```

다행히 이 문제는 **소스가 공개돼 있다**(`?view_source=1`). 추측할 필요 없이 서버가 무엇을 하는지 그대로 읽을 수 있다.

## 2. 소스 분석 — 올린 파일을 FLAG로 덮어쓴다

`?view_source=1`로 받은 **실제 소스** 는 이렇다.

```php
<?php
  include "../../config.php";
  include "./inc.php";                 // 여기서 $upload_dir, $flag 가 정의된다
  if($_GET['view_source']) view_source();
  error_reporting(E_ALL);
  ini_set("display_errors", 1);        // ← 에러를 화면에 그대로 출력
?>
<html><head><title>Challenge 41</title></head><body>
<?php
  if(isset($_FILES['up']) && $_FILES['up']){
    $fn = $_FILES['up']['name'];
    $fn = str_replace(".","",$fn);     // 파일명에서 . 제거
    $fn = str_replace("<","",$fn);
    $fn = str_replace(">","",$fn);
    $fn = str_replace("/","",$fn);     // 경로 구분자도 제거 → 디렉터리 이동 불가
    $cp = $_FILES['up']['tmp_name'];
    copy($cp,"./{$upload_dir}/{$fn}"); // 업로드 파일을 비밀 디렉터리로 복사
    $f = @fopen("./{$upload_dir}/{$fn}","w");  // ★ 같은 파일을 쓰기 모드로 다시 연다
    @fwrite($f,$flag);                         // ★ 그 파일에 FLAG 를 써 버린다
    @fclose($f);
    echo("Done~");
  }
?>
...
```

필터만 보면 "확장자 우회로 웹셸을 올리는" 전형적인 업로드 문제처럼 보인다. `.`·`<`·`>`·`/`를 지워 PHP 업로드와 경로 이동을 막아 두었다.

그런데 **진짜 빈틈은 필터가 아니라 그 아래 세 줄** 이다. 서버는 내가 올린 파일을 비밀 디렉터리로 복사한 다음, **같은 경로를 다시 열어 그 안에 `$flag`를 써 넣는다.** 즉 내가 올린 파일의 내용은 **곧바로 FLAG로 덮어써진다.**

웹셸이고 확장자 우회고 필요 없다. **아무 파일이나 하나 올리면, 그 파일이 곧 FLAG가 든 파일** 이 된다. 남은 문제는 단 하나 —

> 그 파일이 놓이는 **`./{$upload_dir}/` 경로를 모른다.**

`$upload_dir`은 소스에 없는 `inc.php`에서 정의된다. 이 경로만 알면 끝난다.

## 3. 1차 시도 — 빈 파일명으로 에러를 유도

경로를 알아내는 지렛대는 소스 맨 위의 `display_errors = 1` 이다.
게다가 `copy()`에는 `@`가 **붙어 있지 않다**(`fopen`·`fwrite`·`fclose`만 `@`로 가려져 있다). 그러니 **`copy()`가 실패하면 그 경고가 화면에 그대로 출력** 된다.

먼저 파일명이 `.`만으로 이루어진 파일을 올려 봤다. 필터가 점을 모두 지우면 파일명이 **빈 문자열** 이 되고, `copy()`의 목적지는 `"./{$upload_dir}/"` — 즉 **파일이 아니라 디렉터리** 가 된다.

```text
POST /challenge/web-19/   (up 의 파일명 = "...")

Warning: copy(): The second argument to copy() function cannot be a
directory in /var/www/html/challenge/web-19/index.php on line 21
Done~
```

에러는 떴지만 아쉽게도 **디렉터리 이름은 안 보인다.** `copy()`는 "두 번째 인자가 디렉터리면 안 된다"는 말만 할 뿐, 그 경로 문자열은 메시지에 넣지 않는다. (대신 스크립트의 절대 경로 `/var/www/html/challenge/web-19/`는 덤으로 알게 됐다.)

## 4. 2차 시도 — 긴 파일명으로 경로를 통째로 흘리게 한다

필요한 건 **목적지 경로 문자열을 그대로 담은 에러** 다.
`copy()`가 목적지를 **열다가 실패** 하면, PHP는 `copy(<목적지 전체 경로>): failed to open stream: ...` 형태로 **경로를 통째로** 찍는다.

목적지를 일부러 실패시키는 가장 쉬운 방법은 **파일명을 아주 길게** 만드는 것이다. 리눅스 파일명 한계(255바이트)를 넘기면 `ENAMETOOLONG`이 발생한다. 그래서 `a`를 300개 붙인 이름으로 올렸다.

```text
POST /challenge/web-19/   (up 의 파일명 = "aaaa…"(300자))

Warning: copy(./0123456789abcdef0123456789abcdef01234567/aaaaaaaa…aaaa):
failed to open stream: File name too long in
/var/www/html/challenge/web-19/index.php on line 21
Done~
```

> 참고: 위 `0123456789abcdef0123456789abcdef01234567` 자리에는 실제로 **40자리 hex 값**(sha1 형태의 사용자별 디렉터리)이 찍힌다. 풀이자마다 값이 다르고 개인을 식별할 수 있으므로, 이 글에서는 **문서용 예시값으로 익명화** 해 표기한다.

경로가 그대로 새어 나왔다. 업로드 디렉터리는 `./{사용자별 hex}/` 였다. 파일명이 너무 길다는 에러가, 정작 **숨겨야 할 디렉터리 이름을 친절히 적어** 준 것이다.

## 5. 익스플로잇 — 파일을 올리고, 그 파일을 읽는다

경로를 알았으니 절차는 간단하다.

1. **평범한 짧은 이름** 으로 파일을 하나 올린다 → 서버가 그 파일에 FLAG를 써 넣는다.
2. 그 파일을 **웹으로 바로 요청** 해 내용을 읽는다.

```text
(1) 업로드:  POST /challenge/web-19/   (up 의 파일명 = "readme", 내용은 아무거나)
             → Done~

(2) 읽기:    GET  /challenge/web-19/{사용자별 hex}/readme
             → FLAG{error_msg_is_more_userful_than_you_think}
```

내가 올린 "아무 내용"은 사라지고, 그 자리에 **FLAG가 들어 있었다.** 소스에서 읽은 그대로 — 업로드 파일이 곧 FLAG 파일이 된 것이다.

## 6. 결과 — 플래그 제출

webhacking.kr에서 `FLAG{...}` 형식의 답은 `/auth.php`에 JSON으로 제출한다(메인 페이지의 Auth 모달이 쓰는 엔드포인트다).

```text
POST /auth.php
Content-Type: application/json

{"flag":"FLAG{error_msg_is_more_userful_than_you_think}"}

→ {"stat":true,"ret":"old-41 Pwned. You got 25point. Congratz!"}
```

점수가 올랐고, `chall.php`에서도 **`✔️ old-41`** 로 풀린 것을 확인했다.

> 공격자가 한 일은 "파일 하나 올리고, 그 파일을 다시 요청한 것"뿐이다.
> 필터를 뚫은 것도, 코드를 실행시킨 것도 아니다. **서버가 FLAG를 파일에 써 줬고, 에러가 그 파일의 위치를 알려 줬다.**

## 7. 왜 취약한가 — 그리고 올바른 방어

**(1) 비밀을 "요청으로 만든 파일"에 쓰면, 그 파일은 공격자 손에 있다.**
이 문제의 근본 원인은 업로드 핸들러가 **사용자가 이름을 정하는 파일에 `$flag`를 기록** 한다는 것이다. 업로드된 파일이 **웹 루트 아래 그대로 접근 가능** 하다는 점이 이를 완성한다.
→ 업로드 파일은 **웹으로 직접 접근할 수 없는 디렉터리**(문서 루트 밖)에 저장하고, 다운로드가 필요하면 **권한을 검사하는 스크립트를 거쳐서만** 내보낸다. 민감한 값을 사용자가 통제하는 경로·파일에 쓰는 설계 자체를 피한다.

**(2) 운영 환경에서 `display_errors`는 꺼야 한다.**
경로를 흘린 것은 결국 `ini_set("display_errors", 1)` 과 `@` 없이 노출된 `copy()` 경고였다. 에러 메시지에는 **절대 경로·내부 디렉터리·쿼리 조각** 같은 공격 단서가 쉽게 담긴다.
→ 운영에서는 `display_errors = Off` 로 두고 **로그로만 기록**(`log_errors = On`)한다. 사용자에게는 일반화된 오류 화면만 보여 준다.

```php
// 운영 설정 예시 (php.ini 또는 부트스트랩)
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);          // 기록은 전부, 노출은 없음
```

**(3) 파일명은 블랙리스트가 아니라 "서버가 새로 짓는다".**
`str_replace(".", "", ...)` 류의 문자 제거는 우회·부작용(여기서는 빈 이름·초장문 이름으로 에러 유도)이 잦다.
→ 업로드 파일명은 사용자 입력을 **쓰지 말고** 서버가 **무작위 식별자 + 화이트리스트 확장자** 로 새로 만든다. 저장 디렉터리에서는 **실행 권한을 끈다**(PHP 처리 비활성화).

```php
// 좋음: 사용자 파일명을 신뢰하지 않고 서버가 이름을 짓는다
$ext  = strtolower(pathinfo($_FILES['up']['name'], PATHINFO_EXTENSION));
$allow = ['png','jpg','jpeg','gif'];
if (!in_array($ext, $allow, true)) fail();
$name = bin2hex(random_bytes(16)).'.'.$ext;          // 서버가 생성
$dest = '/var/app/uploads/'.$name;                   // 문서 루트 밖
move_uploaded_file($_FILES['up']['tmp_name'], $dest); // copy 가 아니라 전용 함수
```

## 8. 정리

- old-41은 업로드 로직이 **올린 파일을 그대로 `$flag`로 덮어쓰는** 설계라, **아무 파일이나 올리면 그 파일이 곧 FLAG 파일** 이 된다.
- 유일한 장벽은 **저장 경로(`$upload_dir`)를 모른다** 는 것뿐이었다.
- `display_errors`가 켜져 있고 `copy()`가 `@`로 가려지지 않은 점을 이용해, **파일명을 300자로 만들어** `File name too long` 에러를 유도하자 **목적지 경로가 통째로 노출** 됐다.
- 그 경로에 **짧은 이름으로 파일을 올려** FLAG가 써지게 한 뒤 **웹으로 그 파일을 읽어** `FLAG{error_msg_is_more_userful_than_you_think}` 를 얻고, `/auth.php`에 제출해 통과했다.
- 방어는 **비밀을 사용자 통제 파일에 쓰지 않기 + 문서 루트 밖 저장**, **운영 환경 `display_errors` 끄기**, **서버가 짓는 무작위 파일명 + 실행 차단**.

> 때로는 방어선을 뚫을 필요조차 없다. 서버가 비밀을 파일에 적어 두고, 에러 메시지가 그 파일의 주소를 읽어 준다면.
> 그래서 플래그가 말한다 — "에러 메시지는 당신 생각보다 쓸모 있다."
