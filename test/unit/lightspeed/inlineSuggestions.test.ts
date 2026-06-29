import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserAction, LightSpeedCommands } from "@src/definitions/lightspeed";

// ---------------------------------------------------------------------------
// Stable mock surface (hoisted so the SUT and the test share the same object
// identities across vi.resetModules() re-imports).
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  class Position {
    line: number;
    character: number;
    constructor(line: number, character: number) {
      this.line = line;
      this.character = character;
    }
  }
  class Range {
    start: Position;
    end: Position;
    constructor(start: Position, end: Position) {
      this.start = start;
      this.end = end;
    }
    get isEmpty() {
      return (
        this.start.line === this.end.line &&
        this.start.character === this.end.character
      );
    }
  }
  class InlineCompletionItem {
    insertText: string;
    command: unknown;
    constructor(insertText: string) {
      this.insertText = insertText;
      this.command = undefined;
    }
  }

  const window = {
    activeTextEditor: undefined as unknown,
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  };
  const commands = { executeCommand: vi.fn() };
  const InlineCompletionTriggerKind = { Invoke: 0, Automatic: 1 };

  const lightSpeedManager = {
    apiInstance: {
      isSuggestionFeedbackInProgress: vi.fn(() => false),
      cancelSuggestionFeedbackInProgress: vi.fn(),
      feedbackRequest: vi.fn(),
    },
    providerManager: {
      completionRequest: vi.fn(),
    },
    settingsManager: {
      settings: {
        lightSpeedService: {
          suggestions: { enabled: true, waitWindow: 0 },
          provider: "wca",
          apiEndpoint: "https://api.example",
        },
      },
    },
    statusBarProvider: {
      statusBar: { hide: vi.fn(), show: vi.fn(), text: "" },
      getLightSpeedStatusBarText: vi.fn(async () => "LS"),
      updateLightSpeedStatusbar: vi.fn(),
      setLightSpeedStatusBarTooltip: vi.fn(),
    },
    contentMatchesProvider: { suggestionDetails: [] as unknown[] },
    lightSpeedActivityTracker: {} as Record<string, unknown>,
    currentModelValue: undefined as unknown,
    inlineSuggestionsEnabled: true,
  };

  const data = {
    shouldRequestInlineSuggestions: vi.fn(() => true),
    shouldTriggerMultiTaskSuggestion: vi.fn(() => false),
  };
  const prompt = {
    shouldRequestForPromptPosition: vi.fn(() => true),
    getContentWithMultiLinePromptForMultiTasksSuggestions: vi.fn(
      (c: string) => c,
    ),
  };

  return {
    Position,
    Range,
    InlineCompletionItem,
    InlineCompletionTriggerKind,
    window,
    commands,
    lightSpeedManager,
    data,
    prompt,
  };
});

vi.mock("vscode", () => ({
  InlineCompletionTriggerKind: h.InlineCompletionTriggerKind,
  InlineCompletionItem: h.InlineCompletionItem,
  Position: h.Position,
  Range: h.Range,
  window: h.window,
  commands: h.commands,
}));

vi.mock("@src/extension", () => ({ lightSpeedManager: h.lightSpeedManager }));

vi.mock("@src/features/lightspeed/utils/data", () => h.data);

vi.mock(
  "@src/features/lightspeed/utils/multiLinePromptForMultiTasks",
  () => h.prompt,
);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
type TextLine = { text: string; isEmptyOrWhitespace: boolean };

interface DocOptions {
  languageId?: string;
  uri?: string;
  getTextOverride?: string;
}

function makeDoc(lines: string[], opts: DocOptions = {}) {
  const languageId = opts.languageId ?? "ansible";
  const uri = opts.uri ?? "file:///test/playbook.yml";
  return {
    languageId,
    uri: { toString: () => uri },
    lineAt: (posOrLine: number | { line: number }): TextLine => {
      const line = typeof posOrLine === "number" ? posOrLine : posOrLine.line;
      const text = lines[line] ?? "";
      return { text, isEmptyOrWhitespace: text.trim() === "" };
    },
    getText: (range?: { end: { line: number; character: number } }) => {
      if (opts.getTextOverride !== undefined) {
        return opts.getTextOverride;
      }
      if (!range) {
        return lines.join("\n");
      }
      const collected: string[] = [];
      for (let i = 0; i <= range.end.line; i++) {
        const text = lines[i] ?? "";
        collected.push(
          i === range.end.line ? text.slice(0, range.end.character) : text,
        );
      }
      return collected.join("\n");
    },
  };
}

