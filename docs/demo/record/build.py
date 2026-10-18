#!/usr/bin/env python3
"""Narration + subtitles + assembly for the product demo (docs/demo/README.md).

  python3 docs/demo/record/build.py --timing-only   # TTS every line, write build/timing.json
  python3 docs/demo/record/build.py                 # (after record.ts) compose scenes + final mp4

Inputs : record/narration.json, build/raw/<scene>.webm
Outputs: build/audio/*.wav, build/subs/*.png, build/scenes/<scene>.mp4,
         docs/demo/2026-10-19-product-demo.mp4 (+ -720p.mp4 when the 1080-ish master exceeds 100 MB)

Needs macOS `say` (voice Tingting), ffmpeg (libx264 + aac; no libass/drawtext required —
subtitles are PNG overlays rendered with Pillow), ffprobe, Pillow.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DEMO = Path(__file__).resolve().parent.parent
REC = DEMO / "record"
BUILD = DEMO / "build"
RAW, AUDIO, SUBS, SCENES = BUILD / "raw", BUILD / "audio", BUILD / "subs", BUILD / "scenes"
FINAL = DEMO / "2026-10-19-product-demo.mp4"
FINAL_720 = DEMO / "2026-10-19-product-demo-720p.mp4"
W, H, FPS = 1600, 900, 30
FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
GAP, LEAD, TAIL = 0.45, 0.8, 1.0  # seconds between lines / before first / after last


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def duration(path: Path) -> float:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).stdout
    return float(out.strip())


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


# ---------------------------------------------------------------- narration

def tts(text: str, voice: str, rate: int, out_wav: Path) -> float:
    if not out_wav.exists():
        aiff = out_wav.with_suffix(".aiff")
        spoken = text.replace("⌘", "Command ")
        run(["say", "-v", voice, "-r", str(rate), "-o", str(aiff), spoken])
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(aiff), "-ar", "48000", "-ac", "1", str(out_wav)])
        aiff.unlink()
    return duration(out_wav)


def build_timing(spec: dict) -> dict:
    AUDIO.mkdir(parents=True, exist_ok=True)
    timing = {"scenes": {}}
    for scene in spec["scenes"]:
        sid = scene["id"]
        cues, t = [], LEAD
        parts: list[tuple[Path, float]] = []
        for i, line in enumerate(scene["lines"]):
            wav = AUDIO / f"{sid}-{i:02d}.wav"
            d = tts(line, spec["voice"], spec["rate"], wav)
            cues.append({"text": line, "start": round(t, 3), "end": round(t + d, 3)})
            parts.append((wav, d))
            t += d + GAP
        total = t - GAP + TAIL
        # Scene track: silence lead-in, lines with gaps, tail.
        scene_wav = AUDIO / f"{sid}.wav"
        inputs, filt = [], []
        for n, (wav, _) in enumerate(parts):
            inputs += ["-i", str(wav)]
            filt.append(f"[{n}:a]adelay={int(cues[n]['start'] * 1000)}|{int(cues[n]['start'] * 1000)}[a{n}]")
        mix = "".join(f"[a{n}]" for n in range(len(parts))) + f"amix=inputs={len(parts)}:normalize=0,apad=whole_dur={total:.3f}[out]"
        run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filt + [mix]),
             "-map", "[out]", "-ar", "48000", "-ac", "1", "-t", f"{total:.3f}", str(scene_wav)])
        timing["scenes"][sid] = {"title": scene["title"], "total": round(total, 3), "cues": cues}
    (BUILD / "timing.json").write_text(json.dumps(timing, ensure_ascii=False, indent=1))
    grand = sum(s["total"] for s in timing["scenes"].values())
    print(f"[build] timing.json written: {len(timing['scenes'])} scenes, narration total {grand/60:.1f} min")
    return timing


# ---------------------------------------------------------------- overlays

def wrap(text: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    lines, cur = [], ""
    for ch in text:
        if f.getlength(cur + ch) > max_w and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def subtitle_png(text: str, out: Path):
    f = font(34)
    lines = wrap(text, f, 1380)
    lh = 46
    pad_x, pad_y = 26, 14
    tw = max(f.getlength(l) for l in lines)
    bw, bh = int(tw + pad_x * 2), lh * len(lines) + pad_y * 2
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0, y0 = (W - bw) // 2, H - 48 - bh
    d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=10, fill=(12, 14, 20, 196))
    for i, l in enumerate(lines):
        lw = f.getlength(l)
        d.text(((W - lw) / 2, y0 + pad_y + i * lh), l, font=f, fill=(250, 250, 250, 255))
    img.save(out)


def chapter_png(title: str, index: int, total: int, out: Path):
    f, fs = font(22), font(18)
    label = f"{index:02d} / {total:02d}"
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    tw = f.getlength(title) + fs.getlength(label) + 60
    x0, y0 = W - 24 - int(tw), 66
    d.rounded_rectangle([x0, y0, W - 24, y0 + 40], radius=8, fill=(12, 14, 20, 170))
    d.text((x0 + 16, y0 + 11), label, font=fs, fill=(245, 166, 35, 255))
    d.text((x0 + 16 + fs.getlength(label) + 16, y0 + 8), title, font=f, fill=(250, 250, 250, 255))
    img.save(out)


def title_card_png(out: Path):
    img = Image.new("RGBA", (W, H), (8, 10, 16, 230))
    d = ImageDraw.Draw(img)
    t1, t2, t3 = font(72), font(30), font(22)
    name = "osbornalpha"
    w1 = t1.getlength(name)
    d.text(((W - w1) / 2, 300), "osborn", font=t1, fill=(250, 250, 250, 255))
    d.text(((W - w1) / 2 + t1.getlength("osborn"), 300), "alpha", font=t1, fill=(245, 166, 35, 255))
    s = "产品演示 · AI 投资监控与研究工作台"
    d.text(((W - t2.getlength(s)) / 2, 410), s, font=t2, fill=(220, 220, 225, 255))
    s3 = "Today · Watchlist · Intel · Research OS · Analyst · Portfolio · 2026-10"
    d.text(((W - t3.getlength(s3)) / 2, 470), s3, font=t3, fill=(150, 155, 165, 255))
    img.save(out)


LAYERS = [
    ("研究 Research", "/research", "产出建议\n回答：值不值得做", (86, 156, 214)),
    ("分析 Analyst", "/analyst", "模拟账本 + 前向评分\n冻结规则 · 只记分不交易", (245, 166, 35)),
    ("我的投资 Portfolio", "/portfolio", "真实交易 + 持仓\n唯一实盘入口 · 可采纳建议", (96, 200, 120)),
]


def mix(c: tuple[int, int, int], bg: tuple[int, int, int], a: float) -> tuple[int, int, int, int]:
    """Opaque colour = c over bg at opacity a. ImageDraw replaces pixels instead of blending, so
    translucent fills would punch holes through the panel; pre-blend instead."""
    return (round(c[0] * a + bg[0] * (1 - a)), round(c[1] * a + bg[1] * (1 - a)), round(c[2] * a + bg[2] * (1 - a)), 255)


def draw_layers(d: ImageDraw.ImageDraw, top: int, highlight: int, panel_x: int, panel_w: int,
                bg: tuple[int, int, int] = (10, 12, 18), scale: float = 1.0):
    f1, f2, f3 = font(int(30 * scale)), font(int(20 * scale)), font(int(18 * scale))
    bw, bh, gap = int(300 * scale), int(190 * scale), int(80 * scale)
    total_w = bw * 3 + gap * 2
    x = panel_x + (panel_w - total_w) // 2
    white = (255, 255, 255)
    for i, (name, route, desc, col) in enumerate(LAYERS):
        hot = highlight in (i, 4) or highlight == -1
        k = 1.0 if hot else 0.35
        d.rounded_rectangle([x, top, x + bw, top + bh], radius=14, fill=mix(col, bg, 0.20 if hot else 0.07),
                            outline=mix(col, bg, k), width=3)
        d.text((x + 20, top + 18), name, font=f1, fill=mix(white, bg, k))
        d.text((x + 20, top + 18 + int(40 * scale)), route, font=f3, fill=mix(col, bg, k))
        d.multiline_text((x + 20, top + 18 + int(74 * scale)), desc, font=f2, fill=mix((230, 230, 235), bg, k), spacing=8)
        if i < 2:
            ax0, ax1, ay = x + bw + 10, x + bw + gap - 10, top + bh // 2
            ak = 1.0 if highlight in (4, -1, i, i + 1) else 0.35
            d.line([ax0, ay, ax1, ay], fill=mix(white, bg, ak), width=3)
            d.polygon([(ax1, ay), (ax1 - 14, ay - 8), (ax1 - 14, ay + 8)], fill=mix(white, bg, ak))
            d.text((ax0 + 2, ay - int(34 * scale)), "建议 id", font=f3, fill=mix(white, bg, ak))
            d.text((ax0 - 6, ay + 10), "单向 →", font=f3, fill=mix(white, bg, ak))
        x += bw + gap


def boundary_png(highlight: int, out: Path):
    """highlight: -1 all, 0/1/2 one layer, 4 arrows."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pw, ph = 1220, 420
    px, py = (W - pw) // 2, 150
    d.rounded_rectangle([px, py, px + pw, py + ph], radius=18, fill=(10, 12, 18, 225), outline=(60, 64, 76, 255), width=2)
    f0 = font(26)
    d.text((px + 32, py + 24), "三层边界 · 层间只以建议 id 单向连接，实盘永远不改写建议与评分", font=f0, fill=(250, 250, 250, 255))
    draw_layers(d, py + 110, highlight, px, pw, bg=(10, 12, 18))
    img.save(out)


