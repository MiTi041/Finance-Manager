"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type Slide, TutorialOverlay } from "@/components/tutorial-overlay";
import {
  transactionTutorialSlides,
  transactionTutorialStorageKey,
} from "@/pages/transactions/tutorial-config";

type TutorialConfig = {
  slides: Slide[];
  storageKey: string;
};

const tutorialMap: Record<string, TutorialConfig> = {
  "/transactions": {
    storageKey: transactionTutorialStorageKey,
    slides: transactionTutorialSlides,
  },
};

export function DynamicTutorialButton() {
  const { pathname } = useLocation();
  const config = tutorialMap[pathname];

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!config) return;
    const dismissed = window.localStorage.getItem(config.storageKey) === "true";
    if (!dismissed) {
      setOpen(true);
    }
  }, [config]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
  }, []);

  if (!config) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        height={8}
        className="gap-1.5 !bg-violet-500/10 hover:!bg-violet-700/10 text-violet-500 hover:!text-violet-500 !border-violet-500/20"
        title="Tutorial anzeigen"
      >
        Anleitung
        <Sparkles className="size-3" />
      </Button>
      <TutorialOverlay
        open={open}
        onOpenChange={handleOpenChange}
        slides={config.slides}
        storageKey={config.storageKey}
      />
    </>
  );
}
