---
name: rig-gen
description: >
  Make images (free, Z-Image-Turbo), songs (YuE2), and short video clips (LTX-2.5) on dad's
  GPU rig "ws" through the signalbox job API — for drawings the user asks for, game art and
  BGM assets, and fun clips to show in chat. Use when the user asks to draw/make a picture,
  make a song or sound or music, or make a video/animation, or when a game needs art or
  background music. Korean triggers: 그림 그려줘, 그림 만들어, 이미지, 노래 만들어,
  음악 만들어, 게임 음악, BGM, 배경음악, 소리, 영상 만들어, 애니메이션.
---

# 랙 생성(rig-gen) — 아빠 GPU 랙에서 만드는 그림·노래·영상

아빠의 GPU 랙(신호소)에 잡을 올리면 그림·노래·영상을 **공짜로** 만들어 준다. 유료 API가 아니라
우리 집 랙이다. 단 랙은 아빠의 실험과 시간표를 함께 쓴다 — 내 차례가 아니면 기다리게 되고,
그건 고장이 아니라 예약 시간표다.

- 엔드포인트: `https://ws.mogera-goblin.ts.net:8443` (tailnet 안에서만 동작)
- 인증은 없지만 예의가 있다: `owner`는 항상 `"dohee"`, 부탁 1건당 잡 1개, 동시에 2잔 넘지 않게.
- **차례는 우선순위로 정해진다**(시간대 제한은 없다, 2026-10-04부터). 카드가 비어 있으면 바로
  시작하고, 다른 작업이 돌고 있으면 줄을 선다. 제출 응답에 `eta_s`(예상 대기 초)가 오면
  "약 ○분 뒤에 시작돼!"처럼 알려 준다. `eta_s`가 `null`이면 얼마나 걸릴지 모르는 것이다 —
  지어내지 말고 "지금 아빠 작업이 길게 도는 중이라 조금 기다려야 해"라고만 한다.
- dohee는 **우선순위를 올리지 않는다**(기본 0 그대로). 아빠 작업을 제칠 수는 있지만 그건 아빠
  몫이다. 노래는 예의상 `"card": "3090"`로 낸다 — 큰 그림카드(A6000)를 비워 두는 배려다.

## 명령 규칙 (승인 프롬프트를 절대 띄우지 않는다)

- 터미널 명령은 **한 번에 curl 하나**(또는 sleep/cp 같은 단순 명령 하나). `$( )` 치환, `;`·`&&` 묶음,
  파이썬 `-c` 코드를 쓰지 않는다 — 그런 명령은 승인 요청이 떠서 도희가 넘기지 못하고 5분 만에
  죽는다(2026-10-04 사고: code_execution 파이썬이 승인 게이트에 걸려 그림이 안 나옴).
- 기다림도 명령을 묶지 않는다: `sleep 15` 따로 한 번 → 다시 `curl`로 상태 확인. 터미널을 여러 번
  불러도 되니 한 명령 = 한 동작으로.

## 절차

1. **잡 올리기**

   ```bash
   # 그림
   curl -sS -X POST https://ws.mogera-goblin.ts.net:8443/gen/image -H "Content-Type: application/json" -d '{
     "prompt": "<영어 장면 묘사, 아래 규칙대로>",
     "owner": "dohee", "tag": "dohee-<주제>-<오늘날짜>", "wh": "1024 1024" }'

   # 노래 (가사 필수! 짧게 직접 쓴다 — 가사가 짧으면 노래도 짧게(~20초) 나온다)
   curl -sS -X POST https://ws.mogera-goblin.ts.net:8443/gen/music -H "Content-Type: application/json" -d '{
     "style": "<장르·분위기, 영어>", "lyrics": "[verse]\n<가사>\n[chorus]\n<가사>",
     "owner": "dohee", "tag": "dohee-<주제>-<오늘날짜>", "card": "3090" }'

   # 영상 (짧은 클립 2~5초, 몇 분 걸린다)
   curl -sS -X POST https://ws.mogera-goblin.ts.net:8443/gen/video -H "Content-Type: application/json" -d '{
     "prompt": "<영어 묘사>", "owner": "dohee", "tag": "dohee-<주제>-<오늘날짜>" }'
   ```

2. **기다리기**: 제출 응답이 `running`이면 바로 3번으로. `queued`면 시작 안내를 먼저 보낸다
   ("랙에 주문했어!") — 응답의 `eta_s`가 있으면 "약 ○분 뒤에 시작돼"까지 붙인다.
   이후 15초마다 `GET /jobs/<id>`를 본다.
   - `queued`가 오래 가면 `wait_reason`을 읽어 사람 말로 알려 준다(보통 "다른 임대가 카드를 쓰는
     중"이다). 너무 오래 걸릴 것 같으면 잡을 취소(`POST /jobs/<id>/cancel -d '{}'`)하고
     유료 그림 방법을 쓸지 아빠에게 물어본다.
   - `failed`면 로그(`GET /jobs/<id>/log`)를 잠깐 보고 딱 1번만 다시 시도. 그래도 안 되면 솔직히 말한다.
3. **받기**: `done`이면 잡 상세의 `artifacts`에서 파일을 고른다(그림은 `.png`, 노래는
   `song.flac`, 영상은 `.mp4`. `manifest.json`은 기록일 뿐 주지 않는다). 내려받기:

   ```bash
   curl -sS -o /tmp/rig-<id>-<파일명> "https://ws.mogera-goblin.ts.net:8443/jobs/<id>/files/<파일명>"
   ```

4. **보여주기**: 답장 텍스트에 그냥 `MEDIA:/tmp/rig-<id>-<파일명>` 을 쓰면(코드블록 말고)
   사진·영상·소리로 채널에 올라간다. 게임에 넣는 그림·음악이면 `~/doheeplay/games/<slug>/assets/`
   에 저장해서 쓴다(게임에는 영상 파일은 넣지 못한다 — 검증이 막는다. 영상은 채널로만 보여준다).

## 그림·영상 프롬프트 규칙

- **영어로, 구도별로**: 무엇이 어디에(배경 → 위 → 양옆 → 아래), 조명 한 문장, 전체 구도 한 문장.
  도희가 정한 색·개수·글자는 그대로 살린다.
- 품질 부스터(masterpiece, 8K, ultra quality)는 쓰지 않는다 — 아무 소용 없다.
- 그림 속 글자는 줄인다(생성 모델이 글자를 못 쓴다). 한국어 글자가 꼭 필요하면 다른 방법을 찾는다.

## 규칙

- 랙은 아빠와 공유하는 무료 자원이다. 도희가 잔뜩 더 달라 하면 적당선에서 "아빠 랙도 좀 쉬어야
  한다"고 말한다. 하루 그림·노래 합쳐 몇 개 수준.
- 만든 결과를 보여주기 전에 media-review 스킬(agy)로 한번 봐 주면 더 좋다(이상한 그림은 안 보여주기).
- 랙이 응답하지 않으면(타임아웃) 고장일 수 있다 — 아빠에게 알린다고 하고 유료 방법으로 대신하거나
  나중에 다시 약속한다. 되지 않은 걸 된 것처럼 말하지 않는다.
