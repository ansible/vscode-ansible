require("assert");

import { ContentMatchesWebview } from "../../../src/features/lightspeed/contentMatchesWebview";
import { SettingsManager } from "../../../src/settings";
import { LanguageClient } from "vscode-languageclient/node";
import sinon from "sinon";
import assert from "assert";

import {
  ExtensionSettings,
  LightSpeedServiceSettings,
} from "../../../src/interfaces/extensionSettings";
import { ExtensionContext } from "vscode";
import { LightSpeedAPI } from "../../../src/features/lightspeed/api";

import {
  ContentMatchesRequestParams,
  ContentMatchesResponseParams,
  IContentMatch,
  IContentMatchParams,
  ISuggestionDetails,
} from "../../../src/interfaces/lightspeed";
import { LightspeedUser } from "../../../src/features/lightspeed/lightspeedUser";
import { IError } from "../../../src/features/lightspeed/utils/errors";

function createMatchResponse(): ContentMatchesResponseParams {
  const contentMatchParams = {
    repo_name: "ansible.ansible",
    repo_url: "https://github.com/ansible/ansible",
    path: "some/file.py",
    license: "GPLv3+",
    data_source_description: "ansible-core repository",
    score: 123,
  } as IContentMatchParams;
  const icontent_match = {
    contentmatch: [contentMatchParams],
  } as IContentMatch;

  return { contentmatches: [icontent_match] } as ContentMatchesResponseParams;
}

function createMatchErrorResponse(detail: unknown): IError {
  return {
    code: "an_error",
    message: "An error occurred",
    detail: detail,
  } as IError;
}

function createContentMatchesWebview(): ContentMatchesWebview {
  const m_context: Partial<ExtensionContext> = {};
  const m_client: Partial<LanguageClient> = {};
  const m_settings: Partial<SettingsManager> = {};
  m_settings.settings = {} as ExtensionSettings;
  m_settings.settings.lightSpeedService = {} as LightSpeedServiceSettings;
  const m_api_instance: Partial<LightSpeedAPI> = {};
  const m_l_user: Partial<LightspeedUser> = {};
  const cmw = new ContentMatchesWebview(
    m_context as ExtensionContext,
    m_client as LanguageClient,
    m_settings as SettingsManager,
    m_api_instance as LightSpeedAPI,
    m_l_user as LightspeedUser,
  );
  return cmw;
}

describe("ContentMatches view", () => {
  it("with normal input", async function () {
    const cmw = createContentMatchesWebview();
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams,
    ): Promise<ContentMatchesResponseParams> => {
      assert.equal(inputData.model, undefined);
      return createMatchResponse();
    };
    const res = await cmw.requestInlineSuggestContentMatches(
      "foo",
      "bar",
      false,
    );
    assert.equal(cmw.isError(res), false);

    const contentMatchesResponse: ContentMatchesResponseParams =
      res as ContentMatchesResponseParams;
    assert.equal(
      contentMatchesResponse.contentmatches[0].contentmatch[0].repo_name,
      "ansible.ansible",
    );
  });

  it("with normal input with isPlaybook=true", async function () {
    const cmw = createContentMatchesWebview();
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams,
    ): Promise<ContentMatchesResponseParams> => {
      assert.equal(inputData.model, undefined);
      return createMatchResponse();
    };
    const res = await cmw.requestInlineSuggestContentMatches(
      "foo",
      "bar",
      true,
    );
    assert.equal(cmw.isError(res), false);

    const contentMatchesResponse: ContentMatchesResponseParams =
      res as ContentMatchesResponseParams;
    assert.equal(
      contentMatchesResponse.contentmatches[0].contentmatch[0].repo_name,
      "ansible.ansible",
    );
  });

  it("with a specific model", async function () {
    const cmw = createContentMatchesWebview();
    cmw.settingsManager.settings.lightSpeedService.model = "the_model";
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams,
    ): Promise<ContentMatchesResponseParams> => {
      assert.equal(inputData.model, "the_model");
      return createMatchResponse();
    };
    const res = await cmw.requestInlineSuggestContentMatches(
      "foo",
      "bar",
      false,
    );
    assert.equal(cmw.isError(res), false);

    const contentMatchesResponse: ContentMatchesResponseParams =
      res as ContentMatchesResponseParams;
    assert.equal(
      contentMatchesResponse.contentmatches[0].contentmatch[0].repo_name,
      "ansible.ansible",
    );
  });
});

