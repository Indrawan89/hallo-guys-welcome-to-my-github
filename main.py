#!/usr/bin/env python3
"""Sum up 21 November 2026's world news in one image.

Writes /output/entry.png (1024x1024 PNG, < 1 MiB). Deterministic:
no network, no clock, no randomness -- two runs produce identical bytes.
Only dependency: Pillow. Fonts: DejaVu (bundled with most Linux systems).

Headlines verified 21 Nov 2026 via browser search against several
independent aggregators (OneTurn, Horizon, The Daily Edition,
michaelbrunger.com daily brief citing BBC/Reuters/FT/Guardian/Al Jazeera).
See PROGRESS.md for the source list.
"""
import os
import textwrap
from PIL import Image, ImageDraw, ImageFont

W, H = 1024, 1024
OUT = os.environ.get("ENTRY_OUTPUT", "/output/entry.png")

NAVY = (15, 35, 64)
NAVY2 = (24, 52, 92)
RED = (178, 34, 34)
RED_DK = (140, 22, 22)
INK = (18, 18, 18)
GREY = (90, 96, 104)
LIGHT = (242, 240, 235)
CARD = (255, 255, 255)
LINE = (205, 200, 190)
GOLD = (201, 162, 39)
GREEN = (31, 122, 60)

FONT_DIR = "/usr/share/fonts/truetype/dejavu"


def font(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)


SERIF_B = lambda s: font("DejaVuSerif-Bold.ttf", s)
SERIF = lambda s: font("DejaVuSerif.ttf", s)
SANS_B = lambda s: font("DejaVuSans-Bold.ttf", s)
SANS = lambda s: font("DejaVuSans.ttf", s)


def wrap(draw, text, fnt, width):
    """Greedy word wrap to pixel width."""
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if draw.textlength(trial, font=fnt) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def draw_wrapped(draw, xy, text, fnt, width, fill, leading=None):
    x, y = xy
    leading = leading or int(fnt.size * 1.28)
    for line in wrap(draw, text, fnt, width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += leading
    return y


def kicker(draw, x, y, text, color=RED):
    draw.text((x, y), text, font=SANS_B(15), fill=color)
    return y + 22


def card(draw, x, y, w, h, fill=CARD):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=10, fill=fill,
                           outline=LINE, width=1)
    return x + 22, y + 16


def story(draw, x, y, w, h, tag, headline, deck, accent=RED):
    cx, cy = card(draw, x, y, w, h)
    draw.rectangle([x, y, x + 6, y + h], fill=accent)
    cy = kicker(draw, cx, cy, tag, color=accent)
    cy = draw_wrapped(draw, (cx, cy), headline, SANS_B(21), w - 52, INK,
                      leading=26)
    draw_wrapped(draw, (cx, cy + 6), deck, SANS(16), w - 52, (60, 60, 60),
                 leading=21)


