"use client";

import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ALWAYS_VISIBLE, COLUMN_LABELS, type DataColumnId } from "../../table/config";
import { moveColumn } from "../../table/preferences";
import { IconChevronDown, IconChevronUp, IconColumns, IconColumns2, IconColumns3, IconGripVertical, IconRotate } from "@tabler/icons-react";

type Props = {
  order: DataColumnId[];
  visibility: Record<DataColumnId, boolean>;
  onOrderChange: (order: DataColumnId[]) => void;
  onVisibilityChange: (id: DataColumnId, visible: boolean) => void;
  onReset: () => void;
  /** Whether the layout differs from the default, enabling Reset. */
  customized: boolean;
};

/**
 * Show, hide, and reorder data columns. Rows can be dragged by their handle with a mouse, touch, or
 * keyboard (Space to lift, arrows to move), or moved with the arrow buttons.
 */
export function ColumnsPopover({ order, visibility, onOrderChange, onVisibilityChange, onReset, customized }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const hidden = order.filter((id) => !visibility[id]).length;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onOrderChange(arrayMove(order, order.indexOf(active.id as DataColumnId), order.indexOf(over.id as DataColumnId)));
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" aria-label={hidden > 0 ? `Columns, ${hidden} hidden` : "Columns"}><IconColumns3 /></Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Columns</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-0 gap-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <div>
            <p className="font-medium">Columns</p>
          </div>
          <Button variant="ghost" size="sm" className="-mr-2 h-7" disabled={!customized} onClick={onReset}>
            Reset
          </Button>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: { draggable: "To reorder a column, press Space to lift it, use the arrow keys to move it, and press Space again to drop it." },
            announcements: {
              onDragStart: ({ active }) => `Picked up ${label(active.id)}.`,
              onDragOver: ({ active, over }) => (over ? `${label(active.id)} is now at position ${order.indexOf(over.id as DataColumnId) + 1} of ${order.length}.` : undefined),
              onDragEnd: ({ active, over }) => (over ? `Dropped ${label(active.id)} at position ${order.indexOf(over.id as DataColumnId) + 1}.` : `Dropped ${label(active.id)}.`),
              onDragCancel: ({ active }) => `Moving ${label(active.id)} was cancelled.`,
            },
          }}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ul className="max-h-[60vh] overflow-y-auto p-2" aria-label="Column order">
              {order.map((id, index) => (
                <ColumnItem
                  key={id}
                  id={id}
                  visible={visibility[id]}
                  first={index === 0}
                  last={index === order.length - 1}
                  onVisibleChange={(visible) => onVisibilityChange(id, visible)}
                  onMove={(direction) => onOrderChange(moveColumn(order, id, direction))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </PopoverContent>
    </Popover>
  );
}

const label = (id: string | number) => COLUMN_LABELS[id as DataColumnId] ?? String(id);

type ItemProps = {
  id: DataColumnId;
  visible: boolean;
  first: boolean;
  last: boolean;
  onVisibleChange: (visible: boolean) => void;
  onMove: (direction: -1 | 1) => void;
};

function ColumnItem({ id, visible, first, last, onVisibleChange, onMove }: ItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const locked = ALWAYS_VISIBLE.includes(id);
  const checkboxId = `student-column-${id}`;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-md px-1 py-1 ${isDragging ? "relative z-10 bg-muted shadow-sm" : "hover:bg-muted/50"}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${COLUMN_LABELS[id]}`}
        className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
      >
        <IconGripVertical className="size-4" />
      </button>
      <Checkbox
        id={checkboxId}
        checked={visible}
        disabled={locked}
        onCheckedChange={(checked) => onVisibleChange(checked === true)}
      />
      <label htmlFor={checkboxId} className={`min-w-0 flex-1 truncate px-1.5 text-sm ${visible ? "" : "text-muted-foreground"}`}>
        {COLUMN_LABELS[id]}
      </label>
      <Button variant="ghost" size="icon-xs" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${COLUMN_LABELS[id]} left`}>
        <IconChevronUp />
      </Button>
      <Button variant="ghost" size="icon-xs" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${COLUMN_LABELS[id]} right`}>
        <IconChevronDown />
      </Button>
    </li>
  );
}
