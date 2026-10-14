'use client';

import {
  BUG_REPORT_LIMITS,
  BUG_REPORT_LOCATION_LABELS,
  BUG_REPORT_LOCATIONS,
  type BugReportLocation,
} from '@convene/shared-interfaces';
import { type ReactNode, useId } from 'react';

import {
  type BugReportErrorKind,
  type BugReportFields,
  type BugReportImageError,
  type UseBugReportViewModel,
  useBugReportViewModel,
} from '@/feature/bug-report/hooks/useBugReportViewModel';
import { Dialog } from '@/shared/Dialog';

const IMAGE_ERROR_TEXT: Readonly<Record<BugReportImageError, string>> = {
  type: 'PNG·JPEG·GIF·WebP 이미지만 올릴 수 있어요.',
  size: '이미지 한 장은 5MB 이하여야 해요.',
  count: `이미지는 ${BUG_REPORT_LIMITS.imagesMax}장까지 올릴 수 있어요.`,
};

const SUBMIT_ERROR_TEXT: Readonly<Record<BugReportErrorKind, string>> = {
  'rate-limited': '버그 리포트가 잠시 많이 몰렸어요. 잠시 뒤 다시 보내 주세요.',
  unavailable: '지금은 버그 리포트를 받을 수 없어요. 팀에 직접 알려 주세요.',
  'too-large': '이미지가 너무 커서 보내지 못했어요. 더 작은 이미지로 바꿔 주세요.',
  failed: '보내지 못했어요. 잠시 뒤 다시 시도해 주세요.',
};

const fieldClass =
  'border-border bg-paper text-text text-body placeholder:text-muted/60 focus:border-accent focus:ring-accent/20 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-[border-color,box-shadow] focus:ring-4';

const textareaClass = `${fieldClass} resize-y`;

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function CheckIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      {...iconProps}
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ImageIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      {...iconProps}
      className={className}
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2"
      />
      <circle
        cx="9"
        cy="9"
        r="2"
      />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}

/** 양식 한 덩어리 — 번호·제목·도움말 머리 아래에 입력이 온다. */
function Section({
  index,
  title,
  hint,
  labelFor,
  required = false,
  children,
}: {
  readonly index: number;
  readonly title: string;
  readonly hint?: string;
  /** 섹션 제목이 곧 입력칸의 이름일 때 그 입력칸 id. */
  readonly labelFor?: string;
  readonly required?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-5 md:p-6">
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="bg-accent/15 text-accent-on text-cap grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono font-bold"
        >
          {index}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-body text-text font-bold">
              {labelFor === undefined ? title : <label htmlFor={labelFor}>{title}</label>}
            </h3>
            {required && (
              <span className="bg-danger/10 text-danger-on text-cap rounded-full px-2 py-0.5 font-semibold">
                필수
              </span>
            )}
          </div>
          {hint !== undefined && <p className="text-muted text-meta mt-1">{hint}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-3 md:pl-9">{children}</div>
    </section>
  );
}

function LabeledInput({
  label,
  field,
  vm,
  placeholder,
}: {
  readonly label: string;
  readonly field: keyof BugReportFields;
  readonly vm: UseBugReportViewModel;
  readonly placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-meta text-muted font-semibold"
      >
        {label}
      </label>
      <input
        id={id}
        value={vm.fields[field]}
        onChange={(e) => vm.setField(field, e.target.value)}
        maxLength={BUG_REPORT_LIMITS.shortTextMax}
        placeholder={placeholder}
        className={fieldClass}
      />
    </div>
  );
}

function LocationOptions({ vm }: { readonly vm: UseBugReportViewModel }) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {BUG_REPORT_LOCATIONS.map((location: BugReportLocation) => {
          const checked = vm.locations.includes(location);
          return (
            <label
              key={location}
              className="relative cursor-pointer"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => vm.toggleLocation(location)}
                className="peer sr-only"
              />
              <span className="border-border bg-paper text-muted text-meta hover:border-accent/60 hover:text-text peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:text-accent-on peer-focus-visible:ring-accent/30 flex items-center gap-1.5 rounded-full border px-3.5 py-2 font-semibold transition-colors peer-focus-visible:ring-4">
                {checked && <CheckIcon className="h-4 w-4" />}
                {BUG_REPORT_LOCATION_LABELS[location]}
              </span>
            </label>
          );
        })}
      </div>
      {vm.locations.includes('other') && (
        <input
          aria-label="그 외 설명"
          value={vm.fields.otherLocation}
          onChange={(e) => vm.setField('otherLocation', e.target.value)}
          maxLength={BUG_REPORT_LIMITS.shortTextMax}
          placeholder="어디에서 일어났는지 적어 주세요"
          className={fieldClass}
        />
      )}
    </>
  );
}

