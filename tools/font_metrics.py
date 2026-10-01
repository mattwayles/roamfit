#!/usr/bin/env python3
"""Generate app/src/theme/fontMetrics.ts — per-character advance widths for the fonts that
auto-shrink text (Txt `adjustsFontSizeToFit`), so the app can fit text in JS instead of relying on
iOS's shrink, which ignores `minimumFontScale` on the New Architecture and can fall to 4pt.

Reads the TTFs from node_modules directly (cmap format 4 + hmtx, and the GSUB `tnum` single
substitution for `fontVariant: ['tabular-nums']`); no third-party packages.

    python3 tools/font_metrics.py          # rewrite the generated file
    python3 tools/font_metrics.py --check  # exit 1 if it is stale
"""
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app/src/theme/fontMetrics.ts"
FONTS = {
    "BarlowCondensed_700Bold": "barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf",
    "BarlowCondensed_800ExtraBold": "barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf",
}
# Printable ASCII plus the few non-ASCII glyphs the app puts in fitted text.
CHARS = [chr(c) for c in range(32, 127)] + list("·–—×’…")


def tables(data: bytes) -> dict:
    num = struct.unpack(">H", data[4:6])[0]
    out = {}
    for i in range(num):
        tag, _, off, length = struct.unpack(">4sIII", data[12 + 16 * i : 28 + 16 * i])
        out[tag.decode()] = data[off : off + length]
    return out


def cmap4(cmap: bytes) -> dict:
    n = struct.unpack(">H", cmap[2:4])[0]
    for i in range(n):
        pid, eid, off = struct.unpack(">HHI", cmap[4 + 8 * i : 12 + 8 * i])
        if pid == 3 and eid == 1 and struct.unpack(">H", cmap[off : off + 2])[0] == 4:
            sub = cmap[off:]
            segx2 = struct.unpack(">H", sub[6:8])[0]
            ends = struct.unpack(f">{segx2 // 2}H", sub[14 : 14 + segx2])
            starts = struct.unpack(f">{segx2 // 2}H", sub[16 + segx2 : 16 + 2 * segx2])
            deltas = struct.unpack(f">{segx2 // 2}h", sub[16 + 2 * segx2 : 16 + 3 * segx2])
            ro_at = 16 + 3 * segx2
            ranges = struct.unpack(f">{segx2 // 2}H", sub[ro_at : ro_at + segx2])
            mapping = {}
            for s, (end, start, delta, ro) in enumerate(zip(ends, starts, deltas, ranges)):
                for c in range(start, end + 1):
                    if c == 0xFFFF:
                        continue
                    if ro == 0:
                        g = (c + delta) & 0xFFFF
                    else:
                        at = ro_at + 2 * s + ro + 2 * (c - start)
                        g = struct.unpack(">H", sub[at : at + 2])[0]
                        g = (g + delta) & 0xFFFF if g else 0
                    mapping[c] = g
            return mapping
    raise ValueError("no (3,1) format-4 cmap")


def coverage(cov: bytes) -> list:
    fmt, count = struct.unpack(">HH", cov[:4])
    if fmt == 1:
        return list(struct.unpack(f">{count}H", cov[4 : 4 + 2 * count]))
    glyphs = []
    for i in range(count):
        start, end, _ = struct.unpack(">HHH", cov[4 + 6 * i : 10 + 6 * i])
        glyphs.extend(range(start, end + 1))
    return glyphs


