#!/usr/bin/env python3
"""The World in One Day -- poster generator for make.fun news-image-20261120.

Pure standard library (os, sys, struct, zlib only). No network, no random,
no clock: two runs produce byte-identical PNG output.

Draws a 1024x1024 newspaper-style poster summing up world news of
Friday, 20 November 2026, with a hand-made 5x7 bitmap font, simple
drawing primitives, and a hand-rolled PNG encoder (IHDR + IDAT + IEND).

Output: os.environ['MAKEFUN_OUTPUT_DIR'] (default '/output') + '/entry.png'
"""

import os
import struct
import zlib

W = 1024
H = 1024

# ---------------------------------------------------------------- palette
PAPER = (246, 241, 227)   # off-white newsprint
NAVY = (10, 42, 94)
GOLD = (201, 162, 39)
WHITE = (255, 255, 255)
BLACK = (20, 20, 20)
RED = (178, 34, 34)
DARKRED = (139, 0, 0)
BLUE = (31, 78, 160)
LIGHTGREY = (230, 226, 214)
TEAL = (0, 110, 110)
GREEN = (34, 120, 60)
ORANGE = (200, 90, 0)
PURPLE = (90, 50, 140)

# ---------------------------------------------------------------- 5x7 font
# Each glyph: 7 rows of 5 bits ('1' = ink). Classic 5x7 pixel font,
# drawn by hand for this poster. Only uppercase is needed: text is
# normalised to upper case before drawing.
FONT = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01110", "10001", "10000", "10000", "10000", "10001", "01110"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01110", "10001", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("01110", "00100", "00100", "00100", "00100", "00100", "01110"),
    "J": ("00111", "00010", "00010", "00010", "00010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "11011", "10001"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00110", "01000", "10000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
    "6": ("01110", "10000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00001", "01110"),
    " ": ("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "01100", "01100"),
    ",": ("00000", "00000", "00000", "00000", "01100", "00100", "01000"),
    ":": ("00000", "01100", "01100", "00000", "01100", "01100", "00000"),
    ";": ("00000", "01100", "01100", "00000", "01100", "00100", "01000"),
    "'": ("00100", "00100", "01000", "00000", "00000", "00000", "00000"),
    '"': ("01010", "01010", "00000", "00000", "00000", "00000", "00000"),
    "-": ("00000", "00000", "00000", "01110", "00000", "00000", "00000"),
    "&": ("01100", "10010", "10100", "01000", "10101", "10010", "01101"),
    "(": ("00010", "00100", "01000", "01000", "01000", "00100", "00010"),
    ")": ("01000", "00100", "00010", "00010", "00010", "00100", "01000"),
    "/": ("00001", "00010", "00010", "00100", "01000", "01000", "10000"),
    "%": ("11001", "11010", "00010", "00100", "01000", "01011", "10011"),
    "+": ("00000", "00100", "00100", "11111", "00100", "00100", "00000"),
    "$": ("00100", "01111", "10100", "01110", "00101", "11110", "00100"),
    "!": ("00100", "00100", "00100", "00100", "00100", "00000", "00100"),
    "?": ("01110", "10001", "00001", "00110", "00100", "00000", "00100"),
    "=": ("00000", "00000", "11111", "00000", "11111", "00000", "00000"),
    "*": ("00000", "10101", "01110", "11111", "01110", "10101", "00000"),
    "[": ("01110", "01000", "01000", "01000", "01000", "01000", "01110"),
    "]": ("01110", "00010", "00010", "00010", "00010", "00010", "01110"),
    "_": ("00000", "00000", "00000", "00000", "00000", "00000", "11111"),
    "<": ("00010", "00100", "01000", "10000", "01000", "00100", "00010"),
    ">": ("01000", "00100", "00010", "00001", "00010", "00100", "01000"),
    "#": ("01010", "01010", "11111", "01010", "11111", "01010", "01010"),
    "@": ("01110", "10001", "10111", "10101", "10110", "10000", "01110"),
    "^": ("00100", "01010", "10001", "00000", "00000", "00000", "00000"),
    "~": ("00000", "00000", "01001", "10110", "00000", "00000", "00000"),
    "`": ("01000", "00100", "00000", "00000", "00000", "00000", "00000"),
    "|": ("00100", "00100", "00100", "00100", "00100", "00100", "00100"),
    "\\": ("10000", "01000", "01000", "00100", "00010", "00010", "00001"),
    "{": ("00110", "00100", "00100", "01100", "00100", "00100", "00110"),
    "}": ("01100", "00100", "00100", "00110", "00100", "00100", "01100"),
}

# Characters that have no glyph of their own map to one that does.
ALIASES = {
    "\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"',
    "\u2013": "-", "\u2014": "-", "\u2022": "-", "\u00b7": "-",
    "\u00d7": "X", "\u00e9": "E",
}


def normalise(text):
    """Upper-case text and fold fancy punctuation onto plain glyphs."""
    out = []
    for ch in text:
        ch = ALIASES.get(ch, ch)
        out.append(ch.upper())
    return "".join(out)


# ------------------------------------------------------------------- canvas
class Canvas:
    def __init__(self, w, h, bg):
        self.w = w
        self.h = h
        self.px = bytearray(bg * (w * h))

    def rect(self, x, y, w, h, color):
        x0 = max(0, x)
        y0 = max(0, y)
        x1 = min(self.w, x + w)
        y1 = min(self.h, y + h)
        r, g, b = color
        for yy in range(y0, y1):
            base = (yy * self.w + x0) * 3
            for xx in range(x0, x1):
                i = base + (xx - x0) * 3
                self.px[i] = r
                self.px[i + 1] = g
                self.px[i + 2] = b

    def text(self, x, y, s, scale, color):
        """Draw string s with its top-left corner at (x, y)."""
        s = normalise(s)
        cx = x
        for ch in s:
            glyph = FONT.get(ch, FONT["?"])
            for row in range(7):
                bits = glyph[row]
                for col in range(5):
                    if bits[col] == "1":
                        self.rect(cx + col * scale, y + row * scale,
                                  scale, scale, color)
            cx += 6 * scale
        return cx

    def text_width(self, s, scale):
        return len(normalise(s)) * 6 * scale - scale

    def centred(self, y, s, scale, color):
        x = (self.w - self.text_width(s, scale)) // 2
        self.text(x, y, s, scale, color)


def wrap(s, scale, max_w):
    """Greedy word wrap; returns a list of lines fitting max_w pixels."""
    s = normalise(s)
    words = s.split(" ")
    lines = []
    cur = ""
    for word in words:
        trial = word if not cur else cur + " " + word
        if (len(trial) * 6 - 1) * scale <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


# -------------------------------------------------------------------- flags
def flag_usa(c, x, y, w, h):
    stripe = h // 13
    for i in range(13):
        c.rect(x, y + i * stripe, w, stripe, RED if i % 2 == 0 else WHITE)
    cw = int(w * 0.4)
    ch = stripe * 7
    c.rect(x, y, cw, ch, NAVY)
    for r in range(5):
        for col in range(6):
            sx = x + 6 + col * 11
            sy = y + 3 + r * 5
            c.rect(sx, sy, 2, 2, WHITE)


def flag_china(c, x, y, w, h):
    c.rect(x, y, w, h, RED)
    # One large star (plus-shaped pixel star) and four small stars.
    cx, cy = x + 16, y + 16
    c.rect(cx - 2, cy - 8, 4, 16, GOLD)
    c.rect(cx - 8, cy - 2, 16, 4, GOLD)
    c.rect(cx - 5, cy - 5, 10, 10, GOLD)
    for sx, sy in ((x + 38, y + 8), (x + 48, y + 16),
                   (x + 48, y + 28), (x + 38, y + 36)):
        c.rect(sx - 2, sy - 2, 4, 4, GOLD)


def flag_russia(c, x, y, w, h):
    third = h // 3
    c.rect(x, y, w, third, WHITE)
    c.rect(x, y + third, w, third, BLUE)
    c.rect(x, y + 2 * third, w, h - 2 * third, RED)
    c.rect(x, y, w, 1, BLACK)
    c.rect(x, y + h - 1, w, 1, BLACK)


# ------------------------------------------------------------------ poster
def draw_poster():
    c = Canvas(W, H, PAPER)

    # --- masthead ------------------------------------------------------
    c.rect(0, 0, W, 150, NAVY)
    c.centred(26, "THE WORLD IN ONE DAY", 7, WHITE)
    c.centred(96, "FRIDAY, 20 NOVEMBER 2026", 3, GOLD)
    c.rect(0, 150, W, 6, GOLD)

    # --- hero panel: Shenzhen peace pledge ------------------------------
    hx, hy, hw, hh = 24, 170, 976, 278
    c.rect(hx, hy, hw, hh, WHITE)
    c.rect(hx, hy, hw, 3, NAVY)
    c.rect(hx, hy + hh - 3, hw, 3, NAVY)
    c.rect(hx, hy, 3, hh, NAVY)
    c.rect(hx + hw - 3, hy, 3, hh, NAVY)
    c.text(hx + 20, hy + 16, "SHENZHEN SUMMIT", 3, RED)
    c.text(hx + 20, hy + 52, "TRUMP, XI & PUTIN SIGN", 5, NAVY)
    c.text(hx + 20, hy + 96, "JOINT PEACE PLEDGE", 5, NAVY)
    deck = ("SHENZHEN SUMMIT: 'NUCLEAR WAR MUST NEVER BE FOUGHT' - "
            "NO BINDING ARMS CUTS, NO UKRAINE OR IRAN DEAL")
    dy = hy + 148
    for line in wrap(deck, 3, hw - 40):
        c.text(hx + 20, dy, line, 3, BLACK)
        dy += 26
    # Three hand-drawn flags with labels.
    fy = hy + hh - 64
    fw, fh = 170, 52
    flags = ((flag_usa, "USA"), (flag_china, "CHINA"), (flag_russia, "RUSSIA"))
    for i, (fn, label) in enumerate(flags):
        fx = hx + 20 + i * 322
        fn(c, fx, fy, fw, fh)
        c.rect(fx, fy, fw, 1, BLACK)
        c.rect(fx, fy + fh - 1, fw, 1, BLACK)
        c.rect(fx, fy, 1, fh, BLACK)
        c.rect(fx + fw - 1, fy, 1, fh, BLACK)
        c.text(fx + fw + 12, fy + 18, label, 2, NAVY)

    # --- news grid: 2 columns x 3 rows ----------------------------------
    cells = [
        ("WORLD COURT", RED,
         "ICJ: MYANMAR GUILTY OF GENOCIDE",
         "REPARATIONS ORDERED; 1M+ ROHINGYA STILL DISPLACED"),
        ("WAR IN UKRAINE", DARKRED,
         "RUSSIA'S MASS BARRAGE HITS KYIV",
         "400+ DRONES, 110 MISSILES; POWER GRID HIT; "
         "2 MISSILES LAND IN POLAND"),
        ("BUSINESS", TEAL,
         "ANTHROPIC'S $81BN RECORD IPO",
         "BIGGEST IPO EVER, PASSING SPACEX; SHARES OPEN "
         "33% ABOVE OFFER PRICE"),
        ("TECH", BLUE,
         "MICROSOFT OUTAGE GOES GLOBAL",
         "MICROSOFT 365 DOWN 9+ HOURS; OUTLOOK & TEAMS HIT"),
        ("HAITI", ORANGE,
         "HAITI: 34 KILLED IN GANG CRACKDOWN",
         "NATIONAL POLICE REPORT"),
        ("WEATHER", PURPLE,
         "CYCLONE AKVAN HITS INDIA",
         "LANDFALL ON EAST COAST AFTER EVACUATIONS"),
    ]
    cw, chh, gx, gy = 480, 136, 16, 14
    for idx, (kicker, kcolor, head, deck) in enumerate(cells):
        col, row = idx % 2, idx // 2
        x = 24 + col * (cw + gx)
        y = 464 + row * (chh + gy)
        c.rect(x, y, cw, chh, WHITE)
        c.rect(x, y, cw, 8, kcolor)
        c.rect(x, y, cw, 1, LIGHTGREY)
        c.rect(x, y + chh - 1, cw, 1, LIGHTGREY)
        c.rect(x, y, 1, chh, LIGHTGREY)
        c.rect(x + cw - 1, y, 1, chh, LIGHTGREY)
        c.text(x + 16, y + 18, kicker, 2, kcolor)
        lines = wrap(head, 3, cw - 32)
        hyy = y + 40
        for line in lines:
            c.text(x + 16, hyy, line, 3, NAVY)
            hyy += 25
        dyy = hyy + 6
        for line in wrap(deck, 2, cw - 32):
            c.text(x + 16, dyy, line, 2, BLACK)
            dyy += 17

    # --- footer ---------------------------------------------------------
    c.rect(0, 916, W, H - 916, NAVY)
    c.rect(0, 910, W, 6, GOLD)
    also = ("ALSO: EU-UK SUMMIT IN BRUSSELS; GERMANY REJECTS A NEW "
            "'YALTA' DEAL; US CYBER CHIEF SEAN CAIRNCROSS RESIGNS; "
            "TAIWAN FLAGS 2,700 ACCOUNTS")
    fy = 930
    for line in wrap(also, 2, W - 48):
        c.text(24, fy, line, 2, WHITE)
        fy += 20
    src = ("SOURCES: OPEN CHRONICLE, INFORMEDCLEARLY, KLZ RADIO, "
           "MEANWHILE IN UKRAINE - 20 NOV 2026")
    for line in wrap(src, 2, W - 48):
        c.text(24, fy + 4, line, 2, GOLD)
        fy += 20
    return c


# ------------------------------------------------------------- PNG encoder
def png_chunk(ctype, data):
    chunk = ctype + data
    return struct.pack(">I", len(data)) + chunk + struct.pack(
        ">I", zlib.crc32(chunk) & 0xFFFFFFFF)


def encode_png(c):
    raw = bytearray()
    row_bytes = c.w * 3
    for y in range(c.h):
        raw.append(0)  # filter: none
        start = y * row_bytes
        raw += c.px[start:start + row_bytes]
    ihdr = struct.pack(">IIBBBBB", c.w, c.h, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n"
            + png_chunk(b"IHDR", ihdr)
            + png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + png_chunk(b"IEND", b""))


def main():
    out_dir = os.environ.get("MAKEFUN_OUTPUT_DIR", "/output")
    os.makedirs(out_dir, exist_ok=True)
    data = encode_png(draw_poster())
    with open(os.path.join(out_dir, "entry.png"), "wb") as f:
        f.write(data)


if __name__ == "__main__":
    main()
