# The Itti Foundation — website

Public-facing site for **The Itti Foundation** — [itti.org.in](https://itti.org.in).
Legal entity: Itti's Skill School Foundation, a Section 8 not-for-profit.
Built with [Astro](https://docs.astro.build).

> **Status: structure complete, copy deliberately withheld.**
> Almost every string past the opening arc reads `N.A.` on purpose. The poem, the three pillar
> names and the navigation are real; everything else is waiting on facts rather than on code.
> Do not mistake `N.A.` for missing work.

## Running it

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # → dist/
npm run preview    # serve the production build
```

The dev server binds to every interface, so a phone or tablet on the same network can reach it at
`http://<your-lan-ip>:4321`. On macOS the firewall must allow the **real** node binary — the one
`/usr/local/bin/node` symlinks to, not the symlink itself.

New to the project? Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## Layout

```
src/
  components/
    brand/     Mark, Wordmark, ClawMark — identity, reusable anywhere
    layout/    Nav, SiteFooter — the chrome on every page
    home/      OurStory, Featured, Impact, Events, JoinUs, PillarCard, PlateCredit
  layouts/     Base — <head>, nav, grain, the scroll listeners
  pages/       One route per file
  styles/      global.css — design tokens live here and nowhere else
public/
  brand/       Marks and lockup
  plates/      The three cinematic plates, already colour-graded
  shop/        Product photography
supabase/      Database migrations and seed for the app layer
```

## Things that will trip you up

**Astro's scoped styles do not reach a child component's root element.** A rule like
`.brand__mark { --size: 2rem }` in a parent silently matches nothing. This has caused three
separate bugs here. Pass values as **custom properties**, which inherit normally, or wrap the
child in an element the parent owns.

**Design tokens live only in `global.css`.** Colours, fonts, spacing and easing are all custom
properties. Never hard-code a hex value in a component.

**The plates are pre-graded**, once, and committed already graded. Nothing is filtered at
runtime — a CSS filter on a full-bleed element that transforms every frame is a repaint the
browser cannot afford. A replacement plate must be graded to match or it will not sit with the
others.

**The dev server sometimes serves stale CSS** after a large change to a scoped `<style>` block.
If a rule appears to do nothing, restart it before debugging the rule.

**Tunnels need to be allow-listed.** Vite rejects unknown `Host` headers, so `astro.config.mjs`
permits `.trycloudflare.com` for preview. Add any other tunnel domain there.

## Deployment

Not yet deployed. Netlify is the intended host — free tier, private repos, per-branch preview
URLs. Cloudflare Pages is the alternative if traffic is mostly India.

**Before going live:** the plates total roughly 3 MB and are served straight from `public/`. They
should move to Astro's image pipeline for responsive WebP. And the CC BY-SA obligations in
[ATTRIBUTION.md](ATTRIBUTION.md) must be satisfied.

## Design record

The decision record, research and working transcripts are **deliberately not in this
repository** — they live on the maintainer's machine. This repo carries the code and the assets
it ships, and nothing else.

[ATTRIBUTION.md](ATTRIBUTION.md) is the exception, and is not optional: `public/plates/bird.jpg`
is CC BY-SA 4.0 and its notice is required to travel with the file.

---

© The Itti Foundation. All rights reserved. Not open source — see
[ATTRIBUTION.md](ATTRIBUTION.md) for third-party artwork licences.
