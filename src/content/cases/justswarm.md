---
title: justswarm
tagline: AI 여러 대를 한 팀으로 묶는 엔진입니다. 한 대가 코드를 짜면 다른 회사의 AI가 그걸 검사하고, 통과할 때까지 되돌려 보냅니다 — AI가 자기 결과를 스스로 통과시키지 못하게 막는 것이 설계의 중심입니다.
category: agent-infra
period: "2026.04 –"
role: 설계 · 구현 단독
status: active
badge: Orchestration Engine
metrics:
  - value: "52"
    label: 실행 런 (2026-07-18 → 08-09)
  - value: "17"
    label: 수정 요구가 나온 런
  - value: "2→0"
    label: 검수 우회 자동승인 (가드 도입 후 103런 0건)
stack:
  - Python
  - Claude Code CLI
  - GLM 5.2
  - MiMo v2.5-pro
  - DeepSeek
  - Kimi
tags: [오케스트레이션, 검수 프로토콜, 폴백 체인]
weight: 100
featured: true
---

에이전트를 한 번 돌려보는 것과, 조직이 매일 그 위에서 일하게 만드는 것은 다른 문제입니다.
justswarm 은 후자를 위한 엔진입니다. 목표와 명세를 던지면 구현 워커가 코드를 쓰고, **다른 프로바이더의**
검수 워커가 그 결과를 판정하고, 통과할 때까지 반복합니다.

## 왜 만들었나

AI 산출물은 그럴듯하게 틀립니다. 사람이 매번 들여다봐야 한다면 자동화한 의미가 없습니다.
그래서 사람 대신 **모델끼리 서로를 검증하게 만드는 구조**가 필요했습니다.

문제는 그 구조가 쉽게 무너진다는 것입니다. 같은 모델이 만들고 같은 모델이 검수하면 통과합니다.
검수자가 판정 형식을 지키지 않으면 엔진이 아무 말이나 승인으로 읽습니다.
프로바이더가 죽으면 체인 전체가 멈춥니다. 이 세 가지를 각각 막는 것이 이 엔진의 대부분입니다.

## 실제 실행 기록

<div class="figure">
<div class="term">
  <div class="term-bar"><i></i><i></i><i></i><span><code>metrics/runs.jsonl</code> — 실제 실행 기록</span></div>
  <div class="term-body">
    <div class="cmd">swarm_run_v6.py --profile glen --verifier mimo --spec chunk.md</div>
    <table>
      <tr><td class="k">기간</td><td class="v">2026-07-18 → 2026-08-09 · 총 <b>52 런</b></td></tr>
      <tr><td class="k">판정</td><td class="v"><span class="ok">approve 48</span> · <span class="warn">revise 1</span> · <span class="bad">reject 3</span></td></tr>
      <tr><td class="k">재작업</td><td class="v"><b>17 런</b>에서 수정 요구 <b>19건</b> → <b>16 런</b>이 2회 이상 반복</td></tr>
      <tr><td class="k">검수자</td><td class="v">mimo 35 · kimi 7 · kai 5 <span style="color:var(--ink-faint)">(폴백 체인 실동작)</span></td></tr>
      <tr><td class="k">워커</td><td class="v">glen 38 · kai 5 · kimi 4 · mimo 3</td></tr>
      <tr><td class="k">자동승인 우회</td><td class="v"><span class="ok">0건</span> <span style="color:var(--ink-faint)">— 셀프리뷰 가드 우회 없음</span></td></tr>
    </table>
  </div>
</div>
<p class="cap">검수가 장식이 아니라는 증거 — 52 런 중 <b>17 런에서 실제 수정 요구가 나왔고 16 런이 재작업을 거쳤습니다.</b> 검수자가 3개 프로바이더에 걸쳐 분포한 것은 폴백 체인이 실제로 발동했다는 뜻입니다.</p>
</div>

## 구조

- **구현/검수 역할 분리** — 구현 모델과 검수 모델을 서로 다른 프로바이더로 분리하고, 판정은
  `DECISION: approve|revise|reject` 문법만 허용합니다. 미준수 시 엔진이 재질의합니다.
- **셀프리뷰 차단 런타임 가드** — 그 라운드에 산출물을 낸 모델은 검수 후보에서 자동 제외됩니다.
  후보가 소진되면 **자동 승인 대신** 사람 검수로 승계합니다. AI 가 자기 결과를 통과시키는
  구조적 실패를 원천 차단합니다.
- **다단 폴백 체인** — worker · verifier 각각 3단 승계. 프로바이더 장애 / 안전필터 거부 / 인코딩 손상을
  **서로 다른 실패로 분류**해 라우팅합니다. (검수 모델의 안전필터 거부가 `reject` 판정으로 둔갑하던
  사고를 잡아낸 뒤 도입했습니다.)
- **diff 가 유일한 진실** — 워커의 자기보고를 판정에서 배제합니다. baseline → 검수 전 → 검수 반영
  이정표 커밋으로 **검수의 효과 자체를 감사 가능**하게 설계했습니다.

## 검수가 잡아낸 것

가장 중요한 교훈은 **게이트가 통과했다는 사실만으로는 아무것도 증명되지 않는다**는 것이었습니다.
`tsc --noEmit` 같은 명령은 워커가 아무 일도 하지 않아도 통과합니다. 그래서 baseline 커밋만
체크아웃한 임시 워크트리에서 게이트를 한 번 더 돌려, **거기서도 통과하는 명령을 가려내는**
변별력 검사를 넣었습니다. 변별력이 0이면 그 런의 통과는 "아무것도 안 깨졌다"까지만 뜻합니다.

이 결과는 검수자에게 **경고로만** 전달됩니다. 통과 신호는 절대 주지 않습니다 —
검수자를 방심시키는 순간 검수 계층 전체가 무의미해지기 때문입니다.
