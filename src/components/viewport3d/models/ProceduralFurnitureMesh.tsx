'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Dimensions3D, ProceduralShapeType } from '@/types/planner';

interface ProceduralFurnitureMeshProps {
  shapeType: ProceduralShapeType;
  color: string;
  partsHint?: string[];
  dimensions: Dimensions3D;
  isSelected?: boolean;
  isHovered?: boolean;
}

function shiftColor(hex: string, lightnessDelta: number): string {
  const c = new THREE.Color();
  try {
    c.set(hex);
  } catch {
    c.set('#8B9AA8');
  }
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(0.96, Math.max(0.08, hsl.l + lightnessDelta)));
  return `#${c.getHexString()}`;
}

/**
 * すべてのプロシージャル家具は、底面中央を原点 (0, 0, 0) とし、
 * 外接サイズが正確に dimensions (width × height × depth) に収まるように描画する。
 * 正面方向は +Z を基準とする。
 */
export function ProceduralFurnitureMesh({
  shapeType,
  color,
  partsHint = [],
  dimensions,
  isSelected = false,
  isHovered = false,
}: ProceduralFurnitureMeshProps) {
  const { width: w, depth: d, height: h } = dimensions;

  const palette = useMemo(
    () => ({
      main: color || '#7C8A99',
      light: shiftColor(color || '#7C8A99', 0.1),
      dark: shiftColor(color || '#7C8A99', -0.14),
      woodLeg: '#6B4F35',
      metal: '#475569',
    }),
    [color],
  );

  const emissive = isSelected ? '#2563EB' : isHovered ? '#38BDF8' : '#000000';
  const emissiveIntensity = isSelected ? 0.18 : isHovered ? 0.08 : 0;

  const mainMatProps = {
    color: palette.main,
    roughness: 0.72,
    metalness: 0.05,
    emissive,
    emissiveIntensity,
  };

  const accentMatProps = {
    color: palette.light,
    roughness: 0.78,
    metalness: 0.04,
    emissive,
    emissiveIntensity: emissiveIntensity * 0.7,
  };

  const darkMatProps = {
    color: palette.dark,
    roughness: 0.65,
    metalness: 0.08,
    emissive,
    emissiveIntensity: emissiveIntensity * 0.5,
  };

  switch (shapeType) {
    case 'sofa': {
      const isArmless = partsHint.some(
        (hint) => hint.includes('armless') || hint.includes('no_arm'),
      );
      const isLowProfile = partsHint.some((hint) => hint.includes('low'));
      const legH = isLowProfile ? Math.min(0.05, h * 0.08) : Math.min(0.12, h * 0.16);
      const seatH = Math.min(0.32, h * 0.42);
      const armW = isArmless ? 0 : Math.min(0.16, w * 0.14);
      const armH = Math.min(h - legH, Math.max(seatH + 0.16, h * 0.68));
      const backD = Math.min(0.22, d * 0.28);
      const backH = Math.max(0.15, h - legH);
      const innerW = Math.max(0.1, w - armW * 2);
      const seatD = Math.max(0.1, d - backD);
      const cushionCount = w >= 1.9 ? 3 : w >= 1.15 ? 2 : 1;
      const cushionGap = 0.015;
      const cushionW = (innerW - cushionGap * (cushionCount - 1)) / cushionCount;
      const legColor = partsHint.some((hint) => hint.includes('steel') || hint.includes('metal'))
        ? palette.metal
        : palette.woodLeg;

      return (
        <group>
          {/* 4本脚 */}
          {[
            [-w / 2 + 0.06, legH / 2, -d / 2 + 0.06],
            [w / 2 - 0.06, legH / 2, -d / 2 + 0.06],
            [-w / 2 + 0.06, legH / 2, d / 2 - 0.06],
            [w / 2 - 0.06, legH / 2, d / 2 - 0.06],
          ].map((pos, idx) => (
            <mesh key={idx} position={pos as [number, number, number]} castShadow>
              <cylinderGeometry args={[0.025, 0.02, legH, 10]} />
              <meshStandardMaterial color={legColor} roughness={0.6} />
            </mesh>
          ))}
          {/* 座面ベース */}
          <mesh position={[0, legH + seatH * 0.35, 0]} castShadow receiveShadow>
            <boxGeometry args={[w - 0.02, seatH * 0.7, d - 0.02]} />
            <meshStandardMaterial {...darkMatProps} />
          </mesh>
          {/* 座面クッション（分割） */}
          {Array.from({ length: cushionCount }).map((_, i) => {
            const x = -innerW / 2 + cushionW / 2 + i * (cushionW + cushionGap);
            return (
              <mesh
                key={`seat-${i}`}
                position={[x, legH + seatH * 0.85, backD / 2]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[cushionW, seatH * 0.42, seatD - 0.02]} />
                <meshStandardMaterial {...accentMatProps} />
              </mesh>
            );
          })}
          {/* 背もたれ (-Z 側) */}
          <mesh
            position={[0, legH + backH / 2, -d / 2 + backD / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[w, backH, backD]} />
            <meshStandardMaterial {...mainMatProps} />
          </mesh>
          {/* 左右の肘掛け */}
          {!isArmless && (
            <>
              <mesh position={[-w / 2 + armW / 2, legH + armH / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[armW, armH, d]} />
                <meshStandardMaterial {...mainMatProps} />
              </mesh>
              <mesh position={[w / 2 - armW / 2, legH + armH / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[armW, armH, d]} />
                <meshStandardMaterial {...mainMatProps} />
              </mesh>
            </>
          )}
        </group>
      );
    }

    case 'bed': {
      const legH = Math.min(0.14, h * 0.18);
      const frameH = Math.min(0.14, h * 0.18);
      const mattressH = Math.min(0.24, Math.max(0.12, h * 0.28));
      const headD = Math.min(0.1, d * 0.08);
      const mattressY = legH + frameH + mattressH / 2;
      const pillowCount = w >= 1.15 ? 2 : 1;
      const pillowW = Math.min(0.5, (w - 0.2) / pillowCount - 0.04);

      return (
        <group>
          {/* 4本脚 */}
          {[
            [-w / 2 + 0.06, legH / 2, -d / 2 + 0.06],
            [w / 2 - 0.06, legH / 2, -d / 2 + 0.06],
            [-w / 2 + 0.06, legH / 2, d / 2 - 0.06],
            [w / 2 - 0.06, legH / 2, d / 2 - 0.06],
          ].map((pos, idx) => (
            <mesh key={idx} position={pos as [number, number, number]} castShadow>
              <boxGeometry args={[0.06, legH, 0.06]} />
              <meshStandardMaterial {...darkMatProps} />
            </mesh>
          ))}
          {/* フレーム */}
          <mesh position={[0, legH + frameH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, frameH, d]} />
            <meshStandardMaterial {...mainMatProps} />
          </mesh>
          {/* ヘッドボード (-Z 側) */}
          <mesh position={[0, h / 2, -d / 2 + headD / 2]} castShadow receiveShadow>
            <boxGeometry args={[w, h, headD]} />
            <meshStandardMaterial {...mainMatProps} />
          </mesh>
          {/* マットレス */}
          <mesh
            position={[0, mattressY, headD / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[w - 0.04, mattressH, d - headD - 0.03]} />
            <meshStandardMaterial
              color="#F8FAFC"
              roughness={0.85}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity * 0.5}
            />
          </mesh>
          {/* 掛け布団レイヤー */}
          <mesh
            position={[0, legH + frameH + mattressH + 0.015, d * 0.14]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[w - 0.02, 0.05, d * 0.62]} />
            <meshStandardMaterial
              color="#E2E8F0"
              roughness={0.9}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity * 0.4}
            />
          </mesh>
          {/* 枕 */}
          {Array.from({ length: pillowCount }).map((_, i) => {
            const x =
              pillowCount === 1
                ? 0
                : (i === 0 ? -1 : 1) * (pillowW / 2 + 0.05);
            return (
              <mesh
                key={`pillow-${i}`}
                position={[x, legH + frameH + mattressH + 0.05, -d / 2 + headD + 0.22]}
                castShadow
              >
                <boxGeometry args={[pillowW, 0.09, 0.34]} />
                <meshStandardMaterial color="#FFFFFF" roughness={0.9} />
              </mesh>
            );
          })}
        </group>
      );
    }

    case 'table':
    case 'desk': {
      const topH = Math.min(0.045, h * 0.08);
      const legH = Math.max(0.05, h - topH);
      const legThick = Math.min(0.05, Math.min(w, d) * 0.12);
      const insetX = w / 2 - legThick / 2 - 0.03;
      const insetZ = d / 2 - legThick / 2 - 0.03;
      const hasDrawer =
        shapeType === 'desk' && (partsHint.includes('side_drawer') || w >= 1.0);
      const drawerW = Math.min(0.38, w * 0.32);

      return (
        <group>
          {/* 天板 */}
          <mesh position={[0, h - topH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, topH, d]} />
            <meshStandardMaterial {...mainMatProps} />
          </mesh>
          {/* 幕板（テーブル用） */}
          {shapeType === 'table' && (
            <mesh position={[0, h - topH - 0.03, 0]} castShadow>
              <boxGeometry args={[Math.max(0.05, w - 0.12), 0.06, Math.max(0.05, d - 0.12)]} />
              <meshStandardMaterial {...darkMatProps} />
            </mesh>
          )}
          {/* 四隅の脚 */}
          {[
            [-insetX, legH / 2, -insetZ],
            [insetX, legH / 2, -insetZ],
            [-insetX, legH / 2, insetZ],
            [insetX, legH / 2, insetZ],
          ].map((pos, idx) => (
            <mesh key={idx} position={pos as [number, number, number]} castShadow>
              <boxGeometry args={[legThick, legH, legThick]} />
              <meshStandardMaterial
                color={shapeType === 'desk' ? palette.metal : palette.dark}
                roughness={0.5}
              />
            </mesh>
          ))}
          {/* デスク袖キャビネット */}
          {hasDrawer && (
            <mesh
              position={[w / 2 - drawerW / 2 - 0.03, legH / 2 + 0.02, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[drawerW, legH - 0.06, d - 0.06]} />
              <meshStandardMaterial {...darkMatProps} />
            </mesh>
          )}
        </group>
      );
    }

    case 'chair': {
      const seatY = h * 0.54;
      const seatThick = Math.min(0.05, h * 0.07);
      const legH = Math.max(0.05, seatY - seatThick / 2);
      const backH = Math.max(0.08, h - seatY);
      const legThick = 0.035;
      const ix = w / 2 - legThick / 2 - 0.02;
      const iz = d / 2 - legThick / 2 - 0.02;

      return (
        <group>
          {/* 座面 */}
          <mesh position={[0, seatY, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, seatThick, d]} />
            <meshStandardMaterial {...mainMatProps} />
          </mesh>
          {/* 背もたれ (-Z 側) */}
          <mesh
            position={[0, seatY + backH / 2, -d / 2 + 0.025]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[w, backH, 0.045]} />
            <meshStandardMaterial {...accentMatProps} />
          </mesh>
          {/* 4本脚 */}
          {[
            [-ix, legH / 2, -iz],
            [ix, legH / 2, -iz],
            [-ix, legH / 2, iz],
            [ix, legH / 2, iz],
          ].map((pos, idx) => (
            <mesh key={idx} position={pos as [number, number, number]} castShadow>
              <boxGeometry args={[legThick, legH, legThick]} />
              <meshStandardMaterial {...darkMatProps} />
            </mesh>
          ))}
        </group>
      );
    }

    case 'shelf': {
      const boardT = 0.026;
      const tiers = Math.max(2, Math.min(6, Math.round(h / 0.34)));
      const innerW = Math.max(0.05, w - boardT * 2);

      return (
        <group>
          {/* 左右側板 */}
          <mesh position={[-w / 2 + boardT / 2, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[boardT, h, d]} />
            <meshStandardMaterial {...mainMatProps} />
          </mesh>
          <mesh position={[w / 2 - boardT / 2, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[boardT, h, d]} />
            <meshStandardMaterial {...mainMatProps} />
          </mesh>
          {/* 背板 */}
          <mesh position={[0, h / 2, -d / 2 + 0.008]} castShadow receiveShadow>
            <boxGeometry args={[w, h, 0.015]} />
            <meshStandardMaterial {...darkMatProps} />
          </mesh>
          {/* 棚板（底〜天板） */}
          {Array.from({ length: tiers + 1 }).map((_, idx) => {
            const y = boardT / 2 + (idx / tiers) * (h - boardT);
            return (
              <mesh key={`tier-${idx}`} position={[0, y, 0]} castShadow receiveShadow>
                <boxGeometry args={[innerW, boardT, d]} />
                <meshStandardMaterial {...accentMatProps} />
              </mesh>
            );
          })}
        </group>
      );
    }

    case 'tv_stand': {
      const legH = Math.min(0.1, h * 0.22);
      const bodyH = Math.max(0.1, h - legH);
      const bodyY = legH + bodyH / 2;

      return (
        <group>
          {/* 脚 */}
          {[
            [-w / 2 + 0.06, legH / 2, -d / 2 + 0.05],
            [w / 2 - 0.06, legH / 2, -d / 2 + 0.05],
            [-w / 2 + 0.06, legH / 2, d / 2 - 0.05],
            [w / 2 - 0.06, legH / 2, d / 2 - 0.05],
          ].map((pos, idx) => (
            <mesh key={idx} position={pos as [number, number, number]} castShadow>
              <boxGeometry args={[0.04, legH, 0.04]} />
              <meshStandardMaterial {...darkMatProps} />
            </mesh>
          ))}
          {/* ローボード本体 */}
          <mesh position={[0, bodyY, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, bodyH, d]} />
            <meshStandardMaterial {...mainMatProps} />
          </mesh>
          {/* 中央AV機器スペース（ダークパネル） */}
          <mesh position={[0, bodyY, d / 2 + 0.002]}>
            <boxGeometry args={[w * 0.36, bodyH * 0.65, 0.01]} />
            <meshStandardMaterial color="#1E293B" roughness={0.3} metalness={0.3} />
          </mesh>
          {/* 左右引き出しスリット */}
          <mesh position={[-w * 0.32, bodyY, d / 2 + 0.003]}>
            <boxGeometry args={[w * 0.24, 0.015, 0.01]} />
            <meshStandardMaterial {...darkMatProps} />
          </mesh>
          <mesh position={[w * 0.32, bodyY, d / 2 + 0.003]}>
            <boxGeometry args={[w * 0.24, 0.015, 0.01]} />
            <meshStandardMaterial {...darkMatProps} />
          </mesh>
        </group>
      );
    }

    case 'cabinet': {
      const baseH = Math.min(0.06, h * 0.08);
      const bodyH = Math.max(0.1, h - baseH);
      const rows = Math.max(2, Math.min(5, Math.round(bodyH / 0.24)));

      return (
        <group>
          <mesh position={[0, baseH / 2, 0]} castShadow>
            <boxGeometry args={[w - 0.03, baseH, d - 0.03]} />
            <meshStandardMaterial {...darkMatProps} />
          </mesh>
          <mesh position={[0, baseH + bodyH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, bodyH, d]} />
            <meshStandardMaterial {...mainMatProps} />
          </mesh>
          {Array.from({ length: rows }).map((_, i) => {
            const rowH = bodyH / rows;
            const y = baseH + rowH * (i + 0.5);
            return (
              <group key={i}>
                <mesh position={[0, y, d / 2 + 0.005]}>
                  <boxGeometry args={[w - 0.04, rowH - 0.02, 0.01]} />
                  <meshStandardMaterial {...accentMatProps} />
                </mesh>
                <mesh position={[0, y, d / 2 + 0.016]}>
                  <boxGeometry args={[Math.min(0.16, w * 0.25), 0.016, 0.014]} />
                  <meshStandardMaterial color={palette.metal} metalness={0.5} roughness={0.3} />
                </mesh>
              </group>
            );
          })}
        </group>
      );
    }

    case 'refrigerator': {
      return (
        <group>
          {/* 本体 */}
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial
              color={palette.main}
              roughness={0.32}
              metalness={0.35}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {/* ドア分割スリット (+Z 正面) */}
          <mesh position={[0, h * 0.52, d / 2 + 0.003]}>
            <boxGeometry args={[w - 0.01, 0.012, 0.006]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
          <mesh position={[0, h * 0.28, d / 2 + 0.003]}>
            <boxGeometry args={[w - 0.01, 0.012, 0.006]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
          {/* 縦ハンドル */}
          <mesh position={[-w * 0.36, h * 0.72, d / 2 + 0.012]}>
            <boxGeometry args={[0.022, h * 0.24, 0.018]} />
            <meshStandardMaterial color="#64748B" metalness={0.6} roughness={0.25} />
          </mesh>
        </group>
      );
    }

    case 'washing_machine': {
      const drumRadius = Math.min(w, h) * 0.27;
      return (
        <group>
          {/* 本体 */}
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial
              color={palette.main}
              roughness={0.35}
              metalness={0.1}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {/* 上部操作パネル */}
          <mesh position={[0, h - 0.09, d / 2 + 0.004]}>
            <boxGeometry args={[w - 0.04, 0.12, 0.008]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.4} />
          </mesh>
          {/* ドラム扉 */}
          <mesh
            position={[0, h * 0.45, d / 2 + 0.012]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[drumRadius, drumRadius, 0.024, 24]} />
            <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.5} />
          </mesh>
          <mesh
            position={[0, h * 0.45, d / 2 + 0.025]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[drumRadius * 0.74, drumRadius * 0.74, 0.01, 24]} />
            <meshStandardMaterial color="#0F172A" roughness={0.12} metalness={0.65} />
          </mesh>
        </group>
      );
    }

    case 'rug': {
      const rugH = Math.max(0.01, Math.min(0.04, h));
      return (
        <group>
          <mesh position={[0, rugH / 2, 0]} receiveShadow>
            <boxGeometry args={[w, rugH, d]} />
            <meshStandardMaterial {...mainMatProps} roughness={0.95} />
          </mesh>
          <mesh position={[0, rugH + 0.001, 0]} receiveShadow>
            <boxGeometry args={[Math.max(0.05, w - 0.14), 0.002, Math.max(0.05, d - 0.14)]} />
            <meshStandardMaterial {...accentMatProps} roughness={0.95} />
          </mesh>
        </group>
      );
    }

    default: {
      // 'box' および未知の shapeType フォールバック
      return (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial {...mainMatProps} />
        </mesh>
      );
    }
  }
}
