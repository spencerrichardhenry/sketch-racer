import { beforeEach, describe, expect, it } from 'vitest';
import { emptyLevel } from '../level/types';
import { EditorCore } from './core';

let editor: EditorCore;

beforeEach(() => {
  editor = new EditorCore(emptyLevel());
});

function drag(
  from: [number, number],
  to: [number, number],
  via: [number, number][] = [],
): void {
  editor.pointerDown(from);
  for (const point of via) editor.pointerMove(point);
  editor.pointerUp(to);
}

describe('EditorCore', () => {
  it('commits a simplified freehand stroke', () => {
    editor.tool = 'draw';
    drag([0, 0], [6, 0], [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
    expect(editor.level.strokes[0].points).toEqual([[0, 0], [6, 0]]);
    expect(editor.consumeChanged()).toBe(true);
    expect(editor.consumeChanged()).toBe(false);
  });

  it('captures a down/up stroke even without a move event', () => {
    editor.tool = 'draw';
    drag([0, 0], [4, 1]);
    expect(editor.level.strokes[0].points).toEqual([[0, 0], [4, 1]]);
  });

  it('discards a point-sized stroke', () => {
    editor.tool = 'draw';
    drag([1, 1], [1, 1]);
    expect(editor.level.strokes).toHaveLength(0);
  });

  it('exposes only the in-progress stroke', () => {
    editor.tool = 'draw';
    expect(editor.currentStroke()).toBeNull();
    editor.pointerDown([0, 0]);
    editor.pointerMove([1, 0]);
    expect(editor.currentStroke()).toHaveLength(2);
    editor.pointerUp([2, 0]);
    expect(editor.currentStroke()).toBeNull();
  });

  it('cancels an interrupted gesture without committing it', () => {
    editor.tool = 'draw';
    editor.pointerDown([0, 0]);
    editor.pointerMove([3, 1]);
    editor.cancelGesture();
    expect(editor.currentStroke()).toBeNull();
    expect(editor.level.strokes).toHaveLength(0);
  });

  it('uses the boost drag as its direction', () => {
    editor.tool = 'boost';
    drag([2, 3], [2, 8]);
    expect(editor.level.boosts[0]).toMatchObject({ x: 2, y: 3 });
    expect(editor.level.boosts[0].angle).toBeCloseTo(Math.PI / 2);
  });

  it('spans a trampoline across its drag', () => {
    editor.tool = 'trampoline';
    drag([0, 0], [4, 0]);
    expect(editor.level.trampolines[0]).toMatchObject({ x: 2, y: 0, length: 4 });
  });

  it('uses a paddle drag as its travel path', () => {
    editor.tool = 'paddle';
    drag([1, 1], [1, 6]);
    expect(editor.level.paddles[0].a).toEqual([1, 1]);
    expect(editor.level.paddles[0].b).toEqual([1, 6]);
  });

  it('places and orients start, then places finish', () => {
    editor.tool = 'start';
    drag([0, 5], [3, 5]);
    expect(editor.level.start).toEqual({ x: 0, y: 5, angle: 0 });
    editor.tool = 'finish';
    drag([30, 2], [30, 2]);
    expect(editor.level.finish).toEqual({ x: 30, y: 2 });
  });

  it('erases terrain near any segment', () => {
    editor.level.strokes.push({ points: [[0, 0], [5, 0]] });
    editor.tool = 'erase';
    drag([2.5, 0.1], [2.5, 0.1]);
    expect(editor.level.strokes).toHaveLength(0);
  });

  it('erases long gadgets by clicking their visible span', () => {
    editor.level.trampolines.push({ x: 2, y: 0, angle: 0, length: 8 });
    editor.level.paddles.push({ a: [0, 0], b: [0, 8], width: 2.5 });
    editor.tool = 'erase';
    drag([5.5, 0], [5.5, 0]);
    drag([0, 4], [0, 4]);
    expect(editor.level.trampolines).toHaveLength(0);
    expect(editor.level.paddles).toHaveLength(0);
  });

  it('undoes, redoes, and clears redo after a new edit', () => {
    editor.tool = 'trampoline';
    drag([0, 0], [4, 0]);
    expect(editor.undo()).toBe(true);
    expect(editor.level.trampolines).toHaveLength(0);
    expect(editor.redo()).toBe(true);
    expect(editor.level.trampolines).toHaveLength(1);
    editor.undo();
    drag([0, 2], [4, 2]);
    expect(editor.redo()).toBe(false);
  });
});
