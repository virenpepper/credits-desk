"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      size="lg"
      className="h-12 w-fit px-5 text-xl"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed"); // e.g. clipboard blocked: the text is still selectable below
        }
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select the text below to copy" : "Copy the prompt"}
    </Button>
  );
}