const ctx = (kind: number) => ({ triggerKind: kind });
const token = (cancelled = false) => ({ isCancellationRequested: cancelled });

// A valid single-task scenario: prompt line is a `- name:` task, cursor sits on
// the (empty) following line aligned to the same column.
function singleTaskDoc(over: DocOptions = {}) {
  return makeDoc(["    - name: install foo", "    "], over);
}
const singleTaskPos = () => new h.Position(1, 4);

// A valid multi-task scenario: prompt line is a comment.
function multiTaskDoc(over: DocOptions = {}) {
  return makeDoc(["  # install nginx", "  "], over);
}
const multiTaskPos = () => new h.Position(1, 2);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sut: any;

function resetMockState() {
  const m = h.lightSpeedManager;
  m.apiInstance.isSuggestionFeedbackInProgress.mockReturnValue(false);
  m.providerManager.completionRequest.mockReset();
  m.providerManager.completionRequest.mockResolvedValue({
    predictions: ["  - name: created task"],
    suggestionId: "resp-sid",
    model: "model-a",
  });
  m.statusBarProvider.getLightSpeedStatusBarText.mockResolvedValue("LS");
  m.settingsManager.settings.lightSpeedService = {
    suggestions: { enabled: true, waitWindow: 0 },
    provider: "wca",
    apiEndpoint: "https://api.example",
  };
  m.contentMatchesProvider.suggestionDetails = [];
  m.lightSpeedActivityTracker = {};
  m.currentModelValue = undefined;
  m.inlineSuggestionsEnabled = true;

  h.window.activeTextEditor = undefined;

  h.data.shouldRequestInlineSuggestions.mockReturnValue(true);
  h.data.shouldTriggerMultiTaskSuggestion.mockReturnValue(false);
  h.prompt.shouldRequestForPromptPosition.mockReturnValue(true);
  h.prompt.getContentWithMultiLinePromptForMultiTasksSuggestions.mockImplementation(
    (c: string) => c,
  );
}

async function provide(
  doc: unknown,
  position: unknown,
  context: unknown,
  tok: unknown = token(),
) {
  const provider = new sut.LightSpeedInlineSuggestionProvider();
  return provider.provideInlineCompletionItems(doc, position, context, tok);
}

// Drive a successful single-task suggestion to "arm" the module-private state
// (suggestionDisplayed = true, inlineSuggestionData.suggestionId set,
// insertTexts populated, displayTime set). Returns the produced items.
async function arm(position = singleTaskPos()) {
  const items = await provide(
    singleTaskDoc(),
    position,
    ctx(h.InlineCompletionTriggerKind.Automatic),
  );
  return items;
}

const ansibleEditor = () => ({
  document: {
    languageId: "ansible",
    lineAt: () => ({ text: "", isEmptyOrWhitespace: true }),
  },
});

beforeEach(async () => {
  vi.clearAllMocks();
  resetMockState();
  vi.resetModules();
  sut = await import("@src/features/lightspeed/inlineSuggestions");
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe("getCompletionState (via provideInlineCompletionItems)", () => {
  it("RequestInProgress: cancels feedback when suggestion feedback is in progress", async () => {
    h.lightSpeedManager.apiInstance.isSuggestionFeedbackInProgress.mockReturnValue(
      true,
    );
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res).toEqual([]);
    expect(
      h.lightSpeedManager.apiInstance.cancelSuggestionFeedbackInProgress,
    ).toHaveBeenCalled();
  });

  it("NotForMe: hides the status bar for non-ansible documents", async () => {
    const res = await provide(
      makeDoc(["hello"], { languageId: "plaintext" }),
      new h.Position(0, 0),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res).toEqual([]);
    expect(
      h.lightSpeedManager.statusBarProvider.statusBar.hide,
    ).toHaveBeenCalled();
  });

  it("CancellationRequested: returns empty when the token is cancelled", async () => {
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
      token(true),
    );
    expect(res).toEqual([]);
  });

  it("LightspeedIsDisabled: refreshes the status bar when suggestions are disabled", async () => {
    h.lightSpeedManager.settingsManager.settings.lightSpeedService.suggestions.enabled = false;
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res).toEqual([]);
    expect(
      h.lightSpeedManager.statusBarProvider.updateLightSpeedStatusbar,
    ).toHaveBeenCalled();
  });

  it("CacheSuggestion: returns the cached item when the position has not changed", async () => {
    const pos = singleTaskPos();
    await arm(pos);
    h.lightSpeedManager.providerManager.completionRequest.mockClear();
    // same position object -> positionHasChanged is false
    const res = await provide(
      singleTaskDoc(),
      pos,
      ctx(h.InlineCompletionTriggerKind.Invoke),
    );
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(1);
    // cached path does not issue a new completion request
    expect(
      h.lightSpeedManager.providerManager.completionRequest,
    ).not.toHaveBeenCalled();
  });

  it("RefusedSuggestion: hides the suggestion when displayed and position changed", async () => {
    await arm(singleTaskPos());
    h.commands.executeCommand.mockClear();
    const res = await provide(
      singleTaskDoc(),
      new h.Position(5, 4),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res).toEqual([]);
    expect(h.commands.executeCommand).toHaveBeenCalledWith(
      LightSpeedCommands.LIGHTSPEED_SUGGESTION_HIDE,
    );
  });
});

