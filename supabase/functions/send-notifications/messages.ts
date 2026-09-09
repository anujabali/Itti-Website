/**
 * What the two messages say.
 *
 * Both are plain first and marked up second, because a receipt that arrives as
 * a wall of broken HTML is worse than one that arrives as text. Neither claims
 * anything the foundation has not actually undertaken to do.
 */

const SAID: Record<string, string> = {
	neurodivergence: 'Neurodivergence',
	cancer_care: 'Cancer Care',
	claw: 'Conservation',
	not_sure: 'Not sure yet',
	other: 'Other',
};

const say = (v: string) => SAID[v] ?? v.replace(/_/g, ' ');

/**
 * A list the way it is spoken: one on its own, two joined by "and", and three
 * or more separated by commas with "and" before the last. Joining everything
 * with commas reads as a database field rather than as a sentence, and this is
 * a letter.
 */
const sentence = (parts: string[]): string => {
	if (parts.length === 0) return '';
	if (parts.length === 1) return parts[0]!;
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

const list = (interests: string[]): string => sentence(interests.map(say));

/**
 * A number read the way it is said, not the way it is stored.
 *
 * E.164 has no spaces by design — it is a machine format. Nobody reads a number
 * as one run of thirteen digits, and a receipt exists to be read. Only +91 is
 * grouped: grouping depends on the numbering plan, and guessing at a country
 * code's length gets it wrong more often than it helps.
 */
const readablePhone = (raw: string): string => {
	const v = (raw ?? '').trim();
	const india = /^\+91(\d{10})$/.exec(v);
	return india ? `+91 ${india[1].slice(0, 5)} ${india[1].slice(5)}` : v;
};

/** Escapes for the HTML part. The values are names people typed. */
const esc = (s: string) =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

/** The stored value, said the way it was asked for. */
const ROLE: Record<string, string> = {
	patient: 'Patient / Beneficiary',
	caregiver: 'Caregiver / Family Member',
	volunteer: 'Volunteer / Supporter',
	other: 'Member',
};

const GENDER: Record<string, string> = {
	woman: 'Female',
	man: 'Male',
	non_binary: 'Non-binary',
	self_described: 'Prefer to self-describe',
	undisclosed: 'Prefer not to say',
};

const LANG: Record<string, string> = {
	en: 'English',
	hi: 'Hindi',
	mr: 'Marathi',
	gu: 'Gujarati',
	bn: 'Bengali',
	ta: 'Tamil',
	te: 'Telugu',
	kn: 'Kannada',
	ml: 'Malayalam',
	pa: 'Punjabi',
	ur: 'Urdu',
	or: 'Odia',
	as: 'Assamese',
};

const HEARD: Record<string, string> = {
	friend_family: 'A friend or family member',
	doctor_hospital: 'A doctor or hospital',
	event: 'An event',
	podcast: 'A podcast',
	instagram: 'Instagram',
	youtube: 'YouTube',
	whatsapp_group: 'A WhatsApp group',
	search: 'A search engine',
	news: 'The news',
	volunteer_staff: 'Someone from the foundation',
	other: 'Somewhere else',
};

type Row = [string, string];

/**
 * What we wrote down, as they gave it.
 *
 * Only the lines they actually filled in: a receipt full of blanks reads as a
 * form somebody failed rather than as a record of what they said.
 */
const snapshot = (p: Record<string, unknown>): Row[] => {
	const g = (k: string) => String(p[k] ?? '').trim();
	const yes = (k: string) => p[k] === true;
	const channels = [
		yes('consentWhatsapp') ? 'WhatsApp' : '',
		yes('consentSms') ? 'SMS' : '',
		yes('consentEmail') ? 'Email' : '',
	].filter(Boolean);
	const by = sentence(channels);

	const rows: Row[] = [
		['Name', g('fullName')],
		['You are', ROLE[g('role')] ?? g('role')],
		['Phone', readablePhone(g('phone'))],
		['Email', g('email')],
		['City', g('city')],
		['PIN code', g('pincode')],
		['Date of birth', g('dateOfBirth')],
		['Gender', g('genderOther') || (GENDER[g('gender')] ?? g('gender'))],
		['Preferred language', LANG[g('language')] ?? g('language')],
		['Areas', list((p.interests as string[]) ?? [])],
		['How you found us', g('heardOther') || (HEARD[g('heardFrom')] ?? g('heardFrom'))],
		['We may contact you by', by],
		['Parent or guardian', g('guardianName')],
		["Guardian's email", g('guardianEmail')],
		["Guardian's phone", readablePhone(g('guardianPhone'))],
	];
	return rows.filter(([, v]) => v !== '');
};

const asText = (rows: Row[]): string => rows.map(([k, v]) => `  ${k}: ${v}`).join('\n');

const asTable = (rows: Row[]): string =>
	`<table role="presentation" cellpadding="0" cellspacing="0" border="0"
        style="width:100%;margin:0 0 22px;border-collapse:collapse;">` +
	rows
		.map(
			([k, v]) => `<tr>
          <td style="padding:7px 14px 7px 0;vertical-align:top;white-space:nowrap;
                     font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#70695f;
                     border-bottom:1px solid rgba(44,39,33,0.10);">${esc(k)}</td>
          <td style="padding:7px 0;vertical-align:top;font-size:15px;color:#2c2721;
                     border-bottom:1px solid rgba(44,39,33,0.10);">${esc(v)}</td>
        </tr>`,
		)
		.join('') +
	`</table>`;

export interface Message {
	subject: string;
	text: string;
	html: string;
}

const wrap = (body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:32px 20px;background:#fbf8f0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
    style="max-width:34rem;margin:0 auto;font-family:Georgia,'Times New Roman',serif;
           font-size:16px;line-height:1.6;color:#2c2721;">
    <tr><td>
      <p style="margin:0 0 28px;font-size:11px;letter-spacing:0.18em;
                text-transform:uppercase;color:#1c6b77;">The Itti Foundation</p>
      ${body}
      <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid rgba(44,39,33,0.14);
                font-size:13px;color:#70695f;">
        What we hold and why:
        <a href="https://itti.org.in/privacy" style="color:#1c6b77;">itti.org.in/privacy</a>
      </p>
    </td></tr>
  </table>
</body></html>`;

export const welcome = (p: Record<string, unknown>): Message => {
	const first = String(p.firstName ?? '').trim();
	const interests = list((p.interests as string[]) ?? []);
	const greeting = first ? `Thank you, ${first}.` : 'Thank you.';
	const chose = interests
		? `You asked to connect with ${interests}.`
		: `You have not told us yet which part of our work you want.`;

	// The receipt. Asking someone to correct us without showing them what we
	// wrote down asks them to remember a form they filled in once.
	const rows = snapshot(p);

	return {
		subject: first ? `Thank you, ${first}` : 'Thank you for registering',
		text: [
			greeting,
			'',
			'We have your details, and we will be in touch.',
			'',
			chose,
			'',
			'This is what we wrote down:',
			'',
			asText(rows),
			'',
			'If any of the above information is wrong, or you would rather not share it, reply to this message and we will address it.',
			'',
			'The Itti Foundation',
			'https://itti.org.in/privacy',
		].join('\n'),
		html: wrap(`
      <p style="margin:0 0 18px;font-size:28px;line-height:1.2;">${esc(greeting)}</p>
      <p style="margin:0 0 18px;">We have your details, and we will be in touch.</p>
      <p style="margin:0 0 26px;">${esc(chose)}</p>
      <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.18em;
                text-transform:uppercase;color:#70695f;">What we wrote down</p>
      ${asTable(rows)}
      <p style="margin:0;">If any of the above information is wrong, or you would rather not
        share it, reply to this message and we will address it.</p>`),
	};
};

export const guardianNotice = (p: Record<string, unknown>): Message => {
	const child = String(p.childName ?? 'Someone').trim();
	const guardian = String(p.guardianName ?? '').trim();
	const interests = list((p.interests as string[]) ?? []);
	const greeting = guardian ? `Dear ${guardian},` : 'Hello,';

	return {
		subject: `${child} has registered with The Itti Foundation`,
		text: [
			greeting,
			'',
			`${child} is under 18 and has registered with us, giving your address as their parent or guardian.`,
			interests ? `They asked to connect with ${interests}.` : '',
			'',
			'We will not act on their registration until you tell us we may. Reply to this message to agree, or to ask us to remove it.',
			'',
			'The Itti Foundation',
			'https://itti.org.in/privacy',
		]
			.filter((l) => l !== '')
			.join('\n'),
		html: wrap(`
      <p style="margin:0 0 18px;font-size:24px;line-height:1.25;">${esc(greeting)}</p>
      <p style="margin:0 0 18px;">${esc(child)} is under 18 and has registered with us, giving
        your address as their parent or guardian.</p>
      ${interests ? `<p style="margin:0 0 18px;">They asked to connect with ${esc(interests)}.</p>` : ''}
      <p style="margin:0;">We will not act on their registration until you tell us we may.
        Reply to this message to agree, or to ask us to remove it.</p>`),
	};
};
