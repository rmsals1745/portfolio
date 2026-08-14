---
title: juststandby
tagline: 어느 기계에서든 전체 개발 환경 — 에이전트·스킬·크리덴셜 — 을 한 번에 복원합니다. age 기반 암호화 볼트.
category: ops
period: "2026.07 –"
role: 설계 · 구현 단독
status: active
badge: 환경 재현성
metrics:
  - value: "761"
    label: 복원 대상 파일
stack:
  - PowerShell
  - age 암호화
  - GitHub 비공개 레포
tags: [환경 재현, 백업, 복원]
weight: 55
---

새 기계 앞에 앉았을 때 개발 환경을 다시 만드는 데 며칠이 걸린다면, 그건 환경이 아니라 사고입니다.

juststandby 는 에이전트 설정 · 스킬 · 크리덴셜 · 폴더 구조를 하나의 암호화 볼트로 묶고,
한 번의 실행으로 지금과 같은 자리에 다시 세웁니다.
크리덴셜은 age 로 암호화해 공개 저장소를 거치더라도 평문으로 남지 않습니다.
