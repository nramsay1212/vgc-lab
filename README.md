# Toxicroak VGC Lab

A training app for competitive Pokémon doubles (VGC): a game log with mistake tags, review stats, knowledge drills, a matchup notebook, and a multi-year roadmap. It works on phone and computer, installs like an app, and works offline.

## What updates itself

`data/dex.json` is built from [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) by `scripts/build-data.js`. Every Monday the **Update data and publish** workflow rebuilds it. New games, regulations, Pokémon, items, abilities, legality and type charts appear on their own. To update right away, open the **Actions** tab, pick the workflow and press **Run workflow**.

The mechanics flashcards in `js/content.js` are hand-written. When a new game adds a new mechanic, add cards there.

## Where your data lives

Your logs are saved in your browser on each device. To share them between devices, the app can keep them in one private gist on your GitHub account (see **Sync & backup** in the app). Nothing personal is stored in this repository.

## Files

- `index.html`, `css/`, `js/`: the app
- `data/dex.json`: generated Pokémon data, don't edit by hand
- `scripts/build-data.js`: builds the data file from a Showdown checkout
- `sw.js`, `manifest.webmanifest`, `icons/`: offline and install support
- `.github/workflows/deploy.yml`: weekly data refresh and publishing to GitHub Pages

## Build the data locally

```sh
git clone --depth 1 https://github.com/smogon/pokemon-showdown.git /tmp/ps
(cd /tmp/ps && npm install && node build)
node scripts/build-data.js /tmp/ps data/dex.json
```
