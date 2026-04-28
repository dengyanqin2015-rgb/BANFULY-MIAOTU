
import React from 'react';
import WorkflowCanvas from './WorkflowCanvas';
import { Constitution } from '../types';

interface WorkflowPanelProps {
  onSelectConstitution: (c: Constitution) => void;
  userApiKey: string;
  paidImageApiKey: string;
  doubaoApiKey: string;
  doubaoModelId: string;
}

export const WorkflowPanel: React.FC<WorkflowPanelProps> = ({
  onSelectConstitution,
  userApiKey,
  paidImageApiKey,
  doubaoApiKey,
  doubaoModelId
}) => {
  return (
    <div className="h-full w-full animate-slide-up">
      <WorkflowCanvas 
        onSelectConstitution={onSelectConstitution}
        userApiKey={userApiKey}
        paidImageApiKey={paidImageApiKey}
        doubaoApiKey={doubaoApiKey}
        doubaoModelId={doubaoModelId}
      />
    </div>
  );
};
