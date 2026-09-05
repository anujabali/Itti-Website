export interface Country {
  iso2: string;
  name: string;
  dialCode: string;
  flag: string;
  min: number;
  max: number;
}

const raw: Array<[string,string,string,number,number]> = [
['IN','India','+91',10,10],['US','United States','+1',10,10],['GB','United Kingdom','+44',10,10],['CA','Canada','+1',10,10],
['AU','Australia','+61',9,9],['NZ','New Zealand','+64',8,10],['AE','United Arab Emirates','+971',9,9],['SA','Saudi Arabia','+966',9,9],
['SG','Singapore','+65',8,8],['MY','Malaysia','+60',9,10],['TH','Thailand','+66',9,9],['ID','Indonesia','+62',9,11],
['PH','Philippines','+63',10,10],['JP','Japan','+81',9,10],['CN','China','+86',11,11],['KR','South Korea','+82',9,10],
['BD','Bangladesh','+880',10,10],['PK','Pakistan','+92',10,10],['LK','Sri Lanka','+94',9,9],['NP','Nepal','+977',10,10],
['BT','Bhutan','+975',8,8],['AF','Afghanistan','+93',9,9],['QA','Qatar','+974',8,8],['KW','Kuwait','+965',8,8],
['OM','Oman','+968',8,8],['BH','Bahrain','+973',8,8],['IL','Israel','+972',9,9],['TR','Turkey','+90',10,10],
['DE','Germany','+49',10,11],['FR','France','+33',9,9],['IT','Italy','+39',9,10],['ES','Spain','+34',9,9],
['PT','Portugal','+351',9,9],['NL','Netherlands','+31',9,9],['BE','Belgium','+32',9,9],['CH','Switzerland','+41',9,9],
['AT','Austria','+43',10,13],['SE','Sweden','+46',9,10],['NO','Norway','+47',8,8],['DK','Denmark','+45',8,8],
['FI','Finland','+358',9,10],['IE','Ireland','+353',9,9],['IS','Iceland','+354',7,7],['PL','Poland','+48',9,9],
['CZ','Czechia','+420',9,9],['GR','Greece','+30',10,10],['RO','Romania','+40',9,9],['HU','Hungary','+36',9,9],
['UA','Ukraine','+380',9,9],['RU','Russia','+7',10,10],['ZA','South Africa','+27',9,9],['NG','Nigeria','+234',10,10],
['KE','Kenya','+254',9,9],['GH','Ghana','+233',9,9],['EG','Egypt','+20',10,10],['MA','Morocco','+212',9,9],
['BR','Brazil','+55',10,11],['MX','Mexico','+52',10,10],['AR','Argentina','+54',10,10],['CL','Chile','+56',9,9],
['CO','Colombia','+57',10,10],['PE','Peru','+51',9,9],['VE','Venezuela','+58',10,10],['JM','Jamaica','+1',10,10],
['TT','Trinidad and Tobago','+1',10,10],['MV','Maldives','+960',7,7],['MM','Myanmar','+95',8,10],
];
const flag = (iso: string) => iso.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
export const COUNTRIES: Country[] = Array.from(new Map(raw.map(([iso,name,dial,min,max]) => [iso,{iso2:iso,name,dialCode:dial,flag:flag(iso),min,max}])).values());
export function findCountry(iso2: string) { return COUNTRIES.find(c => c.iso2 === iso2) ?? COUNTRIES[0]!; }
export function searchCountries(q: string) {
  const x=q.trim().toLowerCase();
  if(!x) return COUNTRIES;
  return COUNTRIES.filter(c => c.name.toLowerCase().includes(x) || c.iso2.toLowerCase()===x || c.dialCode.includes(x.replace(/^\+/,'').trim()));
}
export function detectCountryFromInternationalNumber(value: string): Country | null {
  const digits=value.replace(/\D/g,'');
  if(!value.trim().startsWith('+') && !/^(?:00)/.test(value.trim())) return null;
  const normalized=digits;
  return [...COUNTRIES].sort((a,b)=>b.dialCode.length-a.dialCode.length).find(c => normalized.startsWith(c.dialCode.replace('+',''))) || null;
}
