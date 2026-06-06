SEED_CATEGORIES_SQL = """
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🧴', 200, 'Drogerie', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💰', 201, 'Einnahmen', NULL, 0, 'Einnahme');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🍽️', 202, 'Essen & Trinken', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💳', 203, 'Finanzen', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 204, 'Freizeit', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏥', 205, 'Gesundheit', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🐾', 206, 'Haustiere', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('👶', 207, 'Kinder', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛍️', 208, 'Lifestyle', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🚗', 209, 'Mobilität', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('📦', 210, 'Sonstiges', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🐷', 211, 'Sparen', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛡️', 212, 'Versicherungen', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏠', 213, 'Wohnen', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏢', 214, 'Gewerbe', NULL, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💰', 20101, 'Elterngeld', 201, 0, 'Einnahme');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💰', 20102, 'Kapitalerträge', 201, 0, 'Einnahme');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💰', 20103, 'Kindergeld', 201, 0, 'Einnahme');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💰', 20104, 'Leistungen der Bundesagentur für Arbeit', 201, 0, 'Einnahme');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💰', 20105, 'Lohn / Gehalt', 201, 0, 'Einnahme');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💰', 20106, 'Mieteinnahmen', 201, 0, 'Einnahme');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💰', 20107, 'Rente/Pension', 201, 0, 'Einnahme');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💰', 20108, 'Sonstige Einnahmen', 201, 0, 'Einnahme');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🍽️', 20201, 'Lebensmittel', 202, 1, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🍽️', 20202, 'Lieferservice', 202, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🍽️', 20203, 'Restaurants', 202, 1, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🍽️', 20204, 'Fast Food', 202, 1, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💳', 20301, 'Bankgebühren', 203, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💳', 20302, 'Kredit', 203, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💳', 20303, 'Sonstige Finanzausgaben', 203, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💳', 20304, 'Spende', 203, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('💳', 20305, 'Steuern', 203, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 20401, 'Bücher & Zeitungen', 204, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 20402, 'Gaming', 204, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 20403, 'In-App-Käufe', 204, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 20404, 'Kino', 204, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 20405, 'Mitgliedschaft', 204, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 20406, 'Musik & Podcast', 204, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 20407, 'Serien & Filme', 204, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 20408, 'Sonstige Freizeitausgaben', 204, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 20409, 'Sport', 204, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 20410, 'Urlaub', 204, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🎉', 20411, 'Veranstaltungen', 204, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏥', 20501, 'Apotheke', 205, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏥', 20502, 'Sonstige Gesundheitsausgaben', 205, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏥', 20503, 'Ärztliche Behandlung', 205, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🐾', 20601, 'Futter & Tierbedarf', 206, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🐾', 20602, 'Tierärztliche Behandlung', 206, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('👶', 20701, 'Kinderbetreuung', 207, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('👶', 20702, 'Schule & Förderung', 207, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('👶', 20703, 'Sonstige Kinderausgaben', 207, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('👶', 20704, 'Taschengeld', 207, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛍️', 20801, 'Bekleidung', 208, 1, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛍️', 20802, 'Bildung', 208, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛍️', 20803, 'Cloud-Dienste', 208, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛍️', 20804, 'Elektrohandel', 208, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛍️', 20805, 'Friseur', 208, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛍️', 20806, 'Geschenke', 208, 1, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛍️', 20807, 'Sonstiger Lifestyle', 208, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛍️', 20808, 'Mobilfunk', 208, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛍️', 20809, 'Prime-Mitgliedschaft', 208, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛍️', 20810, 'Shopping', 208, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🚗', 20901, 'Auto', 209, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🚗', 20902, 'Bus & Bahn', 209, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🚗', 20903, 'Fahrrad', 209, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🚗', 20904, 'Laden', 209, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🚗', 20905, 'Sharing / Gemietet', 209, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🚗', 20906, 'Tanken', 209, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🚗', 20907, 'Taxi', 209, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('📦', 21001, 'Bargeld', 210, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('📦', 21002, 'Kreditkartenabrechnung', 210, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('📦', 21003, 'Sonstige Ausgaben', 210, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🐷', 21101, 'Bausparvertrag', 211, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🐷', 21102, 'Kapitalanlage', 211, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛡️', 21201, 'Brillenversicherung', 212, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛡️', 21202, 'Gesetzliche Krankenversicherung', 212, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛡️', 21203, 'Haftpflichtversicherung', 212, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛡️', 21204, 'KFZ-Versicherung', 212, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛡️', 21205, 'Rechtschutzversicherung', 212, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛡️', 21206, 'Rentenversicherung', 212, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛡️', 21207, 'Sonstige Versicherung', 212, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛡️', 21208, 'Tierhaftpflichtversicherung', 212, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🛡️', 21209, 'Zahnzusatzversicherung', 212, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏠', 21301, 'Bauen / Renovieren', 213, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏠', 21302, 'Baufinanzierung', 213, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏠', 21303, 'Einrichtung', 213, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏠', 21304, 'Gas', 213, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏠', 21305, 'Internet & Telefon', 213, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏠', 21306, 'Miete', 213, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏠', 21307, 'Rundfunkgebühr', 213, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏠', 21308, 'Sonstiges Wohnen', 213, 0, 'Ausgabe');
insert into `kategorien` (`icon`, `id`, `name`, `parent_id`, `personal_expense`, `typ`) values ('🏠', 21309, 'Strom', 213, 0, 'Ausgabe');
"""

SEED_KONTOINHABER_SQL = ""
SEED_IBANS_SQL = ""
SEED_EMPFAENGERKONTEN_SQL = ""
SEED_BANK_CREDENTIALS_SQL = ""
SEED_BANK_ACCOUNTS_SQL = ""
SEED_UMSAETZE_SQL = ""
SEED_APP_SETTINGS_SQL = ""
