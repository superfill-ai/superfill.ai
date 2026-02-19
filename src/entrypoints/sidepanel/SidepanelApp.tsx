import {
  CheckCircle2,
  HeartCrack,
  InfoIcon,
  SparklesIcon,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AutofillContainer } from "@/entrypoints/content/components/autofill-container";
import { contentAutofillMessaging } from "@/lib/autofill/content-autofill-messaging";
import type { PreviewRenderData } from "@/lib/autofill/preview-utils";
import { buildRenderData } from "@/lib/autofill/preview-utils";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { AutofillSidepanelState } from "@/lib/storage/autofill-state";
import { addNeverAskSite } from "@/lib/storage/capture-settings";
import type {
  CaptureResultState,
  CaptureSidepanelState,
} from "@/lib/storage/capture-state";
import type {
  AutofillProgress,
  FieldMapping,
  FieldOpId,
  PreviewFieldData,
  PreviewSidebarPayload,
} from "@/types/autofill";
import type { MemoryEntry } from "@/types/memory";
import { App } from "../popup/App";

const logger = createLogger("sidepanel");

// ---------------------------------------------------------------------------
// Per-tab local state
// ---------------------------------------------------------------------------

type TabAutofillState =
  | { phase: "loading"; progress: AutofillProgress }
  | {
      phase: "preview";
      renderData: PreviewRenderData;
      payload: PreviewSidebarPayload;
    }
  | { phase: "completing"; progress: AutofillProgress };

const toTabState = (s: AutofillSidepanelState): TabAutofillState | null => {
  if (s.mode === "loading") {
    return {
      phase: "loading",
      progress: s.progress ?? { state: "detecting", message: "Processing..." },
    };
  }
  if (s.mode === "preview" && s.payload) {
    const renderData = buildRenderData(s.payload);
    if (!renderData) return null;
    return { phase: "preview", renderData, payload: s.payload };
  }
  return null;
};

// ---------------------------------------------------------------------------
// CaptureMemoryView — renders the save-memory prompt for one tab
// ---------------------------------------------------------------------------

const captureTabLabel = (s: CaptureSidepanelState): string => {
  if (s.tabTitle) return s.tabTitle;
  try {
    return new URL(s.tabUrl).hostname.replace(/^www\./, "");
  } catch {
    return `Tab ${s.tabId}`;
  }
};

const resultConfig = (state: CaptureResultState) => {
  switch (state) {
    case "saving":
      return {
        title: "Saving memories...",
        description: "Processing your form data",
        progress: 50,
        icon: null,
        barClass: "[&>div]:bg-primary",
      };
    case "success":
      return {
        title: "Memories saved!",
        description: "Your data is ready for future autofill",
        progress: 100,
        icon: <CheckCircle2 className="size-4 text-green-500" />,
        barClass: "[&>div]:bg-green-500",
      };
    case "info":
      return {
        title: "No new memories saved",
        description: "All fields were already known",
        progress: 100,
        icon: <InfoIcon className="size-4 text-blue-500" />,
        barClass: "[&>div]:bg-blue-500",
      };
    case "error":
      return {
        title: "Failed to save memories",
        description: "An error occurred — please try again",
        progress: 100,
        icon: <HeartCrack className="size-4 text-destructive" />,
        barClass: "[&>div]:bg-destructive",
      };
  }
};