describe("WCA provider apiEndpoint matrix", () => {
  it("URLMisconfigured: wca provider with a blank apiEndpoint shows an error", async () => {
    h.lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
      "wca";
    h.lightSpeedManager.settingsManager.settings.lightSpeedService.apiEndpoint =
      "   ";
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res).toEqual([]);
    expect(h.window.showErrorMessage).toHaveBeenCalledWith(
      "Ansible Lightspeed URL is empty. Please provide a URL.",
    );
  });

  it("LLM provider with a blank apiEndpoint falls through (no URL error)", async () => {
    h.lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
      "google";
    h.lightSpeedManager.settingsManager.settings.lightSpeedService.apiEndpoint =
      "";
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    // falls through to the Default path -> a real suggestion is produced
    expect(h.window.showErrorMessage).not.toHaveBeenCalled();
    expect(res.length).toBe(1);
  });
});

describe("getInlineSuggestionState rejection paths", () => {
  it("UnexpectedPrompt when the current line is non-empty and trigger is Invoke", async () => {
    const doc = makeDoc(["    - name: install foo", "    not empty"]);
    const res = await provide(
      doc,
      new h.Position(1, 4),
      ctx(h.InlineCompletionTriggerKind.Invoke),
    );
    expect(res).toEqual([]);
    expect(h.window.showInformationMessage).toHaveBeenCalled();
  });

  it("CancellationRequested when indentation mismatches and trigger is Automatic", async () => {
    // prompt indented 4 spaces, cursor at column 2 -> mismatch
    const doc = makeDoc(["    - name: install foo", "  "]);
    const res = await provide(
      doc,
      new h.Position(1, 2),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res).toEqual([]);
    // automatic trigger -> no information message
    expect(h.window.showInformationMessage).not.toHaveBeenCalled();
  });
});

describe("getInlineSuggestionState valid-prompt dispatch", () => {
  it("DoSingleTaskSuggestion when a single-task prompt matches", async () => {
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res.length).toBe(1);
    expect(
      h.lightSpeedManager.providerManager.completionRequest,
    ).toHaveBeenCalled();
  });

  it("DoMultiTasksSuggestion when a multi-task comment matches", async () => {
    h.data.shouldTriggerMultiTaskSuggestion.mockReturnValue(true);
    const res = await provide(
      multiTaskDoc(),
      multiTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res.length).toBe(1);
    expect(
      h.lightSpeedManager.providerManager.completionRequest,
    ).toHaveBeenCalled();
  });

  it("ShouldNotTriggerSuggestion when the prompt is not valid", async () => {
    h.prompt.shouldRequestForPromptPosition.mockReturnValue(false);
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res).toEqual([]);
    expect(
      h.lightSpeedManager.providerManager.completionRequest,
    ).not.toHaveBeenCalled();
  });
});

describe("onUnexpectedPrompt information messages", () => {
  it("shows the positioning hint when there is no prompt match", async () => {
    const doc = makeDoc(["just some text", "    "]);
    await provide(
      doc,
      new h.Position(1, 4),
      ctx(h.InlineCompletionTriggerKind.Invoke),
    );
    expect(h.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Cursor should be positioned"),
    );
  });

  it("shows the positioning hint when the current line is not whitespace", async () => {
    const doc = makeDoc(["    - name: install foo", "    text"]);
    await provide(
      doc,
      new h.Position(1, 4),
      ctx(h.InlineCompletionTriggerKind.Invoke),
    );
    expect(h.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Cursor should be positioned"),
    );
  });

  it("shows the column hint when the indentation does not match", async () => {
    const doc = makeDoc(["    - name: install foo", "  "]);
    await provide(
      doc,
      new h.Position(1, 2),
      ctx(h.InlineCompletionTriggerKind.Invoke),
    );
    expect(h.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Cursor must be in column 4"),
    );
  });
});

