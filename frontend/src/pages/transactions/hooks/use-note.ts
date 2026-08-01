import { useEffect, useMemo, useState } from "react";

import { type Transaction } from "@/types/transaction";

import { extractHashtags, extractTagsFromPurpose, isTypingHashtag } from "../utils/tags";

export function useNote(
  transaction: Transaction,
  isExpanded: boolean,
  onSaveNote: (transactionId: number, note: string | null) => Promise<void>,
  onNoteDraftChange?: (draft: string) => void,
) {
  const [noteDraft, setNoteDraft] = useState(transaction.texte.anmerkung);
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    setNoteDraft(transaction.texte.anmerkung);
  }, [transaction.id, transaction.texte.anmerkung]);

  useEffect(() => {
    if (!isExpanded) setNoteDraft(transaction.texte.anmerkung);
  }, [isExpanded, transaction.texte.anmerkung]);

  useEffect(() => {
    onNoteDraftChange?.(noteDraft);
  }, [noteDraft, onNoteDraftChange]);

  const trimmedNoteDraft = noteDraft.trim();
  const trimmedSavedNote = transaction.texte.anmerkung.trim();
  const noteChanged = trimmedNoteDraft !== trimmedSavedNote;
  const isInTagMode = isTypingHashtag(noteDraft);

  const noteTags = useMemo(() => extractHashtags(noteDraft), [noteDraft]);
  const purposeTags = useMemo(
    () =>
      extractTagsFromPurpose(
        [transaction.texte.verwendungszweck, transaction.texte.zusatzVerwendungszweck]
          .filter(Boolean)
          .join(" "),
      ),
    [transaction.texte.verwendungszweck, transaction.texte.zusatzVerwendungszweck],
  );
  const allTags = useMemo(
    () => [...new Set([...purposeTags, ...noteTags])],
    [purposeTags, noteTags],
  );

  const saveNote = async () => {
    if (!noteChanged || savingNote) return;
    setSavingNote(true);
    try {
      await onSaveNote(transaction.id, trimmedNoteDraft || null);
    } finally {
      setSavingNote(false);
    }
  };

  const resetNote = () => setNoteDraft(transaction.texte.anmerkung);

  return {
    noteDraft,
    setNoteDraft,
    savingNote,
    setSavingNote,
    isInTagMode,
    allTags,
    noteChanged,
    trimmedNoteDraft,
    saveNote,
    resetNote,
  };
}
