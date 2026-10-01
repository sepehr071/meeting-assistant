from __future__ import annotations

import asyncio
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from elevenlabs import ElevenLabs

from app.config import settings
from app.services.storage import probe_duration_seconds


_WORD_TYPES_FOR_TEXT = {"word", "spacing"}

SPEAKER_MATCH_TOLERANCE_S = 0.5
MIN_DURATION_FOR_CHUNKING_S = 480.0  # under 8 min: don't bother


def _t(msg: str) -> None:
    print(f"[TIMING] {msg}", flush=True)


class _Logger:
    @staticmethod
    def info(fmt: str, *args: object) -> None:
        _t(fmt % args if args else fmt)


logger = _Logger()


@dataclass
class TranscriptionResult:
    plain_text: str
    words: list[dict]
    speaker_ids: list[str]
    raw: dict
    language_code: str


def _serialize_word(word: Any) -> dict:
    if hasattr(word, "model_dump"):
        return word.model_dump()
    if isinstance(word, dict):
        return dict(word)
    return {
        "text": getattr(word, "text", ""),
        "start": getattr(word, "start", None),
        "end": getattr(word, "end", None),
        "type": getattr(word, "type", None),
        "speaker_id": getattr(word, "speaker_id", None),
    }


def _serialize_response(response: Any) -> dict:
    if hasattr(response, "model_dump"):
        return response.model_dump()
    if isinstance(response, dict):
        return dict(response)
    return {}


def _build_kwargs(num_speakers: int | None, keyterms: list[str] | None) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "model_id": "scribe_v2",
        "language_code": "fas",
        "diarize": True,
        "timestamps_granularity": "word",
        "tag_audio_events": False,
        "no_verbatim": True,
    }
    if num_speakers is not None and num_speakers > 0:
        kwargs["num_speakers"] = int(num_speakers)
    if keyterms:
        kwargs["keyterms"] = list(keyterms)
    return kwargs


def transcribe(
    audio_path: Path,
    *,
    num_speakers: int | None = None,
    keyterms: list[str] | None = None,
) -> TranscriptionResult:
    audio_path = Path(audio_path)
    client = ElevenLabs(api_key=settings.ELEVENLABS_API_KEY, timeout=1800)
    kwargs = _build_kwargs(num_speakers, keyterms)

    try:
        size_mb = audio_path.stat().st_size / 1024 / 1024
        logger.info(
            "scribe call: file=%s size=%.1fMB kwargs=%s",
            audio_path.name,
            size_mb,
            {k: v for k, v in kwargs.items() if k != "keyterms"},
        )
        t0 = time.perf_counter()
        with audio_path.open("rb") as f:
            response = client.speech_to_text.convert(file=f, **kwargs)
        logger.info(
            "scribe call %s returned in %.2fs",
            audio_path.name,
            time.perf_counter() - t0,
        )
    except Exception as exc:
        raise RuntimeError(f"Scribe failed: {exc}") from exc

    raw_words = getattr(response, "words", None) or []
    serialized_words = [_serialize_word(w) for w in raw_words]

    plain_text_parts: list[str] = []
    speaker_ids: list[str] = []
    seen_speakers: set[str] = set()

    for word in serialized_words:
        word_type = word.get("type")
        if word_type in _WORD_TYPES_FOR_TEXT:
            plain_text_parts.append(word.get("text", "") or "")
        speaker_id = word.get("speaker_id")
        if speaker_id is not None and speaker_id not in seen_speakers:
            seen_speakers.add(speaker_id)
            speaker_ids.append(speaker_id)

    plain_text = "".join(plain_text_parts)
    language_code = getattr(response, "language_code", None) or "fas"
    raw = _serialize_response(response)

    return TranscriptionResult(
        plain_text=plain_text,
        words=serialized_words,
        speaker_ids=speaker_ids,
        raw=raw,
        language_code=language_code,
    )


