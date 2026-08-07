import { useEffect, useMemo, useState } from "react";

import { type Transaction } from "@/types/transaction";

import { extractDotTags, extractHashtags, extractTagsFromPurpose, isTypingHashtag, isTypingTag } from "../utils/tags";
import { loadTagSuggestions } from "../utils/tag-suggestions";

export function useNote(
  transaction: Transaction,
  isExpanded: boolean,
  onSaveNote: (transactionId: number, note: string | null) => Promise<void>,
  onNoteDraftChange?: (draft: string) => void,
) {
  const [noteDraft, setNoteDraft] = useState(transaction.texte.anmerkung);
  const [savingNote, setSavingNote] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const typingHashtag = isTypingHashtag(noteDraft);
  const isTypingTagNow = isTypingTag(noteDraft);

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

  useEffect(() => {
    if (!isTypingTagNow || suggestions.length > 0) return;
    let active = true;
    void loadTagSuggestions().then((tags) => {
      if (active) setSuggestions(tags);
    });
    return () => {
      active = false;
    };
  }, [isTypingTagNow, suggestions.length]);

  const trailingTagPrefix = useMemo(() => {
    if (!isTypingTagNow) return "";
    const lastWord = noteDraft.trimEnd().split(/\s+/).pop() ?? "";
    return lastWord.slice("tag.".length).toLowerCase();
  }, [noteDraft, isTypingTagNow]);

  const matchingSuggestions = useMemo(() => {
    if (!isTypingTagNow || suggestions.length === 0) return [];
    if (!trailingTagPrefix) return suggestions;
    return suggestions.filter((name) => name.toLowerCase().startsWith(trailingTagPrefix));
  }, [isTypingTagNow, suggestions, trailingTagPrefix]);

  const applyTagSuggestion = (name: string) => {
    const full = name.startsWith("tag.") ? name : `tag.${name}`;
    setNoteDraft((draft) => draft.replace(/tag\.[\w.]*$/u, `${full} `));
  };

  const noteHashtags = useMemo(() => extractHashtags(noteDraft), [noteDraft]);
  const noteDotTags = useMemo(() => extractDotTags(noteDraft), [noteDraft]);
  const purposeTags = useMemo(
    () =>
      extractTagsFromPurpose(
        [transaction.texte.verwendungszweck, transaction.texte.zusatzVerwendungszweck]
          .filter(Boolean)
          .join(" "),
      ),
    [transaction.texte.verwendungszweck, transaction.texte.zusatzVerwendungszweck],
  );
  const allHashtags = useMemo(() => [...new Set(noteHashtags)], [noteHashtags]);
  const allTags = useMemo(
    () => [...new Set([...purposeTags, ...noteDotTags])],
    [purposeTags, noteDotTags],
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
    typingHashtag,
    typingTag: isTypingTagNow,
    allHashtags,
    allTags,
    matchingSuggestions,
    applyTagSuggestion,
    noteChanged,
    trimmedNoteDraft,
    saveNote,
    resetNote,
  };
}
