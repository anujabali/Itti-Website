/**
 * The marketplace's goods, makers and collections.
 *
 * One file, so a new item is an edit here rather than a change to a page. The
 * shop is not transactional yet: every item carries an indicative price and the
 * page says so once, plainly, at the top. Nothing here claims stock, a delivery
 * date, or a sale that has happened.
 *
 * `plate: false` means there is no photograph yet and the card is set as a
 * typographic plate instead. That is deliberate — an invented photograph of a
 * thing nobody has made is worse than an honest absence, and the plates read as
 * a decision rather than a gap.
 */

export type Pillar = 'cancer' | 'neuro' | 'claw';

export interface Item {
	slug: string;
	name: string;
	line: string;
	craft: string;
	pillar: Pillar;
	/** In rupees, indicative until the first making cycle closes. */
	price: number;
	/** A photograph in `public/shop/`, or false while there is none. */
	plate: string | false;
	featured?: boolean;
}

export const PILLARS: Record<
	Pillar,
	{ label: string; accent: string; note: string; mark: string | 'claw' }
> = {
	cancer: {
		label: 'Cancer Care',
		accent: 'rose',
		note: 'Carries the dragonfly, and the line the Foundation says on 8 September.',
		mark: '/brand/pillar-cancer.png',
	},
	neuro: {
		label: 'Neurodivergence',
		accent: 'ochre',
		note: 'Made in the skilling workshops, by the people the programme is for.',
		mark: '/brand/pillar-neuro.png',
	},
	claw: {
		label: 'Conservation',
		accent: 'sage',
		note: 'The recurring crafts — the techniques taught in the field, sold as they are made.',
		mark: 'claw',
	},
};

export const ITEMS: Item[] = [
	{
		slug: 'cancer-care-tee',
		name: 'Cancer Care Tee',
		line: 'The dragonfly, and the shloka the Foundation reads on 8 September.',
		craft: 'Screen print on combed cotton',
		pillar: 'cancer',
		price: 899,
		plate: '/shop/tee-itti.jpg',
		featured: true,
	},
	{
		slug: 'bioenzyme-household',
		name: 'Bioenzyme, household',
		line: 'Citrus peel, jaggery and water, left three months. It cleans everything.',
		craft: 'Fermented in the CLAW workshops',
		pillar: 'claw',
		price: 240,
		plate: false,
	},
	{
		slug: 'bioenzyme-garden',
		name: 'Bioenzyme, garden',
		line: 'The same ferment, cut for soil rather than surfaces.',
		craft: 'Fermented in the CLAW workshops',
		pillar: 'claw',
		price: 240,
		plate: false,
	},
	{
		slug: 'vetiver-mat',
		name: 'Vetiver mat',
		line: 'Roots woven wet, dried flat. Wet it again in summer and the room cools.',
		craft: 'Hand-woven vetiver root',
		pillar: 'claw',
		price: 1450,
		plate: false,
	},
	{
		slug: 'vetiver-sachets',
		name: 'Vetiver sachets',
		line: 'For a cupboard, a drawer, or a car that has been shut all day.',
		craft: 'Hand-woven vetiver root',
		pillar: 'claw',
		price: 320,
		plate: false,
	},
	{
		slug: 'seed-ball-set',
		name: 'Seed balls',
		line: 'Clay, compost and native seed. Thrown, not planted.',
		craft: 'Rolled by hand in the workshops',
		pillar: 'claw',
		price: 180,
		plate: false,
	},
	{
		slug: 'block-print-tote',
		name: 'Block-printed tote',
		line: 'Cut, printed and stitched by the same pair of hands, start to finish.',
		craft: 'Hand block print on canvas',
		pillar: 'neuro',
		price: 640,
		plate: false,
	},
	{
		slug: 'clay-planters',
		name: 'Clay planters',
		line: 'Thrown small, glazed once. No two come out the same size.',
		craft: 'Wheel-thrown terracotta',
		pillar: 'neuro',
		price: 520,
		plate: false,
	},
	{
		slug: 'paper-journals',
		name: 'Bound journals',
		line: 'Cotton-rag paper, sewn by hand, no glue anywhere in it.',
		craft: 'Hand-bound, cotton-rag paper',
		pillar: 'neuro',
		price: 480,
		plate: false,
	},
];

export const MAKERS = [
	{
		numeral: 'I',
		title: 'The people the programme is for',
		body: 'Neurodivergent teenagers and adults skilled in the workshops. The work is theirs, the pace is theirs, and the money reaches them by name.',
	},
	{
		numeral: 'II',
		title: 'The people who teach it',
		body: 'The crafts repeat across the Foundation — bioenzymes and vetiver are taught in the field as often as they are made for sale.',
	},
	{
		numeral: 'III',
		title: 'The people who buy it',
		body: 'A marketplace is only a livelihood if somebody buys. That is the whole of the ask, and there is no other.',
	},
];

export const STEPS = [
	{
		numeral: '01',
		title: 'You write',
		body: 'Say what you want and how many. There is no cart yet, and a person reads every message.',
	},
	{
		numeral: '02',
		title: 'We answer',
		body: 'With what is made, what it costs to send, and how long the making takes. Within five working days.',
	},
	{
		numeral: '03',
		title: 'It is made',
		body: 'By hand, in a workshop, by somebody who is paid for it. Nothing here is held in a warehouse.',
	},
	{
		numeral: '04',
		title: 'The money goes back',
		body: 'To the maker first, and to the programme that taught them. The Foundation takes nothing above its costs.',
	},
];
