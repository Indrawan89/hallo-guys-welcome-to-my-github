#!/bin/sh
# Rebuilds clip.mp4 from the screenshots in assets/ (SOLMAR BAY, our own
# GTA 6-style game). Requires ffmpeg 8 with libx264 and the DejaVu fonts.
# Run from this directory:  sh build_clip.sh
# Pass 1 cuts five 6-second vertical scenes (slow horizontal pan + fades)
# and concatenates them; pass 2 burns in the hook text and the make.fun
# end-card pitch. Deterministic for a fixed ffmpeg build; the shipped
# clip.mp4 was rendered with ffmpeg 8.1.2.
set -e
cd "$(dirname "$0")"
S=assets
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
ffmpeg -y -v error \
 -loop 1 -t 6 -i $S/01-cover-title.jpg \
 -loop 1 -t 6 -i $S/02-driving-downtown.jpg \
 -loop 1 -t 6 -i $S/03-police-chase.jpg \
 -loop 1 -t 6 -i $S/04-harbor-heat.jpg \
 -f lavfi -t 6 -i "color=c=0x0c0a12:s=1080x1920:r=30" \
 -filter_complex "\
[0:v]scale=3072:1920,crop=1080:1920:x='(3072-1080)*(t/6)':y=0,fade=t=in:st=0:d=0.5,fade=t=out:st=5.5:d=0.5,setsar=1[v0]; \
[1:v]scale=3072:1920,crop=1080:1920:x='(3072-1080)*(1-t/6)':y=0,fade=t=in:st=0:d=0.5,fade=t=out:st=5.5:d=0.5,setsar=1[v1]; \
[2:v]scale=3072:1920,crop=1080:1920:x='(3072-1080)*(t/6)':y=0,fade=t=in:st=0:d=0.5,fade=t=out:st=5.5:d=0.5,setsar=1[v2]; \
[3:v]scale=3072:1920,crop=1080:1920:x='(3072-1080)*(1-t/6)':y=0,fade=t=in:st=0:d=0.5,fade=t=out:st=5.5:d=0.5,setsar=1[v3]; \
[4:v]fade=t=in:st=0:d=0.5,setsar=1[v4]; \
[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0,format=yuv420p[vout]" \
 -map "[vout]" -c:v libx264 -crf 20 -preset medium -r 30 -movflags +faststart clip_raw.mp4
ffmpeg -y -v error -i clip_raw.mp4 -vf "\
drawtext=fontfile=$F:text='GTA 6 LAUNCH WEEK':fontsize=72:fontcolor=white:borderw=3:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=150:enable='between(t,0,6)',\
drawtext=fontfile=$F:text='EVERYONE IS WAITING':fontsize=64:fontcolor=white:borderw=3:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=150:enable='between(t,6,12)',\
drawtext=fontfile=$F:text='FOR GTA 6...':fontsize=64:fontcolor=white:borderw=3:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=240:enable='between(t,6,12)',\
drawtext=fontfile=$F:text='MY AI AGENT GOT':fontsize=64:fontcolor=white:borderw=3:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=150:enable='between(t,12,18)',\
drawtext=fontfile=$F:text='TIRED OF WAITING':fontsize=64:fontcolor=white:borderw=3:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=240:enable='between(t,12,18)',\
drawtext=fontfile=$F:text='SO IT BUILT ITS OWN':fontsize=64:fontcolor=white:borderw=3:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=150:enable='between(t,18,24)',\
drawtext=fontfile=$F:text='GTA 6 — SOLMAR BAY':fontsize=64:fontcolor=yellow:borderw=3:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=240:enable='between(t,18,24)',\
drawtext=fontfile=$F:text='MAKE CLIPS LIKE THIS':fontsize=66:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=620:enable='between(t,24,30)',\
drawtext=fontfile=$F:text='WITH AI AND EARN':fontsize=66:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=710:enable='between(t,24,30)',\
drawtext=fontfile=$F:text='REAL MONEY ON':fontsize=66:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=800:enable='between(t,24,30)',\
drawtext=fontfile=$F:text='make.fun':fontsize=110:fontcolor=0xFF006E:borderw=4:bordercolor=white:x=(w-text_w)/2:y=920:enable='between(t,24,30)',\
drawtext=fontfile=$F:text='make.fun/bounty/gta6-clipper-01':fontsize=34:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=1120:enable='between(t,24,30)'" \
 -c:v libx264 -crf 20 -preset medium -movflags +faststart clip.mp4
rm -f clip_raw.mp4
ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height,codec_name -of default=noprint_wrappers=1 clip.mp4
