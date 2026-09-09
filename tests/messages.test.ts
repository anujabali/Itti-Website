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
		expect(m.text).toContain('Cancer Care and Neurodivergence');
	});

	// A list is read aloud by the person receiving it, so it is punctuated the
	// way it is spoken rather than the way a column stores it.
	it('says a list of areas the way somebody would say it', () => {
		const areas = (interests: string[]) =>
			welcome({ firstName: 'Asha', interests }).text;

		expect(areas(['claw'])).toContain('connect with Conservation.');
		expect(areas(['cancer_care', 'claw'])).toContain('Cancer Care and Conservation');
		expect(areas(['neurodivergence', 'cancer_care', 'claw'])).toContain(
			'Neurodivergence, Cancer Care and Conservation',
		);
		// No serial comma, and never a bare comma before the last item.
		expect(areas(['neurodivergence', 'cancer_care', 'claw'])).not.toContain(
			'Cancer Care, and Conservation',
		);
	});

	// The receipt exists so somebody can check it, which it cannot do while it
	// calls their answer something other than what they picked.
	it('echoes the words the form showed, not the values the table keeps', () => {
		const receipt = welcome({
			firstName: 'Asha',
			interests: [],
			fullName: 'Asha Rao',
			gender: 'woman',
			role: 'caregiver',
			heardFrom: 'search',
			consentWhatsapp: true,
			consentSms: true,
			consentEmail: true,
		}).text;

		expect(receipt).toContain('Gender: Female');
		expect(receipt).not.toContain('Woman');
		expect(receipt).toContain('You are: Caregiver / Family Member');
		expect(receipt).toContain('How you found us: A search engine');
		expect(receipt).toContain('We may contact you by: WhatsApp, SMS and Email');
	});

	// The catch-all role is the one somebody reads about themselves on a page
	// that opens with their name, so it is not called "Other".
	it('calls the catch-all role Member, not Other', () => {
		const said = (role: string) =>
			welcome({ firstName: 'Asha', interests: [], role }).text;
		expect(said('other')).toContain('You are: Member');
		expect(said('other')).not.toContain('You are: Other');
		// And the areas keep their own "other", which means something else.
		expect(welcome({ interests: ['other'] }).text).toContain('connect with Other');
	});

	// A blank line is a question nobody answered, not a gap to display.
	it('leaves out what was never filled in', () => {
		const sparse = welcome({ firstName: 'Asha', interests: [], city: 'Pune' });
		expect(sparse.text).toContain('City: Pune');
		expect(sparse.text).not.toContain('PIN code');
		expect(sparse.text).not.toContain("Guardian's email");
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
