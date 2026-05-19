'use client';

import { useParams } from 'next/navigation';

import { ReportDetail } from '@/feature/reports/components/ReportDetail';
import { useReportDetailViewModel } from '@/feature/reports/hooks/useReportDetailViewModel';

/**
 * `/reports/[id]` 의 client wrapper.
 * useParams 로 dynamic segment 를 읽고 ViewModel + View 를 합성한다.
 */
export function ReportDetailPageClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';
  const vm = useReportDetailViewModel(id);
  return <ReportDetail {...vm} />;
}
