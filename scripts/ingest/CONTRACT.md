# 청크: 옵시디언 볼트 → Astro 콘텐츠 변환기

## 목표

포트폴리오 사이트(Astro)가 먹을 수 있는 **사례 마크다운**을, 사장이 이미 쓰고 있는
원천 자료에서 **결정론적으로** 뽑아내는 파이썬 변환기를 만든다.

이 청크는 **LLM 을 호출하지 않는다.** 요약·윤문은 이 다음 단계(크론)가 한다.
여기서는 "흩어진 원천 → 구조화된 초안" 까지만 한다. 그래야 테스트가 가능하다.

## 산출물

```
ingest.py              # 단일 진입점
portfolio_ingest/      # 패키지 (원하면 분할)
tests/test_ingest.py   # pytest
README.md              # 사용법 3줄
```

## CLI 계약 (이 시그니처를 바꾸지 말 것 — 다음 단계가 그대로 호출한다)

```
python ingest.py --out <출력디렉터리> [--since YYYY-MM-DD] [--dry-run] [--source <경로> ...]
```

- `--out` : 마크다운을 쓸 디렉터리. 없으면 만든다.
- `--since` : 이 날짜 이후에 수정된 원천만 처리. 생략 시 전부.
- `--dry-run` : 파일을 쓰지 않고 요약만 stdout 에 낸다.
- `--source` : 원천 경로 override (여러 번 가능). 생략 시 아래 기본 원천.

**stdout 은 반드시 JSON 한 덩어리**로 끝난다 (로그는 stderr 로):

```json
{"written": 3, "skipped": 1, "drafts": 3, "items": [{"slug": "justswarm", "category": "agent-infra", "source": "vault", "action": "created"}]}
```

## 기본 원천 (없으면 조용히 건너뛴다 — 크래시 금지)

1. `C:\Users\admin\Documents\Obsidian\포트폴리오\사례\*.md`      → 사례 본문
2. `C:\Users\admin\Documents\Obsidian\포트폴리오\방법론\*.md`    → 사례 아닌 방법론. `category: applied` 후보로만 표시하고 `draft: true` 유지
3. `C:\Users\admin\handoff\*.md`                                  → 월별 아카이브. `## ` 헤딩 단위로 쪼개 사례 후보로
4. `C:\Users\admin\HANDOFF.md`                                    → 현재 상태 보드

## 출력 프론트매터 스키마 (정본 — 한 글자도 바꾸지 말 것)

Astro `src/content.config.ts` 의 zod 스키마와 **기계적으로 일치**해야 한다.
필드명·타입이 틀리면 사이트 빌드가 통째로 실패한다.

```yaml
---
title: string                 # 필수
tagline: string               # 필수. 카드에 보이는 한 줄. 원천의 첫 문장에서 뽑되 110자 이내로 자른다
category: string              # 필수. 아래 4개 중 하나만
period: string                # 필수. 예 "2026.04 –" / "2026.07"
role: string                  # 선택
status: live | active | archived    # 기본 active
badge: string                 # 선택
metrics:                      # 최대 3개. 넘으면 앞 3개만 남긴다 (4개 이상이면 빌드 실패)
  - value: "52"
    label: "실행 런"
stack: [string]               # 기본 []
tags: [string]                # 기본 []
weight: number                # 기본 0
featured: boolean             # 기본 false
draft: boolean                # ★ 이 변환기가 만든 것은 전부 true. 예외 없음
source: string                # "vault" | "handoff" | "handoff-archive"
updated: YYYY-MM-DD           # 원천 파일 mtime
---
```

`category` 허용값 4개, 이 외에는 금지:
`agent-infra` · `product` · `applied` · `ops`

분류 규칙 (키워드 기반, 결정론):
- justswarm / justlink / justgraph / Hermes / 오케스트레이션 / 컨트롤 플레인 / 워크플로 → `agent-infra`
- 인생딸깍 / inlifeclick / 결제 / 포트원 / 크레딧 / 구독 → `product`
- JUST DESIGN / 시안 / 파이프라인 / 컴플라이언스 / 플러그인 / 검수 → `applied`
- 크론 / 백업 / 스케줄 / 복원 / juststandby / 상시 / systemd → `ops`
- ComfyUI / LoRA / 확산 / 시네마틱 → `applied` (옛 genai 축, 2026-08-15 폐지)
- 어디에도 안 걸리면 `applied` + `draft: true` 유지 + stderr 에 경고

## 반드시 지킬 것

1. **`draft: true` 고정.** 이 변환기의 산출물이 사람 확인 없이 사이트에 뜨면 안 된다.
2. **기존 파일을 덮어쓰지 않는다.** `--out` 에 같은 slug 가 이미 있으면 `action: "skipped"` 로 보고하고 건드리지 않는다.
   (사장이 손으로 다듬은 사례를 기계가 되돌리는 사고를 막는다.)
3. **인코딩** — 모든 읽기/쓰기는 `encoding="utf-8"`. 원천에 **UTF-8 BOM 이 섞여 있다**(볼트 스크립트가 BOM 을 쓴다).
   `utf-8-sig` 로 읽어 BOM 을 제거하고, 쓸 때는 BOM 없이 쓴다. 한글이 깨지면 이 청크는 실패다.
4. **slug** — 한글 제목에서 파일명을 만든다. 한글은 그대로 두지 말고 로마자 변환도 하지 말고,
   **영문/숫자만 남기고 나머지는 `-`**, 결과가 비면 원천 파일명 기반으로 대체하고 그래도 비면 `case-<8자리해시>`.
   같은 slug 가 두 번 나오면 `-2`, `-3` 을 붙인다.
5. **YAML 값 이스케이프** — 제목에 `:` `#` `"` `'` 가 들어간다. 반드시 따옴표로 감싸고 내부 따옴표를 이스케이프.
   PyYAML 을 쓰되 `allow_unicode=True`, `default_flow_style=False`. 한글이 `\uXXXX` 로 나오면 실패다.
6. 원천이 하나도 없어도 exit 0 + `{"written": 0, ...}`.

## 엣지 케이스 (테스트로 증명할 것)

- 빈 파일 / 프론트매터만 있고 본문 없는 파일 / 헤딩 없는 파일
- 제목에 `:` 와 따옴표가 섞인 경우
- BOM 붙은 파일
- 같은 제목이 두 원천에 있는 경우 (slug 충돌)
- `metrics` 후보가 4개 이상 잡히는 경우 → 3개로 절단
- `--since` 가 모든 원천을 걸러내는 경우 → written 0, exit 0
- 원천 디렉터리가 아예 없는 경우 → 크래시 금지

## 완료 표식 (필수)

위 계약을 **전부** 만족시켰다고 판단하면, `README.md` 안에 아래 줄을 그대로 한 줄 넣어라.

```
INGEST_CONTRACT_OK
```

이 토큰이 파일에 없으면 게이트가 통과하지 않는다. **채팅으로 출력하는 것은 의미가 없다 — 파일에 써야 한다.**
계약을 못 지킨 항목이 있으면 토큰을 넣지 말고, 무엇이 남았는지 README 에 적어라.

## 게이트

`python -m pytest -q` 가 통과해야 한다.
테스트는 **임시 디렉터리에 가짜 원천을 만들어** 돌린다 — 사장의 실제 볼트를 읽는 테스트는 금지
(볼트가 비어 있는 기계에서 통과해 버린다).

산출된 마크다운이 스키마를 지키는지 **테스트에서 프론트매터를 다시 파싱해 검증**할 것.
"파일이 생겼다" 로 통과시키지 말 것 — 내용의 필드명·타입까지 봐야 한다.
