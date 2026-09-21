"""
polish.py 의 인용 대조 가드 테스트.

이 가드가 무력해지면 LLM 이 지어낸 숫자가 포트폴리오 카드에 그대로 박힌다.
"장치가 있다"가 아니라 "장치가 실제로 걸러낸다"를 증명하는 것이 이 파일의 목적이다.
통과 케이스만 있으면 아무것도 증명하지 못한다 — 반드시 탈락 케이스를 같이 둔다.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from polish import extract_json, normalize, verify_metrics  # noqa: E402

BODY = "총 52 런을 돌렸고 그 중 17 런에서 수정 요구가 나왔다. 자동승인 우회는 0건이었다."


class TestQuoteGuard:
    def test_genuine_metric_is_kept(self):
        kept, dropped = verify_metrics(
            [{"value": "52", "label": "실행 런", "quote": "총 52 런을 돌렸고"}], BODY
        )
        assert kept == [{"value": "52", "label": "실행 런"}]
        assert dropped == []

    def test_fabricated_quote_is_dropped(self):
        """원문에 없는 문장을 인용했다고 주장하는 경우 — 통째로 지어낸 수치."""
        kept, dropped = verify_metrics(
            [{"value": "430", "label": "실행 런", "quote": "총 430 런을 돌렸고"}], BODY
        )
        assert kept == []
        assert len(dropped) == 1

    def test_real_quote_but_inflated_number_is_dropped(self):
        """인용은 진짜인데 value 만 부풀린 경우 — 가장 잡기 어려운 거짓말."""
        kept, dropped = verify_metrics(
            [{"value": "520", "label": "실행 런", "quote": "총 52 런을 돌렸고"}], BODY
        )
        assert kept == []
        assert "숫자가 없" in dropped[0]

    def test_missing_quote_is_dropped(self):
        kept, dropped = verify_metrics([{"value": "99", "label": "뭔가"}], BODY)
        assert kept == []
        assert len(dropped) == 1

    def test_capped_at_three(self):
        kept, _ = verify_metrics(
            [
                {"value": "52", "label": "a", "quote": "총 52 런을 돌렸고"},
                {"value": "17", "label": "b", "quote": "17 런에서 수정 요구가 나왔다"},
                {"value": "0", "label": "c", "quote": "자동승인 우회는 0건이었다"},
                {"value": "52", "label": "d", "quote": "총 52 런을 돌렸고"},
            ],
            BODY,
        )
        assert len(kept) == 3

    def test_empty_input(self):
        assert verify_metrics([], BODY) == ([], [])
        assert verify_metrics(None, BODY) == ([], [])

    def test_markdown_emphasis_does_not_break_match(self):
        """원문이 **52 런** 처럼 강조돼 있어도 인용이 통과해야 한다."""
        body = "총 **52 런**을 돌렸다."
        kept, _ = verify_metrics(
            [{"value": "52", "label": "실행 런", "quote": "총 52 런을 돌렸다"}], body
        )
        assert len(kept) == 1


class TestJsonExtraction:
    def test_plain_json(self):
        assert extract_json('{"a": 1}') == {"a": 1}

    def test_code_fenced(self):
        assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}

    def test_with_chatter(self):
        assert extract_json('네, 결과입니다:\n{"a": 1}\n도움이 되었길!') == {"a": 1}

    def test_garbage_returns_none(self):
        assert extract_json("JSON 을 못 만들겠습니다") is None
        assert extract_json("") is None


class TestNormalize:
    def test_strips_whitespace_and_emphasis(self):
        assert normalize("총 **52 런**을") == normalize("총 52 런을")
        assert normalize('그는 "말했다"') == normalize("그는 말했다")


# ==SELF_START_PYTEST_V2==  (justtest_selfstart.py 가 심음)
# 이 파일은 pytest 가 불러야 도는 계통이다. 예전엔 `python 이파일.py` 로 부르면
# 아무것도 안 하고 exit 0 이었다 — 초록불만 뜨고 시험은 한 줄도 안 도는 죽은 게이트.
# 이제 스크립트로 불러도 스스로 pytest 를 부른다.
# ★레포 뿌리를 sys.path 에 넣는다: `python tests/x.py` 는 **그 파일의 폴더**만 경로에 넣지만
#   `python -m pytest` 는 **현재 폴더**를 넣는다. 그 차이로 패키지 import 가 깨진다.
#   ⚠️단, 파일 **맨 위**에서 패키지를 import 하는 시험은 여기 닿기 전에 이미 죽는다
#     (모듈 본문이 먼저 돈다). 그건 **조용한 통과가 아니라 시끄러운 실패**라 이 장치의 목적 밖이다 —
#     그런 파일은 `python -m pytest <파일>` 로 부르면 된다.
if __name__ == "__main__":
    import os as _os
    import sys as _sys
    _d = _os.path.dirname(_os.path.abspath(__file__))
    while True:
        if any(_os.path.exists(_os.path.join(_d, _m))
               for _m in ("pytest.ini", "pyproject.toml", "setup.cfg", "conftest.py", ".git")):
            break
        _up = _os.path.dirname(_d)
        if _up == _d:
            _d = _os.path.dirname(_os.path.abspath(__file__))
            break
        _d = _up
    if _d not in _sys.path:
        _sys.path.insert(0, _d)
    try:
        import pytest as _pytest
    except ImportError:
        _sys.exit("pytest 미설치 — `python -m pip install pytest`. 못 돌린 것이지 통과가 아니다.")
    _sys.exit(_pytest.main([__file__, "-q", *_sys.argv[1:]]))