def _split_audio(
    audio_path: Path,
    total_dur_s: float,
    n_chunks: int,
    overlap_s: float,
) -> list[tuple[Path, float]]:
    base_dur = total_dur_s / n_chunks
    out: list[tuple[Path, float]] = []
    for i in range(n_chunks):
        nominal_start = i * base_dur
        nominal_end = (i + 1) * base_dur
        start = max(0.0, nominal_start - (overlap_s if i > 0 else 0.0))
        end = min(total_dur_s, nominal_end + (overlap_s if i < n_chunks - 1 else 0.0))
        dur = end - start
        chunk_path = audio_path.parent / f"{audio_path.stem}_chunk{i}{audio_path.suffix}"
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-ss", f"{start:.3f}", "-t", f"{dur:.3f}",
            "-i", str(audio_path),
            "-c", "copy",
            str(chunk_path),
        ]
        t0 = time.perf_counter()
        subprocess.run(cmd, check=True, timeout=300)
        size_mb = chunk_path.stat().st_size / 1024 / 1024
        logger.info(
            "chunk %d: range=%.1f..%.1fs size=%.1fMB split in %.2fs",
            i, start, end, size_mb, time.perf_counter() - t0,
        )
        out.append((chunk_path, start))
    return out


def _stitch(
    results: list[TranscriptionResult],
    offsets: list[float],
    overlap_s: float,
) -> TranscriptionResult:
    n = len(results)

    # rebase timestamps to global
    rebased: list[list[dict]] = []
    for r, off in zip(results, offsets):
        chunk_words = []
        for w in r.words:
            nw = dict(w)
            if w.get("start") is not None:
                nw["start"] = float(w["start"]) + off
            if w.get("end") is not None:
                nw["end"] = float(w["end"]) + off
            chunk_words.append(nw)
        rebased.append(chunk_words)

    # speaker id mapping: chunk_idx -> { local_sid -> global_sid }
    speaker_map: list[dict[str, str]] = [dict() for _ in range(n)]
    next_global = [0]

    def new_global() -> str:
        gid = f"speaker_{next_global[0]}"
        next_global[0] += 1
        return gid

    # chunk 0: anchor — fresh global ids
    for w in rebased[0]:
        sid = w.get("speaker_id")
        if sid is None or sid in speaker_map[0]:
            continue
        speaker_map[0][sid] = new_global()

    # subsequent chunks: vote on overlap match with prev chunk
    for i in range(1, n):
        prev_words = rebased[i - 1]
        cur_words = rebased[i]
        ov_lo = offsets[i]
        ov_hi = ov_lo + 2 * overlap_s

        prev_in_ov = [
            w for w in prev_words
            if w.get("start") is not None
            and ov_lo <= w["start"] <= ov_hi
            and w.get("speaker_id") is not None
        ]
        cur_in_ov = [
            w for w in cur_words
            if w.get("start") is not None
            and ov_lo <= w["start"] <= ov_hi
            and w.get("speaker_id") is not None
        ]

        vote: dict[str, dict[str, int]] = {}
        for cw in cur_in_ov:
            cs = cw["speaker_id"]
            ct = cw["start"]
            best_p, best_diff = None, float("inf")
            for pw in prev_in_ov:
                d = abs(pw["start"] - ct)
                if d < best_diff and d <= SPEAKER_MATCH_TOLERANCE_S:
                    best_diff = d
                    best_p = pw
            if best_p is None:
                continue
            p_global = speaker_map[i - 1].get(best_p["speaker_id"])
            if p_global is None:
                continue
            vote.setdefault(cs, {}).setdefault(p_global, 0)
            vote[cs][p_global] += 1

        all_cur_sids = {w.get("speaker_id") for w in cur_words if w.get("speaker_id") is not None}
        for sid in all_cur_sids:
            if sid in vote and vote[sid]:
                winner = max(vote[sid].items(), key=lambda kv: kv[1])[0]
                speaker_map[i][sid] = winner
                logger.info("chunk %d speaker %s -> %s (votes=%s)", i, sid, winner, vote[sid])
            else:
                fresh = new_global()
                speaker_map[i][sid] = fresh
                logger.info("chunk %d speaker %s -> %s (no overlap match)", i, sid, fresh)

    # dedupe via midpoint boundary between chunks
    boundaries = [0.0]
    for i in range(n - 1):
        boundaries.append(offsets[i + 1] + overlap_s)
    boundaries.append(float("inf"))

    merged_words: list[dict] = []
    for i in range(n):
        lo, hi = boundaries[i], boundaries[i + 1]
        for w in rebased[i]:
            t = w.get("start")
            if t is not None and not (lo <= t < hi):
                continue
            local_sid = w.get("speaker_id")
            if local_sid is not None:
                w = dict(w)
                w["speaker_id"] = speaker_map[i].get(local_sid, local_sid)
            merged_words.append(w)

    plain_text_parts: list[str] = []
    speaker_ids_seen: list[str] = []
    seen: set[str] = set()
    for w in merged_words:
        if w.get("type") in _WORD_TYPES_FOR_TEXT:
            plain_text_parts.append(w.get("text", "") or "")
        sid = w.get("speaker_id")
        if sid is not None and sid not in seen:
            seen.add(sid)
            speaker_ids_seen.append(sid)

    return TranscriptionResult(
        plain_text="".join(plain_text_parts),
        words=merged_words,
        speaker_ids=speaker_ids_seen,
        raw={"chunks": n, "offsets": offsets},
        language_code=results[0].language_code,
    )


