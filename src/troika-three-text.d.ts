declare module 'troika-three-text' {
  import { Mesh, Color } from 'three';

  export class Text extends Mesh {
    text: string;
    fontSize: number;
    color: number | string | Color;
    anchorX: number | 'left' | 'center' | 'right' | string;
    anchorY: number | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom' | string;
    maxWidth: number;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    font: string | null;
    fontWeight: number | 'normal' | 'bold';
    letterSpacing: number;
    lineHeight: number | 'normal';
    outlineWidth: number | string;
    outlineColor: number | string | Color;
    outlineOpacity: number;
    material: Mesh['material'];
    sync(callback?: () => void): void;
    dispose(): void;
  }

  export function preloadFont(
    options: { font?: string; characters?: string | string[] },
    callback: () => void,
  ): void;
}
