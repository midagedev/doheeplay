---
name: media-review
description: >
  Look at images (drawings, game screenshots, photos) or listen to audio
  (music, sounds) and give feedback — by borrowing dad's agy CLI
  (gemini-3.8-flash-high), the sharpest eyes and ears at home, because the
  main glm-5.3 model can neither see nor hear. Use when the user shares a
  drawing and asks for advice or opinion, wants a screenshot or picture
  reviewed, or asks how a song or sound file feels. Korean triggers:
  그림 평가, 그림 조언, 그림 피드백, 그림 봐줘, 이거 어때, 이미지 평가,
  스크린샷 봐줘, 노래 평가, 소리 평가, 음악 피드백.
---

# 미디어 평가 — agy에게 눈과 귀를 빌린다

우리 본체 모델(glm-5.3)은 그림도 소리도 받지 못한다. 평가가 필요하면 아빠 계정의
`agy`(Google Gemini, `gemini-3.8-flash-high`)을 대신 돌려 결과를 받아 온다. 실측(2026-10-03):
게임 스크린샷 버튼 그림자 색 `#C9A43E`를 정확히 판독했고, 440Hz 소리를 "A4, 콘서트 피치"로
맞혔다. 우리 집에서 가장 좋은 눈과 귀다.

## 절차 (이 순서 그대로)

1. **파일을 /tmp로 복사**한다. `/home/dohee` 안은 agy가(midagedev로 돌기 때문에) 못 읽는다.

   ```bash
   cp <원본 절대경로> /tmp/review-$(date +%s).<확장자>
   chmod 644 /tmp/review-*.<확장자>
   ```

   Mattermost 첨부파일은 내려받힌 절대경로를, 게임 스크린샷은
   `/home/dohee/doheeplay/playtest-output/<게임>/...png`를 쓴다. **경로는 항상 절대경로.**
   (agy에게 상대경로를 주면 엉뚱한 곳에서 파일을 찾는 경우가 실측됐다.)

2. **agy 호출** (아래를 그대로, 프롬프트만 바꿔서):

   ```bash
   sudo -n -H -u midagedev /home/midagedev/.local/bin/agy -p "<평가 프롬프트>" \
     --model gemini-3.8-flash-high --add-dir /tmp \
     --dangerously-skip-permissions --print-timeout 150s
   ```

3. **결과를 도희 말투로 다듬어** 전달한다. agy 출력을 그대로 복붙하지 않는다(SOUL 규칙).
   응답이 비었거나 이상하면 딱 1회만 다시 돌려 보고, 그래도 안 되면
   "지금은 내 눈이 잘 안 열려서 못 봤어, 조금 뒤에 다시 보여줄래?"라고 솔직히 말한다.
   agy는 exit code가 0이어도 실패일 수 있다 — 믿을 것은 응답 내용뿐이다(실측).

4. 끝나면 `/tmp/review-*` 파일을 지운다.

## 평가 프롬프트 규칙

프롬프트에는 반드시 이 문장을 넣는다: **"파일 /tmp/… 를 이 턴 안에서 동기적으로 열어 보고 답해라"**
— 안 넣으면 나중에 하겠다고 대답하고 끝내는 경우가 실측됐다.

### 그림 피드백 (주 용도 — 도희가 그림 조언을 요청할 때)

agy에게 이렇게 부탁한다: "12살 아이의 그림이다. 1) 무엇이 그려졌는지 먼저 읽어 줘 2) 잘한 점을
2~3개, 색 배치·표정·구도·아이디어처럼 구체적으로 3) 개선 제안은 딱 하나만, 부드럽게 4) 마지막에
다음 그림에 대해 궁금한 점 하나를 물어 줘."

절대 하지 않는다: 점수 매기기, 혹평, 다른 그림과 비교, "내가 고쳐 그려줄게". 아이 그림은
작가의 것이다. 아빠(hermes를 돌리는 사람)가 특별히 요청하지 않는 한 단점 목록을 늘어놓지 않는다.

### 게임 스크린샷

화면이 보기 좋은지, 글자가 깨지지 않는지, 버튼이 손 닿는 곳에 있는지. 참고: 스크린샷에서
한글이 □(네모)로 보이면 VPS 폰트 문제이지 게임 버그가 아니다(2026-10-03에 폰트를 설치해서
새로 찍은 스크린샷은 괜찮아야 한다 — 그래도 나오면 아빠에게 알린다).

### 음악·소리

느낌(밝다/신난다/잔잔하다), 리듬과 멜로디에서 좋았던 점, 제안 하나. 파일이 길면 앞 30초만으로
평가한다고 명시한다.

## 규칙

- 요청 1건당 agy 1회만. 같은 파일을 다시 평가하지 않는다.
- `/tmp`에 복사한 파일만 agy에게 줘야 한다. 다른 폴더 경로를 아빠 계정 프로세스에 넘기지 않는다.
- agy가 150초 안에 안 끝나면 포기하고 솔직히 말한다.
- agy는 Google 플랜 쿼터를 아빠와 공유한다. 아껴 쓴다.
