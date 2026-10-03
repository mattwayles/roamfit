#!/usr/bin/env python3
"""Synthesizes app/assets/audio/stamp-thunk.wav — the passport stamp landing on the completion
screen. A rubber stamp hitting a pad of paper: a short noise slap (the rubber meeting paper), a
pitched-down body thump, and a softer second thump ~70 ms later (the stamp settling). Stdlib only.

    python3 tools/make_stamp_sound.py
"""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 44100
DURATION = 0.42
OUT = Path(__file__).resolve().parent.parent / "app" / "assets" / "audio" / "stamp-thunk.wav"


def thump(t, start, f0, f1, decay, gain):
    dt = t - start
    if dt < 0:
        return 0.0
    # Pitch glides from f0 down to f1; phase is the integral of the glide.
    k = 28.0
    phase = 2 * math.pi * (f1 * dt + (f0 - f1) * (1 - math.exp(-k * dt)) / k)
    return gain * math.sin(phase) * math.exp(-dt / decay)


def main():
    rng = random.Random(7)
    n = int(RATE * DURATION)
    samples = []
    lp = 0.0
    for i in range(n):
        t = i / RATE
        noise = rng.uniform(-1, 1)
        lp += 0.18 * (noise - lp)  # one-pole low-pass: a dull slap, not a hiss
        slap = lp * math.exp(-t / 0.018) * 1.6
        s = slap + thump(t, 0.0, 150, 52, 0.09, 1.0) + thump(t, 0.07, 110, 48, 0.07, 0.45)
        samples.append(s)
    peak = max(abs(s) for s in samples) or 1.0
    scale = 0.85 / peak
    fade = int(RATE * 0.02)
    with wave.open(str(OUT), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = bytearray()
        for i, s in enumerate(samples):
            if i >= n - fade:
                s *= (n - i) / fade
            frames += struct.pack("<h", int(max(-1, min(1, s * scale)) * 32767))
        w.writeframes(bytes(frames))
    print(f"wrote {OUT} ({n} samples)")


if __name__ == "__main__":
    main()
