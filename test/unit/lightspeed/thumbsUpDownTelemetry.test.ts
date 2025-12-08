import { describe, it, expect, vi } from "vitest";
import type {
  PlaybookFeedbackEvent,
  RoleFeedbackEvent,
} from "../../../src/interfaces/lightspeed";
import { ThumbsUpDownAction } from "../../../src/definitions/lightspeed";
import { PROVIDER_TYPES, MODEL_NAMES } from "./testConstants";
import { sendTelemetry } from "../../../src/utils/telemetryUtils";
import type { TelemetryService } from "@redhat-developer/vscode-redhat-telemetry/lib";

describe("Playbook Thumbs Up/Down Telemetry", () => {
  it("should send telemetry for playbook explanation thumbs up", async () => {
    const provider = PROVIDER_TYPES.GOOGLE;
    const modelName = MODEL_NAMES.GEMINI_25_FLASH;
    const param: PlaybookFeedbackEvent = {
      action: ThumbsUpDownAction.UP,
      explanationId: "exp-123",
    };

    // Build telemetry data
    const isExplanation = !!param.explanationId;
    const eventName = isExplanation
      ? "lightspeed.playbookExplanationFeedback"
      : "lightspeed.playbookOutlineFeedback";

    const telemetryData = {
      provider: provider,
      action: param.action,
      explanationId: param.explanationId || undefined,
      generationId: param.generationId || undefined,
      model: modelName || undefined,
    };

    // Create mock telemetry service
    const mockTelemetryService = {
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as TelemetryService;

    // Call sendTelemetry function
    await sendTelemetry(
      mockTelemetryService,
      true,
      eventName,
      telemetryData,
    );

    // Verify the sendTelemetry function called
    expect(mockTelemetryService.send).toHaveBeenCalledTimes(1);
    expect(mockTelemetryService.send).toHaveBeenCalledWith({
      name: "lightspeed.playbookExplanationFeedback",
      properties: {
        provider: PROVIDER_TYPES.GOOGLE,
        action: ThumbsUpDownAction.UP,
        explanationId: "exp-123",
        model: MODEL_NAMES.GEMINI_25_FLASH,
        generationId: undefined,
      },
    });
  });

  it("should send telemetry for playbook explanation thumbs down", async () => {
    const provider = PROVIDER_TYPES.WCA;
    const modelName = MODEL_NAMES.TEST_MODEL;
    const param: PlaybookFeedbackEvent = {
      action: ThumbsUpDownAction.DOWN,
      explanationId: "exp-456",
    };

    const isExplanation = !!param.explanationId;
    const eventName = isExplanation
      ? "lightspeed.playbookExplanationFeedback"
      : "lightspeed.playbookOutlineFeedback";

    const telemetryData = {
      provider: provider,
      action: param.action,
      explanationId: param.explanationId || undefined,
      generationId: param.generationId || undefined,
      model: modelName || undefined,
    };

    const mockTelemetryService = {
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as TelemetryService;

    await sendTelemetry(mockTelemetryService, true, eventName, telemetryData);

    expect(mockTelemetryService.send).toHaveBeenCalledTimes(1);
    expect(mockTelemetryService.send).toHaveBeenCalledWith({
      name: "lightspeed.playbookExplanationFeedback",
      properties: {
        provider: PROVIDER_TYPES.WCA,
        action: ThumbsUpDownAction.DOWN,
        explanationId: "exp-456",
        model: MODEL_NAMES.TEST_MODEL,
        generationId: undefined,
      },
    });
  });
});

describe("Role Thumbs Up/Down Telemetry", () => {
  it("should send telemetry for role explanation thumbs up", async () => {
    const provider = PROVIDER_TYPES.GOOGLE;
    const modelName = MODEL_NAMES.GEMINI_25_FLASH;
    const param: RoleFeedbackEvent = {
      action: ThumbsUpDownAction.UP,
      explanationId: "role-exp-123",
    };

    // Build telemetry data
    const isExplanation = !!param.explanationId;
    const eventName = "lightspeed.roleExplanationFeedback"

    const telemetryData = {
      provider: provider,
      action: param.action,
      explanationId: param.explanationId || undefined,
      generationId: param.generationId || undefined,
      model: modelName || undefined,
    };

    const mockTelemetryService = {
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as TelemetryService;

    await sendTelemetry(mockTelemetryService, true, eventName, telemetryData);

    expect(mockTelemetryService.send).toHaveBeenCalledTimes(1);
    expect(mockTelemetryService.send).toHaveBeenCalledWith({
      name: "lightspeed.roleExplanationFeedback",
      properties: {
        provider: PROVIDER_TYPES.GOOGLE,
        action: ThumbsUpDownAction.UP,
        explanationId: "role-exp-123",
        model: MODEL_NAMES.GEMINI_25_FLASH,
        generationId: undefined,
      },
    });
  });

  it("should send telemetry for role explanation thumbs down", async () => {
    const provider = PROVIDER_TYPES.WCA;
    const modelName = MODEL_NAMES.TEST_MODEL;
    const param: RoleFeedbackEvent = {
      action: ThumbsUpDownAction.DOWN,
      explanationId: "role-exp-456",
    };

    const isExplanation = !!param.explanationId;
    const eventName = "lightspeed.roleExplanationFeedback"

    const telemetryData = {
      provider: provider,
      action: param.action,
      explanationId: param.explanationId || undefined,
      generationId: param.generationId || undefined,
      model: modelName || undefined,
    };

    const mockTelemetryService = {
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as TelemetryService;

    await sendTelemetry(mockTelemetryService, true, eventName, telemetryData);

    expect(mockTelemetryService.send).toHaveBeenCalledTimes(1);
    expect(mockTelemetryService.send).toHaveBeenCalledWith({
      name: "lightspeed.roleExplanationFeedback",
      properties: {
        provider: PROVIDER_TYPES.WCA,
        action: ThumbsUpDownAction.DOWN,
        explanationId: "role-exp-456",
        model: MODEL_NAMES.TEST_MODEL,
        generationId: undefined,
      },
    });
  });
});