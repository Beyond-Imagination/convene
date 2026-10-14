'use client';

import type { BugReportLocation } from '@convene/shared-interfaces';

export function BugReportPanel(_props: {
  readonly meetingCode?: string;
  readonly location?: BugReportLocation;
}) {
  return null;
}

export function BugReportDialog(_props: {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly meetingCode?: string;
}) {
  return null;
}
