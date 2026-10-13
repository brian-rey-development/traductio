export type LanguagePair = { readonly from: string; readonly to: string };

// Characters needed per unit of meaning relative to alphabetic scripts, used to scale length checks and chunk sizes.
const SCRIPT_DENSITY: Readonly<Record<string, number>> = { zh: 0.3, ja: 0.4, ko: 0.45 };

const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });

export const languageName = (code: string): string => {
  const name = displayNames.of(code);
  if (!name || name === code) throw new Error(`Unknown language code "${code}"`);
  return name;
};

export const parseLanguage = (code: string): string => {
  languageName(code);
  return code;
};

export const scriptDensity = (code: string): number => SCRIPT_DENSITY[code.split('-')[0] ?? code] ?? 1;

export const expectedLengthRatio = ({ from, to }: LanguagePair): number => scriptDensity(to) / scriptDensity(from);
