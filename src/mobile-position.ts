export interface VisualViewportGeometry {
  height: number;
  offsetLeft: number;
  offsetTop: number;
  width: number;
}

export interface MobileButtonPosition {
  right: number;
  top: number;
}

export function calculateMobileButtonPosition(
  layoutWidth: number,
  viewport: VisualViewportGeometry,
  buttonSize = 54,
  bottomClearance = 76,
  sideInset = 16,
  topInset = 12,
  obstructionTop?: number,
): MobileButtonPosition {
  const visibleBottom = viewport.offsetTop + viewport.height;
  const visibleRight = viewport.offsetLeft + viewport.width;
  const naturalTop = visibleBottom - buttonSize - bottomClearance;
  const unobstructedTop = Number.isFinite(obstructionTop)
    ? Math.min(naturalTop, (obstructionTop as number) - buttonSize - topInset)
    : naturalTop;
  return {
    top: Math.max(
      viewport.offsetTop + topInset,
      unobstructedTop,
    ),
    right: Math.max(sideInset, layoutWidth - visibleRight + sideInset),
  };
}