def tnum_map(gsub: bytes) -> dict:
    """glyph -> tabular glyph, from every single-substitution lookup behind the `tnum` feature."""
    feature_list, lookup_list = struct.unpack(">HH", gsub[6:10])
    lookups = set()
    n = struct.unpack(">H", gsub[feature_list : feature_list + 2])[0]
    for i in range(n):
        at = feature_list + 2 + 6 * i
        tag, off = struct.unpack(">4sH", gsub[at : at + 6])
        if tag == b"tnum":
            feat = gsub[feature_list + off :]
            count = struct.unpack(">H", feat[2:4])[0]
            lookups.update(struct.unpack(f">{count}H", feat[4 : 4 + 2 * count]))
    out = {}
    for li in sorted(lookups):
        lo = struct.unpack(">H", gsub[lookup_list + 2 + 2 * li : lookup_list + 4 + 2 * li])[0]
        lookup = gsub[lookup_list + lo :]
        ltype, _, sub_count = struct.unpack(">HHH", lookup[:6])
        for s in range(sub_count):
            so = struct.unpack(">H", lookup[6 + 2 * s : 8 + 2 * s])[0]
            st, kind = lookup[so:], ltype
            if kind == 7:  # extension lookup wraps the real subtable
                kind, eo = struct.unpack(">HI", st[2:8])
                st = st[eo:]
            if kind != 1:
                raise ValueError(f"tnum lookup type {kind} not handled")
            fmt, cov_off = struct.unpack(">HH", st[:4])
            glyphs = coverage(st[cov_off:])
            if fmt == 1:
                delta = struct.unpack(">h", st[4:6])[0]
                out.update({g: (g + delta) & 0xFFFF for g in glyphs})
            else:
                count = struct.unpack(">H", st[4:6])[0]
                subs = struct.unpack(f">{count}H", st[6 : 6 + 2 * count])
                out.update(dict(zip(glyphs, subs)))
    return out


def widths(path: Path) -> tuple[dict, dict, float]:
    t = tables(path.read_bytes())
    upem = struct.unpack(">H", t["head"][18:20])[0]
    n_hmetrics = struct.unpack(">H", t["hhea"][34:36])[0]
    hmtx = t["hmtx"]
    adv = [struct.unpack(">H", hmtx[4 * i : 4 * i + 2])[0] for i in range(n_hmetrics)]
    cmap = cmap4(t["cmap"])
    tnum = tnum_map(t["GSUB"]) if "GSUB" in t else {}

    def em(g: int) -> float:
        return round(adv[min(g, n_hmetrics - 1)] / upem, 4)

    out, tab = {}, {}
    for ch in CHARS:
        g = cmap.get(ord(ch))
        if g is None:
            continue
        out[ch] = em(g)
        if g in tnum and em(tnum[g]) != out[ch]:
            tab[ch] = em(tnum[g])
    return out, tab, max(out.values())


def render() -> str:
    lines = [
        "/**",
        " * GENERATED by tools/font_metrics.py — do not edit by hand.",
        " * Advance width of each character in em (multiply by fontSize for points), for the fonts whose",
        " * text Txt fits in JS (`adjustsFontSizeToFit`). `max` is the widest listed glyph — the safe",
        " * fallback for anything unlisted. `tabular` overrides `chars` under `fontVariant: ['tabular-nums']`.",
        " */",
        "export interface FontWidths {",
        "  max: number;",
        "  chars: Record<string, number>;",
        "  tabular: Record<string, number>;",
        "}",
        "",
        "export const fontWidths: Record<string, FontWidths> = {",
    ]
    for family, rel in FONTS.items():
        w, tab, mx = widths(ROOT / "node_modules/@expo-google-fonts" / rel)
        lines.append(f"  {family}: {{")
        lines.append(f"    max: {mx},")
        for name, table in (("chars", w), ("tabular", tab)):
            lines.append(f"    {name}: {{")
            for ch, v in table.items():
                key = ch.replace("\\", "\\\\").replace("'", "\\'")
                lines.append(f"      '{key}': {v},")
            lines.append("    },")
        lines.append("  },")
    lines.append("};")
    # Through the repo's prettier, so the committed file passes lint as generated.
    return subprocess.run(
        ["npx", "prettier", "--stdin-filepath", str(OUT)],
        input="\n".join(lines) + "\n",
        capture_output=True,
        text=True,
        check=True,
        cwd=ROOT,
    ).stdout


if __name__ == "__main__":
    text = render()
    if "--check" in sys.argv:
        sys.exit(0 if OUT.exists() and OUT.read_text() == text else 1)
    OUT.write_text(text)
    print(f"wrote {OUT.relative_to(ROOT)}")
