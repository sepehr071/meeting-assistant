from __future__ import annotations

import mimetypes
import subprocess
from pathlib import Path

from fastapi import UploadFile

from app.config import settings


_CHUNK_SIZE = 1024 * 1024  # 1 MB

_CONTENT_TYPE_TO_EXT = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/flac": ".flac",
    "audio/x-flac": ".flac",
    "video/webm": ".webm",
    "video/mp4": ".mp4",
}

_ALLOWED_EXTS = {".webm", ".ogg", ".mp3", ".wav", ".m4a", ".flac", ".mp4", ".mpga", ".oga"}


def _resolve_extension(upload_file: UploadFile) -> str:
    content_type = (upload_file.content_type or "").lower()
    if content_type in _CONTENT_TYPE_TO_EXT:
        return _CONTENT_TYPE_TO_EXT[content_type]

    if content_type:
        guessed = mimetypes.guess_extension(content_type)
        if guessed and guessed.lower() in _ALLOWED_EXTS:
            return guessed.lower()

    if upload_file.filename:
        suffix = Path(upload_file.filename).suffix.lower()
        if suffix in _ALLOWED_EXTS:
            return suffix

    return ".webm"


async def save_audio(upload_file: UploadFile, meeting_id: str) -> tuple[str, str]:
    """Stream the upload to settings.audio_dir/{meeting_id}{ext}.

    Returns (audio_path_str, original_filename).
    """
    settings.audio_dir.mkdir(parents=True, exist_ok=True)

    ext = _resolve_extension(upload_file)
    target = settings.audio_dir / f"{meeting_id}{ext}"
    original_filename = upload_file.filename or f"{meeting_id}{ext}"

    with target.open("wb") as out:
        while True:
            chunk = await upload_file.read(_CHUNK_SIZE)
            if not chunk:
                break
            out.write(chunk)

    return str(target), original_filename


def probe_duration_seconds(path: Path) -> float | None:
    """Best-effort ffprobe-based duration probe. Returns None on any failure."""
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=nw=1:nk=1",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None

    raw = (completed.stdout or "").strip()
    if not raw or raw.upper() == "N/A":
        return None

    try:
        return float(raw)
    except ValueError:
        return None
