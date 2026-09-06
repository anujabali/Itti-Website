import { describe, expect, it } from 'vitest';
import { validateForm1 } from '../src/components/forms/form-1/validation';
import type { Form1Data } from '../src/components/forms/form-1/types';
import { LIMITS } from '../src/lib/validation/rules';

const yearsAgo = (years: number, offsetDays = 0) => {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setFullYear(d.getFullYear() - years);
	d.setDate(d.getDate() + offsetDays);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const complete = (over: Partial<Form1Data> = {}): Form1Data => ({
	fullName: 'Asha Rao',
	phone: '',
	countryIso2: 'IN',
	email: 'asha@example.com',
	dateOfBirth: '1990-01-01',
	gender: 'woman',
	city: 'Pune',
	state: 'Maharashtra',
	pincode: '411001',
	preferredLanguage: '',
	role: 'caregiver',
	pillars: ['cancer_care'],
	consentWhatsapp: false,
	consentSms: false,
	consentEmail: false,
	...over,
});

describe('a complete form', () => {
	it('passes', () => {
		expect(validateForm1(complete()).isValid).toBe(true);
	});
});

describe('contact', () => {
	it('needs one of phone or email, not both', () => {
		expect(validateForm1(complete({ email: '', phone: '9876543210' })).isValid).toBe(
			true,
		);
		expect(validateForm1(complete({ email: 'a@b.co', phone: '' })).isValid).toBe(true);
		expect(
			validateForm1(complete({ email: '', phone: '' })).errors.contact,
		).toBeTruthy();
	});
});

describe('areas of interest', () => {
	it('needs at least one, and accepts several', () => {
		expect(validateForm1(complete({ pillars: [] })).errors.pillars).toBeTruthy();
		expect(
			validateForm1(complete({ pillars: ['cancer_care', 'neurodivergence'] })).isValid,
		).toBe(true);
	});
});

describe('under 18', () => {
	const minorDob = yearsAgo(LIMITS.adultAge, 1);

	it('needs a guardian we can reach', () => {
		const errors = validateForm1(complete({ dateOfBirth: minorDob })).errors;
		expect(errors.guardianContact).toBeTruthy();
	});

	it('is satisfied by a guardian phone or a guardian email', () => {
		expect(
			validateForm1(complete({ dateOfBirth: minorDob, guardianPhone: '9876543210' }))
				.isValid,
		).toBe(true);
		expect(
			validateForm1(complete({ dateOfBirth: minorDob, guardianEmail: 'p@example.com' }))
				.isValid,
		).toBe(true);
	});

	it('still checks the guardian details it was given', () => {
		const errors = validateForm1(
			complete({ dateOfBirth: minorDob, guardianPhone: '123', guardianEmail: 'nope' }),
		).errors;
		expect(errors.guardianPhone).toBeTruthy();
		expect(errors.guardianEmail).toBeTruthy();
	});

	it('asks nothing of an adult, including on their eighteenth birthday', () => {
		expect(
			validateForm1(complete({ dateOfBirth: yearsAgo(LIMITS.adultAge) })).isValid,
		).toBe(true);
	});
});

describe('required fields', () => {
	it.each([
		['fullName', { fullName: '' }],
		['city', { city: '' }],
		['role', { role: '' as Form1Data['role'] }],
		['gender', { gender: '' as Form1Data['gender'] }],
		['dateOfBirth', { dateOfBirth: '' }],
		['pincode', { pincode: '' }],
	])('%s is required', (field, over) => {
		const { isValid, errors } = validateForm1(complete(over as Partial<Form1Data>));
		expect(isValid).toBe(false);
		expect(errors[field as keyof typeof errors]).toBeTruthy();
	});

	it('does not require an Indian PIN outside India', () => {
		expect(
			validateForm1(complete({ countryIso2: 'DE', pincode: '' })).errors.pincode,
		).toBeUndefined();
	});
});
