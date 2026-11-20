'use client';

import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Bounds2D } from '@/lib/geometry';
import { usePlannerStore } from '@/store/usePlannerStore';

interface CameraControllerProps {
  bounds: Bounds2D;
}

const EYE_HEIGHT = 1.55; // 成人の目線高さ (m)

export function CameraController({ bounds }: CameraControllerProps) {
  const { camera, gl } = useThree();
  const cameraViewMode = usePlannerStore((s) => s.cameraViewMode);
  const isDragging3D = usePlannerStore((s) => s.isDragging3D);
  const cameraResetNonce = usePlannerStore((s) => s.cameraResetNonce);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // 一人称視点用の姿勢とキー入力状態
  const fpStateRef = useRef({
    yaw: 0,
    pitch: -0.05,
    isLooking: false,
    lastX: 0,
    lastY: 0,
  });
  const keysRef = useRef<Set<string>>(new Set());

  // 視点モード変更・物件変更・リセット時にカメラ位置を初期化
  useEffect(() => {
    const maxSpan = Math.max(bounds.width, bounds.depth, 4);

    if (cameraViewMode === 'perspective') {
      camera.position.set(
        bounds.centerX + maxSpan * 0.65,
        maxSpan * 0.85,
        bounds.centerZ + maxSpan * 0.85,
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(bounds.centerX, 0.3, bounds.centerZ);
      if (controlsRef.current) {
        controlsRef.current.target.set(bounds.centerX, 0.3, bounds.centerZ);
        controlsRef.current.update();
      }
    } else if (cameraViewMode === 'top') {
      camera.position.set(bounds.centerX, maxSpan * 1.48, bounds.centerZ + 0.01);
      camera.up.set(0, 1, 0);
      camera.lookAt(bounds.centerX, 0, bounds.centerZ);
      if (controlsRef.current) {
        controlsRef.current.target.set(bounds.centerX, 0, bounds.centerZ);
        controlsRef.current.update();
      }
    } else if (cameraViewMode === 'first_person') {
      // 部屋の中央やや南側から北方向を見る立ち位置
      camera.position.set(bounds.centerX, EYE_HEIGHT, bounds.centerZ + bounds.depth * 0.22);
      fpStateRef.current.yaw = 0;
      fpStateRef.current.pitch = -0.06;
      camera.rotation.order = 'YXZ';
      camera.rotation.set(fpStateRef.current.pitch, fpStateRef.current.yaw, 0);
    }
  }, [
    camera,
    cameraViewMode,
    cameraResetNonce,
    bounds.centerX,
    bounds.centerZ,
    bounds.width,
    bounds.depth,
  ]);

  // 一人称モードのマウス見渡し・キーボード移動リスナー
  useEffect(() => {
    if (cameraViewMode !== 'first_person') return;

    const dom = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      fpStateRef.current.isLooking = true;
      fpStateRef.current.lastX = e.clientX;
      fpStateRef.current.lastY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!fpStateRef.current.isLooking) return;
      const dx = e.clientX - fpStateRef.current.lastX;
      const dy = e.clientY - fpStateRef.current.lastY;
      fpStateRef.current.lastX = e.clientX;
      fpStateRef.current.lastY = e.clientY;

      fpStateRef.current.yaw -= dx * 0.0045;
      fpStateRef.current.pitch = Math.max(
        -Math.PI / 2.6,
        Math.min(Math.PI / 2.6, fpStateRef.current.pitch - dy * 0.004),
      );
      camera.rotation.order = 'YXZ';
      camera.rotation.set(fpStateRef.current.pitch, fpStateRef.current.yaw, 0);
    };

    const onPointerUp = () => {
      fpStateRef.current.isLooking = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      keysRef.current.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };

    const keys = keysRef.current;

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      keys.clear();
    };
  }, [camera, cameraViewMode, gl]);

  // 一人称の WASD / 矢印キー歩行
  useFrame((_, delta) => {
    if (cameraViewMode !== 'first_person') return;
    const keys = keysRef.current;
    if (keys.size === 0) return;

    const speed = 2.6 * Math.min(delta, 0.1);
    const forward = new THREE.Vector3(
      -Math.sin(fpStateRef.current.yaw),
      0,
      -Math.cos(fpStateRef.current.yaw),
    );
    const right = new THREE.Vector3(
      Math.cos(fpStateRef.current.yaw),
      0,
      -Math.sin(fpStateRef.current.yaw),
    );

    if (keys.has('KeyW') || keys.has('ArrowUp')) {
      camera.position.addScaledVector(forward, speed);
    }
    if (keys.has('KeyS') || keys.has('ArrowDown')) {
      camera.position.addScaledVector(forward, -speed);
    }
    if (keys.has('KeyD') || keys.has('ArrowRight')) {
      camera.position.addScaledVector(right, speed);
    }
    if (keys.has('KeyA') || keys.has('ArrowLeft')) {
      camera.position.addScaledVector(right, -speed);
    }
    camera.position.y = EYE_HEIGHT;
  });

  if (cameraViewMode === 'first_person') {
    return null;
  }

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={!isDragging3D}
      enableDamping
      dampingFactor={0.08}
      enableRotate={cameraViewMode === 'perspective'}
      screenSpacePanning={cameraViewMode === 'top'}
      maxPolarAngle={cameraViewMode === 'perspective' ? Math.PI / 2 - 0.04 : 0.01}
      minDistance={1.5}
      maxDistance={28}
    />
  );
}
