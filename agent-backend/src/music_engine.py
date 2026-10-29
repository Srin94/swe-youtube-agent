"""Soothing background-music bed for each video.

Two sources, in priority order:

  1. Drop-in tracks -- any audio file placed in ``agent-backend/assets/music/``
     (``.mp3`` / ``.wav`` / ``.ogg`` / ``.flac`` / ``.m4a`` / ``.aac``). One is
     chosen per render, deliberately *not* repeating the previous video's pick,
     then looped / trimmed to length. Use this if you have a curated royalty-free
     pack you'd rather hear.

  2. Procedural ambient (default, zero assets) -- a warm, slowly-evolving pad is
     synthesized from scratch with a fresh random key, chord progression and
     tempo on every run, so no two videos ever share the same music and nothing
     has to be downloaded, licensed or committed to the repo.

The returned bed is already looped to length, leveled well under the narration,
and faded in/out. ``audio_engine`` just overlays it onto the stitched speech.

Everything degrades to silence on any error: background music must never be the
reason a render fails.
"""

from __future__ import annotations

import os
import random
from pathlib import Path
from typing import List, Optional

from pydub import AudioSegment

try:
    from . import config
except ImportError:  # pragma: no cover
    import config  # type: ignore

_AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"}
_STATE_FILE = config.OUTPUT_DIR / ".last_music"


# ---------------------------------------------------------------------------
# "Don't repeat the last one" state
# ---------------------------------------------------------------------------
def _read_last() -> str:
    try:
        return _STATE_FILE.read_text(encoding="utf-8").strip()
    except Exception:  # noqa: BLE001
        return ""


