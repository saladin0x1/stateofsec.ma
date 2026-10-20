import type { FinalResult } from "./utils";
import { ShareButtons } from "./share-buttons";

interface ShareButtonsProps {
  results: FinalResult;
}

export function ChartActions({ results }: ShareButtonsProps) {
  const shareUrl = `/#${new URLSearchParams({
    question_id: results.id
  }).toString()}`;
  const shareTitle = `Check out this report: ${results.label}`;
  return (
    <div className="bg-muted px-6 py-4 flex justify-between items-center border-t border-border">
      <ShareButtons url={shareUrl} title={shareTitle} />
    </div>
  );
}
