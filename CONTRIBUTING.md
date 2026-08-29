# Working on this site

Short version: it's an [Astro](https://docs.astro.build) site. Pages are files, components
are `.astro`, and there is no framework layer — no React, no Vue, no Tailwind.

## Setup

```sh
npm install
npm run dev        # http://localhost:4321
```

Node 22.12 or newer. `.nvmrc` pins it if you use nvm — `nvm use`.

```sh
npm run build      # → dist/
npm run preview    # serve the built site
npm run format     # Prettier, before you commit
```

The dev server binds to every interface, so you can open the site on a phone at
`http://<your-machine-ip>:4321` while it runs.

## Where things live

| Path                     | What belongs there                                         |
| ------------------------ | ---------------------------------------------------------- |
| `src/pages/`             | One file per route                                         |
| `src/layouts/`           | Page shells — `<head>`, nav, the scroll listeners          |
| `src/components/brand/`  | Identity: the mark, the wordmark, project marks            |
| `src/components/layout/` | Chrome that appears on every page                          |
| `src/components/home/`   | Sections belonging to the landing page only                |
| `src/styles/global.css`  | Design tokens. Colours, type, spacing, easing              |
| `public/`                | Served verbatim at the site root. No build step touches it |
| `supabase/`              | Database migrations and seed for the app layer             |

A component used on exactly one page goes in that page's folder. Promote it to a shared
folder the second time it's used, not in anticipation.

## House rules

**Never hard-code a colour, font or easing curve.** Every one is a custom property in
`global.css`. If you need a value that isn't there, add it there and use the variable.

**Scoped styles do not reach a child component's root element.** This is Astro's biggest
trap and it has caused three separate bugs in this codebase. Writing

```astro
<Mark class="brand__mark" />
<style>
	.brand__mark {
		--size: 2rem;
	}
</style>
```

silently matches nothing, because the child's root carries its own scope hash. Pass values
as **custom properties** on a parent — they inherit normally — or wrap the child in an
element this component owns.

**Copy that reads `N.A.` is deliberate.** The structure is finished and the words are
pending. Don't invent replacements; ask.

**Plates are graded ahead of time** and committed already graded. Nothing is filtered at
runtime, because a CSS filter on a full-bleed element that transforms every frame is a
repaint the browser can't afford. A new plate has to be graded to match the others.

**Assets in `public/` ship as-is.** Check the file size before committing one. Anything with
a licence goes in [ATTRIBUTION.md](ATTRIBUTION.md) in the same commit.

## Gotchas that will cost you an hour

**The dev server sometimes serves stale CSS** after a large change to a scoped `<style>`
block. If a rule appears to do nothing, restart the server before you debug the rule.

**Vite rejects unknown `Host` headers.** If you're tunnelling the site for a preview, add
that domain to `vite.preview.allowedHosts` in `astro.config.mjs`.

**`svh` units, not `vh`.** Mobile browsers change `vh` as the toolbar hides, which makes
every pinned section jump. The arc depends on this.

## Committing

Branch off `main`, keep commits focused, and write messages that say _why_ rather than
_what_ — the diff already says what. `npm run format` and `npm run build` should both pass
before you push.
