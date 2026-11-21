# Regenerates meme.png from assets/03-police-chase.jpg
# (a screenshot of SOLMAR BAY, our own GTA 6-style game).
# Requires Python 3 + Pillow, no network. Run: python3 build_meme.py
from PIL import Image, ImageDraw, ImageFont
import math
import os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "03-police-chase.jpg")
OUT = os.path.join(HERE, "meme.png")
W,H=1080,1080
BOLD="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
def font(sz): return ImageFont.truetype(BOLD,sz)
def tc(d,y,s,f,fill,stroke=4):
    d.text((W//2,y),s,font=f,fill=fill,anchor="ma",stroke_width=stroke,stroke_fill="black")
img=Image.new("RGB",(W,H),(12,10,18)); d=ImageDraw.Draw(img)
d.rectangle([0,0,W,132],fill=(0,0,0)); d.rectangle([0,132,W,140],fill=(255,0,110))
tc(d,18,"GTA 6 LAUNCH WEEK",font(64),(255,255,255))
photo=Image.open(SRC).convert("RGB").resize((1080,675),Image.LANCZOS)
img.paste(photo,(0,140)); d.rectangle([0,140,W,148],fill=(255,0,110))
d.rectangle([0,640,W,815],fill=(0,0,0))
tc(d,652,'ROCKSTAR: "GTA 6 IS COMING..."',font(46),(255,214,64))
tc(d,716,"ME, ALREADY WANTED:",font(46),(255,255,255))
d.rectangle([0,815,W,824],fill=(255,0,110))
# joke text, 3 lines, left of ghost-free zone
d.text((240,842),"MY AI AGENT BUILT",font=font(44),fill=(255,255,255),stroke_width=4,stroke_fill="black")
d.text((240,898),"ME A GTA 6 — AND",font=font(44),fill=(255,255,255),stroke_width=4,stroke_fill="black")
d.text((240,954),"GOT PAID FOR IT.",font=font(44),fill=(255,255,255),stroke_width=4,stroke_fill="black")

# --- ghost as ONE polygon silhouette (dome + scalloped hem) ---
g=Image.new("RGBA",(220,240),(0,0,0,0)); gd=ImageDraw.Draw(g)
cx, cy, rx, ry = 110, 100, 82, 92
pts=[]
for deg in range(180, -1, -6):  # dome, left -> right over the top
    a=math.radians(deg); pts.append((cx+rx*math.cos(a), cy-ry*math.sin(a)))
pts.append((cx+rx, 178))            # right side down
for ccx in (158, 105, 52):          # three scallops along the hem
    for deg in range(0, 181, 12):
        a=math.radians(deg); pts.append((ccx+26*math.cos(a), 178+26*math.sin(a)))
pts.append((cx-rx, 178))            # left side up (close)
gd.polygon(pts, fill="white", outline="black", width=5)
def sparkle(x,y,r):
    p=[]
    for k in range(8):
        a=math.pi/2+k*math.pi/4; rr=r if k%2==0 else r*0.35
        p.append((x+rr*math.cos(a), y+rr*math.sin(a)))
    gd.polygon(p, fill="black")
sparkle(82,100,14); sparkle(138,100,14)
gd.ellipse([176,128,200,152], fill="white", outline="black", width=4)  # little hand
img.paste(g,(14,830),g)
# magenta coin with white star, held low beside the hand
coin=Image.new("RGBA",(80,80),(0,0,0,0)); cd=ImageDraw.Draw(coin)
cd.ellipse([4,4,76,76],fill=(255,0,110),outline="white",width=5)
cx2,cy2,R,r=40,40,23,10; pts=[]
for k in range(10):
    a=-math.pi/2+k*math.pi/5; rr=R if k%2==0 else r
    pts.append((cx2+rr*math.cos(a), cy2+rr*math.sin(a)))
cd.polygon(pts,fill="white")
img.paste(coin,(150,972),coin)
# wordmark, bottom-right corner below the joke lines
d.text((1064,1072),"make.fun",font=font(46),fill=(255,255,255),anchor="rb",stroke_width=4,stroke_fill="black")
img.save(OUT,"PNG"); print("saved",OUT)
