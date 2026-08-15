# parkgeunmin.pages.dev — 포트폴리오

박근민(Park Geunmin)의 포트폴리오 사이트. **정적 사이트 + 자동 채집 파이프라인**입니다.

> 배포본: https://parkgeunmin.pages.dev

작업 기록이 쌓이면 사례가 저절로 늘어나되, **틀린 내용이 자동으로 공개되지는 않게**
만드는 것이 이 저장소의 설계 목표입니다.

## 구조

```
옵시디언 볼트 (원천, 로컬)
      │  scripts/ingest      결정론 — 원천을 구조로. 판단은 하지 않는다.
      ▼
drafts/*.md  (draft: true · 저장소에 추적되지 않음)
      │  scripts/polish.py   판단 — 한 줄 요약·분류·수치 제안 (LLM)
      ▼
      │  ★ 사람이 확인 → draft:false + src/content/cases/ 로 이동
      │     공개되는 유일한 경로이고, 기계는 이 문을 통과할 수 없다
      ▼
src/content/cases/*.md → Astro 빌드 → Cloudflare Pages
```

| | |
|---|---|
| `src/content.config.ts` | 콘텐츠 스키마와 **분야 4축** 정의 |
| `src/pages/index.astro` | 첫 화면 — 층 단면 |
| `scripts/ingest/` | 볼트 → 초안 변환기 (결정론, 테스트 27) |
| `scripts/polish.py` | 초안 다듬기 (LLM, 인용 대조 가드) |
| `scripts/refresh.ps1` | 위 둘 + 빌드 검증을 묶은 진입점 |
| `scripts/deploy.ps1` | 배포 + 실측 검증 |

## 설계에서 신경 쓴 것

**자동 공개 경로가 없다.** 기계가 만든 사례는 추적되지 않는 `drafts/` 에만 쌓이고
`draft: true` 로 고정됩니다. 사람이 확인해 옮기기 전에는 사이트에도, 이 공개 저장소에도
들어가지 않습니다 — `draft: true` 는 "사이트에 안 뜬다"만 보장하지 "저장소에 안 들어간다"를
보장하지 않기 때문에 두 겹으로 막았습니다.

**LLM 이 숫자를 지어내지 못하게 막는다.** 수치를 제안할 때 원문 인용을 함께 요구하고,
그 인용문이 실제로 본문에 있는지 기계로 대조합니다. 통과 못 하면 버립니다.
지어낸 인용 · 인용은 진짜인데 숫자만 부풀린 것 · 인용 없는 것이 모두 걸러지는지를
[테스트로 증명](scripts/tests/test_polish_guard.py)해 둡니다 — 통과 케이스만 있는 테스트는
가드가 살아 있다는 것을 증명하지 못하기 때문입니다.

**검증이 스스로 변별력을 증명한다.** 배포 검증은 상태코드가 아니라 `content-type` 을 봅니다.
Cloudflare Pages 는 없는 경로에도 폴백으로 200 을 주기 때문에, 200 만 보면 깨진 이미지를
통과시킵니다(실제로 이미지 5장이 그렇게 깨진 채 서비스된 적이 있습니다).
그래서 매 배포마다 **존재하지 않는 경로**를 같이 찔러 보고, 그것마저 통과하면
나머지 결과를 전부 무효로 선언합니다.

**화면 길이가 고정되어 있다.** 사례가 계속 늘어도 첫 화면은 층마다 대표 2건만 세웁니다.
나머지는 분야 페이지로 넘어갑니다. 채집이 자동이면 화면은 반드시 방대해지므로,
늘어나는 쪽과 보이는 쪽을 분리했습니다.

## 실행

```powershell
pnpm install
pnpm dev                    # 로컬 개발
pwsh scripts\refresh.ps1    # 볼트 → 초안 → 다듬기 → 빌드 검증
pwsh scripts\deploy.ps1     # 배포 + 실측 검증
```

경로는 환경변수로 덮어쓸 수 있습니다:
`PORTFOLIO_VAULT` · `PORTFOLIO_NOTES` · `LLM_CLIENT_DIR` · `WRANGLER_CMD`

```bash
python -m pytest scripts/ingest/tests scripts/tests -q    # 39 tests
```

## 기술

Astro 6 (정적 출력, content collections) · Cloudflare Pages · Python 3.12+ (PyYAML)
