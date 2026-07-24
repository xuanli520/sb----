'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Highlighter,
  MessageSquare,
  Moon,
  Plus,
  SlidersHorizontal,
  Star,
  Sun,
  Ticket,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/app/components/ui/pagination';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/app/components/ui/sheet';
import { Slider } from '@/app/components/ui/slider';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Textarea } from '@/app/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import { InlineNotice, NovelShell, formatWordCount } from '@/components/novel/NovelShell';
import {
  AccountEntitlements,
  Book,
  BookSubscription,
  InteractionStats,
  NovelComment,
  NovelCommentPage,
  ParagraphAnnotation,
  ParagraphAnnotationPage,
  PublicParagraphAnnotation,
  PublicParagraphAnnotationPage,
  novelApi,
} from '@/features/novel/api';

type ChapterAccess = 'PREVIEW' | 'BOOK_ENTITLEMENT' | 'MEMBERSHIP' | 'AUTHOR' | 'ADMIN' | 'ENTITLEMENT_REQUIRED';
type Chapter = {
  id: number;
  title: string;
  content: string | null;
  published: boolean;
  orderNo: number;
  readable?: boolean;
  access?: ChapterAccess;
};
type BookmarkItem = { id: number; chapterId: number; offset: number; note: string; createdAt: string };
type ReaderAccess = { fullBookAccess: boolean; source: Exclude<ChapterAccess, 'ENTITLEMENT_REQUIRED'> };
type Detail = {
  book: Book;
  chapters: Chapter[];
  comments?: NovelComment[];
  access?: ReaderAccess;
  /** Returned by the protected reading projection so a refresh preserves the reader's stars. */
  currentUserRating?: number | null;
};
type ReaderFont = 'serif' | 'sans';
type Preference = { theme: 'paper' | 'sepia' | 'night'; font: ReaderFont; fontSize: number; lineHeight: number; brightness: number; pageMode: 'slide' | 'cover' | 'simulation' };
type ReadingProgress = { bookId: number; chapterId: number; offset: number; updatedAt: string };
type BookshelfState = { saved: boolean };
type Notice = { message: string; tone: 'success' | 'error' };
type RewardResult = { bookId: number; amount: number; balance: number };
type PurchaseResult = { bookId: number; purchased: boolean; balance: number };
type RewardState = 'idle' | 'pending' | 'success' | 'error';
type RewardAttempt = { bookId: number; amount: number; idempotencyKey: string };
type ParagraphAnnotationDraft = {
  chapterId: number;
  paragraphIndex: number;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
};
type PageTurnDirection = 'forward' | 'backward';
type ReaderTheme = { page: string; text: string; muted: string; border: string };
type PageTransition = {
  id: number;
  chapter: ReadableChapter;
  pageIndex: number;
  annotations: HighlightAnnotation[];
  direction: PageTurnDirection;
  mode: Preference['pageMode'];
};
type ReadableChapter = Chapter & { content: string };
type HighlightAnnotation = {
  id: number;
  paragraphIndex: number;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
  status: ParagraphAnnotation['status'];
  source: 'personal' | 'public';
};

const chapterTransitionDuration = 460;
const maxRewardAmount = 2_147_483_647;
const chapterCommentPageSize = 20;

const defaultPreference: Preference = {
  theme: 'paper',
  font: 'serif',
  fontSize: 19,
  lineHeight: 190,
  brightness: 85,
  pageMode: 'slide',
};

const themeOptions: Array<{ value: Preference['theme']; label: string; className: string }> = [
  { value: 'paper', label: '纸白', className: 'bg-[#fffdf7] text-stone-900' },
  { value: 'sepia', label: '暖褐', className: 'bg-[#f1e4c8] text-stone-900' },
  { value: 'night', label: '夜读', className: 'bg-[#1e2825] text-stone-100' },
];

const readerFontFamily: Record<ReaderFont, string> = {
  // The bundled CJK face keeps the reading surface legible on hosts without Songti/PingFang.
  serif: '"Songti SC", "STSong", "SimSun", "Noto Sans SC Local", serif',
  sans: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC Local", Arial, sans-serif',
};

function normalizePreference(value: Preference): Preference {
  return { ...value, font: value.font === 'sans' ? 'sans' : 'serif' };
}

const readerTheme: Record<Preference['theme'], ReaderTheme> = {
  paper: { page: '#fffdf7', text: '#292821', muted: '#716f63', border: '#e4dfd1' },
  sepia: { page: '#f1e4c8', text: '#453d30', muted: '#736957', border: '#d9c8a9' },
  night: { page: '#1e2825', text: '#e8ece6', muted: '#a9b4ad', border: '#3b4b45' },
};

function preferenceLabel(mode: Preference['pageMode']) {
  return { slide: '滑动翻页', cover: '覆盖翻页', simulation: '仿真翻页' }[mode];
}

function transitionEffect(mode: Preference['pageMode']) {
  return { slide: 'paired-slide', cover: 'cover-reveal', simulation: 'page-turn' }[mode];
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest('a, button, input, textarea, select, [role="button"], [role="combobox"], [contenteditable="true"]'));
}

function rewardAmountFrom(value: string): number | undefined {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return undefined;

  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= maxRewardAmount ? amount : undefined;
}

function formatTokenAmount(value: number) {
  return value.toLocaleString('zh-CN');
}

function fullBookAccessLabel(source: ReaderAccess['source'] | undefined) {
  return {
    BOOK_ENTITLEMENT: '已获得整本阅读权益。',
    MEMBERSHIP: '会员权益已解锁全书。',
    AUTHOR: '作者身份可阅读本作品全书。',
    ADMIN: '站长身份可阅读本作品全书。',
    PREVIEW: '当前正在阅读试读章节。',
  }[source ?? 'PREVIEW'];
}

function purchaseFailureMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : '获取整本阅读权益失败，请稍后重试。';
  return /insufficient tokens/i.test(message)
    ? '代币余额不足，请先在个人中心兑换代币。'
    : message;
}

function createIdempotencyKey() {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === 'function') return browserCrypto.randomUUID();
  if (typeof browserCrypto?.getRandomValues !== 'function') throw new Error('当前浏览器无法安全创建打赏请求。');

  const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function chapterParagraphs(content: string) {
  return content.replace(/\r\n?/g, '\n').split('\n').filter((paragraph) => paragraph.length > 0);
}

function isReadableChapter(chapter: Chapter | undefined): chapter is ReadableChapter {
  return Boolean(chapter && chapter.readable !== false && typeof chapter.content === 'string');
}

function isDetail(value: unknown): value is Detail {
  return typeof value === 'object'
    && value !== null
    && Array.isArray((value as Detail).chapters)
    && typeof (value as Detail).book === 'object'
    && (value as Detail).book !== null;
}

function isCommentPage(value: unknown): value is NovelCommentPage {
  return typeof value === 'object' && value !== null && Array.isArray((value as NovelCommentPage).items);
}

function isPublicAnnotationPage(value: unknown): value is PublicParagraphAnnotationPage {
  return typeof value === 'object' && value !== null && Array.isArray((value as PublicParagraphAnnotationPage).items);
}

function isInteractionStats(value: unknown): value is InteractionStats {
  return typeof value === 'object'
    && value !== null
    && typeof (value as InteractionStats).visibleCommentCount === 'number'
    && typeof (value as InteractionStats).ratingCount === 'number'
    && typeof (value as InteractionStats).averageRating === 'number'
    && typeof (value as InteractionStats).recommendationVoteCount === 'number'
    && typeof (value as InteractionStats).monthlyVoteCount === 'number';
}

function currentUserRating(value: number | null | undefined) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
}

function annotationHighlightClass(annotation: HighlightAnnotation) {
  if (annotation.source === 'public') return 'bg-emerald-100/90 text-inherit underline decoration-emerald-700/50 decoration-1 underline-offset-4';
  return {
    PRIVATE: 'bg-amber-200/80 text-inherit',
    PENDING_REVIEW: 'bg-sky-200/80 text-inherit',
    VISIBLE: 'bg-emerald-200/80 text-inherit',
    REJECTED: 'bg-stone-200 text-inherit decoration-stone-500 line-through',
  }[annotation.status];
}

function highlightedParagraph(
  paragraph: string,
  paragraphIndex: number,
  annotations: HighlightAnnotation[],
) {
  const anchors = annotations.filter((annotation) => annotation.paragraphIndex === paragraphIndex
    && annotation.selectionStart >= 0
    && annotation.selectionEnd <= paragraph.length
    && annotation.selectionEnd > annotation.selectionStart
    && paragraph.slice(annotation.selectionStart, annotation.selectionEnd) === annotation.selectedText);
  if (anchors.length === 0) return paragraph;

  const boundaries = Array.from(new Set([
    0,
    paragraph.length,
    ...anchors.flatMap((annotation) => [annotation.selectionStart, annotation.selectionEnd]),
  ])).sort((left, right) => left - right);

  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1] ?? paragraph.length;
    const matching = anchors.filter((annotation) => annotation.selectionStart <= start && annotation.selectionEnd >= end);
    const text = paragraph.slice(start, end);
    if (matching.length === 0) return <span key={`${start}-${end}`}>{text}</span>;
    const latest = matching.reduce((current, annotation) => annotation.id > current.id ? annotation : current);
    return (
      <mark
        key={`${start}-${end}-${latest.id}`}
        data-annotation-status={latest.status}
        data-annotation-source={latest.source}
        className={annotationHighlightClass(latest)}
      >
        {text}
      </mark>
    );
  });
}

