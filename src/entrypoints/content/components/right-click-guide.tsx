import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

interface RightClickGuideProps {
  onGotIt: () => void;
}

export const RightClickGuide = ({ onGotIt }: RightClickGuideProps) => {
  return (
    <div
      className="fixed top-4 right-4 z-9999"
      role="dialog"
      aria-modal="false"
      aria-labelledby="right-click-guide-title"
    >
      <Card className="w-96 shadow-2xl border border-border/50 backdrop-blur-sm bg-background/95 pointer-events-auto gap-3">
        <CardHeader>
          <CardDescription className="text-xs text-wrap">
            You can <strong>right-click</strong> on this page and select{" "}
            <strong>Fill with superfill.ai</strong> from the context menu to
            quickly fill all detected form fields with your saved data.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <img
            src={browser.runtime.getURL("/right-click-context.gif")}
            alt="Context menu example"
            className="w-full rounded-lg border border-border"
          />
        </CardContent>

        <CardFooter className="px-3 py-2 flex-row items-center gap-2">
          <Button onClick={onGotIt} className="flex-1" size="sm">
            Got it
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
