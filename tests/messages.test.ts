import { describe, expect, it } from 'vitest';
import {
	guardianNotice,
	welcome,
} from '../supabase/functions/send-notifications/messages';

describe('the welcome message', () => {
	const m = welcome({
		firstName: 'Asha',
		interests: ['cancer_care', 'neurodivergence'],
	});

	it('greets by first name and names the areas in words', () => {
		expect(m.subject).toBe('Thank you, Asha');
		expect(m.text).toContain('Thank you, Asha.');
		expect(m.text).toContain('Cancer Care, Neurodivergence');
	});

	it('offers the route to correction the privacy page promises', () => {
		expect(m.text).toMatch(/reply to this message/i);
		expect(m.html).toContain('itti.org.in/privacy');
	});

	it('reads without a name, rather than greeting an empty space', () => {
		const anon = welcome({ interests: [] });
		expect(anon.subject).toBe('Thank you for registering');
		expect(anon.text).toContain('Thank you.');
		expect(anon.text).not.toContain('undefined');
	});

	it('says something true when no area was chosen', () => {
		expect(welcome({ firstName: 'Asha', interests: [] }).text).toContain(
			'not told us yet',
		);
	});

	it('escapes a name that contains markup', () => {
		const m2 = welcome({ firstName: '<script>x</script>', interests: [] });
		expect(m2.html).not.toContain('<script>x');
		expect(m2.html).toContain('&lt;script&gt;');
	});
});

describe('the guardian notice', () => {
	const m = guardianNotice({
		guardianName: 'Meera',
		childName: 'Asha Rao',
		interests: ['cancer_care'],
	});

	it('addresses the guardian and names the child', () => {
		expect(m.subject).toBe('Asha Rao has registered with The Itti Foundation');
		expect(m.text).toContain('Dear Meera,');
		expect(m.text).toContain('Asha Rao is under 18');
	});

	it('states the undertaking the privacy page makes', () => {
		expect(m.text).toMatch(/will not act on their registration until you tell us/i);
	});

	it('works without a guardian name', () => {
		const m2 = guardianNotice({ childName: 'Asha', interests: [] });
		expect(m2.text).toContain('Hello,');
		expect(m2.text).not.toContain('undefined');
	});
});
