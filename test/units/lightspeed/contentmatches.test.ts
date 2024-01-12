require("assert");

import { ContentMatchesWebview } from "../../../src/features/lightspeed/contentMatchesWebview";
import { LightSpeedAuthenticationProvider } from "../../../src/features/lightspeed/lightSpeedOAuthProvider";
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

function create_match_response(): ContentMatchesResponseParams {
  const content_match_params = {
    repo_name: "ansible.ansible",
    repo_url: "https://github.com/ansible/ansible",
    path: "some/file.py",
    license: "GPLv3+",
    data_source_description: "ansible-core repository",
    score: 123,
  } as IContentMatchParams;
  const icontent_match = {
    contentmatch: [content_match_params],
  } as IContentMatch;

  return { contentmatches: [icontent_match] } as ContentMatchesResponseParams;
}

function create_content_matches_webview(): ContentMatchesWebview {
  const m_context: Partial<ExtensionContext> = {};
  const m_client: Partial<LanguageClient> = {};
  const m_settings: Partial<SettingsManager> = {};
  m_settings.settings = {} as ExtensionSettings;
  m_settings.settings.lightSpeedService = {} as LightSpeedServiceSettings;
  const m_api_instance: Partial<LightSpeedAPI> = {};
  const m_l_auth_provider: Partial<LightSpeedAuthenticationProvider> = {};
  const cmw = new ContentMatchesWebview(
    m_context as ExtensionContext,
    m_client as LanguageClient,
    m_settings as SettingsManager,
    m_api_instance as LightSpeedAPI,
    m_l_auth_provider as LightSpeedAuthenticationProvider
  );
  return cmw;
}

describe("ContentMatches view", () => {
  it("with normal input", async function () {
    const cmw = create_content_matches_webview();
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams
    ): Promise<ContentMatchesResponseParams> => {
      assert.equal(inputData.model, undefined);
      return create_match_response();
    };
    const res = await cmw.requestInlineSuggestContentMatches("foo", "bar");
    assert.equal(
      res.contentmatches[0].contentmatch[0].repo_name,
      "ansible.ansible"
    );
  });

  it("with a specific model", async function () {
    const cmw = create_content_matches_webview();
    cmw.settingsManager.settings.lightSpeedService.model = "the_model";
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams
    ): Promise<ContentMatchesResponseParams> => {
      assert.equal(inputData.model, "the_model");
      return create_match_response();
    };
    const res = await cmw.requestInlineSuggestContentMatches("foo", "bar");
    assert.equal(
      res.contentmatches[0].contentmatch[0].repo_name,
      "ansible.ansible"
    );
  });
});

describe("GetWebviewContent", () => {
  it("no suggestion", async function () {
    const cmw = create_content_matches_webview();
    const res = await cmw["getWebviewContent"]();
    assert.match(res, new RegExp("No training matches found"));
  });

  it("suggestion has no matches", async function () {
    const cmw = create_content_matches_webview();
    cmw.suggestionDetails = [
      {
        suggestion: "- name: foo\n  my.mod:\n",
        suggestionId: "bar",
      } as ISuggestionDetails,
    ];
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<ContentMatchesResponseParams> => {
      const res = create_match_response();
      res.contentmatches = [];
      return res;
    };
    const res = await cmw["getWebviewContent"]();
    assert.match(res, new RegExp("No training matches found"));
  });

  it("suggest has invalid YAML", async function () {
    const cmw = create_content_matches_webview();
    cmw.suggestionDetails = [
      {
        suggestion: "- name: foo\nI\n\nBROKEN\n",
        suggestionId: "bar",
      } as ISuggestionDetails,
    ];
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<ContentMatchesResponseParams> => {
      return create_match_response();
    };
    const spiedConsole = sinon.spy(console, "log");
    const res = await cmw["getWebviewContent"]();
    const console_log_calls = spiedConsole.getCalls();
    spiedConsole.restore();
    assert.ok(
      console_log_calls.find((item) =>
        String(item.firstArg).includes("YAMLParseError: Unexpected scalar")
      )
    );
    assert.match(res, new RegExp("No training matches found"));
  });

  it("suggestion with a match", async function () {
    const cmw = create_content_matches_webview();
    cmw.suggestionDetails = [
      {
        suggestion: "- name: foo\n  my.mod:\n",
        suggestionId: "bar",
      } as ISuggestionDetails,
    ];
    cmw.apiInstance.contentMatchesRequest = async (
      inputData: ContentMatchesRequestParams // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<ContentMatchesResponseParams> => {
      return create_match_response();
    };

    function setRhUserHasSeat(has_seat: boolean) {
      cmw["lightSpeedAuthProvider"].rhUserHasSeat = async (): Promise<
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
});
