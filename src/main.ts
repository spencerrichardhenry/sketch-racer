import { attachEditorControls } from './editor/dom';
import type { Tool } from './editor/core';
import { Game } from './game';
import { demoLevel } from './level/demoLevel';
import {
  type LevelData,
  cloneLevel,
  validateLevel,
} from './level/types';
import * as store from './level/store';
import { createScene } from './render/scene';
import type { RunState } from './sim/run';
import type { VehicleKind } from './sim/vehicles';
import { initRapier } from './sim/world';
import { createHud } from './ui/hud';

declare global {
  interface Window {
    __game: {
      getState(): { mode: string; run: RunState };
      getLevel(): LevelData;
      loadLevel(json: unknown): boolean;
      setMode(mode: 'edit' | 'play'): Promise<void>;
      setInput(input: {
        gas?: boolean;
        brake?: boolean;
        leanLeft?: boolean;
        leanRight?: boolean;
      }): void;
      setVehicle(kind: VehicleKind): boolean;
      getVehicle(): VehicleKind;
      getCarPose(): { x: number; y: number; angle: number } | null;
      getCarVelocity(): { x: number; y: number } | null;
      getRunState(): RunState;
    };
  }
}

function showFatal(message: string): void {
  document.body.replaceChildren();
  const panel = document.createElement('main');
  panel.className = 'fatal';
  const heading = document.createElement('h1');
  heading.textContent = 'Sketch Racer could not start';
  const copy = document.createElement('p');
  copy.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'play-button';
  retry.textContent = 'Retry';
  retry.onclick = () => window.location.reload();
  panel.append(heading, copy, retry);
  document.body.appendChild(panel);
}

