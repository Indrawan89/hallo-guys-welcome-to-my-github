#!/usr/bin/env python3
"""Build the 1024x1024 news poster for 20 November 2026.

Run locally (needs Pillow + DejaVu fonts, present on this machine):
    python3 build_image.py            # writes entry.png next to this file
The shipped entry program (main.py) is pure stdlib: it embeds the PNG
produced here as base64 and writes it to /output/entry.png, so it runs
in the make.fun sandbox (Python 3.13, stdlib only, no network).
"""
import textwrap
from PIL import Image, ImageDraw, ImageFont

W, H = 1024, 1024
PAPER = (248, 244, 236)
INK = (17, 24, 39)
NAVY = (20, 38, 63)
GOLD = (212, 175, 55)
RED = (185, 28, 28)
WHITE = (255, 255, 255)
MUTED = (75, 85, 99)
CARD = (255, 255, 255)
LINE = (203, 213, 225)

SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SERIF_R = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANS_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def wrap(draw, text, fnt, max_w):
    """Greedy word wrap returning list of lines fitting max_w."""
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_wrapped(draw, x, y, text, fnt, max_w, fill, leading=None):
    if leading is None:
        leading = int(fnt.size * 1.22)
    lines = wrap(draw, text, fnt, max_w)
    for ln in lines:
        draw.text((x, y), ln, font=fnt, fill=fill)
        y += leading
    return y


