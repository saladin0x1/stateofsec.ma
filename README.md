# State of Sec Morocco: Brand

Brand assets for [stateofsec.ma](https://stateofsec.ma). This branch holds brand files only; the site lives on `main`.

| Path | What it is |
| --- | --- |
| [`rootie/`](rootie/) | Rootie the mascot: character sheet, parts, standalone SVG poses, and his guide |
| [`stories/`](stories/) | Instagram story kit (`fun.css`) and templates, 1080x1920 |
| [`identity/`](identity/) | Favicon, app icons and the social cover |
| [`fonts/`](fonts/) | Space Grotesk and JetBrains Mono (SIL Open Font License 1.1) |
| [`render.sh`](render.sh) | Renders any HTML file here to PNG with headless Chrome |
| [`CLAUDE.md`](CLAUDE.md) | Instructions for Claude when it makes brand content |

## Identity

**Wordmark**: a root shell prompt, set in JetBrains Mono bold: `root@stateofsec.ma:~# _`. `root@stateofsec.ma` and the cursor are in the primary green, `~` in the accent color, and the cursor blinks.

**Mark**: the `>_` prompt in terminal green on a near-black square (`identity/favicon.svg`). It is also Rootie's idle face.

| File | Size | Use |
| --- | --- | --- |
| `identity/favicon.svg` | vector | Browser tab, the source of the mark |
| `identity/favicon.ico` | 32px | Legacy browsers |
| `identity/icon-192.png`, `identity/icon-512.png` | 192, 512 | Web app manifest |
| `identity/apple-touch-icon.png` | 180 | iOS home screen |
| `identity/cover.png` | 1200x630 | Social preview card |

## Site Palette

The site's theme tokens (set in `src/globals.css` on `main`), checked for WCAG AA contrast. The site is flat and square: radius 0 and no shadows.

| Token | Dark | Light |
| --- | --- | --- |
| background | `#0c110e` | `#eef3ef` |
| foreground | `#dbe7de` | `#0f1712` |
| primary | `#3ddc84` | `#08693a` |
| secondary | `#f5b041` | `#8a5a00` |
| accent | `#4fc3f7` | `#035e8c` |
| muted text | `#93a69a` | `#44524a` |
| border | `#5a7564` | `#5c6b62` |

The stories use their own warmer palette (sage paper, cream, hard ink shadows); see [`rootie/README.md`](rootie/README.md#palette).

## Type

- **Space Grotesk** 500 / 700: headlines.
- **JetBrains Mono** 500 / 700: body, labels, terminal text, the wordmark.

Both are bundled in `fonts/` with their licenses, so the templates render without installing anything.

## Rootie

![Rootie character sheet](rootie/design-sheet.png)

Everything about the mascot, his anatomy, palette, expressions, poses, feet and walk cycle, is in [`rootie/README.md`](rootie/README.md).

## Rendering

```sh
./render.sh stories/qa-call.html ~/Desktop/qa-call.png          # story: 1080x1920 at 3x
./render.sh rootie/design-sheet.html rootie/design-sheet.png 2400 5470 1
```

It uses Google Chrome on macOS; set `CHROME` to the browser binary elsewhere.

The stateofsec.ma site is a fork of [stateofdev.ma](https://stateofdev.ma) by [GeeksBlaBla](https://geeksblabla.community) and its contributors.
