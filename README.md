# SLIPSHIFT

**Hold your nerve. Release to bank.**

An original portrait HTML5 speed game built for Slapjam #2 (theme: **Speed**), beginning October 29, 2026 after the 15:00 UTC build window opened.

## Play

Survive a 60-second sprint and bank the largest score you can.

- **Touch / mouse:** hold the track or accelerator and drag sideways to steer. Let go to save your points and cool down. Optional left/right buttons also steer.
- **Keyboard:** left/right arrows (or A/D) steer; hold Space (or Up) to accelerate; release to bank. P or Escape pauses.
- Fast close passes increase your multiplier, up to ×8. A collision costs one of three hull segments and your unbanked streak. Overheating cuts the engine and loses your unbanked streak, but does not damage hull.
- Banked points are always safe. Finishing the timer banks your remaining streak automatically.
- Sound is synthesized after a user gesture. Toggle it any time. **Calm FX** removes particles, speed streaks, shaking and flashing. Motion-sensitive preferences are respected on first load.
- Changing tabs, losing focus, or a canceled touch automatically pauses. Resume never keeps a stale throttle input held.

No ads, analytics, accounts, network requests, downloaded fonts or third-party runtime code. Personal best and preferences use only local browser storage; blocked storage is safe.

## Run and test

Open `dist/index.html` directly in a modern browser, or serve `dist/` with any static HTTP server. No install or build is required to play.

```sh
npm test
npm run build
```

`npm run build` checks JavaScript syntax and writes a deterministic, root-`index.html` HTML5 ZIP plus SHA-256 checksums in `release/`. `tests/browser_smoke.py` is an independent CI browser harness; it uses Playwright only for tests, never in the game.

For itch.io: choose **HTML**, upload `release/slipshift-html5.zip`, mark **This file will be played in the browser**, enable mobile-friendly portrait embedding (720×1280 target), and allow fullscreen. The game must be directly playable on itch; this repository is source, not an itch submission.

## Verification status

See GitHub Actions for exact-commit automated checks and rendered browser artifacts. Local deterministic tests cover scoring, heat, collision, input-time handling, seeded generation and frame-rate equivalence. Actual handheld touch/audio-device testing is distinct from automated browser emulation.

## Credits and AI disclosure

Designed and implemented with OpenAI ChatGPT/dot agents during the jam build window. All game code, CSS, canvas ship/environment art and Web Audio synthesis were made specifically for this entry. No image-generation model, stock asset pack, music recording, copied game or externally hosted game was used. See [PROVENANCE.md](PROVENANCE.md).

Code and original procedural assets are released under [MIT](LICENSE).