describe("onDoSingleTasksSuggestion happy path", () => {
  it("produces an inline completion item and records suggestion details", async () => {
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res.length).toBe(1);
    expect(res[0]).toBeInstanceOf(h.InlineCompletionItem);
    expect(res[0].command.command).toBe(
      LightSpeedCommands.LIGHTSPEED_SUGGESTION_MARKER,
    );
    // model-update branch: currentModelValue updated to the response model
    expect(h.lightSpeedManager.currentModelValue).toBe("model-a");
    expect(
      h.lightSpeedManager.statusBarProvider.setLightSpeedStatusBarTooltip,
    ).toHaveBeenCalled();
    // suggestionDetails populated with the response suggestionId
    const details = h.lightSpeedManager.contentMatchesProvider
      .suggestionDetails as Array<{ suggestionId: string }>;
    expect(details[0].suggestionId).toBe("resp-sid");
    // activity tracker first-insert
    expect(
      Object.keys(h.lightSpeedManager.lightSpeedActivityTracker).length,
    ).toBe(1);
  });
});

describe("empty predictions early return", () => {
  it("single-task returns empty when there are no predictions", async () => {
    h.lightSpeedManager.providerManager.completionRequest.mockResolvedValue({
      predictions: [],
      suggestionId: "x",
    });
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res).toEqual([]);
  });

  it("multi-task returns empty when there are no predictions", async () => {
    h.data.shouldTriggerMultiTaskSuggestion.mockReturnValue(true);
    h.lightSpeedManager.providerManager.completionRequest.mockResolvedValue({
      predictions: [],
      suggestionId: "x",
    });
    const res = await provide(
      multiTaskDoc(),
      multiTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res).toEqual([]);
  });
});

describe("isDocumentChangedImmediately", () => {
  it("waitWindow 0 proceeds with the suggestion", async () => {
    h.lightSpeedManager.settingsManager.settings.lightSpeedService.suggestions.waitWindow = 0;
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res.length).toBe(1);
  });

  it("waitWindow > 0 returns empty when the document changes during the wait", async () => {
    vi.useFakeTimers();
    h.lightSpeedManager.settingsManager.settings.lightSpeedService.suggestions.waitWindow = 50;
    const p = provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    await vi.advanceTimersByTimeAsync(10);
    sut.setDocumentChanged(true);
    await vi.advanceTimersByTimeAsync(60);
    const res = await p;
    expect(res).toEqual([]);
    expect(
      h.lightSpeedManager.providerManager.completionRequest,
    ).not.toHaveBeenCalled();
  });
});

describe("loadFile YAML parse failure", () => {
  it("shows an error and rethrows when the document is invalid YAML", async () => {
    const doc = singleTaskDoc({ getTextOverride: "{" });
    await expect(
      provide(
        doc,
        singleTaskPos(),
        ctx(h.InlineCompletionTriggerKind.Automatic),
      ),
    ).rejects.toThrow();
    expect(h.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("Ansible Lightspeed expects valid YAML"),
    );
  });
});

describe("requestSuggestion error path", () => {
  it("handles an Error rejection from completionRequest", async () => {
    h.lightSpeedManager.providerManager.completionRequest.mockRejectedValue(
      new Error("boom"),
    );
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res).toEqual([]);
    expect(h.window.showErrorMessage).toHaveBeenCalledWith(
      "Error in inline suggestions: boom",
    );
  });

  it("handles a non-Error rejection from completionRequest", async () => {
    h.lightSpeedManager.providerManager.completionRequest.mockRejectedValue(
      "plain string failure",
    );
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res).toEqual([]);
    expect(h.window.showErrorMessage).toHaveBeenCalledWith(
      "Error in inline suggestions: plain string failure",
    );
  });
});