async function boot(): Promise<void> {
  try {
    await initRapier();
  } catch (error) {
    showFatal(`The physics engine failed to load. ${String(error)}`);
    return;
  }

  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  const uiHost = document.querySelector<HTMLElement>('#ui');
  if (!canvas || !uiHost) {
    showFatal('The game canvas is missing from the page.');
    return;
  }

  const context = createScene(canvas);
  const autosave = store.loadAutosave();
  const initialLevel = autosave ?? demoLevel();
  let currentName = autosave ? 'autosave' : 'demo';
  let autosaveTimeout: ReturnType<typeof setTimeout> | null = null;
  let showedStorageWarning = false;

  const queueAutosave = (level: LevelData) => {
    if (autosaveTimeout) clearTimeout(autosaveTimeout);
    const snapshot = cloneLevel(level);
    autosaveTimeout = setTimeout(() => {
      if (!store.saveAutosave(snapshot) && !showedStorageWarning) {
        showedStorageWarning = true;
        hud.toast('Autosave is unavailable, but you can keep racing.');
      }
    }, 400);
  };

  const game = new Game(initialLevel, context, {
    onModeChange: (mode) => hud.setMode(mode),
    onRunTick: (run) => hud.setTimer(run.timeMs),
    onFinish: (run) => {
      const previousBest = store.getBestTime(currentName);
      store.setBestTime(currentName, run.timeMs);
      hud.showResults(run.timeMs, previousBest);
    },
    onLevelEdited: queueAutosave,
  });

  const toggleMode = async () => {
    try {
      await game.setMode(game.mode === 'edit' ? 'play' : 'edit');
    } catch (error) {
      hud.toast(`Could not switch modes: ${String(error)}`);
    }
  };

  const afterHistoryChange = () => {
    game.editor.consumeChanged();
    game.handleEditorChange();
  };

  const hud = createHud(uiHost, {
    onSelectTool: (tool: Tool) => {
      game.editor.tool = tool;
      hud.setTool(tool);
    },
    onSelectVehicle: (kind: VehicleKind) => {
      if (game.setVehicle(kind)) hud.setVehicle(kind);
    },
    onTogglePlay: () => void toggleMode(),
    onRestart: () => {
      hud.hideResults();
      game.restart();
    },
    onUndo: () => {
      if (game.editor.undo()) afterHistoryChange();
    },
    onRedo: () => {
      if (game.editor.redo()) afterHistoryChange();
    },
    onSave: (name) => {
      if (!store.saveLevel(name, game.level)) {
        hud.toast('Save failed. Browser storage may be unavailable.');
        return;
      }
      currentName = name;
      hud.toast(`Saved “${name}”`);
      hud.setLevelList(store.listLevels());
    },
    onLoad: (name) => {
      const level = store.loadLevel(name);
      if (!level) {
        hud.toast(`Could not load “${name}”.`);
        return;
      }
      currentName = name;
      game.setLevel(level);
      hud.toast(`Loaded “${name}”`);
    },
    onDelete: (name) => {
      store.deleteLevel(name);
      if (currentName === name) currentName = 'autosave';
      hud.setLevelList(store.listLevels());
      hud.toast(`Deleted “${name}”`);
    },
  });

  attachEditorControls(canvas, context.editCam, game.editor, {
    enabled: () => game.mode === 'edit',
    onEdit: () => game.handleEditorChange(),
  });

  hud.setMode('edit');
  hud.setTool('draw');
  hud.setVehicle(game.vehicleKind);
  hud.setLevelList(store.listLevels());
  hud.setTimer(0);

  const toolKeys: Record<string, Tool> = {
    Digit1: 'draw',
    Digit2: 'boost',
    Digit3: 'trampoline',
    Digit4: 'paddle',
    Digit5: 'start',
    Digit6: 'finish',
    Digit7: 'erase',
  };

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return;
    }
    if (event.code === 'Tab') {
      event.preventDefault();
      void toggleMode();
      return;
    }
    if (game.mode === 'play') {
      if (event.code === 'KeyW' || event.code === 'ArrowRight') {
        event.preventDefault();
        game.input.gas = true;
      }
      if (event.code === 'KeyS' || event.code === 'ArrowLeft') {
        event.preventDefault();
        game.input.brake = true;
      }
      if (event.code === 'KeyA') {
        event.preventDefault();
        game.input.leanLeft = true;
      }
      if (event.code === 'KeyD') {
        event.preventDefault();
        game.input.leanRight = true;
      }
      if (event.code === 'KeyR' && !event.repeat) {
        hud.hideResults();
        game.restart();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') {
      event.preventDefault();
      const changed = event.shiftKey ? game.editor.redo() : game.editor.undo();
      if (changed) afterHistoryChange();
      return;
    }
    const tool = toolKeys[event.code];
    if (tool) {
      game.editor.tool = tool;
      hud.setTool(tool);
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'KeyW' || event.code === 'ArrowRight') {
      game.input.gas = false;
    }
    if (event.code === 'KeyS' || event.code === 'ArrowLeft') {
      game.input.brake = false;
    }
    if (event.code === 'KeyA') game.input.leanLeft = false;
    if (event.code === 'KeyD') game.input.leanRight = false;
  });

  window.addEventListener('blur', () => {
    game.input = { gas: false, brake: false };
  });

  window.__game = {
    getState: () => ({ mode: game.mode, run: game.run }),
    getLevel: () => cloneLevel(game.level),
    loadLevel: (json: unknown) => {
      const level = validateLevel(json);
      if (!level || game.mode !== 'edit') return false;
      currentName = 'debug';
      game.setLevel(level);
      return true;
    },
    setMode: (mode) => game.setMode(mode),
    setVehicle: (kind: VehicleKind) => {
      const changed = game.setVehicle(kind);
      if (changed) hud.setVehicle(kind);
      return changed;
    },
    getVehicle: () => game.vehicleKind,
    setInput: (input) => {
      game.input = {
        gas: Boolean(input.gas),
        brake: Boolean(input.brake),
        leanLeft: Boolean(input.leanLeft),
        leanRight: Boolean(input.leanRight),
      };
    },
    getCarPose: () => game.sim?.carPose() ?? null,
    getCarVelocity: () => game.sim?.carVelocity() ?? null,
    getRunState: () => game.run,
  };

  const frame = (time: number) => {
    game.frame(time);
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
}

void boot();
