/**
 * Writes `dist/sitemap.xml` and `dist/robots.txt` from the pages that were
 * actually built.
 *
 * Generated rather than kept by hand for the same reason the headers are: a
 * list of pages maintained separately from the pages is a list that goes wrong.
 * Add a page and it appears here; delete one and it leaves.
 *
 * The not-found page is excluded — it answers every address that does not
 * exist, and is not an address itself.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://itti.org.in';
const DIST = 'dist';
const EXCLUDE = new Set(['/404']);

/** Every index.html under dist, as the path a visitor would type. */
const walk = (dir, base = '') => {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (entry.startsWith('_')) continue; // build assets
			out.push(...walk(full, `${base}/${entry}`));
		} else if (entry === 'index.html') {
			out.push(base === '' ? '/' : base);
		}
	}
	return out;
};

const paths = walk(DIST)
	.filter((p) => !EXCLUDE.has(p))
	.sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));

// The opening is the page worth finding; the documents are the tail.
const priority = (p) => (p === '/' ? '1.0' : p === '/join' ? '0.8' : '0.4');
const today = new Date().toISOString().slice(0, 10);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths
	.map(
		(p) =>
			`\t<url>\n\t\t<loc>${SITE}${p === '/' ? '/' : `${p}/`}</loc>\n` +
			`\t\t<lastmod>${today}</lastmod>\n\t\t<priority>${priority(p)}</priority>\n\t</url>`,
	)
	.join('\n')}
</urlset>
`;

const robots = `# The Itti Foundation
#
# Everything here is public and may be crawled. To keep the site out of search
# while it is unfinished, replace the two lines under User-agent with:
#     Disallow: /

User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

writeFileSync(join(DIST, 'sitemap.xml'), sitemap);
writeFileSync(join(DIST, 'robots.txt'), robots);
console.log(`sitemap.xml written — ${paths.length} pages: ${paths.join(' ')}`);
