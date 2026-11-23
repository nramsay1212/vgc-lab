# VGC Lab: Showdown games (browser extension)

Sends each rated ladder game you finish on Pokémon Showdown to Toxicroak VGC Lab.
VGC Lab logs it as a climb game, tagged with the saved team that matches your six.

## Install in Brave

1. Download this folder (or unzip `vgc-lab-showdown.zip`) somewhere it can stay, for example `Documents/vgc-lab-showdown`. Brave loads it from there each time, so don't delete it.
2. In Brave, go to `brave://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the folder that has `manifest.json` in it.
5. Click the puzzle-piece icon in the toolbar and pin **VGC Lab: Showdown games** so its menu is one click away.
6. Reload any open Showdown tab.

## Use

- Play a ladder game on play.pokemonshowdown.com. When it ends, the extension waits a few seconds for the rating change, then sends the game.
- VGC Lab updates the tab you already have open, or opens one in the background. You stay on Showdown.
- The extension's icon shows a green W or a red L for a few seconds when a game is sent.
- Right after, a box on Showdown asks what style their team was, what went wrong (losses only), and which of your Pokémon stayed in the back if one you brought never came in. Press **Save to VGC Lab** and the answers go into that same game. **Skip** or × closes it; the game is already saved either way.

## Settings (click the icon)

- **Send my games to VGC Lab**: on or off.
- **Losses only**: wins are skipped. A skipped win stays in Recent games with a **Send** button.
- **Ask after each game**: the box above. Turn it off if you'd rather not be asked.
- **Best-of-3 sets** (on): every game of a Showdown best-of-3 set is sent (ladder, tournament or challenge), even with Losses only on, grouped into one set in VGC Lab. After game 1 or 2 the box also asks your plan for the next game, and at the next game's team preview a box shows the score, that plan, and what they led, brought and Mega Evolved in the earlier games.
- **Other challenges and tournaments** (off): single games off the ladder, such as a tournament where each game is its own challenge. Games against the same player within 30 minutes are grouped as a set.
- **Format**: the format in the battle's address. Change it when the regulation changes.
- **Send again**: sends a recent game again (VGC Lab skips it if it already has it).

## Updating

Replace the folder's files with the new ones, then click the circular arrow on the extension's card in `brave://extensions`, and reload Showdown.
