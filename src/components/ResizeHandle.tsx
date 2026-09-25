import { useEffect, useRef, useState } from "react";

type Limit = number | (() => number);

type Props = {
  orientation: "vertical" | "horizontal";
  value: number;
  min: number;
  max: Limit;
  defaultValue: number;
  onChange: (value: number) => void;
  direction?: 1 | -1;
  label: string;
};

function resolveLimit(value: Limit) {
  return typeof value === "function" ? value() : value;
}

function clamp(value: number, min: number, max: number) {
  const safeMax = Math.max(min, max);
  return Math.min(safeMax, Math.max(min, value));
}

export default function ResizeHandle({
  orientation,
  value,
  min,
  max,
  defaultValue,
  onChange,
  direction = 1,
  label
}: Props) {
  const dragRef = useRef<{ pointerId: number; startCoordinate: number; startValue: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const maxValue = () => Math.max(min, resolveLimit(max));

  const finishDrag = (target?: HTMLElement, pointerId?: number) => {
    if (target && pointerId !== undefined && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    dragRef.current = null;
    setDragging(false);
    document.body.classList.remove("xenra-resizing-vertical", "xenra-resizing-horizontal");
  };

  useEffect(() => {
    return () => {
      document.body.classList.remove("xenra-resizing-vertical", "xenra-resizing-horizontal");
    };
  }, []);

  return (
    <div
      className={`resize-handle resize-handle--${orientation}${dragging ? " is-dragging" : ""}`}
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={Math.round(maxValue())}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onDoubleClick={() => onChange(clamp(defaultValue, min, maxValue()))}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const coordinate = orientation === "vertical" ? event.clientX : event.clientY;
        dragRef.current = { pointerId: event.pointerId, startCoordinate: coordinate, startValue: value };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        document.body.classList.add(
          orientation === "vertical" ? "xenra-resizing-vertical" : "xenra-resizing-horizontal"
        );
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const coordinate = orientation === "vertical" ? event.clientX : event.clientY;
        const delta = (coordinate - drag.startCoordinate) * direction;
        onChange(clamp(drag.startValue + delta, min, maxValue()));
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        finishDrag(event.currentTarget, event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        finishDrag(event.currentTarget, event.pointerId);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 24 : 8;
        let axisDelta = 0;
        if (orientation === "vertical") {
          if (event.key === "ArrowLeft") axisDelta = -step;
          if (event.key === "ArrowRight") axisDelta = step;
        } else {
          if (event.key === "ArrowUp") axisDelta = -step;
          if (event.key === "ArrowDown") axisDelta = step;
        }
        if (!axisDelta) return;
        event.preventDefault();
        onChange(clamp(value + axisDelta * direction, min, maxValue()));
      }}
    />
  );
}