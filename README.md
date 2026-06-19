# Olvídalo

A tiny personal scorekeeper for Olvídalo. It runs as a static web app, can be installed to an iPhone Home Screen from Safari, and stores the player roster locally on the device.

## What It Does

- Saves player names and per-player out limits.
- Randomizes one round of play.
- Starts a turn timer for each player.
- Tracks fair hits and out hits.
- Automatically stops a turn when the player's out limit is reached.
- Scores by longest time or most fair hits.
- Shows the next players on deck.

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## GitHub Pages

This repo includes a GitHub Actions workflow that builds and deploys the app to GitHub Pages on every push to `main`.

On GitHub, open the repo settings and set:

- **Settings -> Pages -> Build and deployment -> Source:** `GitHub Actions`

After the first successful deploy, open the Pages URL on your iPhone in Safari and use **Share -> Add to Home Screen**.
