import type { Tool } from '../editor/core';

export type HudCallbacks = {
  onSelectTool(tool: Tool): void;
  onTogglePlay(): void;
  onRestart(): void;
  onUndo(): void;
  onRedo(): void;
  onSave(name: string): void;
  onLoad(name: string): void;
  onDelete(name: string): void;
};

export type Hud = {
  setMode(mode: 'edit' | 'play'): void;
  setTool(tool: Tool): void;
  setTimer(milliseconds: number | null): void;
  showResults(milliseconds: number, bestMilliseconds: number | null): void;
  hideResults(): void;
  toast(message: string): void;
  setLevelList(names: string[]): void;
};

const TOOLS: { tool: Tool; icon: string; label: string; key: string }[] = [
  { tool: 'draw', icon: '✦', label: 'Track', key: '1' },
  { tool: 'boost', icon: '»', label: 'Boost', key: '2' },
  { tool: 'trampoline', icon: '↥', label: 'Bounce', key: '3' },
  { tool: 'paddle', icon: '↕', label: 'Paddle', key: '4' },
  { tool: 'start', icon: '◉', label: 'Start', key: '5' },
  { tool: 'finish', icon: '⚑', label: 'Finish', key: '6' },
  { tool: 'erase', icon: '⌫', label: 'Erase', key: '7' },
];

export function formatMs(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const centiseconds = Math.floor((milliseconds % 1000) / 10);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function button(label: string, className = ''): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  return element;
}