def outro_png(out: Path):
    img = Image.new("RGBA", (W, H), (8, 10, 16, 255))
    d = ImageDraw.Draw(img)
    t1 = font(54)
    name_w = t1.getlength("osbornalpha")
    d.text(((W - name_w) / 2, 110), "osborn", font=t1, fill=(250, 250, 250, 255))
    d.text(((W - name_w) / 2 + t1.getlength("osborn"), 110), "alpha", font=t1, fill=(245, 166, 35, 255))
    draw_layers(d, 240, -1, 0, W, bg=(8, 10, 16))
    t2, t3 = font(28), font(20)
    s = "给信号、给视角、给可追溯的判断 — 不替你下单"
    d.text(((W - t2.getlength(s)) / 2, 520), s, font=t2, fill=(230, 230, 235, 255))
    s3 = "所有内容由 AI 与规则生成，仅作决策辅助，不构成投资建议 · osbornalpha.com"
    d.text(((W - t3.getlength(s3)) / 2, 600), s3, font=t3, fill=(150, 155, 165, 255))
    img.save(out)


# ---------------------------------------------------------------- assembly

def compose_scene(sid: str, index: int, count: int, info: dict) -> Path:
    SUBS.mkdir(parents=True, exist_ok=True)
    SCENES.mkdir(parents=True, exist_ok=True)
    total = info["total"]
    out = SCENES / f"{sid}.mp4"
    overlays: list[tuple[Path, float, float]] = []  # (png, start, end)

    chapter = SUBS / f"{sid}-chapter.png"
    chapter_png(info["title"], index, count, chapter)
    if sid != "s14_outro":
        overlays.append((chapter, 0, 10_000))
    if sid == "s01_intro":
        card = SUBS / "title-card.png"
        title_card_png(card)
        overlays.append((card, 0, 4.2))
    if sid == "s06_boundary":
        cues = info["cues"]
        plan = [(-1, 0, cues[1]["start"]), (0, cues[1]["start"], cues[2]["start"]), (1, cues[2]["start"], cues[3]["start"]),
                (2, cues[3]["start"], cues[4]["start"]), (4, cues[4]["start"], total)]
        for hl, a, b in plan:
            p = SUBS / f"boundary-{hl + 1}.png"
            boundary_png(hl, p)
            overlays.append((p, a, b))
    for i, cue in enumerate(info["cues"]):
        p = SUBS / f"{sid}-{i:02d}.png"
        subtitle_png(cue["text"], p)
        overlays.append((p, cue["start"], cue["end"] + 0.25))

    if sid == "s14_outro":
        card = SUBS / "outro.png"
        outro_png(card)
        src = ["-loop", "1", "-framerate", str(FPS), "-t", f"{total:.3f}", "-i", str(card)]
        vid_len = total
    else:
        raw = RAW / f"{sid}.webm"
        if not raw.exists():
            raise SystemExit(f"missing recording {raw} — run record.ts first")
        src = ["-i", str(raw)]
        vid_len = duration(raw)

    pad = max(0.0, total - vid_len)
    out_len = max(total, vid_len)  # never cut a recorded action short; the audio is padded with silence
    chain = [f"[0:v]scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps={FPS},"
             f"tpad=stop_mode=clone:stop_duration={pad + 1:.3f},format=rgba[v0]"]
    inputs = list(src)
    for n, (png, a, b) in enumerate(overlays, start=1):
        inputs += ["-i", str(png)]
        chain.append(f"[v{n - 1}][{n}:v]overlay=0:0:enable='between(t,{a:.3f},{b:.3f})'[v{n}]")
    last = f"[v{len(overlays)}]"
    chain.append(f"{last}format=yuv420p[vout]")
    inputs += ["-i", str(AUDIO / f"{sid}.wav")]
    aidx = len(overlays) + 1
    chain.append(f"[{aidx}:a]apad[aout]")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(chain),
           "-map", "[vout]", "-map", "[aout]", "-t", f"{out_len:.3f}", "-r", str(FPS),
           "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
           "-movflags", "+faststart", str(out)]
    run(cmd)
    print(f"[build] {sid}: video {vid_len:.1f}s, narration {total:.1f}s, out {out_len:.1f}s → {out.name}")
    return out


