# Upload draft — gta6-clipper-01 (DO NOT submit before uploading)

## Video to upload
`clip.mp4` — 1080×1920 vertical, 30 s, H.264, 4.6 MB, no audio. Four
6-second scenes cut from SOLMAR BAY (our own GTA 6-style game from the
gta6-01 entry: title screen, driving downtown, police chase, harbor heist),
each with a slow horizontal pan and on-screen hook text, then a 6-second
end card with make.fun's pitch. The footage is NOT Rockstar gameplay — the
clip says so on screen ("SO IT BUILT ITS OWN GTA 6 — SOLMAR BAY").

| t | Scene | On-screen text |
| --- | --- | --- |
| 0–6 s | Title screen | GTA 6 LAUNCH WEEK |
| 6–12 s | Driving downtown | EVERYONE IS WAITING FOR GTA 6... |
| 12–18 s | Police chase | MY AI AGENT GOT TIRED OF WAITING |
| 18–24 s | Harbor heist | SO IT BUILT ITS OWN GTA 6 — SOLMAR BAY |
| 24–30 s | End card | MAKE CLIPS LIKE THIS WITH AI AND EARN REAL MONEY ON make.fun — make.fun/bounty/gta6-clipper-01 |

## Title (copy exactly)

> My AI Agent Got Tired of Waiting for GTA 6 — So It Built Its Own

## Description (copy exactly — the first line is required word for word)

> Made by my AI agent for a $500 bounty on make.fun, where you can earn money making clips with AI: https://make.fun/bounty/gta6-clipper-01
>
> My AI agent got tired of waiting for GTA 6, so it built its own GTA 6-style game — SOLMAR BAY — and cut this clip from it. Make clips like this with AI and earn money on make.fun.
>
> Play code: makefun-wombat-cinnamon-cushion

Checklist against the rules (verified 21 Nov 2026):

- [x] Description carries the required line word for word (it contains
      `$500 bounty` and a make.fun link).
- [x] Description carries play code `makefun-wombat-cinnamon-cushion`
      (code 0 of 4 for this bounty, fetched via
      `GET /api/competitions/gta6-clipper-01/play-code?n=0`; the rules say
      the code is no secret). The other codes are
      `makefun-magnet-highland-cradle`, `makefun-hickory-atrium-barnyard`,
      `makefun-broom-maraca-seagull` — any one passes, and it may live in
      the channel description instead.
- [x] The clip itself carries make.fun's pitch on screen (end card, spoken
      by text): viewers are told they can make money on make.fun by making
      clips with AI, naming make.fun and the bounty page.
- [x] Vertical, 30 s — under a minute, so YouTube treats it as a Short.

## Tags (suggested)
GTA 6, GTA VI, Grand Theft Auto 6, SOLMAR BAY, make.fun, AI agent, gaming

## After uploading

1. Upload `clip.mp4` from the user's YouTube channel as a **public** video
   (a Short), between the opening (2026-11-20T01:00:00Z) and the deadline
   (**2026-11-23T01:00:00Z**).
2. Paste the title and description above exactly (the description can be
   edited later in YouTube Studio if anything is missing).
3. Copy the video's Share address, e.g.
   `https://www.youtube.com/shorts/<11-char id>`.
4. Replace the `url` in `VIDEO.json` with it, re-run
   `MAKEFUN_OUTPUT_DIR=out node main.ts`, and confirm `out/VIDEO.json`
   matches.
5. Keep the video public until the results are out.
6. Only then create the GitHub repo `Indrawan89/makefun-gta6-clipper-01`
   (repo must be created AFTER the competition opened) and submit via the
   kit CLI with the transcript bundle.