async def transcribe_async(
    audio_path: Path,
    *,
    num_speakers: int | None = None,
    keyterms: list[str] | None = None,
) -> TranscriptionResult:
    audio_path = Path(audio_path)
    n_chunks = max(1, int(settings.TRANSCRIBE_PARALLEL_CHUNKS))
    overlap_s = float(settings.TRANSCRIBE_CHUNK_OVERLAP_S)
    duration = probe_duration_seconds(audio_path)

    if n_chunks <= 1 or duration is None or duration < MIN_DURATION_FOR_CHUNKING_S:
        logger.info(
            "transcribe_async: single-shot (n_chunks=%d dur=%s)",
            n_chunks, duration,
        )
        return await asyncio.to_thread(
            transcribe, audio_path,
            num_speakers=num_speakers, keyterms=keyterms,
        )

    logger.info(
        "transcribe_async: chunked dur=%.1fs n=%d overlap=%.1fs",
        duration, n_chunks, overlap_s,
    )
    t_split = time.perf_counter()
    try:
        chunks = await asyncio.to_thread(
            _split_audio, audio_path, duration, n_chunks, overlap_s,
        )
    except subprocess.CalledProcessError as exc:
        logger.info("ffmpeg split failed (%s) -- falling back to single shot", exc)
        return await asyncio.to_thread(
            transcribe, audio_path,
            num_speakers=num_speakers, keyterms=keyterms,
        )
    logger.info("all chunks split in %.2fs", time.perf_counter() - t_split)

    chunk_paths = [p for p, _ in chunks]
    offsets = [off for _, off in chunks]

    try:
        t_parallel = time.perf_counter()
        results = await asyncio.gather(
            *[
                asyncio.to_thread(
                    transcribe, p,
                    num_speakers=num_speakers, keyterms=keyterms,
                )
                for p in chunk_paths
            ]
        )
        logger.info(
            "%dx parallel scribe done in %.2fs",
            n_chunks, time.perf_counter() - t_parallel,
        )

        t_stitch = time.perf_counter()
        merged = _stitch(list(results), offsets, overlap_s)
        logger.info(
            "stitch done in %.2fs total_words=%d global_speakers=%d",
            time.perf_counter() - t_stitch,
            len(merged.words), len(merged.speaker_ids),
        )
        return merged
    finally:
        for p in chunk_paths:
            try:
                p.unlink()
            except OSError:
                pass