def concat(parts: list[Path]) -> None:
    lst = BUILD / "concat.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", "-movflags", "+faststart", str(FINAL)])
    size = FINAL.stat().st_size / 1e6
    print(f"[build] {FINAL.name}: {duration(FINAL)/60:.2f} min, {size:.1f} MB")
    if size > 100:
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(FINAL), "-vf", "scale=1280:720", "-c:v", "libx264", "-preset", "medium", "-crf", "24",
             "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(FINAL_720)])
        print(f"[build] {FINAL_720.name}: {FINAL_720.stat().st_size/1e6:.1f} MB")
    elif FINAL_720.exists():
        FINAL_720.unlink()


def main(argv: list[str]) -> None:
    spec = json.loads((REC / "narration.json").read_text())
    BUILD.mkdir(exist_ok=True)
    timing = build_timing(spec)
    if "--timing-only" in argv:
        return
    only = [a for a in argv if not a.startswith("--")]
    ids = [s["id"] for s in spec["scenes"]]
    parts = []
    for i, sid in enumerate(ids, start=1):
        if only and not any(sid.startswith(o) for o in only):
            continue
        parts.append(compose_scene(sid, i, len(ids), timing["scenes"][sid]))
    if not only:
        concat(parts)


if __name__ == "__main__":
    main(sys.argv[1:])
