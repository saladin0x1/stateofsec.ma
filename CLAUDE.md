## Making Brand Content

This branch holds the stateofsec.ma brand only: Rootie the mascot (`rootie/`), the Instagram story kit (`stories/`), the site identity (`identity/`) and fonts. `README.md` and `rootie/README.md` are the full guides; this file is the checklist for making anything with them (stories, posts, stickers, banners).

### Draw Rootie from the Parts

- The canonical parts live in the `<defs>` of `rootie/design-sheet.html`: `arm-*`, `legs`, `feet-sneakers`, `feet-babouches`, `body`, `face-*`, `led-ok` / `led-warn`, `tarbouch`, `hardhat`, `sweat`. Compose poses with `<use href="#...">` in this order: back arms, legs, feet, body, face, LED, hat, then front arms (`arm-r-point`, `arm-r-atay`, `arm-r-lens`).
- Copy exact paths and hex values. Never redraw him from memory, recolor his body or stretch the box; scale uniformly.
- The screen stays black and shows green glyphs only, never words.
- One outfit at a time: plain, hardhat, Moroccan, or QA.

### Build Stories from the Templates

- Start from the closest file in `stories/` and keep `fun.css` beside it. The frame is 1080x1920; keep content inside `.safe` (250px free at the top, 340px at the bottom).
- One message, one call to action. A link or mention CTA gets an empty bracketed zone for the Instagram sticker, with Rootie pointing at it (see `qa-link.html`).
- Copy is lowercase, short and warm, with terminal jokes and a touch of Darija.
- Get the survey's status from the user before writing CTA copy: pre-launch ("not open yet", follow CTA), QA, open (take the survey), or closed (results). Never imply it is open when it is not.
- Never use emoji, including in markup: draw icons (a padlock, a cookie) as inline SVG.
- For a partner, use their page name and colors only. Follow `partner-intro-dark.html`: override the CSS variables and add the `#sticker` outline filter on dark backgrounds.

### Render, Then Look

1. `./render.sh <story.html> <out.png>` renders 1080x1920 at 3x; fonts load from `fonts/`. Write one-off renders outside the repo (the user keeps them in `~/Desktop/stateofsec-stories/`) unless asked to add a template.
2. Read the PNG and check it before reporting:
   - doodles overlapping text
   - lines that wrap with a lone word
   - content in the top 250px or the bottom 340px
   - quote marks pointing the wrong way (use `&ldquo;` and `&rdquo;`)
   - all four corner brackets in a sticker zone (use `:nth-of-type`, not `:nth-child`)
3. Fix and re-render until it is clean, then give the user the path.

### Adding to the Kit

- A new reusable part goes into the sheet's `<defs>` and onto the sheet, then re-render: `./render.sh rootie/design-sheet.html rootie/design-sheet.png 2400 5470 1` (update the height if the sheet grows).
- A new standalone pose in `rootie/svg/` embeds the same `<defs>` and composes it with `<use>`.
- A new template goes in `stories/` with a preview in `stories/previews/` (960px tall JPEG) and a row in `rootie/README.md`.
- Identity files in `identity/` are copies of `public/` on `main`: change them there first, then copy them here.
