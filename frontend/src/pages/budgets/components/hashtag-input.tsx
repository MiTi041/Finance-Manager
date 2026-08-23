import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { fetchHashtagSuggestions } from "@/lib/budgets";
import { Input } from "@/components/ui/input";

export function HashtagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHashtagSuggestions()
      .then((s) => {
        if (!cancelled) setSuggestions(s);
      })
      .catch(() => {
        // Vorschläge sind optional
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#/, "").toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setDraft("");
    setHighlighted(0);
  };

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  const matching = suggestions.filter(
    (s) => draft.trim().length > 0 && s.includes(draft.trim().replace(/^#/, "").toLowerCase()) && !tags.includes(s),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Hashtag ${tag} entfernen`}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={() => remove(tag)}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Input
          ref={inputRef}
          className="h-6 min-w-24 flex-1 border-none bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
          placeholder={tags.length === 0 ? "#hashtag hinzufügen" : "#hashtag"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 100)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === "," || e.key === " ") && open && matching[highlighted]) {
                e.preventDefault();
                add(matching[highlighted]);
                return;
            }
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (draft.trim()) add(draft);
            } else if (e.key === "Backspace" && !draft && tags.length > 0) {
              remove(tags[tags.length - 1]);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((i) => Math.min(i + 1, Math.max(matching.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((i) => Math.max(i - 1, 0));
            }
          }}
        />
      </div>
      {open && matching.length > 0 && (
        <div className="rounded-md border bg-popover p-1 shadow-sm">
          {matching.slice(0, 8).map((s, i) => (
            <button
              key={s}
              type="button"
              className={`w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm ${
                i === highlighted ? "bg-accent text-accent-foreground" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                add(s);
                inputRef.current?.focus();
              }}
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
