const RECIPIENT = "registrierung@hbci-zka.de";
const SUBJECT = "Registrierungsformular zur Aufnahme eines FinTS-Produktes";
const BODY =
  "Sehr geehrte Damen und Herren,\n\nanbei sende ich Ihnen das ausgefüllte Registrierungsformular zur Aufnahme eines FinTS-Produktes.\n\nMit freundlichen Grüßen\nVorname Nachname";

export async function handleMailRegistration() {
  if (window.api?.openMailWithAttachment) {
    await window.api.openMailWithAttachment({
      to: RECIPIENT,
      subject: SUBJECT,
      body: BODY,
    });
    return;
  }

  const mailto = `mailto:${encodeURIComponent(RECIPIENT)}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`;
  window.open(mailto, "_blank");
}
