"""
초안 다듬기 — 변환기가 뽑아 놓은 draft 사례를 LLM 이 사람이 읽을 형태로 만든다.

역할 분담:
  ingest.py  = 결정론. 원천 → 구조. 판단이 필요한 건 손대지 않는다.
  polish.py  = 판단. 한 줄 요약 · 분야 분류 · 수치 제안.
  사람       = 최종 확인. draft:false 로 내리는 것은 사람만 한다.

★ 이 스크립트는 draft 를 절대 false 로 만들지 않는다.
  자동으로 사이트에 글이 뜨는 경로는 존재하지 않는다.

★ 수치는 원문 인용 없이는 채택하지 않는다.
  LLM 에게 "이 숫자가 본문 어디에 있는지 그대로 인용하라"고 요구하고,
  인용문이 실제로 본문에 존재하는지 기계로 대조한다. 통과 못 하면 버린다.
  포트폴리오에 틀린 숫자가 들어가면 나머지가 다 사실이어도 신뢰가 죽는다.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
# 초안은 추적되지 않는 drafts/ 에 산다. 이 저장소는 공개라, 기계가 작업 노트에서
# 뽑아낸 글이 사람 확인 전에 저장소로 새어 나가면 안 된다.
# 사람이 확인해 src/content/cases/ 로 옮기는 순간부터 공개 대상이 된다.
CASES = Path(os.environ.get("PORTFOLIO_DRAFTS") or REPO / "drafts")

# 공용 LLM 클라이언트 (키는 Hermes .env 우선)
_llm_dir = os.environ.get("LLM_CLIENT_DIR") or str(
    Path.home() / "Projects" / "clawview" / "automation"
)
sys.path.insert(0, _llm_dir)
try:
    from llm_client import chat  # type: ignore
except Exception as exc:  # pragma: no cover - 환경 의존
    print(f"[error] llm_client 를 불러오지 못했습니다: {exc}", file=sys.stderr)
    raise SystemExit(3)

VALID_CATEGORIES = {"agent-infra", "product", "applied", "ops"}

SYSTEM = """너는 시니어 엔지니어의 포트폴리오 편집자다.
작업 기록 원문을 받아 포트폴리오 사례 카드에 쓸 정보를 뽑는다.

반드시 지킬 것:
- 원문에 없는 사실을 만들지 마라. 특히 숫자는 절대 지어내지 마라.
- 수치를 제안할 때는 그 숫자가 등장하는 원문 문장을 quote 필드에 **그대로** 복사하라.
  글자 하나라도 바꾸면 기계 대조에서 탈락한다. 확실하지 않으면 그 수치를 빼라.
- 수치가 하나도 없으면 metrics 를 빈 배열로 두어라. 억지로 채우지 마라.
- ★ 아무 숫자나 고르지 마라. **성과나 규모를 보여주는 수치**만 쓴다.
  좋은 예: 실행 런 수, 검수 통과율, 처리한 파일 수, 잡아낸 결함 수, 커밋 수.
  나쁜 예: 타임아웃 설정값, 렌더 소요 시간, 버전 번호, 포트 번호, 재시도 횟수 —
  이런 건 사실이어도 이 사람이 무엇을 해냈는지 말해주지 않는다.
  고를 만한 게 없으면 **빈 배열이 정답이다.** 빈칸은 안 보이지만 무의미한 숫자는 눈에 띈다.
- tagline 은 한 문장, 110자 이내. 무엇을 만들었고 왜 어려웠는지가 드러나야 한다.
  "~를 개발했습니다" 같은 밋밋한 요약이 아니라, 읽는 사람이 한 줄로 이해할 수 있게.
- 한국어로 쓴다. 존댓말 평서형("~합니다").

JSON 만 출력한다. 설명 문장을 붙이지 마라.

형식:
{"tagline": "...", "category": "agent-infra|product|applied|ops",
 "stack": ["..."],
 "metrics": [{"value": "52", "label": "실행 런", "quote": "원문에서 그대로 복사한 문장"}]}