describe("requestInlineSuggest model branches", () => {
  it("no model on the response leaves currentModelValue unchanged", async () => {
    h.lightSpeedManager.currentModelValue = "preset";
    h.lightSpeedManager.providerManager.completionRequest.mockResolvedValue({
      predictions: ["  - name: t"],
      suggestionId: "s",
      model: undefined,
    });
    await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(h.lightSpeedManager.currentModelValue).toBe("preset");
    expect(
      h.lightSpeedManager.statusBarProvider.setLightSpeedStatusBarTooltip,
    ).not.toHaveBeenCalled();
  });

  it("equal model does not trigger a tooltip update", async () => {
    h.lightSpeedManager.currentModelValue = "model-a";
    await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(h.lightSpeedManager.currentModelValue).toBe("model-a");
    expect(
      h.lightSpeedManager.statusBarProvider.setLightSpeedStatusBarTooltip,
    ).not.toHaveBeenCalled();
  });

  it("different model updates the value and the tooltip", async () => {
    h.lightSpeedManager.currentModelValue = "old-model";
    await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(h.lightSpeedManager.currentModelValue).toBe("model-a");
    expect(
      h.lightSpeedManager.statusBarProvider.setLightSpeedStatusBarTooltip,
    ).toHaveBeenCalled();
  });
});

describe("command handler language/editor guards", () => {
  it("inlineSuggestionTriggerHandler does nothing without an active editor", async () => {
    h.window.activeTextEditor = undefined;
    await sut.inlineSuggestionTriggerHandler();
    expect(h.commands.executeCommand).not.toHaveBeenCalledWith(
      "editor.action.inlineSuggest.trigger",
    );
  });

  it("inlineSuggestionTriggerHandler does nothing for a non-ansible editor", async () => {
    h.window.activeTextEditor = { document: { languageId: "plaintext" } };
    await sut.inlineSuggestionTriggerHandler();
    expect(h.commands.executeCommand).not.toHaveBeenCalledWith(
      "editor.action.inlineSuggest.trigger",
    );
  });

  it("inlineSuggestionTriggerHandler triggers for an ansible editor", async () => {
    h.window.activeTextEditor = ansibleEditor();
    await sut.inlineSuggestionTriggerHandler();
    expect(h.commands.executeCommand).toHaveBeenCalledWith(
      "editor.action.inlineSuggest.trigger",
    );
  });

  it("inlineSuggestionReplaceMarker does nothing for a non-ansible editor", async () => {
    const edit = vi.fn();
    h.window.activeTextEditor = {
      document: { languageId: "plaintext" },
      edit,
    };
    await sut.inlineSuggestionReplaceMarker(new h.Position(1, 0));
    expect(edit).not.toHaveBeenCalled();
  });

  it("inlineSuggestionHideHandler does nothing for a non-ansible editor", async () => {
    h.window.activeTextEditor = { document: { languageId: "plaintext" } };
    await sut.inlineSuggestionHideHandler();
    expect(h.commands.executeCommand).not.toHaveBeenCalledWith(
      "editor.action.inlineSuggest.hide",
    );
  });
});

describe("inlineSuggestionReplaceMarker whitespace cleanup", () => {
  function markerEditor(currentLineText: string) {
    const edit = vi.fn(async (cb: (b: unknown) => void) => {
      cb({ delete: vi.fn() });
    });
    return {
      document: {
        languageId: "ansible",
        lineAt: () => ({ text: currentLineText }),
      },
      selection: { active: { line: 3 } },
      edit,
    };
  }

  it("performs a second edit when the trailing line is all whitespace", async () => {
    const editor = markerEditor("     ");
    h.window.activeTextEditor = editor;
    await sut.inlineSuggestionReplaceMarker(new h.Position(2, 0));
    expect(editor.edit).toHaveBeenCalledTimes(2);
  });

  it("performs a single edit when the trailing line has content", async () => {
    const editor = markerEditor("  key: value");
    h.window.activeTextEditor = editor;
    await sut.inlineSuggestionReplaceMarker(new h.Position(2, 0));
    expect(editor.edit).toHaveBeenCalledTimes(1);
  });
});

