# Ai — AI Clip Maker

A client-side AI clip maker (in the spirit of Ssemble), named **Ai**. Two ways to work:

1. **YouTube link** — paste a video or channel URL: Ai fetches metadata, writes hooks/captions/hashtags,
   lets you edit everything, and exports SRT / cover / TXT / a preview `.webm`.
2. **Upload your own video** — Ai really analyses it (audio energy + frame motion), picks the best
   moments, and exports a **real .mp4**: trimmed, centre-cropped to 9:16 / 1:1 / 16:9, captions burned
   in with your chosen style, watermark and procedural music — all rendered locally by **ffmpeg.wasm**.

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
| Dashboard | YouTube video/channel URL **or** drag-&-drop video upload, video type (General/Sports/Game), aspect, caption language, clip count, optional transcript |
| Real analysis | Uploaded videos are scanned per-second: audio RMS loudness + frame-differencing motion → moment scores → non-overlapping clip segments |
| AI clipping | Hook titles, descriptions, hashtags, virality score and synced caption lines |
| Results | Clip cards with virality ring, preview player, SRT / cover / **MP4** export, multi-select scheduling |
| Editor | Real player (uploaded file or YouTube embed), trim, face-tracking / game-mode toggles, caption list editor, 6 style presets, animations, positions, watermark |
| Real export | ffmpeg.wasm in-browser: cut + crop + scale + burned captions + watermark + music mix → `.mp4` (720p/1080p) |
| Music | Procedural WAV synth (lo-fi, trap, cinematic, phonk, upbeat, ambient, funk) mixed under the original audio |
| Automation | Connect a channel, connected accounts, schedule queue (persisted) |
| Rewards / Analytics / Pricing | Campaigns, canvas charts, plans with credit top-ups |

Projects, clips, queue and settings persist in `localStorage`; uploaded source videos persist in
`IndexedDB`. Nothing is uploaded to a server.

## Notes

- The sandbox has no YouTube access, so all YouTube calls (metadata, channel listing, embedding,
  duration) run in **your browser**. If a channel page is blocked, the app asks for a single video link.
- For YouTube projects the `.webm` export is a preview render (motion cover + captions), because
  browsers cannot capture cross-origin YouTube video. Attach a local copy of the video in the editor's
  Export tab and the same project exports a **real .mp4**.
- The ffmpeg engine (`public/vendor/ffmpeg/ffmpeg-core.wasm`, ~32 MB) is fetched on first real export.

