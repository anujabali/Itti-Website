/**
 * What the Foundation has coming up.
 *
 * One file, the way the marketplace is one file: an event is an edit here
 * rather than a change to a component. It used to live inside the calendar's
 * client script, where nothing but the browser could read it — not a search
 * engine, not a reader without JavaScript, and not anybody looking for the
 * list without first learning which component it was buried in.
 *
 * Dates are plain ISO days and times are written as they would be said. The
 * Foundation works to Indian Standard Time; `IST` below is what turns the two
 * into the exact moment a search engine is given.
 *
 * Nothing here is generated. An event that is over stays until it is deleted —
 * the calendar dims it rather than hiding it, because a page that quietly
 * forgets what it said was happening is a page nobody can check.
 */

export interface FoundationEvent {
	/** The day it happens, as YYYY-MM-DD. */
	date: string;
	title: string;
	/** Local clock time, written the way it would be said aloud. */
	time: string;
	/** What it is, in a sentence. */
	desc: string;
}

/** The Foundation keeps Indian Standard Time. */
export const IST = '+05:30';

export const EVENTS: FoundationEvent[] = [
	{
		date: '2026-10-05',
		title: 'Monthly Volunteer Sync (Zoom)',
		time: '11:00 AM',
		desc: 'A quick online catch-up with our volunteers globally.',
	},
	{
		date: '2026-10-10',
		title: 'Pune Milk Bag Project Meet',
		time: '4:00 PM',
		desc: 'Offline event at Pune collection center for recycling.',
	},
	{
		date: '2026-10-15',
		title: 'Cancer Care Meetup',
		time: '10:00 AM',
		desc: 'Support and discussion group for individuals and families.',
	},
	{
		date: '2026-10-18',
		title: 'Periods ki Pathshala Webinar',
		time: '12:30 PM',
		desc: 'Online Zoom webinar raising awareness about menstrual health.',
	},
	{
		date: '2026-10-22',
		title: 'Neurodivergence Workshop',
		time: '2:00 PM',
		desc: 'An interactive offline workshop embracing cognitive diversity.',
	},
	{
		date: '2026-10-28',
		title: 'Rainwater Harvesting Visit',
		time: '9:00 AM',
		desc: 'Offline tour of the newly implemented community tanks.',
	},
	{
		date: '2026-11-05',
		title: 'Conservation Drive',
		time: '9:00 AM',
		desc: 'Tree planting and local environmental cleanup.',
	},
];

/** "4:00 PM" as "16:00:00", so a date and a time can become one moment. */
export const clock = (time: string): string => {
	const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
	if (!match) return '00:00:00';
	const [, h, m, meridiem] = match;
	let hour = Number(h) % 12;
	if (meridiem.toUpperCase() === 'PM') hour += 12;
	return `${String(hour).padStart(2, '0')}:${m}:00`;
};

/** The exact moment, for a search engine. */
export const startsAt = (event: FoundationEvent): string =>
	`${event.date}T${clock(event.time)}${IST}`;

/** Every month that has to be drawn, earliest first, as YYYY-MM. */
export const monthsSpanned = (events: FoundationEvent[], from: Date): string[] => {
	const key = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;
	const months = new Set(events.map((e) => e.date.slice(0, 7)));
	// The month the page was built in, and the two after it, so the calendar is
	// never empty for a reader who arrives after the last event has passed.
	for (let i = 0; i < 3; i++) {
		const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
		months.add(key(d.getFullYear(), d.getMonth()));
	}
	return [...months].sort();
};
