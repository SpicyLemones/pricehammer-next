// src/app/tinder/_state.ts
let lastAction: { s: number; p: number } | null = null;

export function setLastAction(s: number, p: number) {
  lastAction = { s, p };
}

export function getLastAction(): { s: number; p: number } | null {
  return lastAction;
}