describe("inlineSuggestionHideHandler action switch", () => {
  beforeEach(async () => {
    h.window.activeTextEditor = ansibleEditor();
    await arm();
    h.lightSpeedManager.apiInstance.feedbackRequest.mockClear();
  });

  it("REJECTED action sends a feedback request", async () => {
    await sut.inlineSuggestionHideHandler(UserAction.REJECTED, "sid-1");
    expect(h.lightSpeedManager.apiInstance.feedbackRequest).toHaveBeenCalled();
  });

  it("IGNORED action sends a feedback request", async () => {
    await sut.inlineSuggestionHideHandler(UserAction.IGNORED, "sid-1");
    expect(h.lightSpeedManager.apiInstance.feedbackRequest).toHaveBeenCalled();
  });

  it("unknown action hits the default branch and still sends feedback", async () => {
    await sut.inlineSuggestionHideHandler(99 as unknown as UserAction, "sid-1");
    expect(h.lightSpeedManager.apiInstance.feedbackRequest).toHaveBeenCalled();
  });

  it("falls back to the stored suggestionId when none is provided", async () => {
    await sut.inlineSuggestionHideHandler();
    expect(h.lightSpeedManager.apiInstance.feedbackRequest).toHaveBeenCalled();
  });
});

describe("inlineSuggestionHideHandler empty early return", () => {
  it("returns after hiding when there is no suggestionId", async () => {
    h.window.activeTextEditor = ansibleEditor();
    await sut.inlineSuggestionHideHandler();
    expect(h.commands.executeCommand).toHaveBeenCalledWith(
      "editor.action.inlineSuggest.hide",
    );
    expect(
      h.lightSpeedManager.apiInstance.feedbackRequest,
    ).not.toHaveBeenCalled();
  });
});

describe("inlineSuggestionCommitHandler", () => {
  it("commits and exits early when there is no suggestionId", async () => {
    await sut.inlineSuggestionCommitHandler();
    expect(h.commands.executeCommand).toHaveBeenCalledWith(
      "editor.action.inlineSuggest.commit",
    );
  });

  it("commits and proceeds when a suggestionId is set", async () => {
    h.window.activeTextEditor = undefined;
    await arm();
    h.commands.executeCommand.mockClear();
    await sut.inlineSuggestionCommitHandler();
    expect(h.commands.executeCommand).toHaveBeenCalledWith(
      "editor.action.inlineSuggest.commit",
    );
  });
});

describe("rejectPendingSuggestion / ignorePendingSuggestion", () => {
  it("rejectPendingSuggestion sends REJECTED feedback when armed and pending", async () => {
    h.window.activeTextEditor = ansibleEditor();
    await arm();
    h.lightSpeedManager.apiInstance.feedbackRequest.mockClear();
    await sut.rejectPendingSuggestion();
    expect(h.lightSpeedManager.apiInstance.feedbackRequest).toHaveBeenCalled();
  });

  it("rejectPendingSuggestion does nothing when feedback is in progress", async () => {
    h.window.activeTextEditor = ansibleEditor();
    await arm();
    h.lightSpeedManager.apiInstance.feedbackRequest.mockClear();
    h.lightSpeedManager.apiInstance.isSuggestionFeedbackInProgress.mockReturnValue(
      true,
    );
    await sut.rejectPendingSuggestion();
    expect(
      h.lightSpeedManager.apiInstance.feedbackRequest,
    ).not.toHaveBeenCalled();
  });

  it("rejectPendingSuggestion does nothing when inline suggestions are disabled", async () => {
    h.window.activeTextEditor = ansibleEditor();
    await arm();
    h.lightSpeedManager.apiInstance.feedbackRequest.mockClear();
    h.lightSpeedManager.inlineSuggestionsEnabled = false;
    await sut.rejectPendingSuggestion();
    expect(
      h.lightSpeedManager.apiInstance.feedbackRequest,
    ).not.toHaveBeenCalled();
  });

  it("rejectPendingSuggestion resets when displayed but not pending", async () => {
    // armed, but active editor is non-ansible so inlineSuggestionPending() is false
    await arm();
    h.lightSpeedManager.apiInstance.feedbackRequest.mockClear();
    h.window.activeTextEditor = { document: { languageId: "plaintext" } };
    await sut.rejectPendingSuggestion();
    expect(
      h.lightSpeedManager.apiInstance.feedbackRequest,
    ).not.toHaveBeenCalled();
  });

  it("rejectPendingSuggestion does nothing when nothing is displayed", async () => {
    await sut.rejectPendingSuggestion();
    expect(
      h.lightSpeedManager.apiInstance.feedbackRequest,
    ).not.toHaveBeenCalled();
  });

  it("ignorePendingSuggestion sends IGNORED feedback when armed and pending", async () => {
    await arm();
    h.lightSpeedManager.apiInstance.feedbackRequest.mockClear();
    await sut.ignorePendingSuggestion();
    expect(h.lightSpeedManager.apiInstance.feedbackRequest).toHaveBeenCalled();
  });

  it("ignorePendingSuggestion does nothing when nothing is displayed", async () => {
    await sut.ignorePendingSuggestion();
    expect(
      h.lightSpeedManager.apiInstance.feedbackRequest,
    ).not.toHaveBeenCalled();
  });
});

