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
  SlidersHorizontal,
  Star,
  Sun,
  Ticket,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/app/components/ui/sheet';
import { Slider } from '@/app/components/ui/slider';
import { Textarea } from '@/app/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import { InlineNotice, NovelShell, formatWordCount } from '@/components/novel/NovelShell';
import {
  AccountEntitlements,
  Book,
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
type Detail = { book: Book; chapters: Chapter[]; comments?: NovelComment[]; access?: ReaderAccess };
type ReaderFont = 'serif' | 'sans';
type Preference = { theme: 'paper' | 'sepia' | 'night'; font: ReaderFont; fontSize: number; lineHeight: number; brightness: number; pageMode: 'slide' | 'cover' | 'simulation' };
type ReadingProgress = { bookId: number; chapterId: number; offset: number; updatedAt: string };
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
type ChapterTransition = {
  id: number;
  chapter: ReadableChapter;
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
      <p className="text-xs font-semibold text-emerald-700">{bookTitle} · 第 {chapter.orderNo} 章</p>
      {headingId ? <h1 id={headingId} className={headingClassName}>{chapter.title}</h1> : <p className={headingClassName}>{chapter.title}</p>}
      <div className={compact ? 'mt-8 space-y-6' : 'mt-10 space-y-7'}>
        {paragraphs.map((paragraph, index) => (
          <p
            key={`${paragraph}-${index}`}
            data-paragraph-index={index}
            className={`max-w-2xl ${onParagraphSelection ? 'cursor-text select-text' : ''}`}
            onMouseUp={onParagraphSelection ? (event) => onParagraphSelection(index, paragraph, event.currentTarget) : undefined}
          >
            {highlightedParagraph(paragraph, index, annotations)}
          </p>
        ))}
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

export default function Reader({ params }: { params: Promise<{ id: string }> }) {
  const [detail, setDetail] = useState<Detail>();
  const [preference, setPreference] = useState<Preference>(defaultPreference);
  const [activeChapterId, setActiveChapterId] = useState<number>();
  const [saved, setSaved] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [paragraphAnnotations, setParagraphAnnotations] = useState<ParagraphAnnotation[]>([]);
  const [publicParagraphAnnotations, setPublicParagraphAnnotations] = useState<PublicParagraphAnnotation[]>([]);
  const [publicAnnotationsLoading, setPublicAnnotationsLoading] = useState(false);
  const [publicAnnotationsError, setPublicAnnotationsError] = useState('');
  const [publicAnnotationsReloadVersion, setPublicAnnotationsReloadVersion] = useState(0);
  const [paragraphAnnotationDraft, setParagraphAnnotationDraft] = useState<ParagraphAnnotationDraft>();
  const [paragraphAnnotationNote, setParagraphAnnotationNote] = useState('');
  const [paragraphAnnotationShareIntent, setParagraphAnnotationShareIntent] = useState(false);
  const [comment, setComment] = useState('');
  const [chapterComments, setChapterComments] = useState<NovelComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [commentsReloadVersion, setCommentsReloadVersion] = useState(0);
  const [interactionStats, setInteractionStats] = useState<InteractionStats>();
  const [interactionStatsReloadVersion, setInteractionStatsReloadVersion] = useState(0);
  const [rating, setRating] = useState(0);
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
  const [chapterTransition, setChapterTransition] = useState<ChapterTransition>();
  const [chapterAnnouncement, setChapterAnnouncement] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const transitionTimer = useRef<number>();
  const transitionSequence = useRef(0);
  const commentRequestSequence = useRef(0);
  const publicAnnotationRequestSequence = useRef(0);
  const interactionStatsRequestSequence = useRef(0);
  const activeChapterRef = useRef<number>();
  const rewardAttempt = useRef<RewardAttempt>();
  const rewardRequestInFlight = useRef(false);

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
    setChapterTransition(undefined);
  }, [reducedMotion]);

  useEffect(() => () => {
    if (transitionTimer.current !== undefined) window.clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError('');
      setTokenBalance(undefined);
      setHasBookEntitlement(undefined);
      setInteractionStats(undefined);
      setPublicParagraphAnnotations([]);
      setPublicAnnotationsError('');
      setPurchaseDialogOpen(false);
      setPurchaseError('');
      try {
        const { id } = await params;
        const publicDetail = await novelApi<Detail>(`public/books/${id}`);
        let bookDetail = publicDetail;
        try {
          const accountDetail = await novelApi<Detail>(`account/books/${id}/reading`);
          if (isDetail(accountDetail)) bookDetail = accountDetail;
        } catch {
          // Anonymous readers intentionally keep the public preview projection.
        }
        if (cancelled) return;

        setDetail(bookDetail);

        const firstChapter = bookDetail.chapters.find(isReadableChapter);
        if (!firstChapter) return;

        const [preferencesResult, shelfResult, bookmarksResult, progressResult, annotationsResult, walletResult, entitlementsResult, statsResult] = await Promise.allSettled([
          novelApi<Preference>('account/preferences/reading'),
          novelApi<Book[]>('account/bookshelf'),
          novelApi<BookmarkItem[]>(`account/books/${bookDetail.book.id}/bookmarks`),
          novelApi<ReadingProgress[]>('account/progress'),
          novelApi<ParagraphAnnotationPage>(`account/annotations?bookId=${bookDetail.book.id}&size=100`),
          novelApi<{ tokens: number }>('account/wallet'),
          novelApi<AccountEntitlements>('account/entitlements'),
          novelApi<InteractionStats>(`public/books/${bookDetail.book.id}/interactions`),
        ]);
        if (cancelled) return;

        if (preferencesResult.status === 'fulfilled') setPreference(normalizePreference(preferencesResult.value));
        if (shelfResult.status === 'fulfilled') setSaved(shelfResult.value.some((book) => book.id === bookDetail.book.id));
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

        const savedProgress = progressResult.status === 'fulfilled' && Array.isArray(progressResult.value)
          ? progressResult.value.find((item) => item.bookId === bookDetail.book.id)
          : undefined;
        const restoredChapter = savedProgress
          ? bookDetail.chapters.find((item) => item.id === savedProgress.chapterId && isReadableChapter(item))
          : undefined;
        const initialChapter = restoredChapter ?? firstChapter;
        activeChapterRef.current = initialChapter.id;
        setActiveChapterId(initialChapter.id);

        if (!restoredChapter) {
          void novelApi('account/progress', 'reader', {
            method: 'PUT',
            body: JSON.stringify({ bookId: bookDetail.book.id, chapterId: initialChapter.id, offset: 0 }),
          }).catch(() => undefined);
        }
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
  const activeTransitionEffect = chapterTransition ? transitionEffect(chapterTransition.mode) : undefined;
  const displayedPurchasePrice = detail?.book.purchasePrice;
  const purchasePrice = Number.isSafeInteger(displayedPurchasePrice) && (displayedPurchasePrice ?? 0) > 0
    ? displayedPurchasePrice
    : undefined;
  const hasSufficientTokens = purchasePrice !== undefined && tokenBalance !== undefined && tokenBalance >= purchasePrice;
  const hasFullBookAccess = detail?.access?.fullBookAccess === true || hasBookEntitlement === true;

  const announce = (message: string, tone: Notice['tone'] = 'success') => setNotice({ message, tone });

  useEffect(() => {
    const bookId = detail?.book.id;
    const chapterId = activeChapterId;
    const activeChapter = detail?.chapters.find((item) => item.id === chapterId);
    if (!bookId || !chapterId || !isReadableChapter(activeChapter)) {
      commentRequestSequence.current += 1;
      setChapterComments([]);
      setCommentsLoading(false);
      setCommentsError('');
      return;
    }

    const requestId = ++commentRequestSequence.current;
    let cancelled = false;
    setChapterComments([]);
    setCommentsLoading(true);
    setCommentsError('');

    const commentPath = detail?.access?.fullBookAccess
      ? `account/books/${bookId}/comments?chapterId=${chapterId}`
      : `public/books/${bookId}/comments?chapterId=${chapterId}`;
    void novelApi<NovelCommentPage>(commentPath, 'reader')
      .then((page) => {
        if (cancelled || requestId !== commentRequestSequence.current) return;
        if (!isCommentPage(page)) throw new Error('本章评论返回格式无效。');
        setChapterComments(page.items);
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
  }, [activeChapterId, commentsReloadVersion, detail?.access?.fullBookAccess, detail?.book.id, detail?.chapters]);

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

  const selectChapter = async (nextChapter: Chapter) => {
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

    const currentIndex = detail.chapters.findIndex((item) => item.id === chapter?.id);
    const nextIndex = detail.chapters.findIndex((item) => item.id === nextChapter.id);
    const direction: PageTurnDirection = nextIndex > currentIndex ? 'forward' : 'backward';
    const transitionId = transitionSequence.current + 1;
    transitionSequence.current = transitionId;

    if (transitionTimer.current !== undefined) window.clearTimeout(transitionTimer.current);
    if (!reducedMotion && isReadableChapter(chapter)) {
      setChapterTransition({ id: transitionId, chapter, direction, mode: preference.pageMode });
      transitionTimer.current = window.setTimeout(() => {
        setChapterTransition((current) => current?.id === transitionId ? undefined : current);
        transitionTimer.current = undefined;
      }, chapterTransitionDuration);
    } else {
      transitionTimer.current = undefined;
      setChapterTransition(undefined);
    }

    commentRequestSequence.current += 1;
    setChapterComments([]);
    setCommentsLoading(true);
    setCommentsError('');
    activeChapterRef.current = nextChapter.id;
    setActiveChapterId(nextChapter.id);
    setParagraphAnnotationDraft(undefined);
    setParagraphAnnotationNote('');
    setParagraphAnnotationShareIntent(false);
    clearBrowserSelection();
    setChapterAnnouncement(`已切换至第 ${nextChapter.orderNo} 章《${nextChapter.title}》，${preferenceLabel(preference.pageMode)}${reducedMotion ? '，已减少动态效果。' : '。'}`);
    try {
      await novelApi('account/progress', 'reader', {
        method: 'PUT',
        body: JSON.stringify({ bookId: detail.book.id, chapterId: nextChapter.id, offset: 0 }),
      });
    } catch {
      // Public reading remains available when the current visitor has no reader session.
    }
  };

  const moveChapter = (offset: number) => {
    const next = detail?.chapters[activeChapterIndex + offset];
    if (next) void selectChapter(next);
  };

  const handleReaderKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || isInteractiveTarget(event.target)) return;

    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      moveChapter(-1);
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      moveChapter(1);
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

  if (loading) {
    return <NovelShell workspace="reader"><div className="grid min-h-[60vh] place-items-center text-sm text-stone-600">正在打开章节...</div></NovelShell>;
  }

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
            <p id="reader-keyboard-hint" className="sr-only">使用左右方向键或 Page Up 和 Page Down 切换章节。</p>
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{chapterAnnouncement}</p>

            <article
              key={`chapter-${chapter.id}-${chapterTransition?.id ?? 'rest'}`}
              data-testid="reader-current-chapter"
              data-transition-effect={activeTransitionEffect}
              data-transition-direction={chapterTransition?.direction}
              className="yuejie-reader-current min-h-[620px] px-6 py-10 sm:px-12 sm:py-14 lg:px-16"
              style={readerPageStyle}
            >
              <ChapterCopy
                bookTitle={detail.book.title}
                chapter={chapter}
                theme={theme}
                headingId="reader-chapter-title"
                annotations={activeParagraphAnnotations}
                onParagraphSelection={captureParagraphSelection}
              />

              <section className="mt-8 border-t pt-5" style={{ borderColor: theme.border }} aria-labelledby="public-annotations-heading">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="public-annotations-heading" className="text-sm font-semibold">公开段评</h2>
                  {publicParagraphAnnotations.length > 0 ? <span className="text-xs" style={{ color: theme.muted }}>{publicParagraphAnnotations.length} 条</span> : null}
                </div>
                {publicAnnotationsLoading ? <p className="mt-3 text-sm" style={{ color: theme.muted }}>正在加载公开段评...</p> : null}
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
                <Button type="button" variant="ghost" size="sm" onClick={() => moveChapter(-1)} disabled={activeChapterIndex <= 0} className="h-auto rounded-none px-0 text-inherit hover:bg-transparent"><ChevronLeft size={17} aria-hidden="true" />上一章</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => moveChapter(1)} disabled={activeChapterIndex >= detail.chapters.length - 1} className="h-auto rounded-none px-0 text-inherit hover:bg-transparent">下一章<ChevronRight size={17} aria-hidden="true" /></Button>
              </div>
            </article>

            {chapterTransition && !reducedMotion ? (
              <div
                key={chapterTransition.id}
                data-testid="reader-transition-layer"
                data-transition-mode={chapterTransition.mode}
                data-transition-effect={transitionEffect(chapterTransition.mode)}
                data-transition-direction={chapterTransition.direction}
                className="yuejie-reader-transition"
                aria-hidden="true"
              >
                <article className="min-h-full px-6 py-10 sm:px-12 sm:py-14 lg:px-16" style={readerPageStyle}>
                  <ChapterCopy bookTitle={detail.book.title} chapter={chapterTransition.chapter} theme={theme} compact />
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

            <div className="mt-6 space-y-4" aria-live="polite">
              {commentsLoading ? <p className="text-sm text-stone-500">正在加载本章评论...</p> : null}
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