def _write_last(tag: str) -> None:
    try:
        _STATE_FILE.write_text(tag, encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _loop_to(seg: AudioSegment, duration_ms: int) -> Optional[AudioSegment]:
    """Loop ``seg`` until it covers ``duration_ms``, then trim to exact length."""
    if seg is None or len(seg) == 0 or duration_ms <= 0:
        return None
    out = seg
    while len(out) < duration_ms:
        out = out + seg
    return out[:duration_ms]


# ---------------------------------------------------------------------------
# Source 1: drop-in track folder
# ---------------------------------------------------------------------------
def _pick_from_folder(duration_ms: int) -> Optional[AudioSegment]:
    folder: Path = config.MUSIC_DIR
    if not folder.exists():
        return None
    tracks = sorted(
        p for p in folder.iterdir() if p.suffix.lower() in _AUDIO_EXTS and p.is_file()
    )
    if not tracks:
        return None

    last = _read_last()
    # Avoid replaying the previous video's track when we have a choice.
    pool = [t for t in tracks if t.name != last] or tracks
    pick = random.choice(pool)
    _write_last(pick.name)

    try:
        seg = AudioSegment.from_file(pick)
    except Exception as exc:  # noqa: BLE001
        print(f"[music] could not decode '{pick.name}' ({exc}); using generator.")
        return None

    seg = seg.set_channels(1).set_frame_rate(config.AUDIO_SAMPLE_RATE)
    print(f"[music] background track: {pick.name}")
    return _loop_to(seg, duration_ms)


# ---------------------------------------------------------------------------
# Source 2: procedural ambient pad (the zero-asset default)
# ---------------------------------------------------------------------------
# Warm, consonant voicings keyed off a chosen root (semitone offsets).
_CHORDS = {
    "maj7": [0, 4, 7, 11],
    "min7": [0, 3, 7, 10],
    "add9": [0, 4, 7, 14],
    "min9": [0, 3, 7, 14],
    "sus2": [0, 2, 7, 12],
    "maj6": [0, 4, 7, 9],
}
# Gentle 4-chord progressions (consonant, resolve softly -- lo-fi / ambient).
_PROGRESSIONS = [
    ["maj7", "min9", "add9", "sus2"],
    ["add9", "sus2", "maj7", "min7"],
    ["min9", "add9", "maj6", "sus2"],
    ["maj7", "maj6", "min7", "add9"],
    ["sus2", "min7", "add9", "maj7"],
]
# Root movement between bars, in semitones (small, soothing steps).
_ROOT_WALKS = [
    [0, -3, -5, 2],
    [0, 2, -3, -5],
    [0, -5, -3, 0],
    [0, 3, 5, 2],
]
# Candidate tonic frequencies (low-mid register so the pad stays under speech).
_TONICS = [196.00, 174.61, 164.81, 146.83, 220.00, 130.81]  # G3 F3 E3 D3 A3 C3


def _procedural_bed(duration_ms: int, seed: Optional[int] = None) -> Optional[AudioSegment]:
    try:
        import numpy as np
    except Exception as exc:  # noqa: BLE001
        print(f"[music] numpy unavailable ({exc}); no generated music.")
        return None

    sr = config.AUDIO_SAMPLE_RATE
    total = int(sr * duration_ms / 1000)
    if total <= 0:
        return None

    if seed is None:
        seed = int.from_bytes(os.urandom(8), "big")
    rng = random.Random(seed)

    tonic = rng.choice(_TONICS)
    quality = rng.choice(_PROGRESSIONS)
    walk = rng.choice(_ROOT_WALKS)
    bar_sec = rng.uniform(4.0, 6.0)            # slow, unhurried chord changes
    trem_hz = rng.uniform(0.08, 0.18)          # very slow amplitude drift
    sparkle = rng.random() < 0.7               # occasional soft bell arpeggio

    bar_n = int(sr * bar_sec)
    # Half-bar cosine cross-fade so chords melt into each other.
    fade = np.hanning(bar_n * 2)
    env = np.ones(bar_n)
    half = bar_n // 2
    env[:half] = fade[:half]
    env[-half:] = fade[-half:]

    def semis(freq: float, s: float) -> float:
        return freq * (2.0 ** (s / 12.0))

    def voice(freq: float, n: int) -> "np.ndarray":
        """A warm note: fundamental + soft octave + detuned pair + quiet fifth."""
        t = np.arange(n) / sr
        base = np.sin(2 * np.pi * freq * t)
        octv = 0.45 * np.sin(2 * np.pi * freq * 2 * t)
        det = 0.5 * (
            np.sin(2 * np.pi * freq * 1.003 * t)
            + np.sin(2 * np.pi * freq * 0.997 * t)
        )
        fifth = 0.22 * np.sin(2 * np.pi * semis(freq, 7) * t)
        return base + octv + det + fifth

    out = np.zeros(total + bar_n, dtype=np.float32)
    pent = [0, 2, 4, 7, 9]  # major pentatonic for any sparkle notes

    cursor = 0
    bar_idx = 0
    while cursor < total:
        q = quality[bar_idx % len(quality)]
        root = semis(tonic, walk[bar_idx % len(walk)])
        chord = _CHORDS[q]

        bar = np.zeros(bar_n, dtype=np.float32)
        for st in chord:
            bar += voice(semis(root, st), bar_n)
        bar += 0.35 * voice(root / 2.0, bar_n)      # soft sub for body
        bar *= env

        # Rare, quiet bell note so the bed breathes a little.
        if sparkle and rng.random() < 0.6:
            at = rng.randint(0, max(1, bar_n - sr))
            note = semis(root * 2, rng.choice(pent))
            tb = np.arange(sr) / sr
            decay = np.exp(-tb * 3.5)
            bell = 0.18 * np.sin(2 * np.pi * note * tb) * decay
            end = min(bar_n, at + sr)
            bar[at:end] += bell[: end - at]

        out[cursor : cursor + bar_n] += bar
        cursor += bar_n
        bar_idx += 1

    sig = out[:total]

    # Slow tremolo for a living, drifting feel.
    t = np.arange(total) / sr
    sig = sig * (0.88 + 0.12 * np.sin(2 * np.pi * trem_hz * t))

    # One-pole low-pass to round off the highs (warm, non-fatiguing).
    a = 0.14
    lp = np.empty_like(sig)
    acc = 0.0
    for i in range(total):
        acc += a * (sig[i] - acc)
        lp[i] = acc
    sig = 0.75 * lp + 0.25 * sig

    # A couple of attenuated taps for a soft, roomy wash.
    for delay_ms, gain in ((180, 0.22), (320, 0.14)):
        d = int(sr * delay_ms / 1000)
        if d < total:
            sig[d:] += gain * sig[:-d]

    peak = float(np.max(np.abs(sig))) or 1.0
    sig = (sig / peak) * 0.72
    pcm = (sig * 32767.0).astype("<i2")

    bed = AudioSegment(
        pcm.tobytes(), frame_rate=sr, sample_width=2, channels=1
    )
    _write_last(f"gen:{seed}")
    print(
        f"[music] generated ambient bed "
        f"(tonic {tonic:.1f}Hz, {'-'.join(quality)}, {bar_sec:.1f}s/bar)."
    )
    return bed


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------
def build_music_bed(duration_ms: int) -> Optional[AudioSegment]:
    """Return a leveled, faded background bed of ``duration_ms``, or None."""
    if not config.BACKGROUND_MUSIC_ENABLED or duration_ms <= 0:
        return None
    try:
        bed = _pick_from_folder(duration_ms)
        if bed is None:
            bed = _procedural_bed(duration_ms)
        if bed is None:
            return None
        bed = _loop_to(bed, duration_ms) or bed

        # Level the bed to a fixed, well-under-speech target, then fade.
        if bed.dBFS != float("-inf"):
            bed = bed.apply_gain(config.MUSIC_LEVEL_DBFS - bed.dBFS)
        fade = min(config.MUSIC_FADE_MS, len(bed) // 2)
        if fade > 0:
            bed = bed.fade_in(fade).fade_out(fade)
        return bed
    except Exception as exc:  # noqa: BLE001
        print(f"[music] bed build failed ({exc}); rendering without music.")
        return None
