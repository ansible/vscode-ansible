let userKeyInput: string | undefined = undefined;

export function setKeyInput(key: string) {
  userKeyInput = key;
}

export function resetKeyInput() {
  userKeyInput = undefined;
}

export function getKeyInput(): string | undefined {
  return userKeyInput;
}