"""


def split_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        raise ValueError("프론트매터 없음")
    end = text.index("\n---", 3)
    return yaml.safe_load(text[4:end]) or {}, text[end + 4 :].lstrip("\n")


def render(fm: dict, body: str) -> str:
    head = yaml.safe_dump(fm, allow_unicode=True, default_flow_style=False, sort_keys=False)
    return f"---\n{head}---\n\n{body.strip()}\n"


def normalize(s: str) -> str:
    """인용 대조용 — 공백·따옴표·강조 기호 차이는 무시한다."""
    s = re.sub(r"[*_`~\"'“”‘’]", "", s)
    return re.sub(r"\s+", "", s)


def extract_json(raw: str) -> dict | None:
    """모델이 코드펜스나 잡담을 붙여도 JSON 덩어리를 건져낸다."""
    raw = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", raw, re.S)
    if fence:
        raw = fence.group(1).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None


def verify_metrics(proposed: list, body: str) -> tuple[list, list]:
    """
    인용문이 본문에 실제로 있는 수치만 채택한다.
    반환: (채택된 metrics, 버려진 사유 목록)
    """
    hay = normalize(body)
    kept, dropped = [], []
    for m in proposed or []:
        value = str(m.get("value", "")).strip()
        label = str(m.get("label", "")).strip()
        quote = str(m.get("quote", "")).strip()
        if not value or not label:
            dropped.append(f"value/label 누락: {m}")
            continue
        if not quote:
            dropped.append(f"인용 없음 → 폐기: {value} {label}")
            continue
        if normalize(quote) not in hay:
            dropped.append(f"인용문이 원문에 없음 → 폐기: {value} {label} :: “{quote[:40]}…”")
            continue
        if normalize(value) not in normalize(quote):
            dropped.append(f"인용문에 그 숫자가 없음 → 폐기: {value} {label}")
            continue
        kept.append({"value": value, "label": label})
        if len(kept) >= 3:
            break
    return kept, dropped


def polish_one(path: Path, apply: bool) -> dict:
    fm, body = split_frontmatter(path.read_text(encoding="utf-8"))
    report = {"file": path.name, "changed": [], "dropped": []}

    if not fm.get("draft", False):
        report["skipped"] = "draft 아님 — 사람이 확인한 파일은 건드리지 않는다"
        return report

    prompt = f"제목: {fm.get('title','')}\n\n원문:\n{body[:6000]}"
    # chat() 은 {"text","provider","model","usage"} 를 돌려준다 (문자열이 아니다).
    try:
        resp = chat(prompt, system=SYSTEM, tier="cheap", max_tokens=1200, temperature=0.3)
    except Exception as exc:
        report["error"] = f"LLM 호출 실패: {exc}"
        return report

    report["provider"] = resp.get("provider", "?")
    data = extract_json(resp.get("text") or "")
    if not data:
        report["error"] = "JSON 파싱 실패"
        return report

    tagline = str(data.get("tagline", "")).strip()
    if tagline and len(tagline) <= 110:
        if tagline != fm.get("tagline"):
            fm["tagline"] = tagline
            report["changed"].append("tagline")

    cat = str(data.get("category", "")).strip()
    if cat in VALID_CATEGORIES and cat != fm.get("category"):
        fm["category"] = cat
        report["changed"].append(f"category→{cat}")

    stack = [str(s).strip() for s in (data.get("stack") or []) if str(s).strip()]
    if stack and not fm.get("stack"):
        fm["stack"] = stack[:8]
        report["changed"].append("stack")

    kept, dropped = verify_metrics(data.get("metrics"), body)
    report["dropped"] = dropped
    if kept and not fm.get("metrics"):
        fm["metrics"] = kept
        report["changed"].append(f"metrics×{len(kept)}")

    fm["draft"] = True  # ★ 무슨 일이 있어도 유지

    if apply and report["changed"]:
        path.write_text(render(fm, body), encoding="utf-8")

    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="draft 사례를 LLM 으로 다듬는다 (draft 는 유지)")
    ap.add_argument("--apply", action="store_true", help="실제로 파일에 쓴다 (없으면 미리보기)")
    ap.add_argument("--limit", type=int, default=0, help="처리할 최대 건수 (0=전부)")
    args = ap.parse_args()

    if not CASES.exists():
        print(json.dumps({"drafts": 0, "note": f"초안 폴더 없음: {CASES}"}, ensure_ascii=False))
        return 0

    drafts = []
    for p in sorted(CASES.glob("*.md")):
        try:
            fm, _ = split_frontmatter(p.read_text(encoding="utf-8"))
        except (ValueError, yaml.YAMLError):
            continue
        if fm.get("draft"):
            drafts.append(p)

    if args.limit:
        drafts = drafts[: args.limit]

    if not drafts:
        print(json.dumps({"drafts": 0, "note": "다듬을 초안이 없습니다"}, ensure_ascii=False))
        return 0

    reports = [polish_one(p, args.apply) for p in drafts]
    print(json.dumps(
        {"drafts": len(drafts), "applied": args.apply, "reports": reports},
        ensure_ascii=False, indent=2,
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
