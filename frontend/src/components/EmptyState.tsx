import React from 'react';
import { FaFolderOpen } from 'react-icons/fa';
import './EmptyState.css';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
}

export default function EmptyState({ 
  icon, 
  title = 'No items yet', 
  description 
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {icon || <FaFolderOpen />}
      </div>
      <div className="empty-state-title">{title}</div>
      {description && (
        <div className="empty-state-description">{description}</div>
      )}
    </div>
  );
}

