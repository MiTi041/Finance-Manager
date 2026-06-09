import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Gauge,
  Keyboard,
  Lightbulb,
  MousePointerClick,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type Slide = {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
};

export type TutorialOverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slides: Slide[];
  storageKey: string;
};

export function TutorialOverlay({ open, onOpenChange, slides, storageKey }: TutorialOverlayProps) {
  const [step, setStep] = useState(0);
  const isLastStep = step === slides.length - 1;

  const goNext = useCallback(() => {
    if (isLastStep) {
      onOpenChange(false);
    } else {
      setStep((s) => s + 1);
    }
  }, [isLastStep, onOpenChange]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  useEffect(() => {
    if (open) {
      setStep(0);
    }
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (!open) return;
      if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, goNext, goBack]);

  const slide = slides[step];

  const handleDismiss = () => {
    window.localStorage.setItem(storageKey, "true");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl gap-0 p-0 overflow-hidden"
        showCloseButton={false}
      >
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3 right-3 z-10 rounded-full p-1.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          title="Tutorial schließen und nicht mehr anzeigen"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center justify-center pt-8 pb-4">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-violet-500/10 border border-violet-500/20">
            {slide.icon}
          </div>
        </div>

        <div className="px-8 pb-2">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">
              {slide.title}
            </DialogTitle>
            <DialogDescription className="text-center pt-2 text-foreground/80">
              {slide.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-4 pb-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step
                  ? "w-6 bg-violet-500"
                  : "w-1.5 bg-muted-foreground/20 hover:bg-muted-foreground/40"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border/50">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={step === 0}
            className="gap-1.5"
          >
            <ChevronLeft className="size-4" />
            Zurück
          </Button>

          <span className="text-xs text-muted-foreground">
            {step + 1} / {slides.length}
          </span>

          <Button
            type="button"
            size="sm"
            onClick={goNext}
            className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isLastStep ? "Los geht's!" : "Weiter"}
            {!isLastStep && <ChevronRight className="size-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
