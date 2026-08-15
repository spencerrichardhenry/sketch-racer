import * as THREE from 'three';
import type { Vec2 } from '../level/types';
import type { EditorCore } from './core';

export function attachEditorControls(
  canvas: HTMLCanvasElement,
  editCamera: THREE.OrthographicCamera,
  core: EditorCore,
  options: { enabled(): boolean; onEdit(): void },
): { detach(): void } {
  let drawing = false;
  let panning = false;
  let spaceHeld = false;
  let lastScreen: [number, number] = [0, 0];

  const toWorld = (event: PointerEvent): Vec2 => {
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
    const point = new THREE.Vector3(x, y, 0).unproject(editCamera);
    return [point.x, point.y];
  };

  const emitEdit = () => {
    if (core.consumeChanged()) options.onEdit();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!options.enabled()) return;
    lastScreen = [event.clientX, event.clientY];
    if (spaceHeld || event.button === 1) {
      event.preventDefault();
      panning = true;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-panning');
      return;
    }
    if (event.button !== 0) return;
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    core.pointerDown(toWorld(event));
    emitEdit();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!options.enabled()) return;
    if (panning) {
      const worldPerPixelX =
        (editCamera.right - editCamera.left) /
        (editCamera.zoom * Math.max(1, canvas.clientWidth));
      const worldPerPixelY =
        (editCamera.top - editCamera.bottom) /
        (editCamera.zoom * Math.max(1, canvas.clientHeight));
      editCamera.position.x -= (event.clientX - lastScreen[0]) * worldPerPixelX;
      editCamera.position.y += (event.clientY - lastScreen[1]) * worldPerPixelY;
      lastScreen = [event.clientX, event.clientY];
      return;
    }
    if (!drawing) return;
    core.pointerMove(toWorld(event));
    emitEdit();
  };

  const finishPointer = (event: PointerEvent) => {
    if (panning) {
      panning = false;
      canvas.classList.remove('is-panning');
      return;
    }
    if (!drawing) return;
    drawing = false;
    core.pointerUp(toWorld(event));
    emitEdit();
  };

  const onPointerUp = (event: PointerEvent) => finishPointer(event);
  const onPointerCancel = () => {
    panning = false;
    drawing = false;
    canvas.classList.remove('is-panning');
    core.cancelGesture();
    emitEdit();
  };

  const onWheel = (event: WheelEvent) => {
    if (!options.enabled()) return;
    event.preventDefault();
    editCamera.zoom = Math.min(
      5,
      Math.max(0.2, editCamera.zoom * Math.exp(-event.deltaY * 0.001)),
    );
    editCamera.updateProjectionMatrix();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Space' && !event.repeat) {
      spaceHeld = true;
      canvas.classList.add('can-pan');
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      spaceHeld = false;
      canvas.classList.remove('can-pan');
    }
  };
  const onBlur = () => {
    spaceHeld = false;
    panning = false;
    drawing = false;
    canvas.classList.remove('can-pan', 'is-panning');
    core.cancelGesture();
    emitEdit();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    detach() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
