export class EditableList {
  doc: Document;
  win: Window;
  element: HTMLElement;
  observer: MutationObserver | undefined;
  savedValues: string[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(id: string, win?: any) {
    // win is an optional parameter for unit tests with JSDOM
    this.win = win ? win : window;
    this.doc = win ? win?.document : document;
    const element = this.doc.getElementById(id);
    if (!element) {
      throw new Error(`Element ${id} is not found`);
    }
    this.element = element;
    this.savedValues = this.getFromUI();

    // Skip MutationObserver part in unit tests as JSDOM does not
    // support it
    if (!win) {
      this.observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.target.childNodes.length === 0) {
            element.innerHTML = "<li></li>";
            break;
          }
        }
      });
      this.observer.observe(element, { childList: true });
    }
  }

  getFromUI(): string[] {
    const values: string[] = [];
    this.element.childNodes.forEach((node) => {
      if (node.textContent) {
        values.push(node.textContent.trim());
      }
    });
    return values;
  }

  setToUI(values: string[]) {
    let html = "";
    for (let line of values) {
      if (line) {
        line = line.trim();
        html += `<li>${line}</li>`;
      }
    }
    this.element.innerHTML = html;
  }

  update(str: string) {
    this.savedValues = EditableList.stringToList(str);
    this.setToUI(this.savedValues);
  }

  save(): void {
    this.savedValues = this.getFromUI();
  }

  reset(): void {
    this.setToUI(this.savedValues);
  }

  getSavedValueAsString(): string {
    return EditableList.listToString(this.savedValues);
  }

  isChanged() {
    if (!this.savedValues) {
      return true;
    }
    const values = this.getFromUI();
    if (this.savedValues.length !== values.length) {
      return true;
    }
    for (let i = 0; i < this.savedValues.length; i++) {
      if (this.savedValues[i] !== values[i]) {
        return true;
      }
    }
    return false;
  }

  isEmpty() {
    const values = this.getFromUI();
    for (const value of values) {
      if (value.length > 0) {
        return false;
      }
    }
    return true;
  }

  focus() {
    this.element.focus();

    // Move cursor at the end of the last list item
    const values = this.getFromUI();
    const lastIndex = values.length - 1;
    const startNode = this.element.childNodes[lastIndex].firstChild;
    if (startNode) {
      const range = this.doc.createRange();
      range.setStart(startNode, values[lastIndex].length);
      const sel = this.win.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }

  static stringToList(str: string): string[] {
    const values: string[] = [];
    // Even when no data was found in the input, add an empty entry so that user
    // can edit the list.
    if (!str) {
      return [""];
    }
    str = str.trim();
    const re = /\d+\.\s*(.*)/;
    for (let s of str.split("\n")) {
      s = s.trim();
      if (s) {
        const found = s.match(re);
        if (found) {
          values.push(found[1]);
        } else {
          values.push(s);
        }
      }
    }
    return values;
  }

  static listToString(values: string[]): string {
    let str = "";
    let counter = 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i]) {
        counter++;
        str += `${counter}. ${values[i]}\n`;
      }
    }
    return str;
  }
}
