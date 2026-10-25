---
name: webtoon-orchestrator
description: "[doheeplay] 참고서 — 이 환경에서는 직접 쓰지 않는다(TeamCreate·codex가 없다). 웹툰 요청의 진입점은 webtoon-dohee 스킬이고, 이 문서는 그 스킬이 단계별 방법론으로 가리킬 때만 연다. 원문 설명: 웹툰 제작 에이전트 팀(27명)을 조율하는 메인 오케스트레이터. 인기 웹툰 트렌드 조사 → 대사 위주·고긴장·매 회차 반전 시나리오 작성 → 캐릭터 다각도 레퍼런스 시트를 먼저 렌더 → 회차당 50+ 패널을 말풍선·한글 대사 in-image 베이크로 codex-image 동시 5장 병렬 렌더 → panel-validator 생성-검증 루프로 기준 만족까지 재생성 → 세로 스크롤 뷰어 조립까지 전 과정을 단계별 팀 재구성으로 운영한다. 트리거: '웹툰 만들어/제작', '웹툰 한 화/회차 만들어', '웹툰 시나리오부터 이미지까지', '웹툰 에피소드 제작', '웹툰 하네스 실행'. 후속 작업: '다음 화 만들어', '이 회차 다시/수정/보완', '반전 더 강하게', '패널 다시 그려', '특정 단계만 다시 실행', '이전 결과 기반 개선' 등에도 반드시 이 스킬을 사용. 단순 웹툰 추천/감상은 직접 응답."
---

# Webtoon Orchestrator — 웹툰 제작 팀 조율

웹툰 한 회차를 트렌드 조사부터 완성 뷰어까지 만들어내는 통합 오케스트레이터. 27개 전문 에이전트를 **4개 단계별 팀**으로 순차 운영한다.

## 실행 모드: 에이전트 팀 (단계별 재구성)

세션당 활성 팀은 1개뿐이므로, 각 Phase마다 `TeamCreate`로 팀을 만들고 작업이 끝나면 `TeamDelete`로 정리한 뒤 다음 Phase 팀을 만든다. 이전 팀의 산출물은 `_workspace/`에 남아 다음 팀이 Read로 이어받는다. 모든 팀원 스폰과 Agent 호출에 **`model: "opus"`**를 명시한다.

## 에이전트 구성 (27명, 4팀)

