export type FloatingDropdownDirection = 'up' | 'down';

export interface FloatingDropdownPlacementInput {
  triggerTop: number;
  triggerBottom: number;
  triggerLeft: number;
  triggerWidth: number;
  contentHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  gap?: number;
  viewportPadding?: number;
  maxHeight?: number;
}

export interface FloatingDropdownPlacement {
  direction: FloatingDropdownDirection;
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export const calculateFloatingDropdownPlacement = ({
  triggerTop,
  triggerBottom,
  triggerLeft,
  triggerWidth,
  contentHeight,
  viewportHeight,
  viewportWidth,
  gap = 4,
  viewportPadding = 8,
  maxHeight = 176,
}: FloatingDropdownPlacementInput): FloatingDropdownPlacement => {
  const availableBelow = Math.max(0, viewportHeight - viewportPadding - triggerBottom - gap);
  const availableAbove = Math.max(0, triggerTop - viewportPadding - gap);
  const desiredHeight = Math.min(Math.max(0, contentHeight), maxHeight);
  const direction: FloatingDropdownDirection = availableBelow < desiredHeight && availableAbove > availableBelow
    ? 'up'
    : 'down';
  const availableHeight = direction === 'up' ? availableAbove : availableBelow;
  const resolvedMaxHeight = Math.max(0, Math.min(maxHeight, availableHeight));
  const renderedHeight = Math.min(desiredHeight, resolvedMaxHeight);
  const availableWidth = Math.max(0, viewportWidth - viewportPadding * 2);
  const width = Math.min(triggerWidth, availableWidth);
  const left = Math.min(
    Math.max(viewportPadding, triggerLeft),
    Math.max(viewportPadding, viewportWidth - viewportPadding - width),
  );

  return {
    direction,
    top: direction === 'up'
      ? Math.max(viewportPadding, triggerTop - gap - renderedHeight)
      : triggerBottom + gap,
    left,
    width,
    maxHeight: resolvedMaxHeight,
  };
};