describe("additional branch coverage", () => {
  it("reuses the existing activity tracker entry for the same document", async () => {
    await arm(singleTaskPos());
    expect(
      Object.keys(h.lightSpeedManager.lightSpeedActivityTracker).length,
    ).toBe(1);
    // reset the displayed state via a NotForMe pass, then request again
    await provide(
      makeDoc(["x"], { languageId: "plaintext" }),
      new h.Position(0, 0),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    await arm(new h.Position(1, 4));
    // same documentUri -> the tracker entry is reused, not re-inserted
    expect(
      Object.keys(h.lightSpeedManager.lightSpeedActivityTracker).length,
    ).toBe(1);
  });

  it("single-task: prediction with no leading whitespace", async () => {
    h.lightSpeedManager.providerManager.completionRequest.mockResolvedValue({
      predictions: ["- name: no leading"],
      suggestionId: "resp-sid",
      model: "model-a",
    });
    const res = await provide(
      singleTaskDoc(),
      singleTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res.length).toBe(1);
  });

  it("multi-task: prediction with no leading whitespace", async () => {
    h.data.shouldTriggerMultiTaskSuggestion.mockReturnValue(true);
    h.lightSpeedManager.providerManager.completionRequest.mockResolvedValue({
      predictions: ["- name: no leading"],
      suggestionId: "resp-sid",
      model: "model-a",
    });
    const res = await provide(
      multiTaskDoc(),
      multiTaskPos(),
      ctx(h.InlineCompletionTriggerKind.Automatic),
    );
    expect(res.length).toBe(1);
  });

  it("handles a prompt and cursor with no leading whitespace", async () => {
    // prompt line has zero indentation and the current line is non-whitespace
    const doc = makeDoc(["- name: install foo", "z"]);
    await provide(
      doc,
      new h.Position(1, 1),
      ctx(h.InlineCompletionTriggerKind.Invoke),
    );
    expect(h.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Cursor should be positioned"),
    );
  });
});

describe("inlineSuggestionTextDocumentChangeHandler", () => {
  it("handles an accepted match and fetches training matches", async () => {
    h.window.activeTextEditor = ansibleEditor();
    const items = await arm();
    const accepted = items[0].insertText as string;
    h.lightSpeedManager.apiInstance.feedbackRequest.mockClear();
    h.commands.executeCommand.mockClear();

    await sut.inlineSuggestionTextDocumentChangeHandler({
      document: { languageId: "ansible" },
      contentChanges: [{ text: accepted }],
    });
    // flush the async forEach callback
    await new Promise((r) => setTimeout(r, 0));

    expect(h.lightSpeedManager.apiInstance.feedbackRequest).toHaveBeenCalled();
    expect(h.commands.executeCommand).toHaveBeenCalledWith(
      LightSpeedCommands.LIGHTSPEED_FETCH_TRAINING_MATCHES,
    );
  });

  it("does nothing for a non-matching change", async () => {
    h.window.activeTextEditor = ansibleEditor();
    await arm();
    h.lightSpeedManager.apiInstance.feedbackRequest.mockClear();
    h.commands.executeCommand.mockClear();

    await sut.inlineSuggestionTextDocumentChangeHandler({
      document: { languageId: "ansible" },
      contentChanges: [{ text: "something unrelated" }],
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(
      h.lightSpeedManager.apiInstance.feedbackRequest,
    ).not.toHaveBeenCalled();
  });

  it("does nothing when inline suggestions are disabled (guard false)", async () => {
    h.window.activeTextEditor = ansibleEditor();
    const items = await arm();
    const accepted = items[0].insertText as string;
    h.lightSpeedManager.apiInstance.feedbackRequest.mockClear();
    h.lightSpeedManager.inlineSuggestionsEnabled = false;

    await sut.inlineSuggestionTextDocumentChangeHandler({
      document: { languageId: "ansible" },
      contentChanges: [{ text: accepted }],
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(
      h.lightSpeedManager.apiInstance.feedbackRequest,
    ).not.toHaveBeenCalled();
  });
});