| 팀 | 팀원 | 역할 | 스킬 | 주요 출력 |
|----|------|------|------|----------|
| **리서치팀** | trend-scout | 장르/트로프 동향 | webtoon-trend-research | 01_research/trend-scout.md |
| | platform-ranker | 플랫폼 랭킹·연재구조 | webtoon-trend-research | 01_research/platform-ranker.md |
| | audience-analyst | 독자층·이탈·몰입 | webtoon-trend-research | 01_research/audience-analyst.md |
| | hook-analyst | 후킹/반전 메커니즘 역설계 | webtoon-trend-research | 01_research/hook-analyst.md |
| | trend-synthesizer | 종합 기획 브리프 | webtoon-trend-research | 01_research/trend-brief.md |
| **시나리오팀** | concept-architect | 하이콘셉트/로그라인 | webtoon-scenario | 02_story/concept.md |
| | worldbuilder | 세계관·규칙 | webtoon-scenario | 02_story/world.md |
| | character-designer | 캐스트(외형+성격+아크) | webtoon-scenario | 02_story/characters.md |
| | series-plotter | 시리즈 아크·회차 맵 | webtoon-scenario | 02_story/series-arc.md |
| | twist-master | 매 회차 반전 설계 | webtoon-scenario | 02_story/twist-plan.md |
| | tension-engineer | 긴장 곡선·클리프행어 | webtoon-scenario | 02_story/tension-curve.md |
| | episode-outliner | 회차 비트시트(50+ 패널) | webtoon-scenario | 03_episode/ep{NN}_beatsheet.md |
| | dialogue-writer | 대사 위주 대본 | webtoon-scenario | 03_episode/ep{NN}_script.md |
| | script-editor | 교정·반전 명료성 | webtoon-scenario | 03_episode/ep{NN}_script_final.md |
| **비주얼팀** | art-director | 스타일 바이블·일관성 토큰·장소 토큰·말풍선 규약 | webtoon-panel-breakdown | 04_visual/style-bible.md, character-sheets.md |
| | ref-sheet-artist | 캐릭터 다각도/표정 레퍼런스 시트(패널 전 선행) | webtoon-panel-render | 04_visual/refs/*.png, refs/INDEX.md |
| | panel-director | 50+ 패널 샷리스트(scene_id/location) | webtoon-panel-breakdown | 04_visual/ep{NN}_shotlist.md |
| | letterer | in-image 말풍선/대사 베이크 명세 | webtoon-assembly | 04_visual/ep{NN}_lettering.md |
| | prompt-smith | 패널별 codex 프롬프트(베이크+장소+레퍼런스) | webtoon-panel-render | 04_visual/ep{NN}_prompts.md |
| | panel-artist-a | scene 그룹 A 렌더 | webtoon-panel-render | 05_panels/ep{NN}/panel_*.png |
| | panel-artist-b | scene 그룹 B 렌더 | webtoon-panel-render | 05_panels/ep{NN}/panel_*.png |
| | panel-artist-c | scene 그룹 C 렌더 | webtoon-panel-render | 05_panels/ep{NN}/panel_*.png |
| | panel-validator | 패널 6축 검증·재생성 루프 게이트(general-purpose) | webtoon-panel-render | 04_visual/ep{NN}_validation.md |
| **조립검수팀** | episode-compositor | 세로 스크롤 뷰어 조립 | webtoon-assembly | 06_assembly/ep{NN}/index.html |
| | quality-reviewer | QA 검수(general-purpose) | webtoon-assembly | 06_assembly/ep{NN}/qa_report.md |
| | continuity-manager | 회차 간 연속성 | webtoon-assembly | 06_assembly/continuity.md |
| | showrunner | 총괄·사인오프·패키징 | webtoon-assembly | RELEASE/ep{NN}/ |

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 판별)

`_workspace/` 존재 여부와 사용자 요청으로 실행 모드를 정한다.

1. `_workspace/` 미존재 → **초기 실행**. Phase 1로.
2. `_workspace/` 존재 + "다음 화" 요청 → **새 회차 실행**. {NN}을 증가시키고, 02_story·style-bible·character-sheets·**refs/(레퍼런스 시트)**·continuity.md는 재사용(Read, 재렌더 금지 — 시리즈 일관성), 03_episode 이후만 새로 생성.
3. `_workspace/` 존재 + "이 회차의 OO만 다시" 요청 → **부분 재실행**. 해당 단계 팀만 재구성하여 호출하고, 그 산출물만 덮어쓴다. 하위 단계(예: 대본 수정 시 샷리스트→렌더→조립)는 영향받는 만큼만 재실행.
4. `_workspace/` 존재 + 새 기획 입력 → **새 기획 실행**. 기존 `_workspace/`를 `_workspace_{YYYYMMDD_HHMMSS}/`로 이동 후 Phase 1.

부분/새회차 재실행 시 이전 산출물 경로를 팀원 프롬프트에 포함해 "Read 후 개선점만 반영"을 지시한다.

### Phase 1: 준비

1. 사용자 입력 분석 — 회차 번호 {NN}, 장르 방향(있으면), 제약(수위·길이·톤).
2. `_workspace/00_input/brief.md`에 입력·회차 번호·제약을 기록.
3. 작업 디렉토리 보장: `mkdir -p _workspace/{00_input,01_research,02_story,03_episode,04_visual,05_panels,06_assembly,RELEASE}`.

### Phase 2: 트렌드 리서치 (리서치팀)

**실행 모드:** 에이전트 팀

1. `TeamCreate(team_name: "webtoon-research", members: [trend-scout, platform-ranker, audience-analyst, hook-analyst, trend-synthesizer])` — 전원 `agent_type`=커스텀 이름, `model: "opus"`.
2. `TaskCreate`로 5개 작업 등록. trend-synthesizer 작업은 나머지 4개에 `depends_on`.
3. 4명의 조사자가 병렬 조사, 흥미로운 발견을 SendMessage로 공유(hook-analyst↔trend-scout 등).
4. trend-synthesizer가 4개 산출물을 종합 → `01_research/trend-brief.md`.
5. `TeamDelete`로 정리. (산출물은 `_workspace/`에 보존)

### Phase 3: 시나리오 (시나리오팀)

**실행 모드:** 에이전트 팀 (파이프라인 + 팬아웃)

1. `TeamCreate(team_name: "webtoon-story", members: [concept-architect, worldbuilder, character-designer, series-plotter, twist-master, tension-engineer, episode-outliner, dialogue-writer, script-editor])`.
2. 작업 의존성: concept → world → characters(순차 조율) → series-arc → {twist-plan, tension-curve}(상호 조율) → beatsheet → script → script_final.
3. **매 회차 반전 보장**: twist-master가 twist-plan에 회차별 반전을 명시하고, script-editor가 script_final에서 반전이 명료하게 전달되는지 검수.
4. **50+ 패널 분량 확보**: episode-outliner가 비트를 충분히 쪼개 50패널 이상 분량을 만든다.
5. 산출물: `02_story/*`, `03_episode/ep{NN}_script_final.md`.
6. `TeamDelete`로 정리.

### Phase 4: 비주얼 프로덕션 (비주얼팀)

**실행 모드:** 에이전트 팀 (감독자 + 생성-검증 루프). **codex 동시 세션 ≤ 5 엄수.**

1. `TeamCreate(team_name: "webtoon-visual", members: [art-director, ref-sheet-artist, panel-director, letterer, prompt-smith, panel-artist-a, panel-artist-b, panel-artist-c, panel-validator])`.
2. **아트 디렉션**: art-director가 `style-bible.md`(작화·**장소 토큰 LOC_***·**말풍선 시각 규약** 포함) + `character-sheets.md`(일관성 토큰+레퍼런스 사양)를 만들고 팀에 공유.
3. **레퍼런스 시트 먼저(일관성 SSOT)**: ref-sheet-artist가 주요 캐릭터의 다각도/표정 레퍼런스를 codex로 렌더(동시 ≤5) → `04_visual/refs/`에 확정 → INDEX.md를 prompt-smith·panel-validator에 인계. **패널 렌더는 레퍼런스 확정 후 시작.** (후속 회차는 기존 refs/ 재사용.)
4. **콘티+레터링 병렬**: panel-director가 `ep{NN}_shotlist.md`(50+ 패널, 각 패널 scene_id/location), letterer가 `ep{NN}_lettering.md`(in-image 말풍선 베이크 명세, 한글 짧게)를 병렬 작성.
5. **프롬프트 합성**: prompt-smith가 [스타일+장소토큰+캐릭터토큰&레퍼런스앵커+구도/상태색+말풍선/한글 베이크]를 합성한 `ep{NN}_prompts.md`를 만들고 scene 그룹 A/B/C 분배. **`no text` 금지(말풍선을 그려야 함)**, 부정은 `no English/gibberish/misspelled text`.
6. **렌더링 (동시성 핵심)**: 패널을 5장씩 배치로 렌더. panel-artist 3명이어도 **codex exec 동시 실행 총합 ≤ 5**. 리더가 렌더 패스를 순차 디스패치하거나 단일 드라이버(`scripts/codex_imagegen_batch.sh` 또는 회차 렌더 스크립트)로 5장씩 자동 배치. 50패널 ≈ 10웨이브.
7. **검증-재생성 루프 (핵심 — 기준 만족까지)**: 배치 렌더 직후 panel-validator가 6축(C1 캐릭터/레퍼런스, C2 배경·장소 연속성, C3 말풍선·한글 텍스트, C4 프롬프트 충실도, C5 대사 흐름, C6 무결성·md5중복) 검증 → ACCEPT/REGEN 판정. REGEN 패널은 prompt-smith가 프롬프트 보강 → 담당 panel-artist가 그 패널만 재렌더 → 재검증. **패널당 최대 3회**, 초과 시 ACCEPT-FLAG(통과+한계 기록). 전 패널 통과 시 `04_visual/ep{NN}_validation.md` 완성.
8. 산출물: `04_visual/*`(style-bible/character-sheets/refs/shotlist/lettering/prompts/validation), `05_panels/ep{NN}/panel_*.png`(검증 통과본).
9. `TeamDelete`로 정리.

### Phase 5: 조립 · 검수 (조립검수팀)

**실행 모드:** 에이전트 팀 (생성-검증)

1. `TeamCreate(team_name: "webtoon-assembly", members: [episode-compositor, quality-reviewer, continuity-manager, showrunner])`.
2. episode-compositor가 (말풍선이 이미 베이크된) 패널 PNG를 **오버레이 없이** 세로 스크롤 `index.html`로 조립(간격·리듬만 설계).
3. quality-reviewer가 점진적 QA — panel-validator의 `validation.md`(ACCEPT-FLAG 파악)를 먼저 읽고, 회차 전체로 패널 수 50+, **레퍼런스 외형 일관성**, **배경 연속성**, **베이크 한글 텍스트 정확/가독**, **대사 흐름**, **반전 전달**, 손상/중복 이미지를 검수. PASS/FIX/REDO 판정.
4. FIX/REDO 패널 → panel-validator 루프 재투입(prompt-smith 보강+panel-artist 재렌더) 또는 SendMessage 피드백으로 해당 패널만 재작업(최대 2회 루프). 반전이 안 드러나면 시나리오팀/레터러로 피드백.
5. continuity-manager가 `continuity.md`를 갱신(회차 간 외형/설정/떡밥).
6. showrunner가 사인오프 후 `RELEASE/ep{NN}/`에 최종 패키징 + 다음 회차 시드(클리프행어 이어받기) 제안.
7. `TeamDelete`로 정리.

### Phase 6: 마무리

1. `_workspace/` 전체 보존(중간 산출물 = 감사 추적).
2. 사용자에게 결과 요약: 회차 제목·로그라인·반전 한 줄·패널 수·뷰어 경로(`RELEASE/ep{NN}/index.html`)·다음 회차 시드.
3. 피드백 요청: "반전 강도/대사 톤/작화 일관성에서 고치고 싶은 부분이 있나요?" (Phase 7 진화 연결)

## 데이터 흐름

```
trend-brief.md
   └→ concept → world → characters → series-arc → {twist-plan, tension-curve}
                                                       └→ beatsheet → script → script_final
script_final + characters
   └→ style-bible(+장소토큰 LOC_*, 말풍선 규약)/character-sheets
        └→ refs/*.png (레퍼런스 시트, 패널 전 선행)
        └→ shotlist(scene_id/location) + lettering(in-image 말풍선 명세)
              └→ prompts(스타일+장소+레퍼런스앵커+말풍선 베이크, scene A/B/C)
                    └→ panel_*.png ⇄ panel-validator 6축 검증-재생성 루프 ⇄ prompt-smith/panel-artist
                          └→ validation.md (전 패널 통과)
panel_*.png(말풍선 포함) → index.html(오버레이 없음) → qa_report → (재작업 루프) → RELEASE/ep{NN}/
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| 팀원 1명 실패/중지 | 리더가 유휴 알림 감지 → SendMessage 상태 확인 → 재시작 또는 대체 팀원 생성 |
| 팀원 과반 실패 | 사용자에게 알리고 진행 여부 확인 |
| codex 렌더 0바이트/손상 | 해당 패널만 재렌더(배치 전체 금지). 2회 실패 시 경고 후 통과, 보고서 명시 |
| 패널 md5 중복(서로 다른 패널이 동일 이미지) | 중복 패널 삭제 후 단독 재렌더. 크기/헤더 검사로는 못 잡으니 md5 검사 필수(EP01 실제 발생) |
| 배경 급변(도로→실내 등) | panel-validator C2 REGEN → prompt-smith가 장소 토큰(LOC_*) 강화 후 그 패널만 재렌더 |
| 한글 말풍선 깨짐/오탈자 | panel-validator C3 REGEN → 텍스트 짧게·따옴표·굵게로 보강 재렌더. 3회 실패 시 가장 정확한 버전 ACCEPT-FLAG + 보고서 명시 |
| 캐릭터 외형 이탈 | panel-validator C1 REGEN → 레퍼런스 앵커·식별 표식 강조 후 재렌더 |
| codex 전체가 느림(450초+) | 플랜 한도 의심 → `codex login status` 확인, 동시 수를 줄여 재시도 |
| 패널 50개 미만 | episode-outliner/panel-director에게 비트 추가 분할 요청 |
| 반전 불명확(QA REDO) | 시나리오팀(twist-master/script-editor) 또는 letterer로 피드백 후 재작업 |
| 데이터 충돌 | 출처 병기, 삭제 금지 |
| 무한 재작업 | 패널당 재생성 최대 3회, 단계별 재작업 루프 최대 2회. 초과 시 현 상태로 진행하고 한계를 보고 |

## 테스트 시나리오

### 정상 흐름
1. 사용자: "트렌드 반영해서 웹툰 1화 만들어줘."
2. Phase 1: brief 기록, `_workspace/` 생성.
3. Phase 2: 리서치팀 5명 → trend-brief.md.
4. Phase 3: 시나리오팀 9명 → script_final.md (반전 1개+, 50+ 패널 분량).
5. Phase 4: 비주얼팀 9명 → 레퍼런스 시트 선행 → 50+ panel PNG(말풍선 베이크, 5장씩 배치, 동시 ≤5) → panel-validator 6축 검증-재생성 루프로 전 패널 통과 → validation.md.
6. Phase 5: 조립검수팀 4명 → 오버레이 없는 index.html + qa PASS → RELEASE/ep01/.
7. 결과: `RELEASE/ep01/index.html` 세로 스크롤 웹툰(말풍선 포함) + 다음 화 시드.

### 에러 흐름 (배경 급변 + 한글 깨짐 재생성)
1. Phase 4 렌더 후 panel_023의 배경이 같은 씬(도로)인데 실내로 나오고, panel_031의 말풍선 한글이 깨짐.
2. panel-validator가 C2(023)·C3(031) REGEN 판정 → validation.md에 사유·수정 지시 기록.
3. prompt-smith가 023에 장소 토큰(LOC_*) 강화, 031에 텍스트 따옴표·굵게·짧게 보강 → 담당 panel-artist가 그 2장만 재렌더.
4. panel-validator 재검증: 023 ACCEPT, 031은 3회까지도 일부 글자 흔들림 → 가장 정확한 버전 ACCEPT-FLAG + 보고서 명시.
5. 전 패널 통과 후 조립 진행, qa_report·RELEASE 노트에 플래그 패널 한계 명시.

## 후속 작업 가이드

- "다음 화" → Phase 0 case 2(새 회차). 세계관/스타일/연속성 재사용, 03_episode 이후만 신규.
- "반전 더 강하게" → 시나리오팀 부분 재실행(twist-master, script-editor) → 영향 하위 단계 재실행.
- "패널 N번 다시" → 비주얼팀 부분 재실행(prompt-smith 보강 + 해당 panel-artist 재렌더 + panel-validator 재검증) → 재조립.
- 같은 유형 피드백 2회+ 반복 시 해당 스킬/에이전트 정의 개선을 제안(하네스 진화). 변경은 CLAUDE.md 변경 이력에 기록.
