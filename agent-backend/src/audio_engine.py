"""Voiceover synthesis + word-level timestamp alignment.

Pipeline:
  1. Synthesize each scene's narration to a mono WAV.
       Primary : Kokoro-82M (kokoro-onnx, CPU) at speed 1.04.
       Fallback: edge-tts (en-US-ChristopherNeural, +8%) decoded via pydub.
  2. Stitch scenes with a 300ms gap, recording each scene's exact start_sec /
     duration_sec, and export agent-backend/output/narration.wav.
  3. Run faster-whisper (base.en, int8, word_timestamps) over the stitched
     audio to populate payload.words with millisecond-accurate timings.
       Fallback: distribute words evenly across each scene window.

Everything degrades gracefully: a missing Kokoro model falls back to edge-tts;
a missing faster-whisper falls back to proportional word timing. The pipeline
therefore still produces a renderable payload with zero heavyweight models.
"""

from __future__ import annotations

import asyncio
import shutil
from pathlib import Path
from typing import List, Optional

try:
    from . import config
    from .script_generator import VideoRenderPayload, WordTimestamp, save_payload
except ImportError:  # pragma: no cover
    import config  # type: ignore
    from script_generator import VideoRenderPayload, WordTimestamp, save_payload  # type: ignore

# pydub is used for concatenation/silence/format conversion (needs ffmpeg).
from pydub import AudioSegment

TARGET_SR = config.AUDIO_SAMPLE_RATE  # 24kHz stitched master


# ---------------------------------------------------------------------------
# Kokoro (primary)
# ---------------------------------------------------------------------------
_KOKORO_MODEL = None


def _try_load_kokoro():
    """Return a cached Kokoro instance or None if model files are unavailable."""
    global _KOKORO_MODEL
    if _KOKORO_MODEL is not None:
        return _KOKORO_MODEL
    try:
        from kokoro_onnx import Kokoro  # type: ignore
    except ImportError:
        print("[audio] kokoro-onnx not installed; using edge-tts fallback.")
        return None

    # Look for the model/voices files in a few conventional spots.
    search = [
        config.BACKEND_DIR / ".cache",
        config.BACKEND_DIR,
        Path.cwd(),
    ]
    model_path = voices_path = None
    for base in search:
        m = base / "kokoro-v0_19.onnx"
        v = base / "voices-v1.0.bin"
        if m.exists() and v.exists():
            model_path, voices_path = m, v
            break
        # alternative common filenames
        m2 = base / "kokoro.onnx"
        v2 = base / "voices.bin"
        if m2.exists() and v2.exists():
            model_path, voices_path = m2, v2
            break
    if not model_path:
        print("[audio] Kokoro model files not cached; using edge-tts fallback.")
        return None
    try:
        _KOKORO_MODEL = Kokoro(str(model_path), str(voices_path))
        print(f"[audio] Loaded Kokoro model from {model_path}")
        return _KOKORO_MODEL
    except Exception as exc:  # noqa: BLE001
        print(f"[audio] Kokoro load failed ({exc}); using edge-tts fallback.")
        return None


def _synth_kokoro(kokoro, text: str, out_path: Path) -> bool:
    try:
        import soundfile as sf  # type: ignore

        samples, sr = kokoro.create(
            text, voice=config.KOKORO_VOICE, speed=config.KOKORO_SPEED, lang="en-us"
        )
        sf.write(str(out_path), samples, sr)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[audio] Kokoro synth failed for a scene ({exc}).")
        return False


# ---------------------------------------------------------------------------
# edge-tts (fallback)
# ---------------------------------------------------------------------------
async def _edge_save(text: str, mp3_path: Path) -> None:
    import edge_tts  # type: ignore

    comm = edge_tts.Communicate(
        text, voice=config.EDGE_TTS_VOICE, rate=config.EDGE_TTS_RATE
    )
    await comm.save(str(mp3_path))


def _synth_edge(text: str, out_path: Path) -> bool:
    try:
        mp3_tmp = out_path.with_suffix(".mp3")
        asyncio.run(_edge_save(text, mp3_tmp))
        seg = AudioSegment.from_file(mp3_tmp)
        seg = seg.set_channels(1).set_frame_rate(TARGET_SR)
        seg.export(out_path, format="wav")
        mp3_tmp.unlink(missing_ok=True)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[audio] edge-tts synth failed ({exc}).")
        return False


# ---------------------------------------------------------------------------
# Scene synthesis + stitching
# ---------------------------------------------------------------------------
def _synthesize_scene(kokoro, text: str, out_path: Path) -> bool:
    if kokoro is not None and _synth_kokoro(kokoro, text, out_path):
        return True
    return _synth_edge(text, out_path)