def main():
    img = Image.new("RGB", (W, H), LIGHT)
    d = ImageDraw.Draw(img)

    # ---- Masthead -------------------------------------------------
    d.rectangle([0, 0, W, 148], fill=NAVY)
    d.rectangle([0, 148, W, 154], fill=GOLD)
    d.text((36, 22), "THE WORLD TODAY", font=SERIF_B(58), fill=(255, 255, 255))
    d.text((36, 100), "SATURDAY  21  NOVEMBER  2026",
           font=SANS_B(22), fill=GOLD)
    d.text((36, 128), "The day's world news — in one image",
           font=SANS(15), fill=(190, 200, 215))
    d.text((W - 36, 100), "SATURDAY EDITION  •  ONE PAGE",
           font=SANS_B(15), fill=(190, 200, 215), anchor="ra")
    d.text((W - 36, 128), "5,624 entries  •  $100 prize",
           font=SANS(14), fill=(150, 165, 185), anchor="ra")

    # ---- Lead story ----------------------------------------------
    lx, ly, lw, lh = 36, 172, 952, 236
    d.rounded_rectangle([lx, ly, lx + lw, ly + lh], radius=10, fill=CARD,
                        outline=LINE, width=1)
    d.rectangle([lx, ly, lx + lw, ly + 6], fill=RED)
    tx, ty = lx + 24, ly + 20
    ty = kicker(d, tx, ty, "WAR IN EUROPE  —  LEAD STORY")
    ty = draw_wrapped(d, (tx, ty), "Russia's biggest strikes of the year hit Ukraine — missiles land in Poland",
                      SERIF_B(33), 590, INK, leading=40)
    ty = draw_wrapped(d, (tx, ty + 8),
                      "More than 400 drones and 110 missiles fired overnight; at least 8 killed in Kyiv. "
                      "Warsaw says two missiles and a suspected drone came down on its soil — PM Tusk calls it "
                      "a deliberate provocation.",
                      SANS(17), 590, (55, 55, 55), leading=23)
    # stat chips
    chips = [("400+", "drones"), ("110", "missiles"), ("8", "killed in Kyiv")]
    cx = tx
    for num, lab in chips:
        wch = 118
        d.rounded_rectangle([cx, ty + 12, cx + wch, ty + 52], radius=8,
                            fill=(247, 232, 232), outline=(220, 180, 180))
        d.text((cx + wch / 2, ty + 17), num, font=SANS_B(19), fill=RED_DK,
               anchor="ma")
        d.text((cx + wch / 2, ty + 38), lab, font=SANS(11), fill=(90, 40, 40),
               anchor="ma")
        cx += wch + 12

    # schematic map panel (right of lead)
    mx, my, mw, mh = lx + 640, ly + 20, 288, 196
    d.rounded_rectangle([mx, my, mx + mw, my + mh], radius=8, fill=NAVY2)
    d.text((mx + 14, my + 10), "KYIV  →  WARSAW", font=SANS_B(14),
           fill=(255, 255, 255))
    # crude Europe coastline suggestion: dots for cities
    d.ellipse([mx + 180, my + 78, mx + 196, my + 94], fill=GOLD)   # Kyiv
    d.text((mx + 214, my + 66), "KYIV", font=SANS_B(13), fill=(255, 255, 255))
    d.ellipse([mx + 78, my + 58, mx + 94, my + 74], fill=(255, 255, 255))  # Warsaw
    d.text((mx + 30, my + 78), "WARSAW", font=SANS_B(13), fill=(255, 255, 255))
    # missile path + burst
    d.line([(mx + 96, my + 66), (mx + 178, my + 84)], fill=GOLD, width=3)
    for ang in range(0, 360, 45):
        import math
        x2 = mx + 188 + int(16 * math.cos(math.radians(ang)))
        y2 = my + 86 + int(16 * math.sin(math.radians(ang)))
        d.line([(mx + 188, my + 86), (x2, y2)], fill=(255, 120, 90), width=3)
    d.ellipse([mx + 182, my + 80, mx + 194, my + 92], fill=(255, 80, 60))
    d.text((mx + 14, my + 150), "Strikes damaged bridges and railways",
           font=SANS(13), fill=(200, 210, 225))
    d.text((mx + 14, my + 170), "in the capital; ~20 wounded in Kryvyi Rih.",
           font=SANS(13), fill=(200, 210, 225))

    # ---- Markets strip -------------------------------------------
    mx0, my0, mw0, mh0 = 36, 424, 952, 100
    d.rounded_rectangle([mx0, my0, mx0 + mw0, my0 + mh0], radius=10,
                        fill=(20, 20, 20))
    d.text((mx0 + 22, my0 + 12), "MARKETS IN FREEFALL — THE AI ROUT",
           font=SANS_B(15), fill=(255, 120, 100))
    d.text((mx0 + 22, my0 + 36),
           "S&P 500 into correction as the AI sell-off wipes out the Nasdaq's 2026 gains.",
           font=SANS(15), fill=(225, 225, 225))
    d.text((mx0 + 22, my0 + 56),
           "Nvidia falls ~14% as the SEC probes its accounting.",
           font=SANS(15), fill=(225, 225, 225))
    tickers = [("S&P 500", "-3.70%"), ("NASDAQ", "-5.28%"),
               ("NIKKEI", "-5.06%"), ("GOLD", "-4.62%"), ("BRENT", "$89.95")]
    tx = mx0 + 22
    for name, val in tickers:
        d.text((tx, my0 + 80), name, font=SANS_B(12), fill=(160, 160, 160))
        d.text((tx + 72, my0 + 80), val, font=SANS_B(13), fill=(255, 90, 80))
        tx += 168
    # mini falling bars, right end (clear of the text)
    bars = [26, 22, 18, 14, 10]
    bx = mx0 + mw0 - 128
    for i, bh in enumerate(bars):
        d.rectangle([bx + i * 24, my0 + 58 - bh, bx + i * 24 + 16, my0 + 58],
                    fill=(255, 90, 80))

    # ---- Story grid: 2 cols x 2 rows ------------------------------
    grid = [
        ("JUSTICE  •  THE HAGUE",
         "World court: Myanmar guilty of Rohingya genocide",
         "The International Court of Justice finds Myanmar responsible for genocide against the Rohingya.",
         RED),
        ("CLIMATE  •  COP31, ANTALYA",
         "Climate talks run past deadline in fossil-fuel deadlock",
         "Nearly 200 nations fail to agree in Antalya; the summit is extended into overtime.",
         GREEN),
        ("EUROPE  •  BRUSSELS",
         "UK and EU sign biggest post-Brexit deals yet",
         "Three agreements on food exports, carbon markets and youth mobility for 100,000 young Britons.",
         NAVY2),
        ("MIDDLE EAST  •  RIYADH",
         "Coalition intercepts three Houthi missiles over Riyadh",
         "Third night running of attacks on the Saudi capital; ports and a power station threatened.",
         RED),
    ]
    gx, gy = 36, 540
    cw, ch, gap = 468, 132, 16
    for i, (tag, head, deck, acc) in enumerate(grid):
        x = gx + (i % 2) * (cw + gap)
        y = gy + (i // 2) * (ch + gap)
        story(d, x, y, cw, ch, tag, head, deck, accent=acc)

    # ---- In brief --------------------------------------------------
    bx0, by0, bw0, bh0 = 36, 828, 952, 150
    d.rounded_rectangle([bx0, by0, bx0 + bw0, by0 + bh0], radius=10,
                        fill=(235, 233, 226), outline=LINE)
    d.text((bx0 + 18, by0 + 12), "IN BRIEF", font=SANS_B(15), fill=RED)
    briefs = [
        "M6.9 earthquake shakes the Peruvian Andes.",
        "FBI and US farm department hit by cyberattacks.",
        "Cancer pill makes tumours undetectable in 1 in 12 patients in trial.",
        "Gen Z protests spread across 25 European countries.",
        "Bayer to pay $7.25bn to settle Roundup complaints.",
        "GTA VI sets record: $3.8bn in first-day sales.",
    ]
    col_w = (bw0 - 36) // 2
    for i, b in enumerate(briefs):
        col = i // 3
        row = i % 3
        bx = bx0 + 18 + col * col_w
        by = by0 + 40 + row * 36
        draw_wrapped(d, (bx + 14, by), b, SANS(14), col_w - 30, (50, 50, 50),
                     leading=18)
        d.text((bx, by), "•", font=SANS_B(14), fill=RED)

    # ---- Footer ----------------------------------------------------
    d.text((36, 996),
           "Sources: OneTurn • Horizon • BBC • Reuters • FT • Guardian • Al Jazeera  —  all dated 21 Nov 2026",
           font=SANS(12), fill=GREY)
    d.text((W - 36, 996), "THE WORLD TODAY", font=SANS_B(12), fill=GREY,
           anchor="ra")

    out_dir = os.path.dirname(OUT)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    img.save(OUT, format="PNG", optimize=True)
    print(f"Wrote {OUT} ({W}x{H})")


if __name__ == "__main__":
    main()
