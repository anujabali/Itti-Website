/**
 * Rebuilds the served plate variants from the masters in `plates-master/`.
 *
 * The plates are full-bleed, so their widths are chosen by the screens we mean
 * to serve rather than by the size of the file we happen to hold: a laptop
 * should never pull the 2600-wide heron it has nowhere to put. Each width is
 * written as AVIF, WebP and JPEG, and `<picture>` in `src/pages/index.astro`
 * hands the browser the first one it understands.
 *
 * A master is never upscaled, and it is always offered at its own width so the
 * largest screens still get the whole of the art.
 *
 * The widths are written to `src/data/plates.json`, which the page reads to
 * build its srcsets. That file is the only record of which variants exist, so
 * the markup cannot come to disagree with what is on disk.
 */
import sharp from 'sharp';
import { readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';

const SRC = 'plates-master';
const OUT = 'public/plates';
const STEPS = [1280, 1920, 2560];
const FORMATS = [
	['avif', { quality: 50, effort: 6 }],
	['webp', { quality: 76 }],
	['jpg', { quality: 80, mozjpeg: true }],
];

// A step within a whisker of the master is the master, and writing both would
// ship two files no screen can tell apart.
const CLOSE_ENOUGH = 1.08;

// Stale variants would otherwise linger after a master is replaced or a step
// changes, and be deployed for ever.
for (const f of readdirSync(OUT)) rmSync(`${OUT}/${f}`);

const manifest = {};

for (const file of readdirSync(SRC).filter((f) => f.endsWith('.jpg'))) {
	const name = file.replace(/\.jpg$/, '');
	const { width: master } = await sharp(`${SRC}/${file}`).metadata();

	const steps = STEPS.filter((w) => w * CLOSE_ENOUGH < master);
	const widths = [...steps, master];
	manifest[name] = widths;

	for (const width of widths) {
		for (const [ext, options] of FORMATS) {
			const out = `${OUT}/${name}-${width}.${ext}`;
			await sharp(`${SRC}/${file}`)
				.resize({ width })
				.toFormat(ext === 'jpg' ? 'jpeg' : ext, options)
				.toFile(out);
			console.log(`${(statSync(out).size / 1024).toFixed(0).padStart(5)} KB  ${out}`);
		}
	}
}

writeFileSync('src/data/plates.json', JSON.stringify(manifest, null, '\t') + '\n');
console.log('\nsrc/data/plates.json →', JSON.stringify(manifest));
