from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.services import transcription as transcription_module
from app.services.transcription import TranscriptionResult, transcribe


class _FakeWord:
    def __init__(self, **kwargs: Any) -> None:
        self._data = kwargs

    def model_dump(self) -> dict:
        return dict(self._data)


class _FakeResponse:
    def __init__(self, words: list[_FakeWord], language_code: str = "fas") -> None:
        self.words = words
        self.language_code = language_code

    def model_dump(self) -> dict:
        return {
            "language_code": self.language_code,
            "words": [w.model_dump() for w in self.words],
        }


def _build_fake_words() -> list[_FakeWord]:
    # Persian-like sequence with two speakers and a spacing token.
    return [
        _FakeWord(text="سلام", start=0.0, end=0.5, type="word", speaker_id="speaker_0"),
        _FakeWord(text=" ", start=0.5, end=0.55, type="spacing", speaker_id="speaker_0"),
        _FakeWord(text="دنیا", start=0.55, end=1.0, type="word", speaker_id="speaker_0"),
        _FakeWord(text=" ", start=1.0, end=1.05, type="spacing", speaker_id="speaker_1"),
        _FakeWord(text="خوبی؟", start=1.05, end=1.6, type="word", speaker_id="speaker_1"),
        _FakeWord(text="[laugh]", start=1.6, end=1.7, type="audio_event", speaker_id="speaker_1"),
        _FakeWord(text=" ", start=1.7, end=1.75, type="spacing", speaker_id="speaker_0"),
        _FakeWord(text="بله", start=1.75, end=2.0, type="word", speaker_id="speaker_0"),
    ]


def test_transcribe_calls_sdk_and_builds_result(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    audio_path = tmp_path / "clip.mp3"
    audio_path.write_bytes(b"fake-audio-bytes")

    fake_words = _build_fake_words()
    fake_response = _FakeResponse(words=fake_words, language_code="fas")

    convert_mock = MagicMock(return_value=fake_response)
    stt_mock = MagicMock()
    stt_mock.convert = convert_mock

    fake_client = MagicMock()
    fake_client.speech_to_text = stt_mock

    client_factory = MagicMock(return_value=fake_client)
    monkeypatch.setattr(transcription_module, "ElevenLabs", client_factory)

    result = transcribe(audio_path)

    # Client constructed with the configured API key.
    client_factory.assert_called_once()

    # convert was called exactly once with the required args.
    convert_mock.assert_called_once()
    kwargs = convert_mock.call_args.kwargs
    assert kwargs["model_id"] == "scribe_v2"
    assert kwargs["language_code"] == "fas"
    assert kwargs["diarize"] is True
    assert kwargs["timestamps_granularity"] == "word"
    assert kwargs["tag_audio_events"] is False
    # File was passed (open file handle, not a path).
    assert "file" in kwargs
    assert kwargs["file"] is not None

    # Result shape & content.
    assert isinstance(result, TranscriptionResult)
    assert result.language_code == "fas"

    # words is a list of dicts (serialized via model_dump).
    assert len(result.words) == len(fake_words)
    assert all(isinstance(w, dict) for w in result.words)
    assert result.words[0]["text"] == "سلام"
    assert result.words[0]["type"] == "word"
    assert result.words[0]["speaker_id"] == "speaker_0"

    # plain_text concatenates word + spacing tokens, skips audio_event.
    expected_plain = "سلام دنیا خوبی؟ بله"
    assert result.plain_text == expected_plain

    # speaker_ids are distinct, first-seen order.
    assert result.speaker_ids == ["speaker_0", "speaker_1"]

    # raw is JSON-able dict-like.
    assert isinstance(result.raw, dict)
    assert result.raw.get("language_code") == "fas"


def test_transcribe_wraps_sdk_errors(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    audio_path = tmp_path / "clip.mp3"
    audio_path.write_bytes(b"fake-audio-bytes")

    def _boom(*_args: Any, **_kwargs: Any) -> Any:
        raise ValueError("upstream exploded")

    fake_client = MagicMock()
    fake_client.speech_to_text.convert.side_effect = _boom

    monkeypatch.setattr(transcription_module, "ElevenLabs", MagicMock(return_value=fake_client))

    with pytest.raises(RuntimeError, match="Scribe failed: upstream exploded"):
        transcribe(audio_path)


@pytest.mark.skipif(
    not os.getenv("ELEVENLABS_API_KEY")
    or not Path("tests/fixtures/sample_fa.mp3").exists(),
    reason="Requires ELEVENLABS_API_KEY env var and tests/fixtures/sample_fa.mp3 fixture",
)
def test_transcribe_live_smoke() -> None:
    fixture_path = Path("tests/fixtures/sample_fa.mp3")
    result = transcribe(fixture_path)

    assert len(result.words) > 0
    assert len(result.plain_text) > 0
    assert len(result.speaker_ids) >= 1
