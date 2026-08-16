---
title: Hermes 상시 자동화 런타임
tagline: 개발 기계가 대부분 꺼져 있다는 전제로 설계한 자동화 런타임. 게이트웨이가 죽어도, 기계가 꺼져 있어도 살아남습니다.
category: ops
period: "2026.05 –"
role: 설계 · 구현 단독
status: active
badge: Always-on Automation
metrics:
  - value: "14건"
    label: OS 스케줄러로 분리된 잡
  - value: "3중"
    label: 백업 (로컬 · GitHub · 클라우드)
stack:
  - Python
  - Docker (Caddy · CouchDB)
  - systemd
  - cron
  - Windows 작업 스케줄러
  - Telegram Bot API
tags: [상시 런타임, 스케줄, 훅 시스템]
weight: 85
---

<div class="figure">
<div class="term">
  <div class="term-bar"><i></i><i></i><i></i><span>등록된 자동화 스케줄 — OS 스케줄러로 분리된 잡</span></div>
  <div class="term-body">
    <div class="cmd">Get-ScheduledTask -TaskName "HermesCron_*"</div>
    <table>
      <tr><td class="k">HermesCron_SyncCronOutputs</td><td class="v"><span class="ok">Running</span></td><td class="v" style="color:var(--ink-faint)">last 08-09 10:00</td></tr>
      <tr><td class="k">HermesCron_ApiKeyCheck</td><td class="v"><span class="ok">Ready</span></td><td class="v" style="color:var(--ink-faint)">last 08-09 07:40</td></tr>
      <tr><td class="k">HermesCron_StudyDaemon</td><td class="v"><span class="ok">Ready</span></td><td class="v" style="color:var(--ink-faint)">last 08-03 19:21</td></tr>
      <tr><td class="k">HermesCron_ProjectArchiver</td><td class="v" style="color:var(--ink-faint)">Disabled</td><td class="v" style="color:var(--ink-faint)">last 08-05 06:56</td></tr>
      <tr><td class="k" style="color:var(--ink-faint)">… 외 7건</td><td class="v"></td><td class="v"></td></tr>
    </table>
  </div>
</div>
<p class="cap">에이전트가 필요 없는 잡은 게이트웨이에서 떼어내 OS 스케줄러로 내렸습니다. <b>게이트웨이가 죽어도, 기계가 꺼져 있어도 살아남습니다.</b></p>
</div>

## 구조

- **게이트웨이와 스케줄러 분리** — 에이전트가 필요 없는 반복 작업은 OS 스케줄러(`StartWhenAvailable`)로
  내려, 게이트웨이 재시작 · 크래시와 무관하게 굴러가게 만들었습니다.
  놓친 실행은 기계가 켜지는 순간 따라잡습니다.
- **이벤트 훅 체계** — 세션 시작 시 작업 컨텍스트 주입과 자동 커밋 · 푸시, 종료 시 학습 개념 추출 · 축적,
  프롬프트 단계에서 위임 규칙 강제, 외부 CLI · 게이트웨이 호출 실시간 추적.
  **사람이 기억해야 할 일을 런타임이 대신 기억합니다.**
- **크리덴셜 단일화** — 프로필마다 흩어져 있던 키를 시스템 경로 한 곳으로 모아, 키 교체 시
  한 파일만 고치면 되도록 정리했습니다.
- **원격 상주** — Hetzner 에 워커를 상주시켜 로컬 기계가 꺼져 있어도
  메신저 → 서버 에이전트 → 커밋 push → 결재 흐름이 진행됩니다.

## 알아낸 것

프로바이더가 401 / 402 를 뱉을 때 원인이 "충전 부족"이라고 믿고 시간을 버린 적이 있습니다.
실제 원인은 프로필마다 다른 `.env` 에 남아 있던 **stale 엔드포인트**였습니다.
크리덴셜 단일화는 그 사고를 계기로 한 재설계입니다.
