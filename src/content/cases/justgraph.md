---
title: justgraph
tagline: 중단되고도 살아남는 자동화 워크플로. 결재에서 멈춘 그래프를 며칠 뒤 완전히 다른 프로세스가 그 자리에서 재개합니다.
category: agent-infra
period: "2026.08 –"
role: 설계 · 구현 단독
status: active
badge: Durable Workflow
metrics:
  - value: "1개"
    label: 콜백으로 관측 자동 수집
  - value: "14일 / 영구"
    label: 전문 / 요약 보존정책
stack:
  - Python 3.12
  - LangGraph
  - uv
  - Hetzner + systemd/cron
tags: [내구성 워크플로, HITL, 관측성]
weight: 70
---

LangGraph 기반. **결재 인터럽트에서 멈춘 그래프를 완전히 다른 프로세스가 재개**하는 것을 실증했습니다.
며칠 뒤 기계를 껐다 켜도 그 자리에서 이어집니다.

단발 cron 이 못 하는 것은 **런 사이의 상태 누적**입니다. 크론은 매번 처음부터 시작하기 때문에
"사람의 결재를 기다리는 중"이라는 상태를 표현할 수 없습니다.

## 관측성

상용 플랫폼 대신 직접 만들었습니다. **콜백 1개로 자동 수집**되므로 노드가 계측을 몰라도 됩니다.
OTEL 스팬 규격을 따르고, 보존정책을 분리했습니다 — 전문 14일, 요약 영구.
