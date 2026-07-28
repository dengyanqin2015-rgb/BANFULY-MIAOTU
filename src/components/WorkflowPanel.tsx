
import React from 'react';
import { WorkflowCanvas } from './WorkflowCanvas';
import { Constitution } from '../types';

interface WorkflowPanelProps {
  onSelectConstitution: (c: Constitution) => void;
  userApiKey: string;
  paidImageApiKey: string;
}

export const WorkflowPanel: React.FC<WorkflowPanelProps> = ({
  userApiKey
}) => {
  return (
    <div className="h-full w-full animate-slide-up">
      <WorkflowCanvas 
        userApiKey={userApiKey}
      />
    </div>
  );
};
