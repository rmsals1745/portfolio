"""핵심 변환 로직 — LLM 없음, 완전 결정론.

원천 (볼트 사례/방법론, handoff 월별 아카이브, HANDOFF.md) → Astro 콘텐츠
프론트매터 마크다운 초안 (draft: true 고정).
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import yaml

# ---------------------------------------------------------------------------
# 상수
# ---------------------------------------------------------------------------

SOURCE_VAULT = "vault"                # 사례/방법론 (볼트 디렉터리 원천)
SOURCE_HANDOFF = "handoff"            # HANDOFF.md
SOURCE_ARCHIVE = "handoff-archive"    # handoff\*.md 월별 아카이브

# 2026-08-15: genai(생성 미디어) 축 폐지 — 사례가 1건뿐이라 층 그림에서 그 칸만
# 비었고, 축 이름이 AI 인프라라는 초점을 흐렸다. 관련 키워드는 applied 로 흡수.
CATEGORIES = ("agent-infra", "product", "applied", "ops")

# 카테고리 키워드 (결정론 분류) — 순서대로 첫 매칭.
CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("agent-infra", (
        "justswarm", "justlink", "justgraph", "hermes",
        "오케스트레이션", "컨트롤 플레인", "워크플로",
    )),
    ("product", (
        "인생딸깍", "inlifeclick", "결제", "포트원", "크레딧", "구독",
    )),
    ("applied", (
        "just design", "시안", "파이프라인", "컴플라이언스", "플러그인", "검수",
        # 옛 genai 축에서 흡수 (2026-08-15). 로컬 추론은 창작물이 아니라
        # 파이프라인 부품이라 여기가 맞다.
        "comfyui", "lora", "확산", "시네마틱",
    )),
    ("ops", (
        "크론", "백업", "스케줄", "복원", "juststandby", "상시", "systemd",
    )),
]

MAX_METRICS = 3
TAGLINE_MAX = 110


def log(msg: str) -> None:
    """로그는 stderr 로 (stdout 은 JSON 전용)."""
    print(msg, file=sys.stderr)


# ---------------------------------------------------------------------------
# 도메인 객체
# ---------------------------------------------------------------------------


@dataclass
class CaseItem:
    """사례 후보 하나 (원천 파일 하나 또는 아카이브 헤딩 하나)."""
    title: str
    body: str
    source: str                    # "vault" | "handoff" | "handoff-archive"
    source_path: Path
    mtime: date
    source_stem: str               # slug 폴백용 원천 파일명
    methodology: bool = False      # 방법론 디렉터리 출신 → category 강제 applied
    category: str = "applied"
    matched: bool = False          # 키워드 매칭 성공 여부 (False → 경고)
    metrics: list[dict[str, str]] = field(default_factory=list)
    stack: list[str] = field(default_factory=list)


@dataclass
class IngestResult:
    written: list[dict] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)
    drafts: int = 0

    def to_json(self) -> str:
        items = self.written + self.skipped
        return json.dumps(
            {
                "written": len(self.written),
                "skipped": len(self.skipped),
                "drafts": self.drafts,
                "items": items,
            },
            ensure_ascii=False,
        )


# ---------------------------------------------------------------------------
# 슬러그
# ---------------------------------------------------------------------------

_ASCII_WORD = re.compile(r"[A-Za-z0-9]+")


def make_slug(title: str, fallback_stem: str) -> str:
    """제목 → 슬러그. 영문/숫자만 남기고 나머지는 `-`.

    한글은 그대로 두지도, 로마자 변환하지도 않는다.
    결과가 비면 원천 파일명 기반, 그래도 비면 `case-<8자리해시>`.
    """
    words = _ASCII_WORD.findall(title)
    if words:
        return "-".join(words).lower()
    stem_words = _ASCII_WORD.findall(fallback_stem)
    if stem_words:
        return "-".join(stem_words).lower()
    digest = hashlib.sha256((title + fallback_stem).encode("utf-8")).hexdigest()
    return f"case-{digest[:8]}"


def dedupe_slug(slug: str, used: set[str]) -> str:
    """같은 slug 가 두 번 나오면 -2, -3 …."""
    if slug not in used:
        used.add(slug)
        return slug
    n = 2
    while f"{slug}-{n}" in used:
        n += 1
    result = f"{slug}-{n}"
    used.add(result)
    return result


# ---------------------------------------------------------------------------
# 텍스트 유틸
# ---------------------------------------------------------------------------


def strip_yaml_frontmatter(text: str) -> tuple[str | None, str]:
    """프론트매터가 있으면 분리한다. 반환: (frontmatter_raw 또는 None, body)."""
    if text.startswith("---"):
        lines = text.splitlines()
        if len(lines) >= 2 and lines[0].strip() == "---":
            for i in range(1, len(lines)):
                if lines[i].strip() == "---":
                    raw = "\n".join(lines[1:i])
                    body = "\n".join(lines[i + 1:]).lstrip("\n")
                    return raw, body
    return None, text


def first_sentence(text: str, limit: int = TAGLINE_MAX) -> str:
    """본문 첫 문장. 문장 경계 우선, 없으면 110자 하드 컷."""
    text = text.strip()
    if not text:
        return ""
    plain_lines: list[str] = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith(("#", "-", "*", ">", "|", "```")):
            continue
        s = re.sub(r"[*_`[\]]", "", s)
        plain_lines.append(s)
    if not plain_lines:
        # 헤딩/불릿만 있는 문서 — 헤딩 텍스트를 재료로 쓴다
        for line in text.splitlines():
            s = line.strip().lstrip("#").strip()
            if s:
                plain_lines.append(re.sub(r"[*_`[\]]", "", s))
                break
    if not plain_lines:
        return ""
    first = plain_lines[0]
    if len(first) <= limit:
        return first
    window = first[:limit]
    for sep in ("。", ".", "!", "?", "다."):
        idx = window.rfind(sep)
        if idx >= int(limit * 0.4):
            return window[: idx + 1].rstrip()
    return window.rstrip()


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)


def split_by_heading(text: str, min_level: int = 2) -> list[tuple[str, str]]:
    """`## ` 헤딩 단위로 쪼갠다. 반환: [(제목, 본문)]. 헤딩 없으면 빈 리스트."""
    matches = list(_HEADING_RE.finditer(text))
    result: list[tuple[str, str]] = []
    for i, m in enumerate(matches):
        if len(m.group(1)) < min_level:
            continue
        title = m.group(2).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        result.append((title, body))
    return result


def extract_h1(text: str) -> str | None:
    m = re.search(r"^#\s+(.+?)\s*$", text, re.MULTILINE)
    return m.group(1).strip() if m else None


# ---------------------------------------------------------------------------
# 필드 추출 (결정론)
# ---------------------------------------------------------------------------

_METRIC_NUM_RE = re.compile(
    r"([0-9][0-9.,]*)\s*"
    r"(실행\s*런|실행|런|건|회|배|명|일|시간|분|초|프로젝트|사이클|커밋|배포|페이지|줄|개|k\b|M\b|%)"
)


def extract_metrics(text: str, guess: bool = False) -> list[dict[str, str]]:
    """
    숫자+단위 조각에서 metrics 후보.

    ★ 기본값은 "아무것도 안 뽑는다" 이다 (guess=False).

    본문에서 숫자를 긁어오면 그 숫자가 *이 작업에 대한 주장*인지 알 수 없다.
    실측 결과 "447 초", "2,670 초" 처럼 무관한 수치가 카드에 박혔다.
    포트폴리오에서 없는 숫자는 안 보일 뿐이지만 **틀린 숫자는 거짓말**이고,
    신뢰가 통째로 죽는다. 그래서 판단이 필요한 이 항목은 기계가 손대지 않고
    사람 또는 상위 크론(LLM)이 제안하고 사람이 확인하게 둔다.
    """
    if not guess:
        return []

    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for m in _METRIC_NUM_RE.finditer(text):
        value = m.group(1).rstrip(".")
        label = re.sub(r"\s+", " ", m.group(2)).strip()
        key = f"{value}|{label}"
        if key in seen:
            continue
        seen.add(key)
        found.append({"value": value, "label": label})
        if len(found) >= MAX_METRICS:
            break
    return found


# 문서 아무 데서나 20xx 를 줍지 않는다. 명시적으로 기간을 말하는 자리에서만 읽는다.
# (옛 규칙은 커밋 해시·버전 문자열까지 잡아 `2038.02` 같은 값을 만들었다.)
_PERIOD_RE = re.compile(
    r"(?:^|\n)\s*(?:기간|period|일자|날짜)\s*[:：]\s*"
    r"(20\d{2})[.\-\/ ]?(\d{1,2})\s*[–~\-]?\s*(?:(20\d{2})[.\-\/ ]?(\d{1,2}))?",
    re.IGNORECASE,
)


def extract_period(text: str) -> str:
    """
    `기간: 2026.04 –` 처럼 **기간이라고 명시된 자리**에서만 읽는다.
    못 찾으면 빈 문자열을 돌려주고, 호출부가 파일 mtime 으로 폴백한다.
    본문을 훑어 아무 연도나 줍던 옛 동작은 실측에서 오탐을 냈다.
    """
    m = _PERIOD_RE.search(text)
    if m:
        mo1 = int(m.group(2))
        if not (1 <= mo1 <= 12):
            mo1 = 1
        start = f"{m.group(1)}.{mo1:02d}"
        if m.group(3):
            mo2 = int(m.group(4))
            if not (1 <= mo2 <= 12):
                mo2 = 1
            return f"{start} – {m.group(3)}.{mo2:02d}"
        return f"{start} –"
    return ""


def extract_stack(text: str) -> list[str]:
    """`Stack: python, astro` / `기술스택: ...` 라인에서 기술스택 후보."""
    out: list[str] = []
    for line in text.splitlines():
        low = line.lower().lstrip("#*- ").strip()
        if low.startswith(("stack", "기술스택", "기술 스택")):
            parts = re.split(r"[:：]", line, maxsplit=1)
            if len(parts) == 2:
                for p in re.split(r"[,/&|·]", parts[1]):
                    p = p.strip(" `*")
                    if p:
                        out.append(p)
    return out[:10]


def classify(title: str, body: str) -> tuple[str, bool]:
    """키워드 기반 카테고리 분류. 반환: (category, matched).

    결정론 규칙: 먼저 제목에서 (스펙 카테고리 순서대로) 찾고,
    제목에 없으면 본문에서 찾는다. 제목이 본문보다 의도적이기 때문.
    """
    for hay in (title, body):
        hay = hay.lower()
        for category, keywords in CATEGORY_KEYWORDS:
            for kw in keywords:
                if kw.lower() in hay:
                    return category, True
    return "applied", False


def normalize_text(text: str) -> str:
    """유니코드 정규화 (NFC) — 한글 조합형 분산 방지."""
    return unicodedata.normalize("NFC", text)


# ---------------------------------------------------------------------------
# 원천 스캔
# ---------------------------------------------------------------------------


def read_source(path: Path) -> str:
    """utf-8-sig 로 읽어 BOM 제거 + NFC 정규화."""
    return normalize_text(path.read_text(encoding="utf-8-sig"))


def scan_source(
    path: Path,
    source_tag: str,
    since: date | None,
    out_items: list[CaseItem],
    methodology: bool = False,
) -> None:
    """원천 하나(파일 또는 디렉터리)를 스캔해 CaseItem 을 채운다. 없으면 조용히 통과."""
    if not path.exists():
        log(f"[skip] 원천 없음: {path}")
        return

    md_files = (
        sorted(p for p in path.glob("*.md") if p.is_file())
        if path.is_dir()
        else [path]
    )

    split_mode = source_tag in (SOURCE_HANDOFF, SOURCE_ARCHIVE)

    for f in md_files:
        try:
            mtime = date.fromtimestamp(f.stat().st_mtime)
        except OSError:
            continue
        if since and mtime <= since:
            continue
        try:
            text = read_source(f)
        except (OSError, UnicodeDecodeError) as exc:
            log(f"[warn] 읽기 실패 {f}: {exc}")
            continue

        _, body = strip_yaml_frontmatter(text)

        if split_mode:
            # `## ` 헤딩 단위로 쪼개 사례 후보로. 헤딩 없는 파일은 조용히 건너뜀.
            for title, sec_body in split_by_heading(body, min_level=2):
                out_items.append(CaseItem(
                    title=title,
                    body=sec_body,
                    source=source_tag,
                    source_path=f,
                    mtime=mtime,
                    source_stem=f.stem,
                    methodology=methodology,
                ))
        else:
            # 사례/방법론: 파일 하나 = 사례 하나 (제목 = 첫 H1 또는 파일명)
            title = extract_h1(text) or f.stem
            out_items.append(CaseItem(
                title=title,
                body=body if body.strip() else "",
                source=source_tag,
                source_path=f,
                mtime=mtime,
                source_stem=f.stem,
                methodology=methodology,
            ))


# ---------------------------------------------------------------------------
# 아이템 → 프론트매터 → 마크다운
# ---------------------------------------------------------------------------


def build_frontmatter(item: CaseItem) -> dict:
    hay = f"{item.title}\n{item.body}"
    period = extract_period(hay) or f"{item.mtime.year}.{item.mtime.month:02d} –"
    return {
        "title": item.title,
        "tagline": first_sentence(item.body) or item.title,
        "category": item.category,
        "period": period,
        "status": "active",
        "metrics": item.metrics[:MAX_METRICS],
        "stack": item.stack,
        "tags": [],
        "weight": 0,
        "featured": False,
        "draft": True,                       # ★ 이 변환기의 산출물은 전부 true
        "source": item.source,
        "updated": item.mtime.isoformat(),
    }


def render_markdown(fm: dict, body: str) -> str:
    """프론트매터 + 본문. allow_unicode — 한글이 \\uXXXX 로 나오면 안 된다."""
    fm_text = yaml.safe_dump(
        fm,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
    )
    return f"---\n{fm_text}---\n\n{body.strip()}\n"


# ---------------------------------------------------------------------------
# 파이프라인
# ---------------------------------------------------------------------------


def process(
    sources: list[tuple[Path, str, bool]],   # (경로, source 태그, 방법론 여부)
    out_dir: Path,
    since: date | None = None,
    dry_run: bool = False,
    guess_metrics: bool = False,
) -> IngestResult:
    items: list[CaseItem] = []
    for path, tag, methodology in sources:
        scan_source(path, tag, since, items, methodology=methodology)

    result = IngestResult()
    used_slugs: set[str] = set()

    for item in items:
        if not item.title.strip():
            continue

        slug = dedupe_slug(make_slug(item.title, item.source_stem), used_slugs)

        if item.methodology:
            item.category, item.matched = "applied", False
        else:
            item.category, item.matched = classify(item.title, item.body)
        if not item.matched:
            log(
                f"[warn] 카테고리 키워드 미매칭 → applied+draft 유지: "
                f"{item.source_path.name} :: {item.title[:40]}"
            )

        hay = f"{item.title}\n{item.body}"
        item.metrics = extract_metrics(hay, guess=guess_metrics)
        item.stack = extract_stack(hay)

        entry = {
            "slug": slug,
            "category": item.category,
            "source": item.source,
            "action": "created",
        }

        out_path = out_dir / f"{slug}.md"
        if out_path.exists():
            # 기존 파일을 덮어쓰지 않는다 — 손으로 다듬은 사례 보호
            entry["action"] = "skipped"
            result.skipped.append(entry)
            continue

        if dry_run:
            result.written.append(entry)
            continue

        fm = build_frontmatter(item)
        md = render_markdown(fm, item.body)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path.write_text(md, encoding="utf-8")   # BOM 없이
        result.written.append(entry)

    result.drafts = len(result.written)
    return result
