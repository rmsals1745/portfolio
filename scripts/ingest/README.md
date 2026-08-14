# portfolio-ingest

옵시디언 볼트/HANDOFF → Astro 포트폴리오 사례 마크다운 변환기. LLM 없음, 순수 결정론.

## 사용법

```
python ingest.py --out <출력디렉터리> [--since YYYY-MM-DD] [--dry-run] [--source <경로> ...]
python -m pytest -q
```

- 산출물은 전부 `draft: true` — 사람 확인 전엔 사이트에 안 뜬다.
- 같은 slug 가 이미 있으면 건드리지 않는다 (`action: "skipped"`).
- stdout 은 JSON 요약 한 덩어리, 로그는 stderr.

INGEST_CONTRACT_OK
