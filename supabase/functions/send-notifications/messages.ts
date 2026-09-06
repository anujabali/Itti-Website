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
	claw: 'CLAW',
	not_sure: 'Not sure yet',
	other: 'Other',
};

const say = (v: string) => SAID[v] ?? v.replace(/_/g, ' ');

const list = (interests: string[]): string =>
	interests.length === 0 ? '' : interests.map(say).join(', ');

/** Escapes for the HTML part. The values are names people typed. */
const esc = (s: string) =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

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

	return {
		subject: first ? `Thank you, ${first}` : 'Thank you for registering',
		text: [
			greeting,
			'',
			'We have your details, and someone from the right part of the foundation will be in touch.',
			'',
			chose,
			'',
			'If anything here is wrong, or you would rather we not keep it, reply to this message and we will put it right.',
			'',
			'The Itti Foundation',
			'https://itti.org.in/privacy',
		].join('\n'),
		html: wrap(`
      <p style="margin:0 0 18px;font-size:28px;line-height:1.2;">${esc(greeting)}</p>
      <p style="margin:0 0 18px;">We have your details, and someone from the right part of the
        foundation will be in touch.</p>
      <p style="margin:0 0 18px;">${esc(chose)}</p>
      <p style="margin:0;">If anything here is wrong, or you would rather we not keep it,
        reply to this message and we will put it right.</p>`),
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
