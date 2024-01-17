
import { SuggestionDisplayed } from "./suggestionDisplayed";
import { CallbackEntry } from "../inlineSuggestions";

export const onTextEditorNotActive: CallbackEntry = function (
  suggestionDisplayed: SuggestionDisplayed
) {
  suggestionDisplayed.reset();
  return [];
};
