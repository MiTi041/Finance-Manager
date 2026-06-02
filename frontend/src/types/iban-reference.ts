export interface IbanKontoinhaberReferenceDto {
  iban: string;
  f_kontoinhaber_id: number;
  kontoinhaber_name: string;
  kontoinhaber_website?: string | null;
  kontoinhaber_logo_url?: string | null;
  kontoinhaber_logo_white_background?: boolean | null;
  kontoinhaber_logo_padding?: boolean | null;
  kontoinhaber_is_company?: boolean | number | null;
  resolved_logo_url?: string | null;
}

export interface IbanKontoinhaberReference {
  iban: string;
  kontoinhaberId: number;
  kontoinhaberName: string;
  kontoinhaberWebsite?: string | null;
  kontoinhaberLogoUrl?: string | null;
  kontoinhaberLogoWhiteBackground?: boolean;
  kontoinhaberLogoPadding?: boolean;
  resolvedLogoUrl?: string | null;
  kontoinhaberIsCompany?: boolean;
}
