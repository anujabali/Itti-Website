import { beforeEach, describe, expect, it } from 'vitest';
import { readAcquisition } from '../src/lib/validation/acquisition';

const visit = (search: string, referrer = '') => {
	window.history.replaceState({}, '', `/join/${search}`);
	Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
};

describe('what a visit arrived with', () => {
	beforeEach(() => visit(''));

	it('is empty when there is nothing to read', () => {
		expect(readAcquisition()).toEqual({});
	});

	it('picks up campaign tags and a referral code', () => {
		visit('?utm_source=instagram&utm_campaign=launch&ref=ABC1');
		expect(readAcquisition()).toEqual({
			utm: { utm_source: 'instagram', utm_campaign: 'launch' },
			referrerCode: 'ABC1',
		});
	});

	it('keeps only the host of a referring site, never the page', () => {
		visit('', 'https://news.example.com/some/article?q=1');
		expect(readAcquisition().utm).toEqual({ referrer: 'news.example.com' });
	});

	it('ignores our own site as a referrer', () => {
		visit('', `${window.location.origin}/`);
		expect(readAcquisition()).toEqual({});
	});

	it('truncates a value that is too long to be a tag', () => {
		visit(`?utm_source=${'x'.repeat(400)}`);
		expect(readAcquisition().utm!.utm_source).toHaveLength(120);
	});

	it('survives a referrer it cannot parse', () => {
		visit('', 'not-a-url');
		expect(() => readAcquisition()).not.toThrow();
	});
});
