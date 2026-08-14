"""단일 진입점 — 옵시디언 볼트/HANDOFF → Astro 포트폴리오 사례 마크다운.

stdout 은 JSON 한 덩어리로 끝난다 (로그는 stderr).
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from portfolio_ingest.core import (  # noqa: E402
    SOURCE_ARCHIVE,
    SOURCE_HANDOFF,
    SOURCE_VAULT,
    log,
    process,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="옵시디언 볼트/HANDOFF → Astro 포트폴리오 사례 마크다운 (결정론)",
    )
    p.add_argument("--out", required=True, help="마크다운을 쓸 디렉터리 (없으면 만든다)")
    p.add_argument("--since", help="이 날짜 이후에 수정된 원천만 처리 (YYYY-MM-DD)")
    p.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 요약만")
    p.add_argument(
        "--source", action="append", default=None, metavar="경로",
        help="원천 경로 override (여러 번 가능)",
    )
    p.add_argument(
        "--include-handoff", action="store_true",
        help="HANDOFF.md 와 월별 아카이브까지 `##` 단위로 쪼개 후보로 삼는다. "
             "잡음이 많아 기본 꺼짐 — 실측에서 40여 건의 비사례가 후보로 올라왔다.",
    )
    p.add_argument(
        "--guess-metrics", action="store_true",
        help="본문의 숫자+단위를 metrics 후보로 추측한다. 기본 꺼짐 — "
             "무관한 수치가 카드에 박히면 포트폴리오 신뢰가 죽는다.",
    )
    return p.parse_args(argv)


def default_sources(include_handoff: bool = False) -> list[tuple[Path, str, bool]]:
    """
    기본 원천 — (경로, source 태그, 방법론 여부).

    볼트의 `사례/`·`방법론/` 만이 기본이다. 이쪽은 사람이 사례로 쓸 작정으로 쓴 글이라
    한 파일이 한 사례에 대응한다. 반면 HANDOFF 계열은 작업 화이트보드라
    `##` 헤딩이 사례 경계와 일치하지 않는다 — 실측에서 `pytest`, `diff`, `조치` 같은
    슬러그가 만들어졌다. 그래서 옵트인으로 내렸다.
    """
    vault = Path(r"C:\Users\admin\Documents\Obsidian\포트폴리오")
    sources = [
        (vault / "사례", SOURCE_VAULT, False),
        (vault / "방법론", SOURCE_VAULT, True),   # category: applied 후보, draft 유지
    ]
    if include_handoff:
        sources += [
            (Path(r"C:\Users\admin\handoff"), SOURCE_ARCHIVE, False),
            (Path(r"C:\Users\admin\HANDOFF.md"), SOURCE_HANDOFF, False),
        ]
    return sources


def guess_source_kind(path: Path) -> tuple[str, bool]:
    """--source 로 받은 경로의 source 태그를 경로 기반으로 결정한다."""
    name = path.name.lower()
    if name == "handoff.md":
        return SOURCE_HANDOFF, False
    if "handoff" in str(path.parent).lower() or "handoff" in name:
        return SOURCE_ARCHIVE, False
    if "방법론" in str(path):
        return SOURCE_VAULT, True
    return SOURCE_VAULT, False


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    try:
        since = date.fromisoformat(args.since) if args.since else None
    except ValueError:
        log(f"[error] --since 형식 오류 (YYYY-MM-DD): {args.since}")
        return 2

    out_dir = Path(args.out)

    if args.source:
        sources = []
        for raw in args.source:
            path = Path(raw)
            tag, methodology = guess_source_kind(path)
            sources.append((path, tag, methodology))
    else:
        sources = default_sources(include_handoff=args.include_handoff)

    result = process(
        sources, out_dir,
        since=since,
        dry_run=args.dry_run,
        guess_metrics=args.guess_metrics,
    )
    print(result.to_json())
    return 0


if __name__ == "__main__":
    sys.exit(main())
