# Background music (optional drop-in)

Every rendered video gets a soothing background bed mixed **under** the
narration. By default it is **synthesized procedurally** — a warm ambient pad
with a fresh random key, chord progression and tempo on every run — so no two
videos share the same music and nothing has to be downloaded or licensed.

## Use your own tracks instead

Drop audio files in this folder and they take priority over the generator:

- Supported: `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, `.aac`
- One track is chosen per render, and the previous video's pick is skipped when
  there's more than one — so you still don't get "a single music" repeated.
- Each track is looped / trimmed to the narration length and faded in/out.

Use **royalty-free / CC0** music only (e.g. Pixabay Music, YouTube Audio
Library, or any track you have rights to publish). Do not commit copyrighted
songs to the repo.

## Tuning

Set these in `.env` (see `.env.example`):

- `BACKGROUND_MUSIC_ENABLED=false` — turn music off entirely.
- `MUSIC_LEVEL_DBFS=-30` — bed loudness; lower is quieter (e.g. `-34`).
- `MUSIC_FADE_MS=2500` — fade-in / fade-out length in milliseconds.
