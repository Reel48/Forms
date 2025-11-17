import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FaTimes } from 'react-icons/fa';
import type { FormField } from '../../api';
import { FIELD_TYPE_LABELS } from '../../lib/fieldRegistry';

interface FieldListProps {
  fields: FormField[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onRemove: (index: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

interface SortableFieldItemProps {
  id: string;
  field: FormField;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onRemove: (index: number) => void;
}

function SortableFieldItem({
  id,
  field,
  index,
  isSelected,
  onSelect,
  onMove,
  onRemove,
}: SortableFieldItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      className="card"
      style={{
        ...style,
        border: isSelected ? '2px solid #667eea' : '1px solid #e5e7eb',
        cursor: 'pointer',
        backgroundColor: isSelected ? '#f9fafb' : 'white',
      }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className="badge badge-draft" style={{ fontSize: '0.75rem' }}>
              {FIELD_TYPE_LABELS[field.field_type] || field.field_type}
            </span>
            {field.required && (
              <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: '500' }}>* Required</span>
            )}
            <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>Order: {field.order_index + 1}</span>
          </div>
          <h3 style={{ margin: 0, marginBottom: '0.25rem' }}>{field.label || 'Untitled Field'}</h3>
          {field.description && (
            <p style={{ margin: '0.25rem 0', color: '#6b7280', fontSize: '0.875rem' }}>{field.description}</p>
          )}
          {field.field_type === 'section' && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                backgroundColor: '#f3f4f6',
                borderRadius: '4px',
                fontSize: '0.875rem',
                color: '#6b7280',
              }}
            >
              Section Divider
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMove(index, 'up');
            }}
            disabled={index === 0}
            className="btn-outline"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMove(index, 'down');
            }}
            disabled={index === (field.order_index ?? 0)}
            className="btn-outline"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Are you sure you want to remove this field?')) {
                onRemove(index);
              }
            }}
            className="btn-danger"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            title="Remove field"
          >
            <FaTimes />
          </button>
        </div>
      </div>
      <div
        {...attributes}
        {...listeners}
        style={{
          marginTop: '0.5rem',
          padding: '0.5rem',
          backgroundColor: '#f3f4f6',
          borderRadius: '4px',
          cursor: 'grab',
          fontSize: '0.75rem',
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        ⋮⋮ Drag to reorder
      </div>
    </div>
  );
}

export function FieldList({
  fields,
  selectedIndex,
  onSelect,
  onMove,
  onRemove,
  onDragEnd,
}: FieldListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (!fields || fields.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
        <p>No fields yet. Add a field from the sidebar to get started.</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={fields.map((_, i) => i.toString())}
        strategy={verticalListSortingStrategy}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {fields.map((field, index) => (
            <SortableFieldItem
              key={index}
              id={index.toString()}
              field={field}
              index={index}
              isSelected={selectedIndex === index}
              onSelect={() => onSelect(index)}
              onMove={onMove}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

