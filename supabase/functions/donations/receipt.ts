/**
 * The acknowledgement a donor gets.
 *
 * It is deliberately not called a receipt anywhere it can be read as one. The
 * Foundation holds no 80G registration yet, so nothing sent from here can be
 * used to claim relief, and a document that looks like a tax receipt but is not
 * one is worse than no document at all. When 80G arrives this is where the
 * certificate language goes, and not before.
 *
 * Test-mode payments say so on their face. A test acknowledgement that reads
 * like a real one is how somebody ends up thanking a donor who paid nothing.
 */

export interface Message {
	subject: string;
	text: string;
	html: string;
}

const SAID: Record<string, string> = {
	neurodivergence: 'Neurodivergence',
	cancer_care: 'Cancer Care',
	claw: 'Conservation',
};

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Paise to rupees, grouped the way the page groups them. */
const rupees = (paise: number) =>
	`₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

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
        <a href="https://itti.org.in/policies#privacy" style="color:#1c6b77;">itti.org.in/policies</a>
      </p>
    </td></tr>
  </table>
</body></html>`;

export const acknowledgement = (p: {
	name: string | null;
	amountPaise: number;
	pillar: string | null;
	paymentId: string;
	test: boolean;
}): Message => {
	const first = (p.name ?? '').trim().split(/\s+/)[0] ?? '';
	const greeting = first ? `Thank you, ${first}.` : 'Thank you.';
	const amount = rupees(p.amountPaise);
	const where = p.pillar && SAID[p.pillar]
		? `You asked us to direct it to ${SAID[p.pillar]}, and we will.`
		: 'You left it to us to put where it is needed most, and we will.';

	const lines = [
		greeting,
		'',
		`We have received ${amount}.`,
		'',
		where,
		'',
		`Reference: ${p.paymentId}`,
		'',
		'Two things we would rather you heard from us than found out later. The Foundation does not yet hold 80G registration, so this gift does not reduce your tax and this message is not a tax receipt. And if you ever want to know what a gift was spent on, ask us — we will tell you plainly, including the part that went on rent and salaries.',
		'',
		'If anything here is wrong, reply to this message and we will put it right.',
		'',
		'The Itti Foundation',
	];

	if (p.test) {
		lines.unshift('THIS IS A TEST PAYMENT. No money has moved.', '');
	}

	return {
		subject: p.test
			? `[Test] Thank you for your gift of ${amount}`
			: first
				? `Thank you, ${first}`
				: 'Thank you for your gift',
		text: lines.join('\n'),
		html: wrap(`
      ${
				p.test
					? `<p style="margin:0 0 20px;padding:10px 14px;background:#f4efe2;
             border-left:3px solid #b4914f;font-size:14px;">
             <strong>This is a test payment.</strong> No money has moved.</p>`
					: ''
			}
      <p style="margin:0 0 18px;font-size:20px;">${esc(greeting)}</p>
      <p style="margin:0 0 18px;">We have received <strong>${amount}</strong>.</p>
      <p style="margin:0 0 18px;">${esc(where)}</p>
      <p style="margin:0 0 18px;font-size:13px;color:#70695f;">
        Reference: ${esc(p.paymentId)}</p>
      <p style="margin:0 0 18px;">Two things we would rather you heard from us than found
        out later. The Foundation does not yet hold 80G registration, so this gift does not
        reduce your tax and this message is not a tax receipt. And if you ever want to know
        what a gift was spent on, ask us — we will tell you plainly, including the part that
        went on rent and salaries.</p>
      <p style="margin:0;">If anything here is wrong, reply to this message and we will put
        it right.</p>`),
	};
};
