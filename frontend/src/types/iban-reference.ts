import type { LogoBackground } from "@/lib/zahlungspartner";

export interface IbanZahlungspartnerReferenceDto {
  iban: string;
  f_zahlungspartner_id: number;
  zahlungspartner_name: string;
  zahlungspartner_website?: string | null;
  zahlungspartner_logo_url?: string | null;
  zahlungspartner_logo_background?: LogoBackground | null;
  zahlungspartner_logo_padding?: boolean | null;
  zahlungspartner_is_company?: boolean | number | null;
  resolved_logo_url?: string | null;
}

export interface IbanZahlungspartnerReference {
  iban: string;
  zahlungspartnerId: number;
  zahlungspartnerName: string;
  zahlungspartnerWebsite?: string | null;
  zahlungspartnerLogoUrl?: string | null;
  zahlungspartnerLogoBackground?: LogoBackground;
  zahlungspartnerLogoPadding?: boolean;
  resolvedLogoUrl?: string | null;
  zahlungspartnerIsCompany?: boolean;
}
