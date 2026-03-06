---
name: "slidev"
description: "Slidev (sli.dev) presentation framework — Markdown-powered slides for developers"
domain: "presentations"
confidence: "low"
source: "manual — extracted from sli.dev official documentation"
---

## Context

[Slidev](https://sli.dev) is a web-based slide maker for developers. You write slides in Markdown, and Slidev renders them with Vue 3, Vite, UnoCSS, and Shiki syntax highlighting. It supports click animations, slide transitions, code highlighting, LaTeX, Mermaid diagrams, and export to PDF/PPTX/PNG.

**IMPORTANT:** Slidev lives in `slides/` with its own `package.json`. It is completely isolated from the VS Code extension. Do NOT add Slidev dependencies to the root `package.json`. Do NOT reference Slidev in the main `README.md` or `docs/`.

**Source docs:** https://sli.dev/guide/

## Patterns

### Project Setup

Initialize a new deck inside `slides/`:

```bash
cd slides/
npm init slidev@latest
```

This scaffolds the project with a `package.json` containing dev/build/export scripts. The entry file is `slides.md`.

Typical `package.json` scripts:

```json
{
  "scripts": {
    "dev": "slidev --open",
    "build": "slidev build",
    "export": "slidev export"
  }
}
```

**Requirements:** Node.js ≥ 18. Use `npm` or `pnpm` (pnpm preferred by Slidev upstream).

### Slide Syntax

Slides are written in a single Markdown file (default: `slides.md`). Separate slides with `---`:

```md
---
theme: seriph
title: My Presentation
transition: slide-left
---

# Slide 1 — Cover

Welcome to the talk.

---

# Slide 2

- Bullet one
- Bullet two

---
layout: center
---

# Centered Slide

This content is centered.
```

**Key rules:**
- The first `---` block is the **headmatter** — configures the entire deck (theme, title, transitions)
- Subsequent `---` blocks are **frontmatter** — per-slide settings (layout, background, class)
- Presenter notes go in HTML comments at the **end** of a slide: `<!-- speaker note -->`
- Standard Markdown works as-is; you can also use Vue components and HTML inline

### Layouts

Set per-slide layout via frontmatter. Built-in layouts:

| Layout | Purpose |
|--------|---------|
| `default` | Standard content |
| `cover` | Title/cover page |
| `center` | Centered content |
| `two-cols` | Two-column split (use `::right::` slot) |
| `two-cols-header` | Header + two columns (`::left::` / `::right::`) |
| `image` | Full-screen image |
| `image-left` / `image-right` | Image on one side, content on the other |
| `iframe` / `iframe-left` / `iframe-right` | Embed a web page |
| `section` | Section divider |
| `quote` | Prominent quotation |
| `fact` | Large data/fact display |
| `end` | Final slide |

Two-column example:

```md
---
layout: two-cols
---

# Left Column

Content here.

::right::

# Right Column

More content.
```

### Themes

Set the theme in headmatter:

```yaml
---
theme: seriph
---
```

Popular community themes: `seriph` (clean default), `default`, `apple-basic`, `bricks`, `dracula`, `geist`, `penguin`, `purplin`, `shibainu`, `unicorn`. Browse all at https://sli.dev/resources/theme-gallery.

Themes are installed as npm packages automatically when you run the dev server. To pin a version, add `@slidev/theme-<name>` to `devDependencies` in the **slides/** `package.json`.

### Animations & Transitions

#### Click Animations

Use `v-click` to reveal elements one click at a time:

```md
<v-click>

- First item (appears on click 1)

</v-click>

<v-click>

- Second item (appears on click 2)

</v-click>
```

Use `v-clicks` to auto-animate all children (great for lists):

```md
<v-clicks>

- Item 1
- Item 2
- Item 3

</v-clicks>
```

Hide on click with `.hide` modifier:

```md
<div v-click.hide>This disappears on click</div>
```

Use `v-switch` for mutually exclusive content:

```md
<v-switch>
  <template #1> Shown at click 1 </template>
  <template #2> Shown at click 2 </template>
</v-switch>
```

#### Slide Transitions

Set in headmatter (applies to all slides) or per-slide frontmatter:

```yaml
---
transition: slide-left
---
```

Built-in transitions: `fade`, `fade-out`, `slide-left`, `slide-right`, `slide-up`, `slide-down`, `view-transition`.

Different transitions for forward/backward navigation:

```yaml
---
transition: slide-left | slide-right
---
```

#### Motion (v-motion)

Powered by `@vueuse/motion`:

```html
<div
  v-motion
  :initial="{ x: -80 }"
  :enter="{ x: 0 }"
>
  Animated text
</div>
```

### Code Highlighting

Slidev uses Shiki for syntax highlighting. Standard fenced code blocks work out of the box:

````md
```ts
console.log('Hello, World!')
```
````

**Line highlighting** — specify lines in `{}`:

````md
```ts {2,3}
function add(
  a: Ref<number> | number,   // highlighted
  b: Ref<number> | number    // highlighted
) {
  return computed(() => unref(a) + unref(b))
}
```
````

**Dynamic line highlighting** — use `|` for click-through stages:

````md
```ts {2-3|5|all}
function add(
  a: Ref<number> | number,
  b: Ref<number> | number
) {
  return computed(() => unref(a) + unref(b))
}
```
````

**Shiki Magic Move** — animated code transitions between steps (use 4 backticks):

`````md
````md magic-move
```js
console.log(`Step ${1}`)
```
```js
console.log(`Step ${1 + 1}`)
```
````
`````

### Importing & Splitting Slides

Split large decks across files using the `src` frontmatter:

```md
---
src: ./pages/intro.md
---
```

Import specific slides from another file:

```md
---
src: ./other-deck.md#2,5-7
---
```

### Exporting

Install Playwright for CLI export:

```bash
npm i -D playwright-chromium
```

Export commands:

```bash
# PDF (default)
slidev export

# PPTX (slides as images, with presenter notes)
slidev export --format pptx

# PNG per slide
slidev export --format png

# PDF with click steps as separate pages
slidev export --with-clicks

# Custom output filename
slidev export --output my-deck

# PDF with table of contents outline
slidev export --with-toc

# Dark mode export
slidev export --dark
```

The browser-based exporter is also available at `http://localhost:<port>/export` during dev.

### Directory Structure

```
slides/
  ├── components/       # custom Vue components
  ├── layouts/          # custom slide layouts
  ├── pages/            # split slide files (imported via src:)
  ├── public/           # static assets (images, etc.)
  ├── snippets/         # code snippets for import
  ├── styles/           # custom CSS (style.css or styles/index.ts)
  ├── index.html        # inject meta tags / scripts
  ├── slides.md         # main entry point
  ├── package.json      # slidev deps — isolated from root
  └── vite.config.ts    # extend Vite config (optional)
```

All directories are optional. Only `slides.md` and `package.json` are required.

## CI/CD — GitHub Pages Deployment

Deploy Slidev to GitHub Pages using `.github/workflows/slides.yml`:

```yaml
name: Slides

on:
  push:
    branches: [dev]
    paths:
      - 'slides/**'
  workflow_dispatch:

permissions:
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: slides/package-lock.json
      - run: npm ci
        working-directory: slides
      - run: npx slidev build --base /forge/
        working-directory: slides
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: slides/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Key points:**
- `--base /forge/` is required for GitHub project pages (deploys to `/<repo>/` subpath)
- `cache-dependency-path` points to the slides lockfile, not root
- `working-directory: slides` keeps the build isolated from the VS Code extension
- Two-job pattern: `build` uploads the artifact, `deploy` publishes it

## Anti-Patterns

- Do NOT install Slidev deps in root `package.json` — keep `slides/` self-contained
- Do NOT reference `slides/` in the main `README.md` or `docs/` — it's a separate concern
- Do NOT import extension source code (`src/`) from slides
- Do NOT use `npm init slidev` without `@latest` — npm re-downloads packages every time without caching
- Do NOT use `type: "azure"` for Slidev's baseUrl — this is a Forge SDK concern, not Slidev (don't mix them up)
- Do NOT commit `node_modules/` inside `slides/` — add `slides/node_modules` to `.gitignore`
- Do NOT rely on `slidev export` without `playwright-chromium` installed — it will fail silently or error
