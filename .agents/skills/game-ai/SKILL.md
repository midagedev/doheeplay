---
name: game-ai
description: >
  Wire in-game AI into doheeplay games: talking NPCs, dynamic hints, story generation,
  quiz creation, or any chat-based intelligence at runtime — via the family GLM relay
  (glm-5.3-flash, keyless, Tailscale-only, OpenAI-compatible). Use when the user wants
  AI in the game, a character that talks, smart hints, or generated text while playing.
  Korean triggers: 게임 안 AI, AI NPC, 말하는 캐릭터, AI 힌트, 이야기 생성, AI 퀴즈.
---

# 게임 안 AI — 가족 GLM 릴레이

doheeplay 게임에서 실시간 AI가 필요하면(NPC 대화, 상황에 맞는 힌트, 이야기 만들기, 퀴즈 출제 등)
이 릴레이를 브라우저에서 바로 호출한다. **API 키가 필요 없다** — 키는 서버에만 있고 게임 코드에는
URL만 들어간다.

- 엔드포인트: `https://vps.mogera-goblin.ts.net:10001/v1/chat/completions` (OpenAI 호환)
- 모델: `glm-5.3-flash` (빠르고 가볍다)
- 항상 `"thinking": {"type": "disabled"}` 를 같이 보낸다 — 안 보내면 답이 늦어지고 토큰이 낭비된다.
- 서버 제한: 요청당 max_tokens ≤ 512, 같은 기기에서 분당 30회. 이 범위 안에서만 쓰게 만든다.
- 이 주소는 **Tailscale이 켜진 우리 집 기기에서만** 동작한다. 밖에서는 호출이 실패하는 게 정상이므로,
  게임은 AI 없이도 완전히 플레이 가능해야 한다.

## 복사해도 되는 클라이언트 (단일 index.html 게임에 그대로 붙인다)

```js
const AI = {
  url: "https://vps.mogera-goblin.ts.net:10001/v1/chat/completions",
  model: "glm-5.3-flash",
  async chat(messages, { maxTokens = 200, temperature = 0.8, timeoutMs = 20000 } = {}) {
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          thinking: { type: "disabled" },
          messages,
          max_tokens: maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() ?? null;
    } catch {
      return null; // Tailscale 꺼짐/네트워크 실패 — 게임은 계속 진행
    }
  },
};
```

사용 예:

```js
const reply = await AI.chat([
  { role: "system", content: "너는 숲을 지키는 웃긴 도깨비다. 한국어로 1~2문장만 대답해." },
  { role: "user", content: "여기서 어디로 가야 해?" },
]);
showDialog(reply ?? "응? 방금 뭐라구? (AI 잠깐 쉬는 중!)"); // null이면 대체 대사
```

## 규칙

1. **AI 없이도 게임이 완전히 되어야 한다.** `null`이 오면 미리 써둔 대체 대사·기본 힌트로 넘어간다.
   AI가 죽어도(?) 플레이는 끊기지 않는다.
2. 호출은 **사용자 행위에 대해서만** (대화 버튼 클릭, 이벤트 발생). 게임 루프/애니메이션 프레임마다
   호출하지 않는다. 같은 질문을 반복하지 않도록 답을 캐시한다.
3. 시스템 프롬프트로 캐릭터 성격을 정하고, 아이가 읽을 한국어 짧은 문장(1~3문장)으로만 답하게 한다.
4. 플레이어가 입력한 텍스트를 AI에 보낼 때는 최대 500자로 자른다.
5. 게임 코드에 API 키나 이 릴레이 외의 다른 서비스 키를 절대 넣지 않는다. 릴레이 URL만 쓴다.
   검증기(`npm run validate`)가 릴레이를 쓰는 파일의 `fetch()`만 허용하므로, 위 클라이언트의
   URL을 **글자 하나 바꾸지 말고 그대로** 써야 빌드가 통과한다(다른 외부 URL은 계속 차단).
6. 첫 호출이 실패하면 "AI가 잠깐 쉬는 중" 안내를 띄우고, 다시 시도는 사용자가 버튼을 다시 누를 때만.
7. AI가 게임 상태를 바꾸게 하지 않는다(아이템 증설 등). AI는 말/힌트/이야기만 만든다.

## 확인

게임을 만든 뒤 VPS 안에서 플레이테스트하면 릴레이도 같이 돈다(VPS도 tailnet에 있으므로).
AI 호출이 계속 `null`로 돌아오면 먼저 `https://vps.mogera-goblin.ts.net:10001/v1/models`가
응답하는지 확인한다. 응답하지 않으면 릴레이가 죽었으니 아빠에게 고장 신고를 보낸다.
