import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

interface RightClickGuideProps {
  onSnooze: () => void;
  onDismiss: () => void;
}

export const RightClickGuide = ({
  onSnooze,
  onDismiss,
}: RightClickGuideProps) => {
  return (
    <div
      className="fixed top-4 right-4 z-9999"
      role="dialog"
      aria-modal="false"
      aria-labelledby="right-click-guide-title"
    >
      <Card className="w-96 shadow-2xl border border-border/50 backdrop-blur-sm bg-background/95 pointer-events-auto gap-2">
        <CardHeader>
          <CardDescription className="text-xs text-wrap">
            You can <strong>right-click</strong> on this page and select{" "}
            <strong>Fill with superfill.ai</strong> from the context menu to
            quickly fill all detected form fields with your saved data.
          </CardDescription>
        </CardHeader>

        <CardContent className="py-0">
          <img
            src={browser.runtime.getURL("/right-click-context.gif")}
            alt="Context menu example"
            className="w-full rounded-lg border border-border"
          />
        </CardContent>

        <CardFooter className="flex-row items-center gap-2">
          <Button onClick={onSnooze} className="flex-1" size="sm">
            Remind me later
          </Button>
          <Button
            onClick={onDismiss}
            variant="outline"
            className="flex-1"
            size="sm"
          >
            Don't show again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
