export interface PincodeResult {
  city: string;
  state: string;
  district?: string;
  postOffice?: string;
}

interface IndiaPostResponse {
  Status?: string;
  Message?: string;
  PostOffice?: Array<{ Name?: string; District?: string; State?: string }>;
}

export async function lookupPincode(pincode: string): Promise<PincodeResult | null> {
  const pin = pincode.trim();
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(pin)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as IndiaPostResponse[];
    const offices = body?.[0]?.PostOffice;
    if (!offices?.length) return null;
    const office = offices[0];
    const district = office.District?.trim() || '';
    const state = office.State?.trim() || '';
    const postOffice = office.Name?.trim() || '';
    return { city: district || postOffice, state, district, postOffice };
  } catch {
    return null;
  }
}
