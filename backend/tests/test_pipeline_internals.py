from __future__ import annotations

from app.services.pipeline import (
    _GAP_THRESHOLD_S,
    _segment_words,
    build_diarized_prompt,
    build_minutes_segments,
)


def test_segment_words_groups_same_speaker_contiguous() -> None:
    words = [
        {"text": "سلام", "start": 0.0, "end": 0.5, "speaker_id": "speaker_0"},
        {"text": " ", "start": 0.5, "end": 0.6, "speaker_id": "speaker_0"},
        {"text": "دنیا", "start": 0.6, "end": 1.0, "speaker_id": "speaker_0"},
    ]
    segs = _segment_words(words)
    assert len(segs) == 1
    speaker, start, end, text = segs[0]
    assert speaker == "speaker_0"
    assert start == 0.0
    assert end == 1.0
    assert "سلام" in text and "دنیا" in text


def test_segment_words_splits_on_speaker_change() -> None:
    words = [
        {"text": "A", "start": 0.0, "end": 0.4, "speaker_id": "speaker_0"},
        {"text": "B", "start": 0.4, "end": 0.8, "speaker_id": "speaker_1"},
    ]
    segs = _segment_words(words)
    assert len(segs) == 2
    assert segs[0][0] == "speaker_0"
    assert segs[1][0] == "speaker_1"


def test_segment_words_splits_on_gap_above_threshold() -> None:
    gap = _GAP_THRESHOLD_S + 0.5
    words = [
        {"text": "A", "start": 0.0, "end": 0.4, "speaker_id": "speaker_0"},
        {"text": "B", "start": 0.4 + gap, "end": 1.0 + gap, "speaker_id": "speaker_0"},
    ]
    segs = _segment_words(words)
    assert len(segs) == 2


def test_segment_words_keeps_grouped_below_threshold() -> None:
    # gap < threshold should NOT split.
    gap = _GAP_THRESHOLD_S - 0.1
    words = [
        {"text": "A", "start": 0.0, "end": 0.4, "speaker_id": "speaker_0"},
        {"text": "B", "start": 0.4 + gap, "end": 1.0, "speaker_id": "speaker_0"},
    ]
    segs = _segment_words(words)
    assert len(segs) == 1


def test_segment_words_missing_speaker_falls_back_to_speaker_0() -> None:
    words = [
        {"text": "A", "start": 0.0, "end": 0.5},  # no speaker_id
    ]
    segs = _segment_words(words)
    assert len(segs) == 1
    assert segs[0][0] == "speaker_0"


def test_segment_words_drops_blank_text_segments() -> None:
    words = [
        {"text": "   ", "start": 0.0, "end": 0.5, "speaker_id": "speaker_0"},
    ]
    assert _segment_words(words) == []


def test_segment_words_handles_missing_timing_fields() -> None:
    # Words without timing should still group, not crash.
    words = [
        {"text": "A", "speaker_id": "speaker_0"},
        {"text": "B", "speaker_id": "speaker_0"},
    ]
    segs = _segment_words(words)
    # Defaults: start fallback 0.0, end fallback start.
    assert len(segs) == 1
    speaker, _start, _end, text = segs[0]
    assert speaker == "speaker_0"
    assert "A" in text and "B" in text


def test_segment_words_empty_input() -> None:
    assert _segment_words([]) == []


def test_build_diarized_prompt_format() -> None:
    words = [
        {"text": "A", "start": 0.0, "end": 0.4, "speaker_id": "speaker_0"},
        {"text": "B", "start": 0.5, "end": 0.9, "speaker_id": "speaker_1"},
    ]
    prompt = build_diarized_prompt(words)
    lines = prompt.split("\n")
    assert len(lines) == 2
    assert lines[0].startswith("[speaker_0 0.00-0.40] ")
    assert lines[0].endswith("A")
    assert lines[1].startswith("[speaker_1 0.50-0.90] ")
    assert lines[1].endswith("B")


def test_build_minutes_segments_shape_matches_schema() -> None:
    words = [
        {"text": "A", "start": 0.0, "end": 0.4, "speaker_id": "speaker_0"},
        {"text": "B", "start": 0.5, "end": 1.0, "speaker_id": "speaker_1"},
    ]
    minutes = build_minutes_segments(words)
    assert minutes == [
        {"speaker_id": "speaker_0", "text": "A", "start_s": 0.0, "end_s": 0.4},
        {"speaker_id": "speaker_1", "text": "B", "start_s": 0.5, "end_s": 1.0},
    ]


def test_build_minutes_segments_empty() -> None:
    assert build_minutes_segments([]) == []


def test_long_run_is_O_n_not_quadratic() -> None:
    # Smoke: 5000 same-speaker words should not blow up.
    words = [
        {"text": f"w{i}", "start": i * 0.1, "end": i * 0.1 + 0.05, "speaker_id": "speaker_0"}
        for i in range(5000)
    ]
    segs = _segment_words(words)
    assert len(segs) == 1