def flag_usa(d, x, y, w, h):
    d.rectangle([x, y, x + w, y + h], fill=(178, 34, 52), outline=(17, 24, 39))
    for i in range(1, 7, 2):
        yy = y + i * h // 7
        d.rectangle([x, yy, x + w, yy + h // 7 - 1], fill=WHITE)
    d.rectangle([x, y, x + int(w * 0.42), y + int(h * 0.55)], fill=(30, 58, 138))
    for r in range(3):
        for c in range(4):
            cx = x + 8 + c * 14
            cy = y + 7 + r * 11
            d.ellipse([cx, cy, cx + 4, cy + 4], fill=WHITE)


def flag_chn(d, x, y, w, h):
    d.rectangle([x, y, x + w, y + h], fill=(222, 41, 16), outline=(17, 24, 39))
    d.text((x + 8, y + 4), "\u2605", font=font(SANS_B, 30), fill=(255, 222, 0))


def flag_rus(d, x, y, w, h):
    d.rectangle([x, y, x + w, y + h // 3], fill=WHITE, outline=(17, 24, 39))
    d.rectangle([x, y + h // 3, x + w, y + 2 * h // 3], fill=(0, 57, 166))
    d.rectangle([x, y + 2 * h // 3, x + w, y + h], fill=(213, 0, 50))


def main():
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    # ---- Masthead -------------------------------------------------
    d.rectangle([0, 0, W, 148], fill=NAVY)
    d.text((W // 2, 18), "THE WORLD IN ONE DAY", font=font(SERIF, 62),
           fill=WHITE, anchor="ma")
    d.rectangle([W // 2 - 330, 100, W // 2 + 330, 102], fill=GOLD)
    d.text((W // 2, 112), "FRIDAY, 20 NOVEMBER 2026  \u2022  WORLD NEWS IN ONE IMAGE",
           font=font(SANS_B, 23), fill=(232, 196, 106), anchor="ma")

    # ---- Hero: Shenzhen summit ------------------------------------
    hx, hy, hw, hh = 28, 164, 968, 246
    d.rectangle([hx, hy, hx + hw, hy + hh], fill=CARD, outline=LINE, width=2)
    d.rectangle([hx, hy, hx + 10, hy + hh], fill=RED)
    d.text((hx + 28, hy + 16), "SHENZHEN SUMMIT  \u2014  THE DAY'S BIGGEST STORY",
           font=font(SANS_B, 20), fill=RED)
    y = draw_wrapped(d, hx + 28, hy + 48,
                     "TRUMP, XI & PUTIN SIGN JOINT PEACE PLEDGE",
                     font(SERIF, 40), 640, INK, leading=48)
    draw_wrapped(d, hx + 28, y + 8,
                 "Leaders of the three largest nuclear powers declare "
                 "that \u201cnuclear war must never be fought\u201d "
                 "\u2014 but agree no binding arms cuts, and no deal "
                 "on Ukraine or Iran.",
                 font(SANS, 22), 640, MUTED, leading=28)
    # flags
    fx, fy, fw, fh = hx + 700, hy + 58, 84, 56
    flag_usa(d, fx, fy, fw, fh)
    flag_chn(d, fx + 96, fy, fw, fh)
    flag_rus(d, fx + 192, fy, fw, fh)
    for i, name in enumerate(["USA", "CHINA", "RUSSIA"]):
        d.text((fx + i * 96 + fw // 2, fy + fh + 6), name,
               font=font(SANS_B, 16), fill=INK, anchor="ma")
    d.text((fx + 138, fy + 108), "3 NUCLEAR POWERS",
           font=font(SANS_B, 19), fill=NAVY, anchor="ma")
    d.text((fx + 138, fy + 134), "1 JOINT DECLARATION",
           font=font(SANS_B, 19), fill=NAVY, anchor="ma")

    # ---- Grid of six stories --------------------------------------
    cards = [
        ("JUSTICE", (109, 40, 217), "ICJ: MYANMAR GUILTY OF GENOCIDE",
         "World court: Myanmar responsible for genocide in Rakhine, "
         "2017; reparations ordered.",
         "1M+ ROHINGYA DISPLACED"),
        ("WAR", RED, "RUSSIA'S MASS BARRAGE HITS KYIV",
         "400+ drones and 110 missiles strike bridges and the power grid; "
         "two missiles land in Poland.",
         "400+ DRONES, 110 MISSILES"),
        ("MARKETS", (21, 128, 61), "ANTHROPIC'S $81BN RECORD IPO",
         "Largest flotation ever tops SpaceX; shares open 33% above the "
         "offer price on Nasdaq.",
         "$81BN \u2014 LARGEST IPO EVER"),
        ("TECH", (29, 78, 216), "MICROSOFT OUTAGE GOES GLOBAL",
         "Microsoft 365 down 9+ hours; Outlook and Teams disrupted "
         "worldwide.",
         "9+ HOURS OFFLINE"),
        ("AMERICAS", (194, 65, 12), "HAITI: 34 KILLED IN GANG CRACKDOWN",
         "Police say 34 suspected gang members killed amid spiralling "
         "insecurity.",
         "34 KILLED"),
        ("ASIA", (15, 118, 110), "CYCLONE AKVAN HITS INDIA",
         "Storm makes landfall on India's east coast after evacuations; "
         "flooding and crop damage feared.",
         "LANDFALL \u2014 EAST COAST"),
    ]
    gx, gy = 28, 424
    cw, ch, gap = 304, 248, 14
    for i, (kicker, color, head, deck, stat) in enumerate(cards):
        cx = gx + (i % 3) * (cw + gap)
        cy = gy + (i // 3) * (ch + gap)
        d.rectangle([cx, cy, cx + cw, cy + ch], fill=CARD, outline=LINE, width=2)
        d.rectangle([cx, cy, cx + cw, cy + 8], fill=color)
        d.text((cx + 16, cy + 18), kicker, font=font(SANS_B, 17), fill=color)
        y = draw_wrapped(d, cx + 16, cy + 46, head, font(SERIF, 23),
                         cw - 32, INK, leading=28)
        y = draw_wrapped(d, cx + 16, y + 6, deck, font(SANS, 17),
                         cw - 32, MUTED, leading=22)
        d.text((cx + 16, cy + ch - 30), stat, font=font(SANS_B, 17), fill=color)

    # ---- Footer ----------------------------------------------------
    fy = 946
    d.rectangle([0, fy, W, H], fill=NAVY)
    y = draw_wrapped(d, 28, fy + 10,
                     "ALSO:  EU\u2013UK summit in Brussels  \u2022  Germany rejects a new \u201cYalta\u201d deal  \u2022  "
                     "US cyber chief steps down  \u2022  Taiwan flags 2,700 accounts",
                     font(SANS_B, 16), W - 56, (232, 196, 106), leading=21)
    d.text((28, y + 2),
           "Reported Friday 20 Nov 2026.  Sources: Open Chronicle \u2022 InformedClearly "
           "\u2022 KLZ Radio \u2022 IANS \u2022 Meanwhile in Ukraine",
           font=font(SANS, 15), fill=(203, 213, 225))

    img.save("entry.png", optimize=True)
    print("wrote entry.png", img.size)


if __name__ == "__main__":
    main()
