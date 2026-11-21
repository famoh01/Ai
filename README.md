# Ai — AI Clip Maker

A fully client-side clone of an AI YouTube-to-Shorts clip maker (in the spirit of Ssemble), named **Ai**.
Paste a YouTube video or channel link → Ai scores the best moments, writes hooks, captions, hashtags and
covers, and lets you edit, export and schedule the clips.

## Run it

```bash
npm start          # serves on http://localhost:3000
```

No build step and no runtime dependencies — plain HTML/CSS/ES modules behind a tiny Node static server.

## What's inside

| Area | Details |
| --- | --- |
| Landing page | Marketing page with hero rotator, features, how-it-works, sources, automation, pricing |
| Auth | Sign in / sign up / Google / Apple (stored locally) + guest mode |
| Dashboard | Paste a YouTube video **or channel** URL, pick video type (General / Sports / Game), aspect, caption language, clip count, optional transcript |
| AI clipping | Scores moments, writes hook titles, descriptions, hashtags, virality score and synced caption lines |
| Results | Clip cards with virality ring, caption preview, SRT / cover export, multi-select scheduling |
| Editor | Real YouTube player, trim, face-tracking / game-mode toggles, caption list editor, 6 style presets, animations, positions, watermark |
| Exports | `.srt` captions, `.txt` package (hook/description/hashtags/timings), branded cover `.png`, and a real `.webm` preview rendered in-browser with canvas + MediaRecorder |
| Automation | Connect a channel, connected accounts, schedule queue (persisted) |
| Rewards | Clip Rewards campaigns with join flow |
| Analytics | Views per clip + 14-day trend charts (canvas) |
| Pricing | Free / Pro / Expert / Business / Custom with monthly-yearly toggle and credit top-ups |

All data (projects, clips, queue, settings) is persisted in `localStorage`.

## Notes

- The sandbox has no YouTube access, so all YouTube calls (metadata, channel listing, embedding,
  duration) run in **your browser**. If a channel page is blocked, the app asks for a single video link.
- The `.webm` export is a **preview render** (motion cover + styled captions), not a re-encode of the
  source video — browsers cannot capture cross-origin YouTube video into a canvas.
