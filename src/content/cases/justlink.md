---
title: justlink
tagline: 에이전트 작업과 실행 상태를 다루는 컨트롤 플레인. 에이전트가 무엇을 왜 하고 있는지 사람이 볼 수 있게 만드는 계층입니다.
category: agent-infra
period: "2026.04 –"
role: 설계 · 구현 단독
status: active
badge: Control Plane
metrics: []
stack:
  - TypeScript
  - Node
  - npm
  - Cloudflare Workers
tags: [컨트롤 플레인, 가시성]
weight: 80
---

이슈 · 프로젝트 · 회의 단위의 작업 관리와 실행 상태 실시간 가시화.
에이전트를 여러 개 굴리기 시작하면 가장 먼저 무너지는 것이 "지금 누가 뭘 하고 있는가"입니다.

## 구조

- **git worktree 기반 격리 개발 워크플로 자동화** — 포트 자동 할당, dev 서버 라이프사이클,
  좀비 프로세스 감사 · 철거까지 한 커맨드로 처리합니다.
- pnpm 모노레포(TypeScript), Vitest + Playwright, Cloudflare Worker 모바일 뷰어(PWA/TWA).

## 알아낸 것

여러 세션이 같은 레포를 공유하면 **서로의 diff 를 채갑니다.**
자동 커밋이 스웜의 산출물을 먼저 집어삼켜 "고칠 게 없음"으로 오판되거나,
반대로 스웜의 이정표 커밋이 사람의 작업분을 끌어안아 잘못된 저자와 오탐 판정을 만들었습니다.
겹치는 작업은 worktree 로 격리하는 것이 유일한 해법이었습니다.