const CaptureMemoryView = ({
  captureState,
  onDone,
}: {
  captureState: CaptureSidepanelState;
  onDone: () => void;
}) => {
  const { tabId, capturedFields, resultState, savedCount, skippedCount } =
    captureState;
  const siteDomain = (() => {
    try {
      return new URL(captureState.tabUrl).hostname.replace(/^www\./, "");
    } catch {
      return captureState.tabUrl;
    }
  })();

  const removeFromStorage = useCallback(async () => {
    const current = await storage.captureSidepanelState.getValue();
    const { [tabId]: _removed, ...rest } = current;
    await storage.captureSidepanelState.setValue(
      rest as Record<number, CaptureSidepanelState>,
    );
    onDone();
  }, [tabId, onDone]);

  const patchStorage = useCallback(
    async (patch: Partial<CaptureSidepanelState>) => {
      const current = await storage.captureSidepanelState.getValue();
      const existing = current[tabId];
      if (!existing) return;
      await storage.captureSidepanelState.setValue({
        ...current,
        [tabId]: { ...existing, ...patch },
      });
    },
    [tabId],
  );

  const handleSave = useCallback(async () => {
    await patchStorage({ resultState: "saving" });
    try {
      const result = await contentAutofillMessaging.sendMessage(
        "saveCapturedMemories",
        { capturedFields },
      );
      const total = capturedFields.length;
      const saved = result.savedCount;
      const skipped = total - saved;
      await patchStorage({
        resultState: result.success
          ? saved > 0
            ? "success"
            : "info"
          : "error",
        savedCount: saved,
        skippedCount: skipped,
      });
    } catch {
      await patchStorage({ resultState: "error" });
    }
    setTimeout(removeFromStorage, 3000);
  }, [capturedFields, patchStorage, removeFromStorage]);

  const handleNeverAsk = useCallback(async () => {
    try {
      await addNeverAskSite(siteDomain);
    } catch {}
    await removeFromStorage();
  }, [siteDomain, removeFromStorage]);

  const groupedFields = capturedFields.reduce(
    (acc, field) => {
      const cat = field.fieldMetadata.type ?? "general";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(field);
      return acc;
    },
    {} as Record<string, typeof capturedFields>,
  );

  if (resultState) {
    const cfg = resultConfig(resultState);
    return (
      <div className="flex-1 flex flex-col p-4">
        <Card className="shadow-none border-border/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              {cfg.title} {cfg.icon}
            </CardTitle>
            <CardDescription className="text-xs">
              {cfg.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <Progress value={cfg.progress} className={cfg.barClass} />
            {resultState !== "saving" && (
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{savedCount} saved</span>
                <span>{skippedCount} skipped</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium">Save form data?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Detected {capturedFields.length} field
              {capturedFields.length !== 1 ? "s" : ""} filled on {siteDomain}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={removeFromStorage}
          >
            <X className="size-4" />
          </Button>
        </div>

        <Accordion type="single" collapsible className="w-full mb-3">
          {Object.entries(groupedFields).map(([category, fields]) => (
            <AccordionItem key={category} value={category}>
              <AccordionTrigger className="text-sm">
                {category.charAt(0).toUpperCase() + category.slice(1)} (
                {fields.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-1.5">
                  {fields.map((field, idx) => (
                    <div
                      key={`${field.formOpid}-${field.fieldOpid}-${idx}`}
                      className="p-1.5 bg-muted/50 rounded text-xs"
                    >
                      <div className="font-medium mb-0.5 text-foreground">
                        {field.question}
                      </div>
                      <div className="text-muted-foreground truncate">
                        {field.answer}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <Alert variant="default" className="items-center">
          <SparklesIcon className="size-3" />
          <span className="text-xs">
            Superfill's AI will intelligently handle duplicate fields by either
            merging or skipping them.
          </span>
        </Alert>
      </div>

      <div className="flex-none border-t px-4 py-3 flex gap-2">
        <Button onClick={handleSave} className="flex-1" size="sm">
          Save All
        </Button>
        <Button
          onClick={handleNeverAsk}
          variant="destructive"
          size="sm"
          className="flex-1 min-w-0"
        >
          <span className="truncate" title={`Never ask for ${siteDomain}`}>
            Never ask for {siteDomain}
          </span>
        </Button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab-switcher entry types
// ---------------------------------------------------------------------------

type TabEntry =
  | { kind: "autofill"; tabId: number; state: TabAutofillState }
  | { kind: "capture"; tabId: number; state: CaptureSidepanelState };

// ---------------------------------------------------------------------------
// TabSwitcherButton
// ---------------------------------------------------------------------------

const TabSwitcherButton = ({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`max-w-[140px] truncate rounded px-2.5 py-1 text-xs font-medium transition-colors ${
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
};

// ---------------------------------------------------------------------------
// TabAutofillView — renders one tab's AutofillContainer
// ---------------------------------------------------------------------------

type TabViewProps = {
  tabId: number;
  state: TabAutofillState;
  onStateChange: (tabId: number, next: TabAutofillState | null) => void;
};

const TabAutofillView = ({ tabId, state, onStateChange }: TabViewProps) => {
  const removeTabFromStorage = useCallback(async () => {
    const current = await storage.autofillSidepanelState.getValue();
    const { [tabId]: _removed, ...rest } = current;
    await storage.autofillSidepanelState.setValue(
      rest as Record<number, AutofillSidepanelState>,
    );
  }, [tabId]);

  const handleClose = useCallback(async () => {
    try {
      await contentAutofillMessaging.sendMessage("sidepanelClose", { tabId });
    } catch (err) {
      logger.error("Failed to send sidepanelClose:", err);
    }
    await removeTabFromStorage();
    onStateChange(tabId, null);
  }, [tabId, onStateChange, removeTabFromStorage]);

  const handleFill = useCallback(
    async (
      fieldsToFill: {
        fieldOpid: FieldOpId;
        value: string;
        confidence?: number;
      }[],
    ) => {
      if (state.phase !== "preview") return;

      const { payload } = state;
      const sessionId = payload.sessionId;

      onStateChange(tabId, {
        phase: "completing",
        progress: {
          state: "filling",
          message: "Auto-filling fields...",
          fieldsDetected: fieldsToFill.length,
        },
      });

      try {
        await contentAutofillMessaging.sendMessage("sidepanelFill", {
          fieldsToFill,
          sessionId,
          tabId,
        });

        await contentAutofillMessaging.sendMessage("updateSessionStatus", {
          sessionId,
          status: "filling",
        });
        await contentAutofillMessaging.sendMessage("completeSession", {
          sessionId,
        });

        onStateChange(tabId, {
          phase: "completing",
          progress: {
            state: "completed",
            message: "Auto-fill complete!",
            fieldsDetected: fieldsToFill.length,
            fieldsMatched: fieldsToFill.length,
          },
        });

        setTimeout(async () => {
          await removeTabFromStorage();
          onStateChange(tabId, null);
        }, 2500);
      } catch (error) {
        logger.error("Failed during sidepanel fill:", error);
        onStateChange(tabId, {
          phase: "completing",
          progress: {
            state: "failed",
            message: "Auto-fill failed. Please try again.",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    },
    [tabId, state, onStateChange, removeTabFromStorage],
  );

  const handleMemoryAddition = useCallback(
    async (fieldOpid: FieldOpId, data: MemoryEntry) => {
      if (state.phase !== "preview") return;

      const updatedMapping: FieldMapping = {
        fieldOpid,
        value: data.answer,
        confidence: 1.0,
        reasoning: "User-provided value",
        autoFill: true,
      };

      const { renderData, payload } = state;

      const updatedForms = renderData.forms.map((form) => ({
        ...form,
        fields: form.fields.map((field: PreviewFieldData) =>
          field.fieldOpid === fieldOpid
            ? { ...field, mapping: updatedMapping }
            : field,
        ),
      }));

      const matchedFields = updatedForms.reduce(
        (count, form) =>
          count +
          form.fields.filter((f: PreviewFieldData) => f.mapping.value !== null)
            .length,
        0,
      );

      onStateChange(tabId, {
        phase: "preview",
        payload,
        renderData: {
          forms: updatedForms,
          summary: { ...renderData.summary, matchedFields },
        },
      });
    },
    [tabId, state, onStateChange],
  );

  const mode: "loading" | "preview" =
    state.phase === "preview" ? "preview" : "loading";
  const progress =
    state.phase === "loading" || state.phase === "completing"
      ? state.progress
      : undefined;
  const renderData = state.phase === "preview" ? state.renderData : undefined;

  return (
    <AutofillContainer
      mode={mode}
      progress={progress}
      data={renderData}
      onClose={handleClose}
      onFill={handleFill}
      onHighlight={() => {}}
      onUnhighlight={() => {}}
      onMemoryAddition={handleMemoryAddition}
    />
  );
};

// ---------------------------------------------------------------------------
// SidepanelApp
// ---------------------------------------------------------------------------

export const SidepanelApp = () => {
  const [autofillStates, setAutofillStates] = useState<
    Record<number, TabAutofillState>
  >({});
  const [autofillMeta, setAutofillMeta] = useState<
    Record<number, { tabUrl?: string; tabTitle?: string }>
  >({});
  const [captureStates, setCaptureStates] = useState<
    Record<number, CaptureSidepanelState>
  >({});
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Watch autofill storage
  useEffect(() => {
    let isMounted = true;
    const sync = (record: Record<number, AutofillSidepanelState>) => {
      if (!isMounted) return;
      const next: Record<number, TabAutofillState> = {};
      const meta: Record<number, { tabUrl?: string; tabTitle?: string }> = {};
      for (const [key, val] of Object.entries(record)) {
        const s = toTabState(val);
        if (s) {
          const id = Number(key);
          next[id] = s;
          meta[id] = { tabUrl: val.tabUrl, tabTitle: val.tabTitle };
        }
      }
      setAutofillStates(next);
      setAutofillMeta(meta);
    };
    storage.autofillSidepanelState.getValue().then(sync);
    const unwatch = storage.autofillSidepanelState.watch((v) => sync(v ?? {}));
    return () => {
      isMounted = false;
      unwatch();
    };
  }, []);

  // Watch capture storage
  useEffect(() => {
    let isMounted = true;
    const sync = (record: Record<number, CaptureSidepanelState>) => {
      if (!isMounted) return;
      setCaptureStates({ ...record });
    };
    storage.captureSidepanelState.getValue().then(sync);
    const unwatch = storage.captureSidepanelState.watch((v) => sync(v ?? {}));
    return () => {
      isMounted = false;
      unwatch();
    };
  }, []);

  // Build unified tab list — autofill tabs first, capture tabs second
  const entries: TabEntry[] = [
    ...Object.entries(autofillStates).map(
      ([k, s]): TabEntry => ({
        kind: "autofill",
        tabId: Number(k),
        state: s,
      }),
    ),
    ...Object.entries(captureStates).map(
      ([k, s]): TabEntry => ({
        kind: "capture",
        tabId: Number(k),
        state: s,
      }),
    ),
  ];

  const getLabel = (e: TabEntry): string => {
    if (e.kind === "capture") return captureTabLabel(e.state);
    const meta = autofillMeta[e.tabId];
    if (meta?.tabTitle) return meta.tabTitle;
    try {
      return new URL(meta?.tabUrl ?? "").hostname.replace(/^www\./, "");
    } catch {
      return `Tab ${e.tabId}`;
    }
  };

  // Keep activeKey valid whenever the underlying storages change
  useEffect(() => {
    const keys = [
      ...Object.keys(autofillStates).map((k) => `autofill-${k}`),
      ...Object.keys(captureStates).map((k) => `capture-${k}`),
    ];
    if (keys.length === 0) {
      setActiveKey(null);
      return;
    }
    setActiveKey((prev) => {
      if (prev && keys.includes(prev)) return prev;
      return keys[0];
    });
  }, [autofillStates, captureStates]);

  const handleAutofillStateChange = useCallback(
    (tabId: number, next: TabAutofillState | null) => {
      setAutofillStates((prev) => {
        const updated = { ...prev };
        if (next === null) delete updated[tabId];
        else updated[tabId] = next;
        return updated;
      });
    },
    [],
  );

  if (entries.length === 0) {
    return <App />;
  }

  const currentKey = activeKey ?? `${entries[0].kind}-${entries[0].tabId}`;
  const currentEntry = entries.find(
    (e) => `${e.kind}-${e.tabId}` === currentKey,
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {entries.length > 1 && (
        <div className="flex-none flex gap-1 overflow-x-auto border-b bg-background px-3 py-1.5">
          {entries.map((e) => {
            const key = `${e.kind}-${e.tabId}`;
            return (
              <TabSwitcherButton
                key={key}
                label={getLabel(e)}
                isActive={key === currentKey}
                onClick={() => setActiveKey(key)}
              />
            );
          })}
        </div>
      )}

      {currentEntry && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {currentEntry.kind === "autofill" ? (
            <TabAutofillView
              key={currentKey}
              tabId={currentEntry.tabId}
              state={currentEntry.state}
              onStateChange={handleAutofillStateChange}
            />
          ) : (
            <CaptureMemoryView
              key={currentKey}
              captureState={currentEntry.state}
              onDone={() =>
                setActiveKey((prev) => {
                  if (prev !== currentKey) return prev;
                  const remaining = entries.filter(
                    (e) => `${e.kind}-${e.tabId}` !== currentKey,
                  );
                  return remaining.length > 0
                    ? `${remaining[0].kind}-${remaining[0].tabId}`
                    : null;
                })
              }
            />
          )}
        </div>
      )}
    </div>
  );
};