describe("GetWebviewContent", () => {
  it("no suggestion", async function () {
    const cmw = createContentMatchesWebview();
    const res = await cmw["getWebviewContent"]();
    assert.match(
      res,
      new RegExp(
        "Training matches will be displayed here after you accept an inline suggestion.",
      ),
    );
  });

  it("suggestion has no matches", async function () {
    const cmw = createContentMatchesWebview();
    cmw.suggestionDetails = [
      {
        suggestion: "- name: foo\n  my.mod:\n",
        suggestionId: "bar",
      } as ISuggestionDetails,
    ];
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams, // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<ContentMatchesResponseParams> => {
      const res = createMatchResponse();
      res.contentmatches = [];
      return res;
    };
    const res = await cmw["getWebviewContent"]();
    assert.match(res, new RegExp("No training matches found"));
  });

  it("suggest has invalid YAML", async function () {
    const cmw = createContentMatchesWebview();
    cmw.suggestionDetails = [
      {
        suggestion: "- name: foo\nI\n\nBROKEN\n",
        suggestionId: "bar",
      } as ISuggestionDetails,
    ];
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams, // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<ContentMatchesResponseParams> => {
      return createMatchResponse();
    };
    const spiedConsole = sinon.spy(cmw, "log");
    const res = await cmw["getWebviewContent"]();
    const console_log_calls = spiedConsole.getCalls();
    spiedConsole.restore();
    assert.ok(
      console_log_calls.find((item) =>
        String(item.firstArg).includes("YAMLParseError: Unexpected scalar"),
      ),
    );
    assert.match(res, new RegExp("No training matches found"));
  });

  it("suggestion with a match", async function () {
    const cmw = createContentMatchesWebview();
    cmw.suggestionDetails = [
      {
        suggestion: "- name: foo\n  my.mod:\n",
        suggestionId: "bar",
      } as ISuggestionDetails,
    ];
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams, // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<ContentMatchesResponseParams> => {
      return createMatchResponse();
    };

    function setRhUserHasSeat(has_seat: boolean) {
      cmw["lightspeedAuthenticatedUser"].rhUserHasSeat = async (): Promise<
        boolean | undefined
      > => {
        return has_seat;
      };
    }

    setRhUserHasSeat(false);
    let res = await cmw["getWebviewContent"]();
    assert.match(res, new RegExp("<summary>ansible.ansible</summary>"));
    assert.doesNotMatch(res, new RegExp("<li>License:.*</li>"));

    setRhUserHasSeat(true);
    res = await cmw["getWebviewContent"]();
    assert.match(res, new RegExp("<summary>ansible.ansible</summary>"));
    assert.match(res, new RegExp("<li>License:.*</li>"));
  });

  it("no suggestion with error - string", async function () {
    const cmw = createContentMatchesWebview();
    cmw.suggestionDetails = [
      {
        suggestion: "- name: foo\n  my.mod:\n",
        suggestionId: "bar",
      } as ISuggestionDetails,
    ];
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams, // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<IError> => {
      return createMatchErrorResponse("Something went wrong");
    };

    const res = await cmw["getWebviewContent"]();
    assert.match(
      res,
      new RegExp("An error occurred trying to retrieve the training matches."),
    );
    assert.match(res, new RegExp("An error occurred"));
    assert.match(res, new RegExp("Something went wrong"));
  });

  it("no suggestion with error - object", async function () {
    const cmw = createContentMatchesWebview();
    cmw.suggestionDetails = [
      {
        suggestion: "- name: foo\n  my.mod:\n",
        suggestionId: "bar",
      } as ISuggestionDetails,
    ];
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams, // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<IError> => {
      return createMatchErrorResponse({ cheese: "edam" });
    };

    const res = await cmw["getWebviewContent"]();
    assert.match(
      res,
      new RegExp("An error occurred trying to retrieve the training matches."),
    );
    assert.match(res, new RegExp("An error occurred"));
    // eslint-disable-next-line no-control-regex
    assert.match(res, new RegExp('{\n {2}"cheese": "edam"\n}'));
  });

  it("no suggestion with error - undefined", async function () {
    const cmw = createContentMatchesWebview();
    cmw.suggestionDetails = [
      {
        suggestion: "- name: foo\n  my.mod:\n",
        suggestionId: "bar",
      } as ISuggestionDetails,
    ];
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams, // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<IError> => {
      return createMatchErrorResponse(undefined);
    };

    const res = await cmw["getWebviewContent"]();
    assert.match(
      res,
      new RegExp("An error occurred trying to retrieve the training matches."),
    );
    assert.doesNotMatch(res, new RegExp("<details>"));
    assert.doesNotMatch(res, new RegExp("undefined"));
  });
});
