from __future__ import annotations

import io
import subprocess
from pathlib import Path

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.services import storage


def _upload(filename: str | None, content_type: str | None, body: bytes = b"data") -> UploadFile:
    headers = Headers({"content-type": content_type}) if content_type else None
    return UploadFile(
        file=io.BytesIO(body),
        filename=filename,
        headers=headers,
    )


@pytest.mark.parametrize(
    "ctype,expected",
    [
        ("audio/webm", ".webm"),
        ("audio/mpeg", ".mp3"),
        ("audio/mp3", ".mp3"),
        ("audio/wav", ".wav"),
        ("audio/x-wav", ".wav"),
        ("audio/mp4", ".m4a"),
        ("audio/x-m4a", ".m4a"),
        ("audio/flac", ".flac"),
        ("audio/x-flac", ".flac"),
        ("video/webm", ".webm"),
        ("video/mp4", ".mp4"),
    ],
)
def test_resolve_extension_from_known_content_type(ctype: str, expected: str) -> None:
    f = _upload("anything", ctype)
    assert storage._resolve_extension(f) == expected


def test_resolve_extension_from_filename_when_content_type_unknown() -> None:
    f = _upload("foo.mp3", "application/octet-stream")
    assert storage._resolve_extension(f) == ".mp3"


def test_resolve_extension_fallback_webm_on_complete_miss() -> None:
    # Unknown content-type AND filename suffix not in allowlist.
    f = _upload("foo.bogus", "application/something-else")
    assert storage._resolve_extension(f) == ".webm"


def test_resolve_extension_no_filename_no_ctype() -> None:
    f = _upload(None, None)
    assert storage._resolve_extension(f) == ".webm"


def test_resolve_extension_filename_suffix_case_insensitive() -> None:
    f = _upload("CAPITAL.MP3", "application/octet-stream")
    assert storage._resolve_extension(f) == ".mp3"


async def test_save_audio_writes_file_and_returns_paths(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(storage.settings, "STORAGE_DIR", tmp_path)
    body = b"FAKE\x00AUDIO" * 1000
    f = _upload("orig.mp3", "audio/mpeg", body=body)

    path_str, original = await storage.save_audio(f, "meeting-123")

    written = Path(path_str)
    assert written.exists()
    assert written.read_bytes() == body
    assert written.name == "meeting-123.mp3"
    assert original == "orig.mp3"


async def test_save_audio_uses_meeting_id_when_no_filename(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(storage.settings, "STORAGE_DIR", tmp_path)
    f = _upload(None, "audio/webm", body=b"x")
    path_str, original = await storage.save_audio(f, "mid-xyz")
    assert original == "mid-xyz.webm"
    assert Path(path_str).name == "mid-xyz.webm"


async def test_save_audio_creates_audio_dir(tmp_path, monkeypatch) -> None:
    target = tmp_path / "nested" / "storage"
    monkeypatch.setattr(storage.settings, "STORAGE_DIR", target)
    assert not (target / "audio").exists()
    f = _upload("m.webm", "audio/webm", body=b"abc")
    path_str, _ = await storage.save_audio(f, "mid-1")
    assert (target / "audio").is_dir()
    assert Path(path_str).parent == target / "audio"


def test_probe_duration_seconds_returns_float_on_success(mocker, tmp_path) -> None:
    p = tmp_path / "a.webm"
    p.write_bytes(b"x")
    mocker.patch.object(
        storage.subprocess,
        "run",
        return_value=subprocess.CompletedProcess(args=[], returncode=0, stdout="12.34\n", stderr=""),
    )
    assert storage.probe_duration_seconds(p) == pytest.approx(12.34)


def test_probe_duration_seconds_returns_none_on_na(mocker, tmp_path) -> None:
    p = tmp_path / "a.webm"
    p.write_bytes(b"x")
    mocker.patch.object(
        storage.subprocess,
        "run",
        return_value=subprocess.CompletedProcess(args=[], returncode=0, stdout="N/A\n", stderr=""),
    )
    assert storage.probe_duration_seconds(p) is None


def test_probe_duration_seconds_returns_none_on_empty(mocker, tmp_path) -> None:
    p = tmp_path / "a.webm"
    p.write_bytes(b"x")
    mocker.patch.object(
        storage.subprocess,
        "run",
        return_value=subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr=""),
    )
    assert storage.probe_duration_seconds(p) is None


def test_probe_duration_seconds_returns_none_when_ffprobe_missing(mocker, tmp_path) -> None:
    p = tmp_path / "a.webm"
    p.write_bytes(b"x")
    mocker.patch.object(storage.subprocess, "run", side_effect=FileNotFoundError())
    assert storage.probe_duration_seconds(p) is None


def test_probe_duration_seconds_returns_none_on_called_process_error(mocker, tmp_path) -> None:
    p = tmp_path / "a.webm"
    p.write_bytes(b"x")
    mocker.patch.object(
        storage.subprocess,
        "run",
        side_effect=subprocess.CalledProcessError(returncode=1, cmd=["ffprobe"]),
    )
    assert storage.probe_duration_seconds(p) is None


def test_probe_duration_seconds_returns_none_on_timeout(mocker, tmp_path) -> None:
    p = tmp_path / "a.webm"
    p.write_bytes(b"x")
    mocker.patch.object(
        storage.subprocess,
        "run",
        side_effect=subprocess.TimeoutExpired(cmd=["ffprobe"], timeout=10),
    )
    assert storage.probe_duration_seconds(p) is None


def test_probe_duration_seconds_returns_none_on_garbage_output(mocker, tmp_path) -> None:
    p = tmp_path / "a.webm"
    p.write_bytes(b"x")
    mocker.patch.object(
        storage.subprocess,
        "run",
        return_value=subprocess.CompletedProcess(args=[], returncode=0, stdout="garbage", stderr=""),
    )
    assert storage.probe_duration_seconds(p) is None
