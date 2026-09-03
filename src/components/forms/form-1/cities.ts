/**
 * Curated list of Indian cities with state associations for the autocomplete search.
 */
import type { CityOption } from './types';

export const INDIAN_CITIES: CityOption[] = [
	// Maharashtra (Primary examples requested: Pune, Mumbai, Nagpur)
	{ city: 'Pune', state: 'Maharashtra', keywords: ['pune', 'poona', 'mh'] },
	{ city: 'Mumbai', state: 'Maharashtra', keywords: ['mumbai', 'bombay', 'mh'] },
	{ city: 'Nagpur', state: 'Maharashtra', keywords: ['nagpur', 'mh'] },
	{ city: 'Nashik', state: 'Maharashtra', keywords: ['nashik', 'nasik', 'mh'] },
	{ city: 'Thane', state: 'Maharashtra', keywords: ['thane', 'mh'] },
	{ city: 'Navi Mumbai', state: 'Maharashtra', keywords: ['navi mumbai', 'mh'] },
	{
		city: 'Aurangabad (Chhatrapati Sambhajinagar)',
		state: 'Maharashtra',
		keywords: ['aurangabad', 'sambhajinagar', 'mh'],
	},
	{ city: 'Kolhapur', state: 'Maharashtra', keywords: ['kolhapur', 'mh'] },
	{ city: 'Solapur', state: 'Maharashtra', keywords: ['solapur', 'mh'] },
	{ city: 'Amravati', state: 'Maharashtra', keywords: ['amravati', 'mh'] },

	// Delhi NCR
	{ city: 'New Delhi', state: 'Delhi', keywords: ['delhi', 'new delhi', 'ncr', 'dl'] },
	{
		city: 'Noida',
		state: 'Uttar Pradesh',
		keywords: ['noida', 'gautam buddha nagar', 'ncr', 'up'],
	},
	{
		city: 'Gurugram (Gurgaon)',
		state: 'Haryana',
		keywords: ['gurgaon', 'gurugram', 'ncr', 'hr'],
	},
	{ city: 'Ghaziabad', state: 'Uttar Pradesh', keywords: ['ghaziabad', 'ncr', 'up'] },
	{ city: 'Faridabad', state: 'Haryana', keywords: ['faridabad', 'ncr', 'hr'] },

	// Karnataka
	{
		city: 'Bengaluru (Bangalore)',
		state: 'Karnataka',
		keywords: ['bangalore', 'bengaluru', 'blr', 'ka'],
	},
	{ city: 'Mysuru (Mysore)', state: 'Karnataka', keywords: ['mysore', 'mysuru', 'ka'] },
	{
		city: 'Mangaluru (Mangalore)',
		state: 'Karnataka',
		keywords: ['mangalore', 'mangaluru', 'ka'],
	},
	{
		city: 'Hubballi-Dharwad',
		state: 'Karnataka',
		keywords: ['hubli', 'hubballi', 'dharwad', 'ka'],
	},

	// Telangana & Andhra Pradesh
	{
		city: 'Hyderabad',
		state: 'Telangana',
		keywords: ['hyderabad', 'secunderabad', 'hyd', 'ts'],
	},
	{ city: 'Warangal', state: 'Telangana', keywords: ['warangal', 'ts'] },
	{
		city: 'Visakhapatnam',
		state: 'Andhra Pradesh',
		keywords: ['vizag', 'visakhapatnam', 'ap'],
	},
	{ city: 'Vijayawada', state: 'Andhra Pradesh', keywords: ['vijayawada', 'ap'] },

	// Tamil Nadu
	{ city: 'Chennai', state: 'Tamil Nadu', keywords: ['chennai', 'madras', 'tn'] },
	{ city: 'Coimbatore', state: 'Tamil Nadu', keywords: ['coimbatore', 'kovai', 'tn'] },
	{ city: 'Madurai', state: 'Tamil Nadu', keywords: ['madurai', 'tn'] },
	{
		city: 'Tiruchirappalli (Trichy)',
		state: 'Tamil Nadu',
		keywords: ['trichy', 'tiruchirappalli', 'tn'],
	},

	// Gujarat
	{ city: 'Ahmedabad', state: 'Gujarat', keywords: ['ahmedabad', 'amdavad', 'gj'] },
	{ city: 'Surat', state: 'Gujarat', keywords: ['surat', 'gj'] },
	{
		city: 'Vadodara (Baroda)',
		state: 'Gujarat',
		keywords: ['vadodara', 'baroda', 'gj'],
	},
	{ city: 'Rajkot', state: 'Gujarat', keywords: ['rajkot', 'gj'] },

	// West Bengal
	{ city: 'Kolkata', state: 'West Bengal', keywords: ['kolkata', 'calcutta', 'wb'] },
	{ city: 'Howrah', state: 'West Bengal', keywords: ['howrah', 'wb'] },
	{ city: 'Siliguri', state: 'West Bengal', keywords: ['siliguri', 'wb'] },

	// Rajasthan
	{ city: 'Jaipur', state: 'Rajasthan', keywords: ['jaipur', 'pink city', 'rj'] },
	{ city: 'Jodhpur', state: 'Rajasthan', keywords: ['jodhpur', 'rj'] },
	{ city: 'Udaipur', state: 'Rajasthan', keywords: ['udaipur', 'rj'] },
	{ city: 'Kota', state: 'Rajasthan', keywords: ['kota', 'rj'] },

	// Madhya Pradesh
	{ city: 'Indore', state: 'Madhya Pradesh', keywords: ['indore', 'mp'] },
	{ city: 'Bhopal', state: 'Madhya Pradesh', keywords: ['bhopal', 'mp'] },
	{ city: 'Gwalior', state: 'Madhya Pradesh', keywords: ['gwalior', 'mp'] },

	// Uttar Pradesh
	{ city: 'Lucknow', state: 'Uttar Pradesh', keywords: ['lucknow', 'up'] },
	{ city: 'Kanpur', state: 'Uttar Pradesh', keywords: ['kanpur', 'up'] },
	{
		city: 'Varanasi',
		state: 'Uttar Pradesh',
		keywords: ['varanasi', 'banaras', 'kashi', 'up'],
	},
	{ city: 'Agra', state: 'Uttar Pradesh', keywords: ['agra', 'up'] },
	{
		city: 'Prayagraj (Allahabad)',
		state: 'Uttar Pradesh',
		keywords: ['allahabad', 'prayagraj', 'up'],
	},

	// Kerala
	{
		city: 'Kochi (Cochin)',
		state: 'Kerala',
		keywords: ['kochi', 'cochin', 'ernakulam', 'kl'],
	},
	{
		city: 'Thiruvananthapuram (Trivandrum)',
		state: 'Kerala',
		keywords: ['trivandrum', 'thiruvananthapuram', 'kl'],
	},
	{
		city: 'Kozhikode (Calicut)',
		state: 'Kerala',
		keywords: ['calicut', 'kozhikode', 'kl'],
	},

	// Punjab & Chandigarh
	{ city: 'Chandigarh', state: 'Chandigarh', keywords: ['chandigarh', 'chd'] },
	{ city: 'Ludhiana', state: 'Punjab', keywords: ['ludhiana', 'pb'] },
	{ city: 'Amritsar', state: 'Punjab', keywords: ['amritsar', 'pb'] },

	// Goa & Others
	{ city: 'Panaji', state: 'Goa', keywords: ['panaji', 'panjim', 'goa'] },
	{ city: 'Patna', state: 'Bihar', keywords: ['patna', 'br'] },
	{ city: 'Bhubaneswar', state: 'Odisha', keywords: ['bhubaneswar', 'od'] },
	{ city: 'Ranchi', state: 'Jharkhand', keywords: ['ranchi', 'jh'] },
	{ city: 'Guwahati', state: 'Assam', keywords: ['guwahati', 'as'] },
	{ city: 'Dehradun', state: 'Uttarakhand', keywords: ['dehradun', 'uk'] },
];

/**
 * Normalizes string for fuzzy match comparison.
 */
function normalize(str: string): string {
	return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Searches the curated cities array and returns ranked matches.
 */
export function searchCities(query: string, limit = 8): CityOption[] {
	const clean = query.trim();
	if (!clean || clean.length < 1) return [];

	const qNorm = normalize(clean);
	const lower = clean.toLowerCase();

	const matches = INDIAN_CITIES.filter((item) => {
		if (item.city.toLowerCase().includes(lower)) return true;
		if (item.state.toLowerCase().includes(lower)) return true;
		if (item.keywords?.some((k) => k.includes(lower) || normalize(k).includes(qNorm)))
			return true;
		return false;
	});

	// Sort: Exact prefix of city first, then city includes, then state
	matches.sort((a, b) => {
		const aStarts = a.city.toLowerCase().startsWith(lower);
		const bStarts = b.city.toLowerCase().startsWith(lower);
		if (aStarts && !bStarts) return -1;
		if (!aStarts && bStarts) return 1;
		return a.city.localeCompare(b.city);
	});

	return matches.slice(0, limit);
}
