import { useEffect, useState } from "react";

export function useIbanLinking(
  transactionId: number,
  unknownIban: string | null,
  onLinkIbanToZahlungspartner: (iban: string, zahlungspartnerId: number) => Promise<void>,
  onCreateZahlungspartnerForIban: (iban: string, name: string) => Promise<void>,
) {
  const [selectedZahlungspartnerId, setSelectedZahlungspartnerId] = useState("");
  const [newZahlungspartnerName, setNewZahlungspartnerName] = useState("");
  const [savingIbanMapping, setSavingIbanMapping] = useState(false);

  useEffect(() => {
    setSelectedZahlungspartnerId("");
    setNewZahlungspartnerName("");
  }, [transactionId, unknownIban]);

  const linkUnknownIban = async () => {
    if (!unknownIban || !selectedZahlungspartnerId || savingIbanMapping) return;
    setSavingIbanMapping(true);
    try {
      await onLinkIbanToZahlungspartner(unknownIban, Number(selectedZahlungspartnerId));
    } finally {
      setSavingIbanMapping(false);
    }
  };

  const createOwnerForUnknownIban = async () => {
    const name = newZahlungspartnerName.trim();
    if (!unknownIban || !name || savingIbanMapping) return;
    setSavingIbanMapping(true);
    try {
      await onCreateZahlungspartnerForIban(unknownIban, name);
    } finally {
      setSavingIbanMapping(false);
    }
  };

  return {
    selectedZahlungspartnerId,
    setSelectedZahlungspartnerId,
    newZahlungspartnerName,
    setNewZahlungspartnerName,
    savingIbanMapping,
    linkUnknownIban,
    createOwnerForUnknownIban,
  };
}