function selectedParagraphAnchor(
  paragraphElement: HTMLParagraphElement,
  chapterId: number,
  paragraphIndex: number,
  paragraph: string,
): ParagraphAnnotationDraft | undefined {
  if (typeof window === 'undefined') return undefined;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return undefined;
  const range = selection.getRangeAt(0);
  const contains = (node: Node | null) => node === paragraphElement || (node !== null && paragraphElement.contains(node));
  if (!contains(range.startContainer) || !contains(range.endContainer)) return undefined;

  try {
    const offset = (node: Node, value: number) => {
      const prefix = document.createRange();
      prefix.selectNodeContents(paragraphElement);
      prefix.setEnd(node, value);
      return prefix.toString().length;
    };
    const selectionStart = offset(range.startContainer, range.startOffset);
    const selectionEnd = offset(range.endContainer, range.endOffset);
    const selectedText = paragraph.slice(selectionStart, selectionEnd);
    if (selectionEnd <= selectionStart || !selectedText.trim() || selectedText !== range.toString()) return undefined;
    return { chapterId, paragraphIndex, selectionStart, selectionEnd, selectedText };
  } catch {
    return undefined;
  }
}

function clearBrowserSelection() {
  if (typeof window !== 'undefined') window.getSelection?.()?.removeAllRanges();
}

function ChapterCopy({
  bookTitle,
  chapter,
  theme,
  headingId,
  compact = false,
  annotations = [],
  onParagraphSelection,
}: {
  bookTitle: string;
  chapter: ReadableChapter;
  theme: ReaderTheme;
  headingId?: string;
  compact?: boolean;
  annotations?: HighlightAnnotation[];
  onParagraphSelection?: (paragraphIndex: number, paragraph: string, element: HTMLParagraphElement) => void;
}) {
  const headingClassName = compact ? 'mt-3 text-2xl font-semibold leading-tight' : 'mt-3 text-3xl font-semibold leading-tight';
  const paragraphs = chapterParagraphs(chapter.content);

  return (
    <>
      <>
        <p className="text-xs font-semibold text-emerald-700">{bookTitle} · 第 {chapter.orderNo} 章</p>
        {headingId ? <h1 id={headingId} className={headingClassName}>{chapter.title}</h1> : <p className={headingClassName}>{chapter.title}</p>}
      </>
      <div className={`${compact ? 'mt-8 space-y-6' : 'mt-10 space-y-7'}`}>
        {paragraphs.map((paragraph, index) => {
          return (
          <p
            key={`${paragraph}-${index}`}
            data-paragraph-index={index}
            className={`max-w-2xl ${onParagraphSelection ? 'cursor-text select-text' : ''}`}
            onMouseUp={onParagraphSelection ? (event) => onParagraphSelection(index, paragraph, event.currentTarget) : undefined}
          >
            {highlightedParagraph(paragraph, index, annotations)}
          </p>
          );
        })}
      </div>
      {!compact ? <p className="mt-16 border-t pt-5 text-sm" style={{ borderColor: theme.border, color: theme.muted }}>本章阅读完毕</p> : null}
    </>
  );
}

function ChapterDirectoryList({
  chapters,
  activeChapterId,
  onSelect,
  className,
}: {
  chapters: Chapter[];
  activeChapterId: number;
  onSelect: (chapter: Chapter) => void;
  className: string;
}) {
  return (
    <ol className={className}>
      {chapters.map((item) => (
        <li key={item.id}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onSelect(item)}
            aria-current={item.id === activeChapterId ? 'page' : undefined}
            aria-label={isReadableChapter(item) ? `第 ${item.orderNo} 章 · ${item.title}` : `第 ${item.orderNo} 章 · ${item.title}，需要阅读权益`}
            className={`h-auto w-full justify-start rounded-none px-2 py-2.5 text-left transition-colors ${item.id === activeChapterId ? 'bg-emerald-50 font-semibold text-emerald-900 hover:bg-emerald-50 hover:text-emerald-900' : isReadableChapter(item) ? 'text-stone-600 hover:bg-stone-50 hover:text-stone-950' : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800'}`}
          >
            <span className="w-5 shrink-0 text-xs text-stone-400">{item.orderNo}</span>
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            {!isReadableChapter(item) ? <Coins className="ml-2 shrink-0 text-stone-400" size={14} aria-hidden="true" /> : null}
          </Button>
        </li>
      ))}
    </ol>
  );
}

const readerTransitionStyles = `
  @keyframes yuejie-reader-slide-enter-forward {
    from { opacity: 0.32; transform: translate3d(12%, 0, 0); }
    to { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes yuejie-reader-slide-enter-backward {
    from { opacity: 0.32; transform: translate3d(-12%, 0, 0); }
    to { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes yuejie-reader-slide-leave-forward {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to { opacity: 0.2; transform: translate3d(-12%, 0, 0); }
  }
  @keyframes yuejie-reader-slide-leave-backward {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to { opacity: 0.2; transform: translate3d(12%, 0, 0); }
  }
  @keyframes yuejie-reader-cover-forward {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(-100%, 0, 0); }
  }
  @keyframes yuejie-reader-cover-backward {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(100%, 0, 0); }
  }
  @keyframes yuejie-reader-page-turn-forward {
    from { opacity: 1; transform: rotateY(0deg); }
    to { opacity: 0.16; transform: rotateY(-92deg); }
  }
  @keyframes yuejie-reader-page-turn-backward {
    from { opacity: 1; transform: rotateY(0deg); }
    to { opacity: 0.16; transform: rotateY(92deg); }
  }
  .yuejie-reader-page-surface {
    isolation: isolate;
    perspective: 1400px;
  }
  .reader-chapter-pages {
    height: min(62vh, 720px);
    overflow: hidden;
    contain: layout paint;
  }
  .reader-chapter-page-flow {
    height: 100%;
    column-fill: auto;
    column-gap: 0;
    will-change: transform;
  }
  .reader-transition-pages { height: 100%; }
  .yuejie-reader-transition {
    position: absolute;
    inset: 0;
    z-index: 10;
    overflow: hidden;
    pointer-events: none;
    will-change: transform, opacity;
  }
  .yuejie-reader-current[data-transition-effect="paired-slide"][data-transition-direction="forward"] {
    animation: yuejie-reader-slide-enter-forward 360ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .yuejie-reader-current[data-transition-effect="paired-slide"][data-transition-direction="backward"] {
    animation: yuejie-reader-slide-enter-backward 360ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .yuejie-reader-transition[data-transition-effect="paired-slide"][data-transition-direction="forward"] {
    animation: yuejie-reader-slide-leave-forward 360ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .yuejie-reader-transition[data-transition-effect="paired-slide"][data-transition-direction="backward"] {
    animation: yuejie-reader-slide-leave-backward 360ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .yuejie-reader-transition[data-transition-effect="cover-reveal"] {
    box-shadow: 12px 0 22px rgb(41 40 33 / 22%);
  }
  .yuejie-reader-transition[data-transition-effect="cover-reveal"][data-transition-direction="forward"] {
    animation: yuejie-reader-cover-forward 420ms cubic-bezier(0.45, 0, 0.2, 1) both;
  }
  .yuejie-reader-transition[data-transition-effect="cover-reveal"][data-transition-direction="backward"] {
    animation: yuejie-reader-cover-backward 420ms cubic-bezier(0.45, 0, 0.2, 1) both;
  }
  .yuejie-reader-transition[data-transition-effect="page-turn"] {
    backface-visibility: hidden;
    transform-style: preserve-3d;
    box-shadow: 0 10px 24px rgb(41 40 33 / 19%);
  }
  .yuejie-reader-transition[data-transition-effect="page-turn"][data-transition-direction="forward"] {
    transform-origin: left center;
    animation: yuejie-reader-page-turn-forward 460ms cubic-bezier(0.35, 0.05, 0.25, 1) both;
  }
  .yuejie-reader-transition[data-transition-effect="page-turn"][data-transition-direction="backward"] {
    transform-origin: right center;
    animation: yuejie-reader-page-turn-backward 460ms cubic-bezier(0.35, 0.05, 0.25, 1) both;
  }
  @media (prefers-reduced-motion: reduce) {
    .yuejie-reader-current,
    .yuejie-reader-transition {
      animation: none !important;
    }
    .yuejie-reader-transition {
      display: none !important;
    }
  }
`;

function ReaderLoadingSkeleton() {
  return (
    <NovelShell workspace="reader">
      <section aria-live="polite" aria-busy="true" aria-label="正在打开章节" className="py-1">
        <span className="sr-only">正在打开章节...</span>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4" aria-hidden="true">
          <Skeleton className="h-4 w-20 rounded-none bg-stone-100" />
          <div className="space-y-2 text-right">
            <Skeleton className="ml-auto h-4 w-32 rounded-none bg-stone-100" />
            <Skeleton className="ml-auto h-3 w-24 rounded-none bg-stone-100" />
          </div>
        </div>

        <div className="mt-5 grid border border-stone-200 bg-white lg:grid-cols-[232px_minmax(0,1fr)]" aria-hidden="true">
          <div className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r">
            <Skeleton className="h-3 w-16 rounded-none bg-emerald-100" />
            <Skeleton className="mt-2 h-5 w-32 rounded-none bg-stone-100" />
            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1">
              <Skeleton className="h-9 w-full rounded-none bg-stone-100" />
              <Skeleton className="h-9 w-full rounded-none bg-stone-100" />
            </div>
            <div className="mt-5 border-t border-stone-200 pt-4">
              <Skeleton className="h-4 w-20 rounded-none bg-stone-100" />
              <Skeleton className="mt-3 h-4 w-full rounded-none bg-stone-100" />
              <Skeleton className="mt-2 h-4 w-4/5 rounded-none bg-stone-100" />
            </div>
            <div className="mt-5 hidden space-y-3 border-t border-stone-200 pt-3 lg:block">
              {[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-4 w-full rounded-none bg-stone-100" />)}
            </div>
          </div>

          <div className="min-h-[620px]">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 sm:px-8">
              <Skeleton className="h-3 w-16 rounded-none bg-stone-100" />
              <Skeleton className="h-4 w-20 rounded-none bg-stone-100" />
            </div>
            <div className="space-y-6 px-6 py-10 sm:px-12 sm:py-14 lg:px-16">
              <Skeleton className="h-3 w-32 rounded-none bg-emerald-100" />
              <Skeleton className="h-9 w-3/5 max-w-md rounded-none bg-stone-100" />
              <div className="space-y-5 pt-4">
                {[0, 1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className={`h-4 rounded-none bg-stone-100 ${item === 4 ? 'w-3/5' : item === 2 ? 'w-4/5' : 'w-full'}`} />)}
              </div>
              <div className="border-t border-stone-200 pt-5">
                <Skeleton className="h-4 w-20 rounded-none bg-stone-100" />
                <Skeleton className="mt-4 h-4 w-full rounded-none bg-stone-100" />
                <Skeleton className="mt-2 h-4 w-4/5 rounded-none bg-stone-100" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </NovelShell>
  );
}

function ReaderAnnotationsLoadingSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="正在加载公开段评" className="mt-3 space-y-3">
      <span className="sr-only">正在加载公开段评...</span>
      {[0, 1].map((item) => (
        <div key={item} className="border-l-2 border-emerald-200 pl-3" aria-hidden="true">
          <Skeleton className="h-4 w-20 rounded-none bg-stone-100" />
          <Skeleton className="mt-2 h-4 w-full rounded-none bg-stone-100" />
          <Skeleton className="mt-2 h-4 w-3/5 rounded-none bg-stone-100" />
        </div>
      ))}
    </div>
  );
}

function ReaderCommentsLoadingSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="正在加载本章评论" className="space-y-4">
      <span className="sr-only">正在加载本章评论...</span>
      {[0, 1].map((item) => (
        <div key={item} className="border-l-2 border-emerald-200 pl-4" aria-hidden="true">
          <Skeleton className="h-4 w-20 rounded-none bg-stone-100" />
          <Skeleton className="mt-2 h-4 w-full max-w-xl rounded-none bg-stone-100" />
          <Skeleton className="mt-2 h-4 w-3/5 max-w-md rounded-none bg-stone-100" />
        </div>
      ))}
    </div>
  );
}

function ReaderCommentPagination({
  meta,
  loading,
  onPageChange,
}: {
  meta: NovelCommentPage['meta'];
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(meta.total / Math.max(1, meta.size)));
  if (totalPages <= 1) return null;
  const previousDisabled = loading || meta.page <= 0;
  const nextDisabled = loading || meta.page >= totalPages - 1;
  const navigate = (page: number) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (page >= 0 && page < totalPages && page !== meta.page) onPageChange(page);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4 text-xs text-stone-500">
      <span>第 {meta.page + 1} / {totalPages} 页，共 {meta.total.toLocaleString('zh-CN')} 条</span>
      <Pagination aria-label="本章评论分页" className="mx-0 w-auto justify-start">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#chapter-comments" aria-disabled={previousDisabled} tabIndex={previousDisabled ? -1 : undefined} onClick={navigate(meta.page - 1)} className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50" />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#chapter-comments" aria-disabled={nextDisabled} tabIndex={nextDisabled ? -1 : undefined} onClick={navigate(meta.page + 1)} className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

export default function Reader({ params }: { params: Promise<{ id: string }> }) {
  const [detail, setDetail] = useState<Detail>();
  const [preference, setPreference] = useState<Preference>(defaultPreference);
  const [activeChapterId, setActiveChapterId] = useState<number>();
  const [saved, setSaved] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [paragraphAnnotations, setParagraphAnnotations] = useState<ParagraphAnnotation[]>([]);
  const [publicParagraphAnnotations, setPublicParagraphAnnotations] = useState<PublicParagraphAnnotation[]>([]);
  const [publicAnnotationsLoading, setPublicAnnotationsLoading] = useState(true);
  const [publicAnnotationsError, setPublicAnnotationsError] = useState('');
  const [publicAnnotationsReloadVersion, setPublicAnnotationsReloadVersion] = useState(0);
  const [paragraphAnnotationDraft, setParagraphAnnotationDraft] = useState<ParagraphAnnotationDraft>();
  const [paragraphAnnotationNote, setParagraphAnnotationNote] = useState('');
  const [paragraphAnnotationShareIntent, setParagraphAnnotationShareIntent] = useState(false);
  const [comment, setComment] = useState('');
  const [chapterComments, setChapterComments] = useState<NovelComment[]>([]);
  const [chapterCommentsPage, setChapterCommentsPage] = useState<NovelCommentPage>();
  const [commentsPageIndex, setCommentsPageIndex] = useState(0);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState('');
  const [commentsReloadVersion, setCommentsReloadVersion] = useState(0);
  const [interactionStats, setInteractionStats] = useState<InteractionStats>();
  const [interactionStatsReloadVersion, setInteractionStatsReloadVersion] = useState(0);
  const [rating, setRating] = useState(0);
  const [hasReaderSession, setHasReaderSession] = useState(false);
  const [rewardAmount, setRewardAmount] = useState('');
  const [rewardState, setRewardState] = useState<RewardState>('idle');
  const [rewardMessage, setRewardMessage] = useState('');
  const [tokenBalance, setTokenBalance] = useState<number>();
  const [hasBookEntitlement, setHasBookEntitlement] = useState<boolean>();
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [notice, setNotice] = useState<Notice>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pendingAction, setPendingAction] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileDirectoryOpen, setMobileDirectoryOpen] = useState(false);
  const [pageTransition, setPageTransition] = useState<PageTransition>();
  const [chapterAnnouncement, setChapterAnnouncement] = useState('');
  const [chapterPageIndex, setChapterPageIndex] = useState(0);
  const [chapterPageTotal, setChapterPageTotal] = useState(1);
  const [chapterPageWidth, setChapterPageWidth] = useState(720);
  const [reducedMotion, setReducedMotion] = useState(false);
  const transitionTimer = useRef<number>();
  const transitionSequence = useRef(0);
  const commentRequestSequence = useRef(0);
  const publicAnnotationRequestSequence = useRef(0);
  const interactionStatsRequestSequence = useRef(0);
  const activeChapterRef = useRef<number>();
  const rewardAttempt = useRef<RewardAttempt>();
  const rewardRequestInFlight = useRef(false);
  const readingProgressHeartbeat = useRef<{ key: string; sentAt: number }>();
  const chapterPagesRef = useRef<HTMLDivElement>(null);
  const restoredOffsetRef = useRef(0);
  const pageRatioRef = useRef(0);
  const pendingChapterPageRef = useRef<'start' | 'end'>('start');

  const persistReadingProgress = useCallback((force = false) => {
    const bookId = detail?.book.id;
    const chapterId = activeChapterRef.current ?? activeChapterId;
    const activeChapter = detail?.chapters.find((item) => item.id === chapterId);
    if (!hasReaderSession || !bookId || !chapterId || !isReadableChapter(activeChapter)) return;

    const offset = isReadableChapter(activeChapter) && chapterPageTotal > 1
      ? Math.min(
        activeChapter.content.length - 1,
        Math.round((activeChapter.content.length - 1) * chapterPageIndex / (chapterPageTotal - 1)),
      )
      : 0;
    const key = `${bookId}:${chapterId}:${offset}`;
    const now = Date.now();
    const previous = readingProgressHeartbeat.current;
    if (!force && previous?.key === key && now - previous.sentAt < 55_000) return;
    readingProgressHeartbeat.current = { key, sentAt: now };

    void novelApi<ReadingProgress>('account/progress', 'reader', {
      method: 'PUT',
      body: JSON.stringify({ bookId, chapterId, offset }),
      keepalive: force,
    }).catch(() => {
      // Reading stays usable if an expired session or a transient network error rejects telemetry.
    });
  }, [activeChapterId, chapterPageIndex, chapterPageTotal, detail?.book.id, detail?.chapters, hasReaderSession]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setReducedMotion(query.matches);
    syncPreference();
    query.addEventListener?.('change', syncPreference);
    return () => query.removeEventListener?.('change', syncPreference);
  }, []);

  useEffect(() => {
    if (!reducedMotion) return;
    if (transitionTimer.current !== undefined) {
      window.clearTimeout(transitionTimer.current);
      transitionTimer.current = undefined;
    }
    setPageTransition(undefined);
  }, [reducedMotion]);

  useEffect(() => () => {
    if (transitionTimer.current !== undefined) window.clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => {
    if (!hasReaderSession || !detail?.book.id || !activeChapterId) return;

    persistReadingProgress();
    const heartbeat = window.setInterval(() => persistReadingProgress(), 60_000);
    const persistWhenHidden = () => {
      if (document.visibilityState === 'hidden') persistReadingProgress(true);
    };
    const persistOnPageHide = () => persistReadingProgress(true);

    document.addEventListener('visibilitychange', persistWhenHidden);
    window.addEventListener('pagehide', persistOnPageHide);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', persistWhenHidden);
      window.removeEventListener('pagehide', persistOnPageHide);
    };
  }, [activeChapterId, detail?.book.id, hasReaderSession, persistReadingProgress]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError('');
      setTokenBalance(undefined);
      setHasBookEntitlement(undefined);
      setHasReaderSession(false);
      setSaved(false);
      setSubscribed(false);
      setInteractionStats(undefined);
      setRating(0);
      setChapterComments([]);
      setCommentsLoading(true);
      setCommentsError('');
      setPublicParagraphAnnotations([]);
      setPublicAnnotationsLoading(true);
      setPublicAnnotationsError('');
      setPurchaseDialogOpen(false);
      setPurchaseError('');
      try {
        const { id } = await params;
        const publicDetail = await novelApi<Detail>(`public/books/${id}`);
        let bookDetail = publicDetail;
        let readerSessionAvailable = false;
        try {
          const accountDetail = await novelApi<Detail>(`account/books/${id}/reading`);
          if (isDetail(accountDetail)) {
            bookDetail = accountDetail;
            readerSessionAvailable = true;
          }
        } catch {
          // Anonymous readers intentionally keep the public preview projection.
        }
        if (cancelled) return;

        setDetail(bookDetail);
        setHasReaderSession(readerSessionAvailable);
        setRating(currentUserRating(bookDetail.currentUserRating));

        const firstChapter = bookDetail.chapters.find(isReadableChapter);
        if (!firstChapter) return;

        const [preferencesResult, shelfResult, subscriptionResult, bookmarksResult, progressResult, annotationsResult, walletResult, entitlementsResult, statsResult] = await Promise.allSettled([
          novelApi<Preference>('account/preferences/reading'),
          novelApi<BookshelfState>(`account/bookshelf/${bookDetail.book.id}`),
          readerSessionAvailable
            ? novelApi<BookSubscription>(`account/subscriptions/${bookDetail.book.id}`)
            : Promise.resolve(null),
          novelApi<BookmarkItem[]>(`account/books/${bookDetail.book.id}/bookmarks`),
          novelApi<ReadingProgress | null>(`account/books/${bookDetail.book.id}/progress`),
          novelApi<ParagraphAnnotationPage>(`account/annotations?bookId=${bookDetail.book.id}&size=100`),
          novelApi<{ tokens: number }>('account/wallet'),
          novelApi<AccountEntitlements>('account/entitlements'),
          novelApi<InteractionStats>(`public/books/${bookDetail.book.id}/interactions`),
        ]);
        if (cancelled) return;

        if (preferencesResult.status === 'fulfilled') setPreference(normalizePreference(preferencesResult.value));
        if (shelfResult.status === 'fulfilled' && typeof shelfResult.value.saved === 'boolean') setSaved(shelfResult.value.saved);
        if (subscriptionResult.status === 'fulfilled'
          && subscriptionResult.value?.bookId === bookDetail.book.id
          && typeof subscriptionResult.value.subscribed === 'boolean') {
          setSubscribed(subscriptionResult.value.subscribed);
        }
        if (bookmarksResult.status === 'fulfilled') setBookmarks(bookmarksResult.value);
        if (annotationsResult.status === 'fulfilled' && Array.isArray(annotationsResult.value.items)) {
          setParagraphAnnotations(annotationsResult.value.items);
        }
        if (walletResult.status === 'fulfilled') setTokenBalance(walletResult.value.tokens);
        if (entitlementsResult.status === 'fulfilled') {
          setHasBookEntitlement(entitlementsResult.value.books.some((item) => item.bookId === bookDetail.book.id));
        }
        if (statsResult.status === 'fulfilled' && isInteractionStats(statsResult.value)) {
          setInteractionStats(statsResult.value);
        }

        const savedProgress = progressResult.status === 'fulfilled'
          && progressResult.value !== null
          && progressResult.value.bookId === bookDetail.book.id
          ? progressResult.value
          : undefined;
        restoredOffsetRef.current = savedProgress?.offset ?? 0;
        const restoredChapter = savedProgress
          ? bookDetail.chapters.find((item) => item.id === savedProgress.chapterId && isReadableChapter(item))
          : undefined;
        const initialChapter = restoredChapter ?? firstChapter;
        setChapterComments([]);
        setChapterCommentsPage(undefined);
        setCommentsPageIndex(0);
        setCommentsLoading(true);
        setCommentsError('');
        setPublicParagraphAnnotations([]);
        setPublicAnnotationsLoading(true);
        setPublicAnnotationsError('');
        activeChapterRef.current = initialChapter.id;
        setActiveChapterId(initialChapter.id);

      } catch (reason) {
        if (!cancelled) {
          setLoadError(reason instanceof Error ? reason.message : '章节暂时无法打开。');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [params]);

  const chapter = useMemo(
    () => detail?.chapters.find((item) => item.id === activeChapterId) ?? detail?.chapters[0],
    [activeChapterId, detail],
  );
  const activeChapterIndex = detail && chapter ? detail.chapters.findIndex((item) => item.id === chapter.id) : -1;
  const activeParagraphAnnotations: HighlightAnnotation[] = chapter
    ? [
      ...paragraphAnnotations
        .filter((annotation) => annotation.chapterId === chapter.id)
        .map((annotation) => ({ ...annotation, source: 'personal' as const })),
      ...publicParagraphAnnotations
        .filter((annotation) => annotation.chapterId === chapter.id && !paragraphAnnotations.some((personal) => personal.id === annotation.id))
        .map((annotation) => ({ ...annotation, status: 'VISIBLE' as const, source: 'public' as const })),
    ]
    : [];
  const theme = readerTheme[preference.theme];
  const readerPageStyle = {
    backgroundColor: theme.page,
    color: theme.text,
    borderColor: theme.border,
    fontSize: preference.fontSize,
    lineHeight: preference.lineHeight / 100,
    fontFamily: readerFontFamily[preference.font],
    filter: `brightness(${preference.brightness}%)`,
  };
  const activeTransitionEffect = pageTransition ? transitionEffect(pageTransition.mode) : undefined;
  const displayedPurchasePrice = detail?.book.purchasePrice;
  const purchasePrice = Number.isSafeInteger(displayedPurchasePrice) && (displayedPurchasePrice ?? 0) > 0
    ? displayedPurchasePrice
    : undefined;
  const hasSufficientTokens = purchasePrice !== undefined && tokenBalance !== undefined && tokenBalance >= purchasePrice;
  const hasFullBookAccess = detail?.access?.fullBookAccess === true || hasBookEntitlement === true;
  useLayoutEffect(() => {
    const element = chapterPagesRef.current;
    if (!element || !isReadableChapter(chapter)) return undefined;
    let frame = 0;
    const updatePages = () => {
      const width = element.clientWidth;
      if (width <= 0) return;

      const total = Math.max(1, Math.ceil(element.scrollWidth / width));
      if (width !== chapterPageWidth) setChapterPageWidth(width);
      setChapterPageTotal(total);
      setChapterPageIndex(() => {
        const pendingBoundary = pendingChapterPageRef.current;
        if (pendingBoundary === 'end') {
          pendingChapterPageRef.current = 'start';
          return total - 1;
        }
        if (restoredOffsetRef.current > 0) {
          const restored = Math.min(
            total - 1,
            Math.round(restoredOffsetRef.current / Math.max(1, chapter.content.length - 1) * (total - 1)),
          );
          restoredOffsetRef.current = 0;
          return restored;
        }
        return Math.min(total - 1, Math.round(pageRatioRef.current * (total - 1)));
      });
    };
    updatePages();
    frame = window.requestAnimationFrame(updatePages);
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updatePages);
    });
    observer.observe(element);
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, [chapter, chapterPageWidth, loading, preference.font, preference.fontSize, preference.lineHeight]);

  useEffect(() => {
    pageRatioRef.current = chapterPageTotal > 1 ? chapterPageIndex / (chapterPageTotal - 1) : 0;
  }, [chapterPageIndex, chapterPageTotal]);

  useLayoutEffect(() => {
    const element = chapterPagesRef.current;
    if (!element) return;
    const left = chapterPageIndex * element.clientWidth;
    if (typeof element.scrollTo === 'function') element.scrollTo({ left, behavior: 'auto' });
    else element.scrollLeft = left;
  }, [chapter?.id, chapterPageIndex, chapterPageWidth, loading]);

  const announce = (message: string, tone: Notice['tone'] = 'success') => setNotice({ message, tone });

  useEffect(() => {
    const bookId = detail?.book.id;
    const chapterId = activeChapterId;
    const activeChapter = detail?.chapters.find((item) => item.id === chapterId);
    if (!bookId || !chapterId || !isReadableChapter(activeChapter)) {
      commentRequestSequence.current += 1;
    setChapterComments([]);
    setChapterCommentsPage(undefined);
      setCommentsPageIndex(0);
      setCommentsLoading(false);
      setCommentsError('');
      return;
    }

    const requestId = ++commentRequestSequence.current;
    let cancelled = false;
      setChapterComments([]);
      setChapterCommentsPage(undefined);
    setCommentsLoading(true);
    setCommentsError('');

    const commentParameters = new URLSearchParams({
      chapterId: chapterId.toString(),
      page: commentsPageIndex.toString(),
      size: chapterCommentPageSize.toString(),
    });
    const commentPath = detail?.access?.fullBookAccess
      ? `account/books/${bookId}/comments?${commentParameters.toString()}`
      : `public/books/${bookId}/comments?${commentParameters.toString()}`;
    void novelApi<NovelCommentPage>(commentPath, 'reader')
      .then((page) => {
        if (cancelled || requestId !== commentRequestSequence.current) return;
        if (!isCommentPage(page)) throw new Error('本章评论返回格式无效。');
        setChapterComments(page.items);
        setChapterCommentsPage(page);
      })
      .catch((reason) => {
        if (cancelled || requestId !== commentRequestSequence.current) return;
        setCommentsError(reason instanceof Error ? reason.message : '本章评论暂时无法加载。');
      })
      .finally(() => {
        if (cancelled || requestId !== commentRequestSequence.current) return;
        setCommentsLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeChapterId, commentsPageIndex, commentsReloadVersion, detail?.access?.fullBookAccess, detail?.book.id, detail?.chapters]);

  useEffect(() => {
    const bookId = detail?.book.id;
    const chapterId = activeChapterId;
    const activeChapter = detail?.chapters.find((item) => item.id === chapterId);
    if (!bookId || !chapterId || !isReadableChapter(activeChapter)) {
      publicAnnotationRequestSequence.current += 1;
      setPublicParagraphAnnotations([]);
      setPublicAnnotationsLoading(false);
      setPublicAnnotationsError('');
      return;
    }

    const requestId = ++publicAnnotationRequestSequence.current;
    let cancelled = false;
    setPublicParagraphAnnotations([]);
    setPublicAnnotationsLoading(true);
    setPublicAnnotationsError('');
    const annotationPath = detail?.access?.fullBookAccess
      ? `account/books/${bookId}/chapters/${chapterId}/annotations`
      : `public/books/${bookId}/chapters/${chapterId}/annotations`;
    void novelApi<PublicParagraphAnnotationPage>(annotationPath, 'reader')
      .then((page) => {
        if (cancelled || requestId !== publicAnnotationRequestSequence.current) return;
        if (!isPublicAnnotationPage(page)) throw new Error('公开段评返回格式无效。');
        setPublicParagraphAnnotations(page.items);
      })
      .catch((reason) => {
        if (cancelled || requestId !== publicAnnotationRequestSequence.current) return;
        setPublicAnnotationsError(reason instanceof Error ? reason.message : '公开段评暂时无法加载。');
      })
      .finally(() => {
        if (cancelled || requestId !== publicAnnotationRequestSequence.current) return;
        setPublicAnnotationsLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeChapterId, detail?.access?.fullBookAccess, detail?.book.id, detail?.chapters, publicAnnotationsReloadVersion]);

  useEffect(() => {
    const bookId = detail?.book.id;
    if (!bookId) {
      interactionStatsRequestSequence.current += 1;
      setInteractionStats(undefined);
      return;
    }
    const requestId = ++interactionStatsRequestSequence.current;
    let cancelled = false;
    void novelApi<InteractionStats>(`public/books/${bookId}/interactions`)
      .then((stats) => {
        if (!cancelled && requestId === interactionStatsRequestSequence.current && isInteractionStats(stats)) setInteractionStats(stats);
      })
      .catch(() => {
        if (!cancelled && requestId === interactionStatsRequestSequence.current) setInteractionStats(undefined);
      });
    return () => { cancelled = true; };
  }, [detail?.book.id, interactionStatsReloadVersion]);

  const savePreference = async (next: Preference) => {
    setPreference(next);
    try {
      await novelApi<Preference>('account/preferences/reading', 'reader', { method: 'PUT', body: JSON.stringify(next) });
    } catch {
      announce('阅读设置仅保存在当前页面；登录后可跨设备同步。', 'error');
    }
  };

  const startPageTransition = (sourceChapter: ReadableChapter, direction: PageTurnDirection) => {
    const transitionId = transitionSequence.current + 1;
    transitionSequence.current = transitionId;
    if (transitionTimer.current !== undefined) window.clearTimeout(transitionTimer.current);

    if (reducedMotion) {
      transitionTimer.current = undefined;
      setPageTransition(undefined);
      return;
    }

    setPageTransition({
      id: transitionId,
      chapter: sourceChapter,
      pageIndex: chapterPageIndex,
      annotations: activeParagraphAnnotations,
      direction,
      mode: preference.pageMode,
    });
    transitionTimer.current = window.setTimeout(() => {
      setPageTransition((current) => current?.id === transitionId ? undefined : current);
      transitionTimer.current = undefined;
    }, chapterTransitionDuration);
  };

  const selectChapter = async (nextChapter: Chapter, targetPage: 'start' | 'end' = 'start', directionOverride?: PageTurnDirection) => {
    if (!detail || nextChapter.id === chapter?.id) return;

    if (!isReadableChapter(nextChapter)) {
      setChapterAnnouncement(`第 ${nextChapter.orderNo} 章《${nextChapter.title}》需要整本阅读权益。`);
      if (tokenBalance !== undefined && purchasePrice !== undefined) {
        setPurchaseError('');
        setPurchaseDialogOpen(true);
      } else {
        announce('此章节需要整本阅读权益。登录后可兑换代币或购买整本。', 'error');
      }
      return;
    }

    persistReadingProgress(true);
    const currentIndex = detail.chapters.findIndex((item) => item.id === chapter?.id);
    const nextIndex = detail.chapters.findIndex((item) => item.id === nextChapter.id);
    const direction: PageTurnDirection = directionOverride ?? (nextIndex > currentIndex ? 'forward' : 'backward');
    if (isReadableChapter(chapter)) startPageTransition(chapter, direction);

    commentRequestSequence.current += 1;
    setChapterComments([]);
    setChapterCommentsPage(undefined);
    setCommentsPageIndex(0);
    setCommentsLoading(true);
    setCommentsError('');
    publicAnnotationRequestSequence.current += 1;
    setPublicParagraphAnnotations([]);
    setPublicAnnotationsLoading(true);
    setPublicAnnotationsError('');
    activeChapterRef.current = nextChapter.id;
    setActiveChapterId(nextChapter.id);
    pendingChapterPageRef.current = targetPage;
    setChapterPageIndex(0);
    setChapterPageTotal(1);
    setParagraphAnnotationDraft(undefined);
    setParagraphAnnotationNote('');
    setParagraphAnnotationShareIntent(false);
    clearBrowserSelection();
    setChapterAnnouncement(`已切换至第 ${nextChapter.orderNo} 章《${nextChapter.title}》，${preferenceLabel(preference.pageMode)}${reducedMotion ? '，已减少动态效果。' : '。'}`);
    persistReadingProgress(true);
  };

  const moveChapter = (offset: number, targetPage: 'start' | 'end') => {
    const next = detail?.chapters[activeChapterIndex + offset];
    if (next) void selectChapter(next, targetPage, offset > 0 ? 'forward' : 'backward');
  };

  const moveReaderPage = (offset: number) => {
    const target = chapterPageIndex + offset;
    if (isReadableChapter(chapter) && target >= 0 && target < chapterPageTotal) {
      startPageTransition(chapter, offset > 0 ? 'forward' : 'backward');
      setChapterPageIndex(target);
      setChapterAnnouncement(`第 ${chapter.orderNo} 章《${chapter.title}》，第 ${target + 1} / ${chapterPageTotal} 页。`);
      return;
    }
    moveChapter(offset, offset > 0 ? 'start' : 'end');
  };

  const handleReaderKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || isInteractiveTarget(event.target)) return;

    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      moveReaderPage(-1);
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      moveReaderPage(1);
    }
  };

  const toggleShelf = async () => {
    if (!detail) return;
    setPendingAction('shelf');
    try {
      const result = await novelApi<{ saved: boolean }>(`account/bookshelf/${detail.book.id}`, 'reader', { method: 'POST' });
      setSaved(result.saved);
      announce(result.saved ? '已加入书架，可以在登录后继续阅读。' : '已从书架移除。');
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '加入书架失败，请先登录读者账户。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const toggleSubscription = async () => {
    if (!detail) return;
    setPendingAction('subscription');
    try {
      const result = await novelApi<BookSubscription>(
        `account/subscriptions/${detail.book.id}`,
        'reader',
        { method: subscribed ? 'DELETE' : 'PUT' },
      );
      setSubscribed(result.subscribed);
      announce(result.subscribed ? '已免费订阅本作品。' : '已取消订阅本作品。');
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '订阅操作失败，请先登录读者账户。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const addBookmark = async () => {
    if (!detail || !chapter) return;
    setPendingAction('bookmark');
    try {
      const result = await novelApi<BookmarkItem>(`account/books/${detail.book.id}/bookmarks`, 'reader', {
        method: 'POST',
        body: JSON.stringify({ chapterId: chapter.id, offset: 0, note: chapter.title }),
      });
      setBookmarks((items) => [result, ...items]);
      announce('已添加书签');
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '添加书签失败，请先登录读者账户。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const captureParagraphSelection = (
    paragraphIndex: number,
    paragraph: string,
    paragraphElement: HTMLParagraphElement,
  ) => {
    if (!chapter) return;
    const draft = selectedParagraphAnchor(paragraphElement, chapter.id, paragraphIndex, paragraph);
    if (!draft) return;
    setParagraphAnnotationDraft(draft);
    setParagraphAnnotationNote('');
    setParagraphAnnotationShareIntent(false);
  };

  const saveParagraphAnnotation = async () => {
    if (!detail || !chapter || !paragraphAnnotationDraft || paragraphAnnotationDraft.chapterId !== chapter.id) return;
    setPendingAction('paragraph-annotation');
    try {
      const result = await novelApi<ParagraphAnnotation>(
        `account/books/${detail.book.id}/chapters/${chapter.id}/annotations`,
        'reader',
        {
          method: 'POST',
          body: JSON.stringify({
            paragraphIndex: paragraphAnnotationDraft.paragraphIndex,
            selectionStart: paragraphAnnotationDraft.selectionStart,
            selectionEnd: paragraphAnnotationDraft.selectionEnd,
            selectedText: paragraphAnnotationDraft.selectedText,
            note: paragraphAnnotationNote,
            shareIntent: paragraphAnnotationShareIntent,
          }),
        },
      );
      setParagraphAnnotations((items) => [result, ...items]);
      setParagraphAnnotationDraft(undefined);
      setParagraphAnnotationNote('');
      setParagraphAnnotationShareIntent(false);
      clearBrowserSelection();
      announce(result.status === 'PENDING_REVIEW' ? '划线已保存，分享申请已进入审核。' : '划线已保存。');
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '保存划线失败，请先登录读者账户。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const discardParagraphAnnotation = () => {
    setParagraphAnnotationDraft(undefined);
    setParagraphAnnotationNote('');
    setParagraphAnnotationShareIntent(false);
    clearBrowserSelection();
  };

  const postComment = async () => {
    if (!detail || !chapter || !comment.trim()) return;
    const content = comment.trim();
    const commentChapterId = chapter.id;
    setPendingAction('comment');
    try {
      const result = await novelApi<NovelComment>(`account/books/${detail.book.id}/comments`, 'reader', {
        method: 'POST',
        body: JSON.stringify({ chapterId: commentChapterId, content }),
      });
      setComment((current) => current === content ? '' : current);
      announce(result.status === 'VISIBLE' ? '评论已发布' : '评论已进入审核队列');
      if (result.status === 'VISIBLE' && activeChapterRef.current === commentChapterId) {
        // A late list response must not replace a comment the reader has just published.
        commentRequestSequence.current += 1;
        setCommentsLoading(false);
        setCommentsError('');
        setChapterComments((items) => items.some((item) => item.id === result.id) ? items : [...items, result]);
        setChapterCommentsPage((current) => current
          ? { ...current, items: current.items.some((item) => item.id === result.id) ? current.items : [...current.items, result], meta: { ...current.meta, total: current.meta.total + 1 } }
          : current);
      }
      setInteractionStatsReloadVersion((version) => version + 1);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '发表评论失败，请先登录读者账户。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const rateBook = async (value: number) => {
    if (!detail) return;
    setPendingAction('rating');
    try {
      await novelApi(`account/books/${detail.book.id}/rating`, 'reader', { method: 'POST', body: JSON.stringify({ rating: value }) });
      setRating(value);
      setInteractionStatsReloadVersion((version) => version + 1);
      announce(`已为《${detail.book.title}》评分 ${value} 星。`);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '评分失败，请先登录读者账户。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const voteBook = async (type: 'recommendation' | 'monthly') => {
    if (!detail) return;
    setPendingAction(`vote-${type}`);
    try {
      const result = await novelApi<{ count: number }>(`account/books/${detail.book.id}/votes/${type}`, 'reader', { method: 'POST' });
      const label = type === 'monthly' ? '月票' : '推荐票';
      setInteractionStatsReloadVersion((version) => version + 1);
      announce(`${label}已送出，作品当前获得 ${result.count} 张${label}。`);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '投票失败，请先登录读者账户。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const rewardBook = async () => {
    if (!detail || rewardState === 'pending' || rewardRequestInFlight.current) return;

    const amount = rewardAmountFrom(rewardAmount);
    if (amount === undefined) {
      setRewardState('error');
      setRewardMessage('请输入大于 0 的整数代币数。');
      return;
    }

    try {
      rewardRequestInFlight.current = true;
      const previousAttempt = rewardAttempt.current;
      const currentAttempt = previousAttempt?.bookId === detail.book.id && previousAttempt.amount === amount
        ? previousAttempt
        : { bookId: detail.book.id, amount, idempotencyKey: createIdempotencyKey() };
      rewardAttempt.current = currentAttempt;
      setRewardState('pending');
      setRewardMessage(`正在打赏 ${amount} 代币…`);
      const result = await novelApi<RewardResult>(`account/books/${detail.book.id}/reward`, 'reader', {
        method: 'POST',
        body: JSON.stringify({ amount }),
        headers: { 'Idempotency-Key': currentAttempt.idempotencyKey },
      });
      rewardAttempt.current = undefined;
      setRewardAmount('');
      setRewardState('success');
      setRewardMessage(`打赏成功，已送出 ${result.amount} 代币，账户余额 ${result.balance} 代币。`);
    } catch (reason) {
      setRewardState('error');
      setRewardMessage(reason instanceof Error ? reason.message : '打赏失败，请稍后重试。');
    } finally {
      rewardRequestInFlight.current = false;
    }
  };

  const purchaseBook = async () => {
    if (!detail || purchasePrice === undefined || pendingAction === 'purchase') return;

    setPendingAction('purchase');
    setPurchaseError('');
    try {
      const result = await novelApi<PurchaseResult>(`account/books/${detail.book.id}/purchase`, 'reader', { method: 'POST' });
      try {
        const refreshedDetail = await novelApi<Detail>(`account/books/${detail.book.id}/reading`, 'reader');
        if (isDetail(refreshedDetail)) {
          setDetail(refreshedDetail);
          const restoredChapter = refreshedDetail.chapters.find((item) => item.id === activeChapterRef.current && isReadableChapter(item));
          const firstReadableChapter = refreshedDetail.chapters.find(isReadableChapter);
          const nextChapter = restoredChapter ?? firstReadableChapter;
          if (nextChapter) {
            activeChapterRef.current = nextChapter.id;
            setActiveChapterId(nextChapter.id);
          }
        }
      } catch {
        // The purchase is already committed. Keep the entitlement state and allow the next route
        // load to recover the protected reading projection instead of reporting a false failure.
      }
      setTokenBalance(result.balance);
      setHasBookEntitlement(true);
      setPurchaseDialogOpen(false);
      announce(`《${detail.book.title}》的整本阅读权益已确认，当前代币余额 ${formatTokenAmount(result.balance)}。`);
    } catch (reason) {
      setPurchaseError(purchaseFailureMessage(reason));
    } finally {
      setPendingAction(undefined);
    }
  };

  if (loading) return <ReaderLoadingSkeleton />;

  if (!detail || !isReadableChapter(chapter)) {
    return (
      <NovelShell workspace="reader">
        <div className="mx-auto max-w-lg py-20">
          <InlineNotice tone="error">{loadError || '此作品暂时没有可阅读的章节。'}</InlineNotice>
          <Button asChild variant="link" size="sm" className="mt-5 h-auto rounded-none px-0 text-emerald-800 hover:text-emerald-950"><Link href="/"><ArrowLeft size={16} aria-hidden="true" />返回书城</Link></Button>
        </div>
      </NovelShell>
    );
  }

  return (
    <NovelShell workspace="reader">
      <style>{readerTransitionStyles}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-stone-600 hover:text-emerald-800"><ArrowLeft size={16} aria-hidden="true" />返回书城</Link>
        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-semibold text-stone-900">{detail.book.title}</p>
          <p className="text-xs text-stone-500">{detail.book.author} · {formatWordCount(detail.book.words)}</p>
        </div>
      </div>

      {notice ? <div className="mt-4"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}

      <div className="mt-5 grid border border-stone-200 bg-white lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-700">阅读目录</p>
              <p className="mt-1 font-semibold text-stone-950">{detail.book.title}</p>
            </div>
            <BookOpen className="shrink-0 text-emerald-700" size={19} aria-hidden="true" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1">
            <Button type="button" variant="outline" size="sm" onClick={() => void toggleShelf()} disabled={pendingAction === 'shelf'} className="h-auto justify-center rounded-none border-stone-300 px-3 py-2 text-stone-800 hover:border-emerald-700 hover:text-emerald-800">
              {saved ? <Check size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
              {saved ? '已加入书架' : '加入书架'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void addBookmark()} disabled={pendingAction === 'bookmark'} className="h-auto justify-center rounded-none border-stone-300 px-3 py-2 text-stone-800 hover:border-emerald-700 hover:text-emerald-800">
              <Bookmark size={16} aria-hidden="true" />添加书签
            </Button>
          </div>

          <section aria-labelledby="reader-subscription-title" className="mt-5 border-t border-stone-200 pt-4">
            <h2 id="reader-subscription-title" className="text-sm font-semibold text-stone-950">免费订阅</h2>
            <Button type="button" variant="outline" size="sm" aria-pressed={subscribed} onClick={() => void toggleSubscription()} disabled={pendingAction === 'subscription'} className="mt-3 h-auto w-full justify-center rounded-none border-stone-300 px-3 py-2 text-stone-800 hover:border-emerald-700 hover:text-emerald-800">
              {subscribed ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              {subscribed ? '取消订阅' : '订阅作品'}
            </Button>
          </section>

          <section aria-labelledby="reader-entitlement-title" className="mt-5 border-t border-stone-200 pt-4">
            <div className="flex items-start gap-2">
              <Coins className="mt-0.5 shrink-0 text-emerald-700" size={17} aria-hidden="true" />
              <div className="min-w-0">
                <h2 id="reader-entitlement-title" className="text-sm font-semibold text-stone-950">本书权益</h2>
                {hasFullBookAccess ? (
                  <>
                    <p className="mt-2 text-sm leading-6 text-emerald-800">{detail?.access?.fullBookAccess ? fullBookAccessLabel(detail.access.source) : '已获得整本阅读权益。'}</p>
                    <Button asChild variant="link" size="sm" className="mt-1 h-auto rounded-none px-0 text-emerald-800 hover:text-emerald-950">
                      <Link href="/account">查看账户权益</Link>
                    </Button>
                  </>
                ) : tokenBalance === undefined || purchasePrice === undefined ? (
                  <>
                    <p className="mt-2 text-sm leading-6 text-stone-600">登录后可查看代币余额并获得本书整本阅读权益。</p>
                    <Button asChild variant="link" size="sm" className="mt-1 h-auto rounded-none px-0 text-emerald-800 hover:text-emerald-950">
                      <Link href="/login">登录后继续</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-6 text-stone-600">整本阅读权益：{formatTokenAmount(purchasePrice)} 代币</p>
                    <p className="mt-1 text-xs leading-5 text-stone-500">当前代币：{formatTokenAmount(tokenBalance)}</p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setPurchaseError('');
                        setPurchaseDialogOpen(true);
                      }}
                      disabled={!hasSufficientTokens || pendingAction === 'purchase'}
                      className="mt-3 h-auto w-full rounded-none bg-emerald-700 px-3 py-2 text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                    >
                      <Coins size={15} aria-hidden="true" />
                      {hasSufficientTokens ? `使用 ${formatTokenAmount(purchasePrice)} 代币获得` : '代币不足'}
                    </Button>
                    {!hasSufficientTokens ? (
                      <Button asChild variant="link" size="sm" className="mt-2 h-auto rounded-none px-0 text-emerald-800 hover:text-emerald-950">
                        <Link href="/account">去兑换代币</Link>
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </section>

          <div className="mt-4 lg:hidden">
            <Sheet open={mobileDirectoryOpen} onOpenChange={setMobileDirectoryOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" aria-label="打开阅读目录" className="h-10 w-full justify-between rounded-none border-stone-300 px-3 text-stone-800 hover:border-emerald-700 hover:text-emerald-800">
                  <span className="inline-flex min-w-0 items-center gap-2"><BookOpen size={16} aria-hidden="true" />章节目录</span>
                  <span className="min-w-0 truncate text-xs text-stone-500">第 {chapter.orderNo} 章 · {chapter.title}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(22rem,calc(100vw_-_2rem))] gap-0 border-stone-200 bg-white p-0">
                <SheetHeader className="border-b border-stone-200 pr-12">
                  <SheetTitle className="truncate text-stone-950">{detail.book.title}</SheetTitle>
                  <SheetDescription>阅读目录 · 共 {detail.chapters.length} 章</SheetDescription>
                </SheetHeader>
                <ScrollArea className="min-h-0 flex-1">
                  <ChapterDirectoryList
                    chapters={detail.chapters}
                    activeChapterId={chapter.id}
                    onSelect={(item) => {
                      setMobileDirectoryOpen(false);
                      void selectChapter(item);
                    }}
                    className="p-3 text-sm"
                  />
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>

          <ChapterDirectoryList
            chapters={detail.chapters}
            activeChapterId={chapter.id}
            onSelect={(item) => void selectChapter(item)}
            className="mt-5 hidden border-t border-stone-200 pt-3 text-sm lg:block"
          />

          {bookmarks.length > 0 ? (
            <div className="mt-5 border-t border-stone-200 pt-4">
              <p className="text-xs font-semibold text-stone-500">本书书签</p>
              <ul className="mt-2 space-y-2 text-sm text-stone-600">
                {bookmarks.slice(0, 3).map((item) => <li key={item.id} className="truncate">{item.note || '阅读书签'}</li>)}
              </ul>
            </div>
          ) : null}
        </aside>

        <section className="min-w-0">
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 sm:px-8">
            <span className="text-xs font-medium text-stone-500">{preferenceLabel(preference.pageMode)}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} className="h-auto rounded-none px-0 text-stone-700 hover:bg-transparent hover:text-emerald-800">
              <SlidersHorizontal size={17} aria-hidden="true" />阅读设置
            </Button>
          </div>

          {settingsOpen ? (
            <div className="grid gap-5 border-b border-stone-200 bg-stone-50 px-5 py-5 sm:grid-cols-2 sm:px-8 xl:grid-cols-3">
              <fieldset>
                <legend className="text-xs font-semibold text-stone-600">主题</legend>
                <ToggleGroup
                  type="single"
                  value={preference.theme}
                  onValueChange={(theme) => {
                    if (theme) void savePreference({ ...preference, theme: theme as Preference['theme'] });
                  }}
                  aria-label="阅读主题"
                  className="mt-2 w-auto gap-2 rounded-none"
                >
                  {themeOptions.map((item) => (
                    <ToggleGroupItem key={item.value} value={item.value} className={`h-auto min-w-0 flex-none rounded-none border border-stone-300 px-2.5 py-1.5 text-xs shadow-none first:rounded-none last:rounded-none ${item.className} data-[state=on]:border-emerald-700 data-[state=on]:ring-1 data-[state=on]:ring-emerald-700`}>
                      {item.value === 'night' ? <Moon className="mr-1 inline" size={13} aria-hidden="true" /> : <Sun className="mr-1 inline" size={13} aria-hidden="true" />}{item.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </fieldset>
              <div>
                <Label id="font-family-label" className="text-xs font-semibold text-stone-600">字体</Label>
                <Select value={preference.font} onValueChange={(value) => void savePreference({ ...preference, font: value as ReaderFont })}>
                  <SelectTrigger aria-labelledby="font-family-label" aria-label="字体" className="mt-2 h-9 rounded-none border-stone-300 bg-white text-sm font-normal text-stone-800 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none border-stone-300 bg-white text-stone-900">
                    <SelectItem value="serif">宋体衬线</SelectItem>
                    <SelectItem value="sans">无衬线</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Label className="block text-xs font-semibold text-stone-600">字号 <span className="float-right text-stone-500">{preference.fontSize}px</span>
                <Slider aria-label="字号" className="mt-3 [&_[data-slot=slider-range]]:bg-emerald-700 [&_[data-slot=slider-thumb]]:border-emerald-700 [&_[data-slot=slider-track]]:bg-stone-200" min={16} max={26} value={[preference.fontSize]} onValueChange={([fontSize]) => { if (fontSize !== undefined) setPreference({ ...preference, fontSize }); }} onValueCommit={([fontSize]) => { if (fontSize !== undefined) void savePreference({ ...preference, fontSize }); }} />
              </Label>
              <Label className="block text-xs font-semibold text-stone-600">行距 <span className="float-right text-stone-500">{preference.lineHeight}%</span>
                <Slider aria-label="行距" className="mt-3 [&_[data-slot=slider-range]]:bg-emerald-700 [&_[data-slot=slider-thumb]]:border-emerald-700 [&_[data-slot=slider-track]]:bg-stone-200" min={140} max={230} step={10} value={[preference.lineHeight]} onValueChange={([lineHeight]) => { if (lineHeight !== undefined) setPreference({ ...preference, lineHeight }); }} onValueCommit={([lineHeight]) => { if (lineHeight !== undefined) void savePreference({ ...preference, lineHeight }); }} />
              </Label>
              <Label className="block text-xs font-semibold text-stone-600">亮度 <span className="float-right text-stone-500">{preference.brightness}%</span>
                <Slider aria-label="亮度" className="mt-3 [&_[data-slot=slider-range]]:bg-emerald-700 [&_[data-slot=slider-thumb]]:border-emerald-700 [&_[data-slot=slider-track]]:bg-stone-200" min={10} max={100} value={[preference.brightness]} onValueChange={([brightness]) => { if (brightness !== undefined) setPreference({ ...preference, brightness }); }} onValueCommit={([brightness]) => { if (brightness !== undefined) void savePreference({ ...preference, brightness }); }} />
              </Label>
              <div>
                <Label id="page-mode-label" className="text-xs font-semibold text-stone-600">翻页模式</Label>
                <Select value={preference.pageMode} onValueChange={(value) => void savePreference({ ...preference, pageMode: value as Preference['pageMode'] })}>
                  <SelectTrigger aria-labelledby="page-mode-label" aria-label="翻页模式" className="mt-2 h-9 rounded-none border-stone-300 bg-white text-sm font-normal text-stone-800 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none border-stone-300 bg-white text-stone-900">
                    <SelectItem value="slide">滑动</SelectItem>
                    <SelectItem value="cover">覆盖</SelectItem>
                    <SelectItem value="simulation">仿真</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <div
            data-testid="reader-page-surface"
            data-page-mode={preference.pageMode}
            data-motion={reducedMotion ? 'reduced' : 'full'}
            className="yuejie-reader-page-surface relative min-h-[620px] overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-inset"
            role="region"
            aria-label={`章节阅读：${detail.book.title}，${chapter.title}`}
            aria-describedby="reader-keyboard-hint"
            aria-keyshortcuts="ArrowLeft ArrowRight PageUp PageDown"
            tabIndex={0}
            onKeyDown={handleReaderKeyDown}
          >
            <p id="reader-keyboard-hint" className="sr-only">使用左右方向键或 Page Up 和 Page Down 在章节内翻页，在章节边界切换章节。</p>
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{chapterAnnouncement}</p>

            <article
              // Keep the paged element mounted while its transition state changes. Recreating it
              // after an animation resets its horizontal scroll position to the chapter's first page.
              key={`chapter-${chapter.id}`}
              data-testid="reader-current-chapter"
              data-transition-effect={activeTransitionEffect}
              data-transition-direction={pageTransition?.direction}
              className="yuejie-reader-current min-h-[620px] px-6 py-10 sm:px-12 sm:py-14 lg:px-16"
              style={readerPageStyle}
            >
              <div
                ref={chapterPagesRef}
                className="reader-chapter-pages"
              >
                <div className="reader-chapter-page-flow" style={{ columnWidth: `${chapterPageWidth}px` }}>
                  <ChapterCopy
                    bookTitle={detail.book.title}
                    chapter={chapter}
                    theme={theme}
                    headingId="reader-chapter-title"
                    annotations={activeParagraphAnnotations}
                    onParagraphSelection={captureParagraphSelection}
                  />
                </div>
              </div>
              <p className="mt-4 text-xs" style={{ color: theme.muted }}>第 {chapterPageIndex + 1} / {chapterPageTotal} 页</p>

              <section className="mt-8 border-t pt-5" style={{ borderColor: theme.border }} aria-labelledby="public-annotations-heading">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="public-annotations-heading" className="text-sm font-semibold">公开段评</h2>
                  {publicParagraphAnnotations.length > 0 ? <span className="text-xs" style={{ color: theme.muted }}>{publicParagraphAnnotations.length} 条</span> : null}
                </div>
                {publicAnnotationsLoading ? <ReaderAnnotationsLoadingSkeleton /> : null}
                {!publicAnnotationsLoading && publicAnnotationsError ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-l-2 border-rose-500 bg-rose-50 px-3 py-3 text-sm text-rose-800">
                    <p>公开段评暂时无法加载：{publicAnnotationsError}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPublicAnnotationsReloadVersion((version) => version + 1)} className="h-auto rounded-none border-rose-300 bg-white px-3 py-1.5 text-rose-800 hover:border-rose-500 hover:text-rose-950">重新加载公开段评</Button>
                  </div>
                ) : null}
                {!publicAnnotationsLoading && !publicAnnotationsError && publicParagraphAnnotations.length === 0 ? <p className="mt-3 text-sm" style={{ color: theme.muted }}>这一章还没有审核公开的段评。</p> : null}
                {!publicAnnotationsLoading && !publicAnnotationsError && publicParagraphAnnotations.length > 0 ? (
                  <ol className="mt-3 space-y-3">
                    {publicParagraphAnnotations.map((annotation) => (
                      <li key={annotation.id} className="border-l-2 border-emerald-600 pl-3 text-sm leading-6">
                        <p className="font-medium">{annotation.authorName}</p>
                        <blockquote className="mt-1 border-l border-emerald-300 pl-2" style={{ color: theme.muted }}>{annotation.selectedText}</blockquote>
                        {annotation.note ? <p className="mt-1">{annotation.note}</p> : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </section>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => moveReaderPage(-1)} disabled={chapterPageIndex <= 0 && activeChapterIndex <= 0} className="h-auto rounded-none px-0 text-inherit hover:bg-transparent"><ChevronLeft size={17} aria-hidden="true" />{chapterPageIndex > 0 ? '上一页' : '上一章'}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => moveReaderPage(1)} disabled={chapterPageIndex >= chapterPageTotal - 1 && activeChapterIndex >= detail.chapters.length - 1} className="h-auto rounded-none px-0 text-inherit hover:bg-transparent">{chapterPageIndex < chapterPageTotal - 1 ? '下一页' : '下一章'}<ChevronRight size={17} aria-hidden="true" /></Button>
              </div>
            </article>

            {pageTransition && !reducedMotion ? (
              <div
                key={pageTransition.id}
                data-testid="reader-transition-layer"
                data-transition-mode={pageTransition.mode}
                data-transition-effect={transitionEffect(pageTransition.mode)}
                data-transition-direction={pageTransition.direction}
                className="yuejie-reader-transition"
                aria-hidden="true"
              >
                <article className="min-h-full px-6 py-10 sm:px-12 sm:py-14 lg:px-16" style={readerPageStyle}>
                  <div className="reader-chapter-pages reader-transition-pages">
                    <div className="reader-chapter-page-flow" style={{ columnWidth: `${chapterPageWidth}px`, transform: `translateX(-${pageTransition.pageIndex * chapterPageWidth}px)` }}>
                      <ChapterCopy bookTitle={detail.book.title} chapter={pageTransition.chapter} theme={theme} annotations={pageTransition.annotations} />
                    </div>
                  </div>
                </article>
              </div>
            ) : null}
          </div>

          <section className="border-t border-stone-200 bg-white px-6 py-8 sm:px-12 lg:px-16" aria-labelledby="chapter-interaction-heading">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-semibold text-emerald-700">本章互动</p>
                <h2 id="chapter-interaction-heading" className="mt-1 text-xl font-semibold text-stone-950">留下你的阅读感受</h2>
                {interactionStats ? <p className="mt-1 text-xs text-stone-500">{interactionStats.ratingCount > 0 ? `${interactionStats.averageRating.toFixed(1)} 分 · ${interactionStats.ratingCount} 人评分` : '暂无评分'} · 推荐票 {interactionStats.recommendationVoteCount} · 月票 {interactionStats.monthlyVoteCount}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center" aria-label="为作品评分">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Button key={value} type="button" variant="ghost" size="icon" aria-label={`评分 ${value} 星`} onClick={() => void rateBook(value)} disabled={pendingAction === 'rating'} className="size-7 rounded-none p-1 text-amber-500 hover:bg-amber-50 hover:text-amber-600">
                      <Star size={18} fill={value <= rating ? 'currentColor' : 'none'} aria-hidden="true" />
                    </Button>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void voteBook('recommendation')} disabled={pendingAction === 'vote-recommendation'} className="h-auto rounded-none border-stone-300 px-3 py-2 text-stone-700 hover:border-emerald-700 hover:text-emerald-800">
                  <Ticket size={16} aria-hidden="true" />投推荐票
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void voteBook('monthly')} disabled={pendingAction === 'vote-monthly'} className="h-auto rounded-none border-stone-300 px-3 py-2 text-stone-700 hover:border-emerald-700 hover:text-emerald-800">
                  <Ticket size={16} aria-hidden="true" />投月票
                </Button>
              </div>
            </div>

            {paragraphAnnotationDraft ? (
              <form
                data-testid="reader-annotation-draft"
                className="mt-5 border-y border-amber-200 bg-amber-50/60 py-4"
                aria-label="保存段落划线"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveParagraphAnnotation();
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-800">划线片段</p>
                    <blockquote className="mt-2 border-l-2 border-amber-500 pl-3 text-sm leading-6 text-stone-800">{paragraphAnnotationDraft.selectedText}</blockquote>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label="取消划线" onClick={discardParagraphAnnotation} className="size-8 shrink-0 rounded-none text-stone-600 hover:bg-amber-100 hover:text-stone-950">
                        <X size={16} aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>取消划线</TooltipContent>
                  </Tooltip>
                </div>
                <Label htmlFor="paragraph-annotation-note" className="mt-4 block text-xs font-semibold text-stone-700">划线感想</Label>
                <Textarea
                  id="paragraph-annotation-note"
                  aria-label="划线感想"
                  maxLength={2000}
                  value={paragraphAnnotationNote}
                  onChange={(event) => setParagraphAnnotationNote(event.target.value)}
                  className="mt-2 min-h-20 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"
                  placeholder="写下感想"
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="paragraph-annotation-share"
                      checked={paragraphAnnotationShareIntent}
                      onCheckedChange={(checked) => setParagraphAnnotationShareIntent(checked === true)}
                      className="border-stone-400 data-[state=checked]:border-emerald-700 data-[state=checked]:bg-emerald-700"
                    />
                    <Label htmlFor="paragraph-annotation-share" className="text-sm font-medium text-stone-800">申请公开分享</Label>
                  </div>
                  <Button type="submit" disabled={pendingAction === 'paragraph-annotation'} className="h-10 rounded-none bg-emerald-700 px-4 hover:bg-emerald-800">
                    <Highlighter size={16} aria-hidden="true" />{pendingAction === 'paragraph-annotation' ? '保存中…' : '保存划线'}
                  </Button>
                </div>
              </form>
            ) : null}

            <form
              className="mt-5 border-y border-stone-200 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                void rewardBook();
              }}
              aria-label="打赏作品"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-900">打赏作品</p>
                  <p className="mt-1 text-xs text-stone-500">用代币支持作者创作</p>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Label htmlFor="reader-reward-amount" className="sr-only">打赏代币</Label>
                  <Input
                    id="reader-reward-amount"
                    aria-label="打赏代币"
                    aria-describedby="reader-reward-help"
                    aria-invalid={rewardState === 'error' || undefined}
                    autoComplete="off"
                    className="h-10 min-w-0 flex-1 rounded-none border-stone-300 bg-white text-stone-900 sm:w-36 sm:flex-none focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"
                    disabled={rewardState === 'pending'}
                    inputMode="numeric"
                    placeholder="代币数量"
                    type="text"
                    value={rewardAmount}
                    onChange={(event) => {
                      setRewardAmount(event.target.value);
                      if (rewardState !== 'idle') {
                        setRewardState('idle');
                        setRewardMessage('');
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    aria-busy={rewardState === 'pending'}
                    className="h-10 shrink-0 rounded-none bg-emerald-700 px-4 hover:bg-emerald-800"
                    disabled={rewardState === 'pending'}
                  >
                    {rewardState === 'pending' ? '打赏中…' : '打赏'}
                  </Button>
                </div>
              </div>
              <p id="reader-reward-help" className="mt-2 text-xs text-stone-500">仅支持大于 0 的整数代币数。</p>
              {rewardState !== 'idle' ? (
                <p
                  data-testid="reader-reward-feedback"
                  role={rewardState === 'error' ? 'alert' : 'status'}
                  className={`mt-2 text-sm ${rewardState === 'error' ? 'text-rose-700' : rewardState === 'success' ? 'text-emerald-800' : 'text-stone-600'}`}
                >
                  {rewardMessage}
                </p>
              ) : null}
            </form>

            <div className="mt-6 flex gap-2">
              <MessageSquare className="mt-2.5 shrink-0 text-stone-500" size={17} aria-hidden="true" />
              <Input aria-label="发表评论" value={comment} onChange={(event) => setComment(event.target.value)} className="h-11 min-w-0 flex-1 rounded-none border-stone-300 bg-white px-3 text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="写下此刻的想法" />
              <Button type="button" onClick={() => void postComment()} disabled={pendingAction === 'comment' || !comment.trim()} className="h-11 rounded-none bg-emerald-700 px-4 hover:bg-emerald-800">发布</Button>
            </div>

            <div id="chapter-comments" className="mt-6 space-y-4" aria-live="polite">
              {commentsLoading ? <ReaderCommentsLoadingSkeleton /> : null}
              {!commentsLoading && commentsError ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-rose-500 bg-rose-50 px-3 py-3 text-sm text-rose-800">
                  <p>本章评论暂时无法加载：{commentsError}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setCommentsReloadVersion((version) => version + 1)} className="h-auto rounded-none border-rose-300 bg-white px-3 py-1.5 text-rose-800 hover:border-rose-500 hover:text-rose-950">重新加载本章评论</Button>
                </div>
              ) : null}
              {!commentsLoading && !commentsError && chapterComments.length === 0 ? <p className="text-sm text-stone-500">还没有章评，成为第一个留下感受的读者。</p> : null}
              {!commentsLoading && !commentsError && chapterComments.map((item) => (
                <article key={item.id} className="border-l-2 border-emerald-600 pl-4 text-sm leading-6 text-stone-700">
                  <p className="font-semibold text-stone-900">{item.authorName}</p>
                  <p className="mt-1">{item.content}</p>
                </article>
              ))}
              {!commentsLoading && !commentsError && chapterCommentsPage ? <ReaderCommentPagination meta={chapterCommentsPage.meta} loading={commentsLoading} onPageChange={setCommentsPageIndex} /> : null}
            </div>
          </section>
        </section>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 text-sm text-stone-500"><ArrowRight size={15} aria-hidden="true" />登录后，阅读进度会同步到你的读者账户</div>

      <AlertDialog open={purchaseDialogOpen} onOpenChange={(open) => {
        if (pendingAction !== 'purchase') setPurchaseDialogOpen(open);
      }}>
        <AlertDialogContent className="rounded-none border-stone-300 bg-white text-stone-900">
          <AlertDialogHeader>
            <AlertDialogTitle>获得整本阅读权益</AlertDialogTitle>
            <AlertDialogDescription>
              {purchasePrice === undefined
                ? '本书权益价格暂时无法确认。'
                : `将使用 ${formatTokenAmount(purchasePrice)} 代币获得《${detail.book.title}》的整本阅读权益。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm leading-6 text-stone-600">代币可通过兑换码获得；本次权益确认后不支持退款。</p>
          {purchaseError ? <InlineNotice tone="error">{purchaseError}</InlineNotice> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction === 'purchase'} className="rounded-none border-stone-300 bg-white text-stone-700">取消</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => void purchaseBook()}
              disabled={purchasePrice === undefined || pendingAction === 'purchase'}
              className="rounded-none bg-emerald-700 text-white hover:bg-emerald-800 disabled:cursor-wait"
            >
              <Coins size={16} aria-hidden="true" />
              {pendingAction === 'purchase' ? '确认中...' : '确认获得权益'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NovelShell>
  );
}