function StepList({ vm }: { readonly vm: UseBugReportViewModel }) {
  return (
    <>
      <ol className="flex flex-col gap-2">
        {vm.steps.map((step, i) => (
          <li
            key={i}
            className="flex items-center gap-2.5"
          >
            <span
              aria-hidden="true"
              className="border-border text-muted text-cap grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono font-semibold"
            >
              {i + 1}
            </span>
            <input
              aria-label={`${i + 1}단계`}
              value={step}
              onChange={(e) => vm.setStep(i, e.target.value)}
              maxLength={BUG_REPORT_LIMITS.textMax}
              placeholder={i === 0 ? '예) 회의에 입장한다' : undefined}
              className={fieldClass}
            />
            {vm.steps.length > 1 && (
              <button
                type="button"
                onClick={() => vm.removeStep(i)}
                aria-label={`${i + 1}단계 지우기`}
                className="text-muted hover:bg-text/10 hover:text-text grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg transition-colors"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ol>
      {vm.steps.length < BUG_REPORT_LIMITS.stepsMax && (
        <button
          type="button"
          onClick={vm.addStep}
          className="border-border text-muted hover:border-accent/60 hover:text-accent-on text-meta self-start rounded-full border border-dashed px-3.5 py-1.5 font-semibold transition-colors"
        >
          + 단계 추가
        </button>
      )}
    </>
  );
}

function ImagePicker({ vm }: { readonly vm: UseBugReportViewModel }) {
  const inputId = useId();
  return (
    <>
      {vm.images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          {vm.images.map((image) => (
            <li
              key={image.id}
              className="border-border bg-paper relative aspect-[4/3] overflow-hidden rounded-xl border"
            >
              {/* 로컬 blob 미리보기라 next/image 최적화 대상이 아니다. */}
              <img
                src={image.previewUrl}
                alt={image.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => vm.removeImage(image.id)}
                aria-label={`${image.name} 빼기`}
                className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-sm text-white transition-colors hover:bg-black/80"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {vm.images.length < BUG_REPORT_LIMITS.imagesMax && (
        <label
          htmlFor={inputId}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            vm.addImages(Array.from(e.dataTransfer.files));
          }}
          className="border-border bg-paper text-muted hover:border-accent/60 hover:text-text flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors"
        >
          <ImageIcon className="h-7 w-7" />
          <span className="text-meta font-semibold">
            클릭해서 고르거나 이미지를 끌어다 놓으세요
          </span>
          <span className="text-cap">
            PNG·JPEG·GIF·WebP · 장당 5MB · {vm.images.length}/{BUG_REPORT_LIMITS.imagesMax}장
          </span>
          <input
            id={inputId}
            type="file"
            accept={BUG_REPORT_LIMITS.imageTypes.join(',')}
            multiple
            onChange={(e) => {
              vm.addImages(Array.from(e.target.files ?? []));
              // 같은 파일을 지웠다가 다시 고를 수 있게 비운다.
              e.target.value = '';
            }}
            className="sr-only"
          />
        </label>
      )}
      {vm.imageError !== null && (
        <p className="text-danger-on text-meta">{IMAGE_ERROR_TEXT[vm.imageError]}</p>
      )}
    </>
  );
}

function SubmittedNotice({ onReset }: { readonly onReset: () => void }) {
  return (
    <div className="border-border bg-surface flex flex-col items-center gap-4 rounded-2xl border px-6 py-12 text-center">
      <span className="bg-accent text-accent-fg grid h-14 w-14 place-items-center rounded-full">
        <CheckIcon className="h-7 w-7" />
      </span>
      <div className="flex flex-col gap-1.5">
        <p
          role="status"
          className="text-title text-text font-bold"
        >
          버그 리포트가 접수됐어요
        </p>
        <p className="text-muted text-body">알려 주셔서 고맙습니다. 팀이 확인하고 고칠게요.</p>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="btn-ghost"
      >
        새 리포트 작성
      </button>
    </div>
  );
}

/** 버그 리포트 양식 — 노션 이슈 템플릿과 같은 순서로 묻는다. */
export function BugReportForm({ vm }: { readonly vm: UseBugReportViewModel }) {
  const summaryId = useId();
  const expectedId = useId();
  const notesId = useId();

  if (vm.status === 'done') return <SubmittedNotice onReset={vm.reset} />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void vm.submit();
      }}
      className="flex flex-col gap-4"
    >
      <Section
        index={1}
        title="무슨 일이 있었나요"
        hint="겪은 문제를 한두 문장으로 정리해 주세요."
        labelFor={summaryId}
        required
      >
        <textarea
          id={summaryId}
          value={vm.fields.summary}
          onChange={(e) => vm.setField('summary', e.target.value)}
          maxLength={BUG_REPORT_LIMITS.summaryMax}
          rows={3}
          placeholder="예) 회의에 입장했는데 상대방 소리가 들리지 않았습니다."
          className={textareaClass}
        />
      </Section>

      <Section
        index={2}
        title="어디서 발생했나요"
        hint="해당하는 곳을 모두 골라 주세요."
        required
      >
        <LocationOptions vm={vm} />
      </Section>

      <Section
        index={3}
        title="회의 코드와 발생 시각"
        hint="원인을 찾는 데 도움이 돼요. 회의 화면 상단이나 주소창의 /meetings/{회의코드} 에서 확인할 수 있어요."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <LabeledInput
            label="회의 코드"
            field="meetingCode"
            vm={vm}
            placeholder="예) a3k9zq1m"
          />
          <LabeledInput
            label="발생 시각"
            field="occurredAt"
            vm={vm}
            placeholder="날짜 + 대략적인 시:분"
          />
        </div>
      </Section>

      <Section
        index={4}
        title="재현 방법"
        hint="어떤 순서로 하면 다시 일어나는지 적어 주세요."
      >
        <StepList vm={vm} />
      </Section>

      <Section
        index={5}
        title="기대한 동작"
        hint="원래 어떻게 동작해야 한다고 생각했는지"
        labelFor={expectedId}
      >
        <textarea
          id={expectedId}
          value={vm.fields.expected}
          onChange={(e) => vm.setField('expected', e.target.value)}
          maxLength={BUG_REPORT_LIMITS.textMax}
          rows={2}
          className={textareaClass}
        />
      </Section>

      <Section
        index={6}
        title="사용 환경"
        hint="지금 기기에서 알아낸 값을 미리 채웠어요. 다르면 고쳐 주세요."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <LabeledInput
            label="기기 / OS"
            field="device"
            vm={vm}
          />
          <LabeledInput
            label="브라우저"
            field="browser"
            vm={vm}
          />
          <LabeledInput
            label="네트워크"
            field="network"
            vm={vm}
            placeholder="예) 와이파이, 5G"
          />
        </div>
      </Section>

      <Section
        index={7}
        title="화면 캡쳐"
        hint="문제가 보이는 화면을 붙여 주시면 훨씬 빨리 찾을 수 있어요."
      >
        <ImagePicker vm={vm} />
      </Section>

      <Section
        index={8}
        title="그 밖에"
        hint="노션 이슈 링크, 회의록 링크, 같이 겪은 사람 등 참고할 내용"
        labelFor={notesId}
      >
        <textarea
          id={notesId}
          value={vm.fields.notes}
          onChange={(e) => vm.setField('notes', e.target.value)}
          maxLength={BUG_REPORT_LIMITS.textMax}
          rows={3}
          className={textareaClass}
        />
      </Section>

      <div className="border-border flex flex-col gap-3 border-t pt-5 md:flex-row md:items-center md:justify-between">
        {vm.errorKind !== null ? (
          <p
            role="alert"
            className="text-danger-on text-meta font-semibold"
          >
            {SUBMIT_ERROR_TEXT[vm.errorKind]}
          </p>
        ) : (
          <p className="text-muted text-meta">
            {vm.canSubmit
              ? '보내면 노션 이슈로 등록돼 팀이 확인합니다.'
              : '무슨 일이 있었는지와 발생 위치를 채우면 보낼 수 있어요.'}
          </p>
        )}
        <button
          type="submit"
          disabled={!vm.canSubmit}
          aria-label="버그 리포트 보내기"
          className="btn-primary shrink-0"
        >
          {vm.status === 'submitting' ? '보내는 중…' : '버그 리포트 보내기'}
        </button>
      </div>
    </form>
  );
}

/** 버그 리포트 페이지와 회의 중 모달이 함께 쓴다. */
export function BugReportPanel({
  meetingCode,
  location,
}: {
  readonly meetingCode?: string;
  readonly location?: BugReportLocation;
}) {
  const vm = useBugReportViewModel({ meetingCode, location });
  return <BugReportForm vm={vm} />;
}

/** 회의를 떠나지 않고 버그를 알리는 모달. 회의 코드와 위치(회의 화면)를 미리 채운다. */
export function BugReportDialog({
  isOpen,
  onClose,
  meetingCode,
}: {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly meetingCode?: string;
}) {
  if (!isOpen) return null;
  return (
    <Dialog
      title="버그 리포트"
      closeLabel="버그 리포트 닫기"
      onClose={onClose}
      width="lg"
    >
      <BugReportPanel
        meetingCode={meetingCode}
        location="meeting"
      />
    </Dialog>
  );
}
