const HASHTAG_REGEX = /#([\w.]+)/g;
const DOT_TAG_REGEX = /tag\.([a-zA-Z0-9_äöüÄÖÜß]+)\.([a-zA-Z0-9_äöüÄÖÜß]+)/gi;

export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const tags = new Set<string>();
  let match;
  const regex = new RegExp(HASHTAG_REGEX.source, "g");
  while ((match = regex.exec(text)) !== null) {
    tags.add(match[1].toLowerCase());
  }
  return Array.from(tags);
}

export function extractTagsFromPurpose(purpose: string): string[] {
  if (!purpose) return [];
  const tags = new Set<string>();
  let match;
  const regex = new RegExp(DOT_TAG_REGEX.source, "gi");
  while ((match = regex.exec(purpose)) !== null) {
    tags.add(`${match[1].toLowerCase()}.${match[2].toLowerCase()}`);
  }
  return Array.from(tags);
}

export function isTypingHashtag(text: string): boolean {
  if (!text) return false;
  if (text.endsWith(" ") || text.endsWith("\n")) return false;

  const words = text.split(/\s+/);
  const lastWord = words[words.length - 1];

  return lastWord.startsWith("#") && lastWord.length >= 1;
}

export function splitNoteIntoSegments(
  text: string,
): Array<{ type: "text" | "tag"; value: string }> {
  if (!text) return [];
  const segments: Array<{ type: "text" | "tag"; value: string }> = [];
  const parts = text.split(/(#[\w.]+)/g);

  for (const part of parts) {
    if (!part) continue;
    if (/^#[\w.]+$/.test(part)) {
      segments.push({ type: "tag", value: part });
    } else {
      segments.push({ type: "text", value: part });
    }
  }

  return segments;
}
