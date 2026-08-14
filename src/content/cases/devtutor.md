---
title: devtutor
tagline: 작업 세션에서 개념을 자동 추출해 지식 베이스로 축적합니다. 로컬 서버 + Cloudflare + TWA 모바일 앱.
category: ops
period: "2026.06 –"
role: 설계 · 구현 단독
status: active
badge: 지식 파이프라인
metrics:
  - value: "586"
    label: 관리 파일 수
stack:
  - Python
  - Cloudflare Workers
  - TWA (Android)
  - Obsidian
tags: [지식 파이프라인, 자동 추출]
weight: 50
---

일을 하면서 배운 것은 대부분 그 자리에서 증발합니다.
devtutor 는 세션이 끝날 때 그 대화에서 **개념 단위**를 추출해 지식 카드로 만들고,
기존 카드와 연결해 축적합니다.

시간 기반 크론이 아니라 **세션 시작 이벤트**에 걸어 두었습니다 —
기계가 대부분 꺼져 있는 환경에서 시간 기반 스케줄은 조용히 실행되지 않기 때문입니다.
