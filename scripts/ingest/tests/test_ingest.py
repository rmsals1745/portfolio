"""portfolio_ingest 테스트 — 임시 디렉터리 가짜 원천으로만 돌린다.

실제 사장 볼트를 읽는 테스트 금지 (볼트가 비어 있는 기계에서 통과해 버린다).
산출 마크다운은 프론트매터를 다시 파싱해 필드명·타입까지 검증한다.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ingest import main
from portfolio_ingest.core import (
    SOURCE_ARCHIVE,
    SOURCE_HANDOFF,
    SOURCE_VAULT,
    dedupe_slug,
    make_slug,
)


# ---------------------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------------------


def write(path: Path, text: str, mtime: datetime | None = None, bom: bool = False):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = text.encode("utf-8")
    if bom:
        data = b"\xef\xbb\xbf" + data
    path.write_bytes(data)
    if mtime:
        ts = mtime.timestamp()
        os.utime(path, (ts, ts))
    return path


def run(tmp: Path, *extra: str) -> tuple[int, dict]:
    """ingest.main 을 subprocess 가 아니라 직접 호출하고 stdout JSON 을 캡처."""
    import contextlib
    import io

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = main(["--out", str(tmp / "out"), *extra])
    assert code == 0
    return code, json.loads(buf.getvalue())


def parse_case(path: Path) -> tuple[dict, str]:
    """산출 마크다운의 프론트매터를 다시 파싱한다."""
    text = path.read_text(encoding="utf-8")
    assert text.startswith("---\n")
    end = text.index("\n---", 3)
    fm = yaml.safe_load(text[4:end])
    body = text[end + 4:]
    return fm, body


RECENT = datetime.now() - timedelta(days=1)
OLD = datetime.now() - timedelta(days=400)

VALID_CATEGORIES = {"agent-infra", "product", "applied", "ops"}
VALID_STATUS = {"live", "active", "archived"}
VALID_SOURCES = {"vault", "handoff", "handoff-archive"}


def assert_schema(fm: dict):
    """프론트매터가 Astro zod 스키마와 기계적으로 일치하는지."""
    # 필수 필드 존재
    for key in ("title", "tagline", "category", "period", "status", "metrics",
                "stack", "tags", "weight", "featured", "draft", "source", "updated"):
        assert key in fm, f"필수 필드 누락: {key}"
    # 타입
    assert isinstance(fm["title"], str) and fm["title"]
    assert isinstance(fm["tagline"], str)
    assert len(fm["tagline"]) <= 110
    assert isinstance(fm["category"], str) and fm["category"] in VALID_CATEGORIES
    assert isinstance(fm["period"], str) and fm["period"]
    assert fm["status"] in VALID_STATUS
    assert isinstance(fm["metrics"], list) and len(fm["metrics"]) <= 3
    for metric in fm["metrics"]:
        assert set(metric) == {"value", "label"}
        assert isinstance(metric["value"], str)
        assert isinstance(metric["label"], str)
    assert isinstance(fm["stack"], list)
    assert all(isinstance(s, str) for s in fm["stack"])
    assert isinstance(fm["tags"], list)
    assert isinstance(fm["weight"], int) and not isinstance(fm["weight"], bool)
    assert isinstance(fm["featured"], bool)
    assert isinstance(fm["draft"], bool)
    assert fm["source"] in VALID_SOURCES
    assert isinstance(fm["updated"], str)
    date.fromisoformat(fm["updated"])
    # ★ 이 변환기의 산출물은 전부 draft
    assert fm["draft"] is True


# ---------------------------------------------------------------------------
# slug 단위 테스트
# ---------------------------------------------------------------------------


class TestSlug:
    def test_ascii_title(self):
        assert make_slug("JustSwarm v6 Overview", "x") == "justswarm-v6-overview"

    def test_korean_title_falls_back_to_filename(self):
        assert make_slug("인생딸깍 결제 시스템", "inlife-payment") == "inlife-payment"

    def test_all_korean_falls_back_to_hash(self):
        slug = make_slug("한글만 있는 제목", "한글파일")
        assert slug.startswith("case-")
        assert len(slug) == len("case-") + 8

    def test_dedupe(self):
        used: set[str] = set()
        assert dedupe_slug("justswarm", used) == "justswarm"
        assert dedupe_slug("justswarm", used) == "justswarm-2"
        assert dedupe_slug("justswarm", used) == "justswarm-3"


# ---------------------------------------------------------------------------
# 엣지 케이스: 원천 파일 형태
# ---------------------------------------------------------------------------


class TestSourceFileEdges:
    def test_empty_file_is_silently_skipped(self, tmp_path):
        write(tmp_path / "vault" / "empty.md", "")
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0
        # 빈 파일 → title 폴백 = 파일명 "empty" 로 초안이 나온다 (크래시 아님)
        assert out["written"] <= 1

    def test_frontmatter_only_no_body(self, tmp_path):
        write(tmp_path / "vault" / "fm-only.md", "---\ntitle: X\n---\n")
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0
        if out["written"] == 1:
            fm, body = parse_case(tmp_path / "out" / "fm-only.md")
            assert_schema(fm)
            assert fm["tagline"]  # tagline 은 비어도 스키마상 string 이면 됨

    def test_no_heading_archive_file_skipped(self, tmp_path):
        write(tmp_path / "handoff" / "2026-07.md", "그냥 본문만 있는 아카이브\n")
        code, out = run(tmp_path, "--source", str(tmp_path / "handoff"))
        assert code == 0
        assert out["written"] == 0  # 헤딩 없음 → 조용히 건너뜀

    def test_title_with_colon_and_quotes(self, tmp_path):
        write(
            tmp_path / "vault" / "quoted.md",
            '# justswarm: "오케스트레이션" 리팩토링\n\n본문 첫 문장이다.\n',
        )
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0 and out["written"] == 1
        fm, _ = parse_case(tmp_path / "out" / "justswarm.md")
        assert fm["title"] == 'justswarm: "오케스트레이션" 리팩토링'
        assert_schema(fm)
        # YAML 을 다시 파싱해도 원문 제목과 동일해야 한다
        raw = (tmp_path / "out" / "justswarm.md").read_text(encoding="utf-8")
        assert "\\u" not in raw  # 유니코드 이스케이프 금지

    def test_bom_file(self, tmp_path):
        write(
            tmp_path / "vault" / "bomcase.md",
            "# justswarm 백업 파이프라인\n\n한글 본문.\n",
            bom=True,
        )
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0 and out["written"] == 1
        raw = (tmp_path / "out" / "justswarm.md").read_bytes()
        assert not raw.startswith(b"\xef\xbb\xbf")  # BOM 없이 쓰기
        text = raw.decode("utf-8")
        assert "한글 본문" in text  # BOM 제거 후에도 한글 온전
        fm, _ = parse_case(tmp_path / "out" / "justswarm.md")
        assert fm["title"] == "justswarm 백업 파이프라인"


# ---------------------------------------------------------------------------
# 엣지 케이스: 동작
# ---------------------------------------------------------------------------


class TestBehavior:
    def test_same_title_two_sources_slug_collision(self, tmp_path):
        write(tmp_path / "vault" / "a.md", "# justswarm 개요\n\nA 원천.\n")
        write(tmp_path / "vault" / "b.md", "# justswarm 개요\n\nB 원천.\n")
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0 and out["written"] == 2
        slugs = [i["slug"] for i in out["items"]]
        assert "justswarm" in slugs and "justswarm-2" in slugs
        assert (tmp_path / "out" / "justswarm.md").exists()
        assert (tmp_path / "out" / "justswarm-2.md").exists()

    def test_existing_file_not_overwritten(self, tmp_path):
        write(tmp_path / "vault" / "a.md", "# justswarm 개요\n\n본문.\n")
        run(tmp_path, "--source", str(tmp_path / "vault"))
        # 사장이 손으로 다듬은 상태를 시뮬레이션
        target = tmp_path / "out" / "justswarm.md"
        target.write_text("손으로 다듬은 내용", encoding="utf-8")
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0
        assert out["written"] == 0 and out["skipped"] == 1
        assert out["items"][0]["action"] == "skipped"
        assert target.read_text(encoding="utf-8") == "손으로 다듬은 내용"

    def test_metrics_empty_by_default(self, tmp_path):
        """
        ★ 기본값은 "숫자를 손대지 않는다".
        본문의 숫자가 이 작업에 대한 주장인지 기계는 알 수 없다. 실측에서 무관한
        "447 초" 가 카드에 박혔다. 없는 숫자는 안 보일 뿐이지만 틀린 숫자는 거짓말이다.
        """
        write(
            tmp_path / "vault" / "m.md",
            "# justswarm 실행 런 리포트\n"
            "12 실행, 34 회, 56 배, 78 건, 90 명.\n",
        )
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0 and out["written"] == 1
        fm, _ = parse_case(tmp_path / "out" / "justswarm.md")
        assert fm["metrics"] == []

    def test_metrics_capped_at_3_when_guessing(self, tmp_path):
        """--guess-metrics 를 켠 경우에만 추측하고, 그때도 3개를 넘지 않는다."""
        write(
            tmp_path / "vault" / "m.md",
            "# justswarm 실행 런 리포트\n"
            "12 실행, 34 회, 56 배, 78 건, 90 명.\n",
        )
        code, out = run(
            tmp_path, "--source", str(tmp_path / "vault"), "--guess-metrics"
        )
        assert code == 0 and out["written"] == 1
        fm, _ = parse_case(tmp_path / "out" / "justswarm.md")
        assert len(fm["metrics"]) == 3  # 4개 이상 → 앞 3개만

    def test_since_filters_everything(self, tmp_path):
        write(
            tmp_path / "vault" / "old.md",
            "# justswarm 과거\n\n본문.\n", mtime=OLD,
        )
        future = (datetime.now() + timedelta(days=1)).date().isoformat()
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"), "--since", future)
        assert code == 0
        assert out["written"] == 0  # 전부 필터 → exit 0

    def test_missing_source_dir_no_crash(self, tmp_path):
        code, out = run(tmp_path, "--source", str(tmp_path / "nope"))
        assert code == 0
        assert out["written"] == 0

    def test_dry_run_writes_nothing(self, tmp_path):
        write(tmp_path / "vault" / "a.md", "# justswarm 개요\n\n본문.\n")
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"), "--dry-run")
        assert code == 0 and out["written"] == 1
        assert not (tmp_path / "out").exists() or not any((tmp_path / "out").iterdir())


# ---------------------------------------------------------------------------
# 원천 종류별 동작
# ---------------------------------------------------------------------------


class TestSourceKinds:
    def test_archive_splits_by_heading(self, tmp_path):
        write(
            tmp_path / "handoff" / "2026-08.md",
            "# 2026-08\n\n"
            "## justswarm 하드닝 완료\n\nV7 게이트 4건 마감했다.\n\n"
            "## 인생딸깍 결제 흐름 정리\n\n구독 결제 포트원 붙였다.\n\n"
            "## ComfyUI LoRA 파인튜닝\n\n확산 이미지 파이프라인.\n",
        )
        code, out = run(tmp_path, "--source", str(tmp_path / "handoff"))
        assert code == 0 and out["written"] == 3
        byslug = {i["slug"]: i for i in out["items"]}
        assert byslug["justswarm"]["category"] == "agent-infra"
        assert byslug["justswarm"]["source"] == "handoff-archive"
        # 한글 제목 → 파일명 폴백 (2026-08)
        korean_slug = make_slug("인생딸깍 결제 흐름 정리", "2026-08")
        assert byslug[korean_slug]["category"] == "product"
        # genai 축 폐지(2026-08-15) — 로컬 추론 키워드는 applied 로 흡수됐다
        comfy_slug = make_slug("ComfyUI LoRA 파인튜닝", "2026-08")
        assert byslug[comfy_slug]["category"] == "applied"

    def test_handoff_md_splits_by_heading(self, tmp_path):
        write(
            tmp_path / "HANDOFF.md",
            "# HANDOFF\n\n## justswarm 오케스트레이션 현재 상태\n\n워크플로 정리 중.\n",
        )
        code, out = run(tmp_path, "--source", str(tmp_path / "HANDOFF.md"))
        assert code == 0 and out["written"] == 1
        item = out["items"][0]
        assert item["source"] == "handoff"
        fm, _ = parse_case(tmp_path / "out" / "justswarm.md")
        assert fm["source"] == "handoff"
        assert_schema(fm)

    def test_methodology_dir_forces_applied(self, tmp_path):
        write(
            tmp_path / "방법론" / "m1.md",
            "# justswarm 로드맵 방법론\n\n오케스트레이션 키워드가 있어도 applied.\n",
        )
        code, out = run(tmp_path, "--source", str(tmp_path / "방법론"))
        assert code == 0 and out["written"] == 1
        assert out["items"][0]["category"] == "applied"
        fm, _ = parse_case(tmp_path / "out" / "justswarm.md")
        assert fm["category"] == "applied"
        assert fm["draft"] is True

    def test_unmatched_keywords_default_applied_with_warning(self, tmp_path, capsys):
        write(tmp_path / "vault" / "odd.md", "# 전혀 다른 주제\n\n키워드가 없다.\n")
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0 and out["written"] == 1
        assert out["items"][0]["category"] == "applied"
        # 경고는 stderr 로
        err = capsys.readouterr().err
        assert "미매칭" in err


# ---------------------------------------------------------------------------
# 스키마 / 인코딩 총괄
# ---------------------------------------------------------------------------


class TestSchemaAndEncoding:
    def test_full_frontmatter_schema(self, tmp_path):
        write(
            tmp_path / "vault" / "case.md",
            "# justswarm 배포 파이프라인\n\n"
            "기간: 2026.04 – 2026.07\n\n"
            "그동안 52 실행 런을 돌렸다.\n\n"
            "Stack: python, astro\n",
            mtime=RECENT,
        )
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0 and out["written"] == 1
        fm, body = parse_case(tmp_path / "out" / "justswarm.md")
        assert_schema(fm)
        assert fm["period"] == "2026.04 – 2026.07"
        assert fm["category"] == "agent-infra"
        assert "python" in fm["stack"]
        assert fm["source"] == "vault"
        assert fm["updated"] == RECENT.date().isoformat()

    def test_no_unicode_escape_in_korean(self, tmp_path):
        write(
            tmp_path / "vault" / "kr.md",
            "# justswarm 한글 사례\n\n결제 시스템 구독 흐름 개선.\n",
        )
        run(tmp_path, "--source", str(tmp_path / "vault"))
        raw = (tmp_path / "out" / "justswarm.md").read_text(encoding="utf-8")
        assert "\\u" not in raw
        assert "한글" in raw

    def test_tagline_truncated_to_110(self, tmp_path):
        long_line = "가" * 300 + ". 두번째 문장이다."
        write(tmp_path / "vault" / "long.md", f"# justswarm 긴 문서\n\n{long_line}\n")
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0
        fm, _ = parse_case(tmp_path / "out" / "justswarm.md")
        assert len(fm["tagline"]) <= 110

    def test_period_falls_back_to_mtime(self, tmp_path):
        write(
            tmp_path / "vault" / "noperiod.md",
            "# justswarm 기간 없음\n\n기간 정보가 없는 문서.\n",
            mtime=datetime(2026, 3, 10),
        )
        run(tmp_path, "--source", str(tmp_path / "vault"))
        fm, _ = parse_case(tmp_path / "out" / "justswarm.md")
        assert fm["period"] == "2026.03 –"

    def test_json_summary_shape(self, tmp_path):
        write(tmp_path / "vault" / "a.md", "# justswarm 사례\n\n본문.\n")
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert set(out) == {"written", "skipped", "drafts", "items"}
        assert out["drafts"] == out["written"]
        item = out["items"][0]
        assert set(item) == {"slug", "category", "source", "action"}


class TestPeriodIsConservative:
    """
    실측 회귀 — 본문 아무 데나 있는 20xx 를 기간으로 읽던 버그.
    커밋 해시·버전 문자열을 물어 `2038.02` 같은 값을 만들었다.
    """

    def test_bare_year_in_prose_is_not_a_period(self, tmp_path):
        write(
            tmp_path / "vault" / "p.md",
            "# justswarm 회고\n\n"
            "커밋 2038d0 을 되짚었고 v2026.13 태그를 붙였다.\n",
            mtime=RECENT,
        )
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0 and out["written"] == 1
        fm, _ = parse_case(tmp_path / "out" / "justswarm.md")
        # 명시적 `기간:` 이 없으므로 mtime 으로 폴백해야 한다
        assert fm["period"] == f"{RECENT.year}.{RECENT.month:02d} –"

    def test_labeled_period_is_read(self, tmp_path):
        write(
            tmp_path / "vault" / "q.md",
            "# justswarm 정식\n\n기간: 2026.04 –\n\n본문.\n",
            mtime=RECENT,
        )
        code, out = run(tmp_path, "--source", str(tmp_path / "vault"))
        assert code == 0 and out["written"] == 1
        fm, _ = parse_case(tmp_path / "out" / "justswarm.md")
        assert fm["period"] == "2026.04 –"