def synthesize_narration(payload: VideoRenderPayload) -> AudioSegment:
    """Synthesize every scene, stitch with 300ms gaps, return the master track.

    Also writes exact start_sec / duration_sec back onto each scene.
    """
    kokoro = _try_load_kokoro()
    gap = AudioSegment.silent(duration=config.SCENE_GAP_MS, frame_rate=TARGET_SR)
    master = AudioSegment.silent(duration=0, frame_rate=TARGET_SR)

    tmp_dir = config.OUTPUT_DIR / "_scene_audio"
    tmp_dir.mkdir(exist_ok=True)

    cursor_ms = 0
    for i, scene in enumerate(payload.scenes):
        scene_wav = tmp_dir / f"scene_{i:02d}.wav"
        ok = _synthesize_scene(kokoro, scene.narration_text, scene_wav)
        if not ok or not scene_wav.exists():
            # Last-resort: a short silent clip so timing stays coherent.
            dur_ms = int(len(scene.narration_text.split()) / 2.6 * 1000)
            seg = AudioSegment.silent(duration=max(500, dur_ms), frame_rate=TARGET_SR)
        else:
            seg = AudioSegment.from_file(scene_wav).set_channels(1).set_frame_rate(TARGET_SR)

        scene.start_sec = round(cursor_ms / 1000.0, 3)
        scene.duration_sec = round(len(seg) / 1000.0, 3)
        master += seg
        cursor_ms += len(seg)

        if i < len(payload.scenes) - 1:
            master += gap
            cursor_ms += config.SCENE_GAP_MS

    payload.total_duration_sec = round(len(master) / 1000.0, 3)

    master.export(config.NARRATION_PATH, format="wav")
    print(
        f"[audio] Stitched {len(payload.scenes)} scenes -> "
        f"{config.NARRATION_PATH} ({payload.total_duration_sec:.1f}s)"
    )
    shutil.rmtree(tmp_dir, ignore_errors=True)
    return master


# ---------------------------------------------------------------------------
# Word-level alignment
# ---------------------------------------------------------------------------
def _decode_for_whisper():
    """Decode narration.wav to a 16kHz mono float32 array via soundfile.

    We decode here instead of letting faster-whisper open the file itself:
    faster-whisper 1.2.x calls `av.open(..., metadata_errors=...)`, a kwarg
    that PyAV 19 (the only build with Python 3.14 wheels) no longer accepts.
    Passing a numpy array to `transcribe` bypasses PyAV entirely.
    """
    import numpy as np  # bundled via soundfile's dependency chain
    import soundfile as sf  # type: ignore

    audio, sr = sf.read(str(config.NARRATION_PATH), dtype="float32")
    if getattr(audio, "ndim", 1) > 1:  # stereo -> mono
        audio = audio.mean(axis=1)
    target = 16_000
    if sr != target:  # linear resample is plenty for ASR alignment
        n = int(len(audio) * target / sr)
        audio = np.interp(
            np.linspace(0, len(audio), n, endpoint=False),
            np.arange(len(audio)),
            audio,
        ).astype("float32")
    return np.ascontiguousarray(audio, dtype="float32")


def _align_with_whisper(payload: VideoRenderPayload) -> bool:
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError:
        print("[audio] faster-whisper not installed; using proportional timing.")
        return False
    try:
        model = WhisperModel(
            config.WHISPER_MODEL, device="cpu", compute_type=config.WHISPER_COMPUTE_TYPE
        )
        audio = _decode_for_whisper()
        segments, _ = model.transcribe(
            audio, word_timestamps=True, language="en"
        )
        words: List[WordTimestamp] = []
        for seg in segments:
            for w in seg.words or []:
                words.append(
                    WordTimestamp(
                        word=w.word.strip(),
                        start_sec=round(float(w.start), 3),
                        end_sec=round(float(w.end), 3),
                    )
                )
        if not words:
            return False
        payload.words = words
        print(f"[audio] faster-whisper aligned {len(words)} words.")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[audio] faster-whisper alignment failed ({exc}).")
        return False


def _align_proportional(payload: VideoRenderPayload) -> None:
    """Even word distribution across each scene window (fallback)."""
    words: List[WordTimestamp] = []
    for scene in payload.scenes:
        toks = scene.narration_text.split()
        if not toks:
            continue
        step = scene.duration_sec / len(toks)
        for j, tok in enumerate(toks):
            start = scene.start_sec + j * step
            words.append(
                WordTimestamp(
                    word=tok.strip(),
                    start_sec=round(start, 3),
                    end_sec=round(start + step, 3),
                )
            )
    payload.words = words
    print(f"[audio] Proportional timing produced {len(words)} words.")


def align_words(payload: VideoRenderPayload) -> None:
    if not _align_with_whisper(payload):
        _align_proportional(payload)


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------
def build_audio(payload: VideoRenderPayload, save: bool = True) -> VideoRenderPayload:
    """Synthesize narration, align words, and (optionally) persist the payload."""
    synthesize_narration(payload)
    align_words(payload)
    if save:
        save_payload(payload)
    return payload


if __name__ == "__main__":
    import json

    with open(config.RENDER_PAYLOAD_PATH, encoding="utf-8") as fh:
        p = VideoRenderPayload.model_validate(json.load(fh))
    build_audio(p)