export function createHud(host: HTMLElement, callbacks: HudCallbacks): Hud {
  host.replaceChildren();

  const brand = document.createElement('div');
  brand.className = 'brand glass';
  const logo = document.createElement('div');
  logo.className = 'brand-logo';
  logo.textContent = 'SR';
  const brandCopy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'Sketch Racer';
  const subtitle = document.createElement('span');
  subtitle.textContent = 'DRAW IT. DRIVE IT.';
  brandCopy.append(title, subtitle);
  const modeBadge = document.createElement('div');
  modeBadge.className = 'mode-badge';
  brand.append(logo, brandCopy, modeBadge);
  host.appendChild(brand);

  const utilities = document.createElement('div');
  utilities.className = 'utilities glass';
  const undoButton = button('↶', 'icon-button');
  undoButton.title = 'Undo';
  undoButton.setAttribute('aria-label', 'Undo');
  undoButton.onclick = callbacks.onUndo;
  const redoButton = button('↷', 'icon-button');
  redoButton.title = 'Redo';
  redoButton.setAttribute('aria-label', 'Redo');
  redoButton.onclick = callbacks.onRedo;
  const levelsButton = button('Levels', 'utility-button');
  const playButton = button('Race track', 'play-button');
  playButton.onclick = callbacks.onTogglePlay;
  utilities.append(undoButton, redoButton, levelsButton, playButton);
  host.appendChild(utilities);

  const toolbelt = document.createElement('div');
  toolbelt.className = 'toolbelt glass';
  const toolButtons = new Map<Tool, HTMLButtonElement>();
  for (const tool of TOOLS) {
    const toolButton = button('', 'tool-button');
    toolButton.innerHTML = `<span class="tool-icon">${tool.icon}</span><span class="tool-label">${tool.label}</span><kbd>${tool.key}</kbd>`;
    toolButton.title = `${tool.label} tool (${tool.key})`;
    toolButton.onclick = () => callbacks.onSelectTool(tool.tool);
    toolButtons.set(tool.tool, toolButton);
    toolbelt.appendChild(toolButton);
  }
  host.appendChild(toolbelt);

  const levelPanel = document.createElement('section');
  levelPanel.className = 'level-panel glass hidden';
  const panelHeading = document.createElement('div');
  panelHeading.className = 'panel-heading';
  const panelTitle = document.createElement('div');
  panelTitle.innerHTML = '<strong>My tracks</strong><span>Saved in this browser</span>';
  const closePanel = button('×', 'icon-button');
  closePanel.setAttribute('aria-label', 'Close levels panel');
  closePanel.onclick = () => levelPanel.classList.add('hidden');
  panelHeading.append(panelTitle, closePanel);
  const saveRow = document.createElement('div');
  saveRow.className = 'save-row';
  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Track name';
  nameInput.maxLength = 48;
  const saveButton = button('Save', 'small-primary');
  const saveCurrent = () => {
    const name = nameInput.value.trim();
    if (name) callbacks.onSave(name);
  };
  saveButton.onclick = saveCurrent;
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveCurrent();
  });
  saveRow.append(nameInput, saveButton);
  const levelList = document.createElement('div');
  levelList.className = 'level-list';
  levelPanel.append(panelHeading, saveRow, levelList);
  host.appendChild(levelPanel);
  levelsButton.onclick = () => levelPanel.classList.toggle('hidden');

  const timer = document.createElement('div');
  timer.className = 'timer hidden';
  const timerLabel = document.createElement('span');
  timerLabel.textContent = 'RUN TIME';
  const timerValue = document.createElement('strong');
  timerValue.textContent = '0:00.00';
  timer.append(timerLabel, timerValue);
  host.appendChild(timer);

  const hint = document.createElement('div');
  hint.className = 'hint glass';
  host.appendChild(hint);

  const overlay = document.createElement('div');
  overlay.className = 'overlay hidden';
  const resultCard = document.createElement('div');
  resultCard.className = 'result-card glass';
  overlay.appendChild(resultCard);
  host.appendChild(overlay);

  let toastElement: HTMLDivElement | null = null;
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  const hud: Hud = {
    setMode(mode) {
      host.dataset.mode = mode;
      modeBadge.textContent = mode === 'edit' ? 'EDIT MODE' : 'RACE MODE';
      modeBadge.classList.toggle('race', mode === 'play');
      playButton.textContent = mode === 'edit' ? 'Race track' : 'Back to editor';
      timer.classList.toggle('hidden', mode === 'edit');
      toolbelt.classList.toggle('is-disabled', mode === 'play');
      for (const toolButton of toolButtons.values()) {
        toolButton.disabled = mode === 'play';
      }
      undoButton.disabled = redoButton.disabled = levelsButton.disabled = mode === 'play';
      if (mode === 'play') levelPanel.classList.add('hidden');
      hint.textContent =
        mode === 'edit'
          ? 'Drag to build · Space + drag to pan · Scroll to zoom · Tab to race'
          : 'W / → gas · S / ← reverse · A / D rock · R restart · Tab edit';
      if (mode === 'edit') hud.hideResults();
    },
    setTool(tool) {
      for (const [name, toolButton] of toolButtons) {
        toolButton.classList.toggle('active', name === tool);
      }
    },
    setTimer(milliseconds) {
      timerValue.textContent = formatMs(milliseconds ?? 0);
    },
    showResults(milliseconds, previousBest) {
      const isBest = previousBest === null || milliseconds <= previousBest;
      resultCard.replaceChildren();
      const eyebrow = document.createElement('span');
      eyebrow.className = 'result-eyebrow';
      eyebrow.textContent = isBest ? 'NEW BEST' : 'TRACK COMPLETE';
      const heading = document.createElement('h2');
      heading.textContent = 'Finish!';
      const resultTime = document.createElement('div');
      resultTime.className = 'result-time';
      resultTime.textContent = formatMs(milliseconds);
      const best = document.createElement('p');
      best.textContent = isBest
        ? 'You set the pace. Can you beat it?'
        : `Personal best · ${formatMs(previousBest)}`;
      const actions = document.createElement('div');
      actions.className = 'result-actions';
      const again = button('Race again', 'play-button');
      again.onclick = callbacks.onRestart;
      const edit = button('Edit track', 'utility-button');
      edit.onclick = callbacks.onTogglePlay;
      actions.append(again, edit);
      resultCard.append(eyebrow, heading, resultTime, best, actions);
      overlay.classList.remove('hidden');
    },
    hideResults() {
      overlay.classList.add('hidden');
    },
    toast(message) {
      toastElement?.remove();
      if (toastTimeout) clearTimeout(toastTimeout);
      toastElement = document.createElement('div');
      toastElement.className = 'toast';
      toastElement.textContent = message;
      host.appendChild(toastElement);
      toastTimeout = setTimeout(() => {
        toastElement?.remove();
        toastElement = null;
      }, 2600);
    },
    setLevelList(names) {
      levelList.replaceChildren();
      if (names.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-list';
        empty.textContent = 'No named tracks yet.';
        levelList.appendChild(empty);
        return;
      }
      for (const name of names) {
        const row = document.createElement('div');
        row.className = 'level-row';
        const label = document.createElement('span');
        label.textContent = name;
        label.title = name;
        const load = button('Load', 'row-button');
        load.onclick = () => callbacks.onLoad(name);
        const remove = button('×', 'row-button danger');
        remove.setAttribute('aria-label', `Delete ${name}`);
        remove.onclick = () => callbacks.onDelete(name);
        row.append(label, load, remove);
        levelList.appendChild(row);
      }
    },
  };

  return hud;
}
