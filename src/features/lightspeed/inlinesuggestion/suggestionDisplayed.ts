import { InlineCompletionItem } from "vscode";

export class SuggestionDisplayed {
  inlineSuggestionDisplayed: boolean;
  cachedCompletionItem: InlineCompletionItem[];

  constructor() {
    this.inlineSuggestionDisplayed = false;
    this.cachedCompletionItem = [];
  }

  reset() {
    this.inlineSuggestionDisplayed = false;
    this.cachedCompletionItem = [];
  }

  set(inlineCompletionItem: InlineCompletionItem[]) {
    this.inlineSuggestionDisplayed = true;
    this.cachedCompletionItem = inlineCompletionItem;
  }

  get() {
    return this.inlineSuggestionDisplayed;
  }
}
