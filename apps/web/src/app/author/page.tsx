'use client';

import Link from 'next/link';
import { ArrowDown, ArrowUp, BookCopy, BookOpen, CalendarClock, FileText, FolderOpen, FolderPlus, Gift, Heart, Highlighter, ImageUp, Layers3, MessageSquareText, PenLine, Plus, RefreshCw, Save, Send, SquarePen, Star, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/app/components/ui/alert-dialog';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/app/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Textarea } from '@/app/components/ui/textarea';
import { InlineNotice, NovelPageHeader, NovelShell, NovelStatusBadge, formatWordCount } from '@/components/novel/NovelShell';
import { BookCover } from '@/components/novel/BookCover';
import { AuthorAnalyticsReport, AuthorBookPage, AuthorCommentPage, AuthorCoverUploadResult, AuthorModerationAdvice, Book, BookCoverCandidate, BookStatusAuditPage, ChapterCandidate, ParagraphAnnotationPage, novelApi } from '@/features/novel/api';

type Volume = { id: number; bookId: number; title: string; orderNo: number; createdAt: string };
type VolumeDeleteResult = { id: number; deleted: boolean; detachedChapterCount: number };
type AuthorChapter = {
  id: number;
  bookId: number;
  volumeId: number | null;
  title: string;
  content: string;
  published: boolean;
  status: string;
  scheduledPublishAt: string | null;
  publishedAt: string | null;
  reviewReason: string;
  orderNo: number;
};
type RewardRecord = { id: number; bookId: number; bookTitle: string; rewarderUserId: number; tokenAmount: number; rewardedAt: string };
type RewardReport = {
  items: RewardRecord[];
  summary: { rewardCount: number; totalTokens: number; amountUnit: string };
  meta: { total: number; page: number; size: number; bookId: number | null; from: string | null; to: string | null; timeZone: string; dateBoundary: string; recordInclusion: string };
};
type RewardQuery = { bookId: number | undefined; from: string; to: string; page: number };
type AnalyticsQuery = { bookId: number | undefined; from: string; to: string };
type Notice = { message: string; tone: 'success' | 'error' };
type DeleteTarget = { kind: 'book'; item: Book } | { kind: 'chapter'; item: AuthorChapter } | { kind: 'volume'; item: Volume };
type FeedbackTab = 'comments' | 'annotations';
type FeedbackPageMeta = { total: number; page: number; size: number };

const bookCategories = ['科幻', '悬疑', '古言'];
const serialStatuses = ['连载中', '已完结'];
const rewardPageSize = 10;
const feedbackPageSize = 20;
const authorBooksPageSize = 12;
const bookStatusAuditPageSize = 12;

function canEditBook(book: Book) {
  return book.status === 'DRAFT' || book.status === 'REJECTED';
}

function canManageBookCover(book: Book) {
  return ['DRAFT', 'REJECTED', 'PUBLISHED'].includes(book.status);
}

function canEditChapter(chapter: AuthorChapter) {
  return ['DRAFT', 'SCHEDULED', 'PUBLISHED'].includes(chapter.status);
}

function canDeleteChapter(chapter: AuthorChapter) {
  return chapter.status === 'DRAFT' || chapter.status === 'SCHEDULED';
}

function normalizedSerialStatus(serialStatus: string) {
  if (serialStatus === 'COMPLETED') return '已完结';
  if (serialStatus === 'SERIALIZING') return '连载中';
  return serialStatuses.includes(serialStatus) ? serialStatus : '连载中';
}

function failureMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function formatCommentTime(createdAt: string) {
  const timestamp = Date.parse(createdAt);
  if (Number.isNaN(timestamp)) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function feedbackPath(bookId: number, resource: 'comments' | 'annotations', page: number) {
  const parameters = new URLSearchParams();
  if (page > 0) parameters.set('page', page.toString());
  parameters.set('size', feedbackPageSize.toString());
  return `author/books/${bookId}/${resource}?${parameters.toString()}`;
}

function authorBooksPath(page: number) {
  const parameters = new URLSearchParams({ page: page.toString(), size: authorBooksPageSize.toString() });
  return `author/books?${parameters.toString()}`;
}

function bookStatusAuditsPath(bookId: number, page: number) {
  const parameters = new URLSearchParams({ page: page.toString(), size: bookStatusAuditPageSize.toString() });
  return `author/books/${bookId}/status-audits?${parameters.toString()}`;
}

function InteractionStatusBadge({ status }: { status: string }) {
  const meta = {
    PENDING_REVIEW: { label: '待审核', className: 'border-amber-300 bg-amber-50 text-amber-900' },
    VISIBLE: { label: '已公开', className: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
    REJECTED: { label: '未通过', className: 'border-rose-300 bg-rose-50 text-rose-800' },
    PRIVATE: { label: '未分享', className: 'border-stone-300 bg-stone-100 text-stone-700' },
  }[status] ?? { label: status, className: 'border-stone-300 bg-stone-100 text-stone-700' };

  return <Badge variant="outline" className={`rounded-none ${meta.className}`}>{meta.label}</Badge>;
}

function FeedbackPagination({
  label,
  meta,
  loading,
  onPageChange,
}: {
  label: string;
  meta: FeedbackPageMeta;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.size));
  if (totalPages <= 1) return null;
  const previousDisabled = loading || meta.page <= 0;
  const nextDisabled = loading || meta.page >= totalPages - 1;

  return (
    <div className="flex flex-col gap-3 border-t border-stone-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-stone-500">共 {meta.total.toLocaleString('zh-CN')} 条</p>
      <Pagination aria-label={`${label}分页`} className="mx-0 w-auto justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#author-feedback-heading"
              onClick={(event) => {
                event.preventDefault();
                if (!previousDisabled) onPageChange(meta.page - 1);
              }}
              aria-disabled={previousDisabled}
              tabIndex={previousDisabled ? -1 : undefined}
              className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            />
          </PaginationItem>
          <PaginationItem>
            <span className="inline-flex h-9 min-w-20 items-center justify-center px-2 text-stone-600" aria-live="polite">第 {meta.page + 1} / {totalPages} 页</span>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#author-feedback-heading"
              onClick={(event) => {
                event.preventDefault();
                if (!nextDisabled) onPageChange(meta.page + 1);
              }}
              aria-disabled={nextDisabled}
              tabIndex={nextDisabled ? -1 : undefined}
              className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function FeedbackSelectionEmpty({ icon }: { icon: FeedbackTab }) {
  const Icon = icon === 'comments' ? MessageSquareText : Highlighter;
  return (
    <div className="px-5 py-12 text-center">
      <Icon className="mx-auto text-stone-400" size={28} aria-hidden="true" />
      <p className="mt-3 font-medium text-stone-800">请先选择一部作品</p>
      <p className="mt-1 text-sm leading-6 text-stone-500">反馈会按你拥有的作品归集，不能查看其他作者的内容。</p>
    </div>
  );
}

function FeedbackLoading({ label }: { label: string }) {
  return (
    <div className="space-y-3 px-5 py-6" aria-live="polite">
      <p className="text-sm text-stone-600">{label}</p>
      <Skeleton className="h-12 rounded-none bg-stone-100" />
      <Skeleton className="h-12 rounded-none bg-stone-100" />
    </div>
  );
}

function FeedbackEmpty({ icon, title, description }: { icon: FeedbackTab; title: string; description: string }) {
  const Icon = icon === 'comments' ? MessageSquareText : Highlighter;
  return (
    <div className="px-5 py-12 text-center">
      <Icon className="mx-auto text-stone-400" size={28} aria-hidden="true" />
      <p className="mt-3 font-medium text-stone-800">{title}</p>
      <p className="mt-1 text-sm leading-6 text-stone-500">{description}</p>
    </div>
  );
}

function FeedbackError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between" role="alert">
      <InlineNotice tone="error">{message}</InlineNotice>
      <Button type="button" variant="outline" onClick={onRetry} className="h-auto shrink-0 rounded-none border-stone-300 bg-white px-3 py-2 text-stone-700 hover:border-emerald-700 hover:text-emerald-800">
        <RefreshCw size={16} aria-hidden="true" />重试
      </Button>
    </div>
  );
}

function formatPublishTime(publishAt: string | null) {
  if (!publishAt) return '';
  const timestamp = Date.parse(publishAt);
  if (Number.isNaN(timestamp)) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

function formatRewardTime(rewardedAt: string) {
  const timestamp = Date.parse(rewardedAt);
  if (Number.isNaN(timestamp)) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

function rewardReportPath(query: RewardQuery) {
  const parameters = new URLSearchParams();
  if (query.bookId !== undefined) parameters.set('bookId', query.bookId.toString());
  if (query.from) parameters.set('from', query.from);
  if (query.to) parameters.set('to', query.to);
  parameters.set('page', query.page.toString());
  parameters.set('size', rewardPageSize.toString());
  return `author/reward-records?${parameters.toString()}`;
}

function analyticsReportPath(query: AnalyticsQuery) {
  const parameters = new URLSearchParams();
  if (query.bookId !== undefined) parameters.set('bookId', query.bookId.toString());
  if (query.from && query.to) {
    parameters.set('from', query.from);
    parameters.set('to', query.to);
  }
  const queryString = parameters.toString();
  return queryString ? `author/analytics?${queryString}` : 'author/analytics';
}

function formatAnalyticsPercent(value: number) {
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)}%`;
}

function formatRetentionPercent(value: number | null) {
  return value === null ? '待观察' : formatAnalyticsPercent(value);
}

function formatAnalyticsRating(value: number, count: number) {
  if (!Number.isFinite(value) || count <= 0) return '暂无评分';
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)} 分`;
}

function AnalyticsAvailabilityNotice({ label, available, reason }: { label: string; available: boolean; reason: string }) {
  if (available) return null;
  return (
    <p className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950" role="status">
      <strong>历史不可观测：</strong>{label}。{reason}
    </p>
  );
}

function ChapterStatusBadge({ status }: { status: string }) {
  const meta = {
    DRAFT: { label: '草稿', className: 'border-stone-300 bg-stone-100 text-stone-700' },
    SCHEDULED: { label: '已排期', className: 'border-sky-200 bg-sky-50 text-sky-800' },
    PUBLISHED: { label: '已发布', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    NEEDS_REVIEW: { label: '候选待审核', className: 'border-amber-300 bg-amber-50 text-amber-900' },
  }[status] ?? { label: status, className: 'border-stone-300 bg-stone-100 text-stone-700' };

  return <Badge variant="outline" className={`rounded-none ${meta.className}`}>{meta.label}</Badge>;
}

export default function AuthorPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [booksMeta, setBooksMeta] = useState<AuthorBookPage['meta']>();
  const [booksPageIndex, setBooksPageIndex] = useState(0);
  const [selectedBookId, setSelectedBookId] = useState<number>();
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [chapters, setChapters] = useState<AuthorChapter[]>([]);
  const [chapterCandidates, setChapterCandidates] = useState<ChapterCandidate[]>([]);
  const [selectedVolumeId, setSelectedVolumeId] = useState<number>();
  const [selectedDraftId, setSelectedDraftId] = useState<number>();
  const [feedbackTab, setFeedbackTab] = useState<FeedbackTab>('comments');
  const [commentPage, setCommentPage] = useState<AuthorCommentPage>();
  const [commentPageIndex, setCommentPageIndex] = useState(0);
  const [commentError, setCommentError] = useState('');
  const [annotationPage, setAnnotationPage] = useState<ParagraphAnnotationPage>();
  const [annotationPageIndex, setAnnotationPageIndex] = useState(0);
  const [annotationError, setAnnotationError] = useState('');
  const [rewardBookId, setRewardBookId] = useState<number>();
  const [rewardFrom, setRewardFrom] = useState('');
  const [rewardTo, setRewardTo] = useState('');
  const [rewardQuery, setRewardQuery] = useState<RewardQuery>({ bookId: undefined, from: '', to: '', page: 0 });
  const [rewardReport, setRewardReport] = useState<RewardReport>();
  const [rewardLoading, setRewardLoading] = useState(true);
  const [rewardError, setRewardError] = useState('');
  const [analyticsBookId, setAnalyticsBookId] = useState<number>();
  const [analyticsFrom, setAnalyticsFrom] = useState('');
  const [analyticsTo, setAnalyticsTo] = useState('');
  const [analyticsQuery, setAnalyticsQuery] = useState<AnalyticsQuery>({ bookId: undefined, from: '', to: '' });
  const [analyticsReport, setAnalyticsReport] = useState<AuthorAnalyticsReport>();
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(bookCategories[0]);
  const [synopsis, setSynopsis] = useState('');
  const [volumeTitle, setVolumeTitle] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [editingBook, setEditingBook] = useState<Book>();
  const [bookEditTitle, setBookEditTitle] = useState('');
  const [bookEditCategory, setBookEditCategory] = useState(bookCategories[0]);
  const [bookEditSynopsis, setBookEditSynopsis] = useState('');
  const [bookEditSerialStatus, setBookEditSerialStatus] = useState(serialStatuses[0]);
  const [bookCoverFile, setBookCoverFile] = useState<File>();
  const [coverUploadCandidate, setCoverUploadCandidate] = useState<BookCoverCandidate>();
  const [editingChapter, setEditingChapter] = useState<AuthorChapter>();
  const [chapterEditTitle, setChapterEditTitle] = useState('');
  const [chapterEditContent, setChapterEditContent] = useState('');
  const [chapterEditVolumeId, setChapterEditVolumeId] = useState<number>();
  const [editingVolume, setEditingVolume] = useState<Volume>();
  const [volumeEditTitle, setVolumeEditTitle] = useState('');
  const [editError, setEditError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>();
  const [deleteError, setDeleteError] = useState('');
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [bookStatusAuditPage, setBookStatusAuditPage] = useState<BookStatusAuditPage>();
  const [bookStatusAuditPageIndex, setBookStatusAuditPageIndex] = useState(0);
  const [bookStatusAuditsLoading, setBookStatusAuditsLoading] = useState(false);
  const [bookStatusAuditsError, setBookStatusAuditsError] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>();
  const [moderationAdviceReasons, setModerationAdviceReasons] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>();
  const workspaceRequestId = useRef(0);
  const booksRequestId = useRef(0);
  const bookStatusAuditRequestId = useRef(0);
  const commentRequestId = useRef(0);
  const annotationRequestId = useRef(0);
  const rewardRequestId = useRef(0);
  const analyticsRequestId = useRef(0);
  const bookCoverInputRef = useRef<HTMLInputElement>(null);

  const loadBooks = useCallback(async (page: number) => {
    const requestId = ++booksRequestId.current;
    setLoading(true);
    try {
      const result = await novelApi<AuthorBookPage>(authorBooksPath(page), 'author');
      if (requestId !== booksRequestId.current) return;
      setBooks(result.items);
      setBooksMeta(result.meta);
      if (result.meta.page !== page) setBooksPageIndex(result.meta.page);
    } catch (reason) {
      if (requestId === booksRequestId.current) {
        setBooks([]);
        setBooksMeta(undefined);
        setNotice({ message: reason instanceof Error ? reason.message : '作品库暂时无法加载。', tone: 'error' });
      }
    } finally {
      if (requestId === booksRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBooks(booksPageIndex); }, [booksPageIndex, loadBooks]);

  const loadRewardReport = useCallback(async (query: RewardQuery) => {
    const requestId = ++rewardRequestId.current;
    setRewardLoading(true);
    setRewardError('');
    try {
      const report = await novelApi<RewardReport>(rewardReportPath(query), 'author');
      if (requestId === rewardRequestId.current) setRewardReport(report);
    } catch (reason) {
      if (requestId === rewardRequestId.current) {
        setRewardReport(undefined);
        setRewardError(failureMessage(reason, '打赏记录暂时无法加载。'));
      }
    } finally {
      if (requestId === rewardRequestId.current) setRewardLoading(false);
    }
  }, []);

  useEffect(() => { void loadRewardReport(rewardQuery); }, [loadRewardReport, rewardQuery]);

  const loadAnalyticsReport = useCallback(async (query: AnalyticsQuery) => {
    const requestId = ++analyticsRequestId.current;
    setAnalyticsLoading(true);
    setAnalyticsError('');
    try {
      const report = await novelApi<AuthorAnalyticsReport>(analyticsReportPath(query), 'author');
      if (requestId === analyticsRequestId.current) setAnalyticsReport(report);
    } catch (reason) {
      if (requestId === analyticsRequestId.current) {
        setAnalyticsReport(undefined);
        setAnalyticsError(failureMessage(reason, '作品数据暂时无法加载。'));
      }
    } finally {
      if (requestId === analyticsRequestId.current) setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => { void loadAnalyticsReport(analyticsQuery); }, [analyticsQuery, loadAnalyticsReport]);

  useEffect(() => {
    setSelectedBookId((current) => books.some((book) => book.id === current) ? current : books[0]?.id);
  }, [books]);

  const loadBookWorkspace = useCallback(async (bookId: number) => {
    const requestId = ++workspaceRequestId.current;
    setWorkspaceLoading(true);
    setWorkspaceError('');
    try {
      const [volumeItems, chapterItems, candidateItems] = await Promise.all([
        novelApi<Volume[]>(`author/books/${bookId}/volumes`, 'author'),
        novelApi<AuthorChapter[]>(`author/books/${bookId}/chapters`, 'author'),
        novelApi<ChapterCandidate[]>(`author/books/${bookId}/chapter-candidates`, 'author'),
      ]);
      if (requestId === workspaceRequestId.current) {
        setVolumes(volumeItems);
        setChapters(chapterItems);
        setChapterCandidates(candidateItems);
      }
    } catch (reason) {
      if (requestId === workspaceRequestId.current) {
        const message = reason instanceof Error ? reason.message : '卷册和章节暂时无法加载。';
        setVolumes([]);
        setChapters([]);
        setChapterCandidates([]);
        setWorkspaceError(message);
      }
    } finally {
      if (requestId === workspaceRequestId.current) setWorkspaceLoading(false);
    }
  }, []);

  const loadBookStatusAudits = useCallback(async (bookId: number, page: number) => {
    const requestId = ++bookStatusAuditRequestId.current;
    setBookStatusAuditsLoading(true);
    setBookStatusAuditsError('');
    try {
      const result = await novelApi<BookStatusAuditPage>(bookStatusAuditsPath(bookId, page), 'author');
      if (requestId === bookStatusAuditRequestId.current) {
        setBookStatusAuditPage(result);
        if (result.meta.page !== page) setBookStatusAuditPageIndex(result.meta.page);
      }
    } catch (reason) {
      if (requestId === bookStatusAuditRequestId.current) {
        setBookStatusAuditPage(undefined);
        setBookStatusAuditsError(failureMessage(reason, '作品处置反馈暂时无法加载。'));
      }
    } finally {
      if (requestId === bookStatusAuditRequestId.current) setBookStatusAuditsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedBookId) {
      workspaceRequestId.current += 1;
      setVolumes([]);
      setChapters([]);
      setChapterCandidates([]);
      setSelectedVolumeId(undefined);
      setSelectedDraftId(undefined);
      setWorkspaceLoading(false);
      setWorkspaceError('');
      return;
    }
    setSelectedVolumeId(undefined);
    setSelectedDraftId(undefined);
    void loadBookWorkspace(selectedBookId);
  }, [loadBookWorkspace, selectedBookId]);

  useEffect(() => {
    if (!selectedBookId) {
      bookStatusAuditRequestId.current += 1;
      setBookStatusAuditPage(undefined);
      setBookStatusAuditPageIndex(0);
      setBookStatusAuditsError('');
      setBookStatusAuditsLoading(false);
      return;
    }
    void loadBookStatusAudits(selectedBookId, bookStatusAuditPageIndex);
  }, [bookStatusAuditPageIndex, loadBookStatusAudits, selectedBookId]);

  useEffect(() => {
    setBookStatusAuditPageIndex(0);
  }, [selectedBookId]);

  useEffect(() => {
    setSelectedVolumeId((current) => volumes.some((volume) => volume.id === current) ? current : volumes[0]?.id);
  }, [volumes]);

  const draftChapters = useMemo(() => chapters.filter((chapter) => chapter.status === 'DRAFT'), [chapters]);
  const pendingCandidateByTargetChapterId = useMemo(() => new Map(
    chapterCandidates
      .filter((candidate) => candidate.status === 'PENDING_REVIEW')
      .map((candidate) => [candidate.targetChapterId, candidate]),
  ), [chapterCandidates]);

  useEffect(() => {
    setSelectedDraftId((current) => draftChapters.some((chapter) => chapter.id === current) ? current : draftChapters[0]?.id);
  }, [draftChapters]);

  const loadAuthorComments = useCallback(async (bookId: number, pageIndex: number) => {
    const requestId = ++commentRequestId.current;
    setCommentsLoading(true);
    setCommentError('');
    setCommentPage(undefined);
    try {
      const page = await novelApi<AuthorCommentPage>(feedbackPath(bookId, 'comments', pageIndex), 'author');
      if (requestId === commentRequestId.current) setCommentPage(page);
    } catch (reason) {
      if (requestId === commentRequestId.current) {
        setCommentPage(undefined);
        setCommentError(failureMessage(reason, '作品评论暂时无法加载。'));
      }
    } finally {
      if (requestId === commentRequestId.current) setCommentsLoading(false);
    }
  }, []);

  const loadAuthorAnnotations = useCallback(async (bookId: number, pageIndex: number) => {
    const requestId = ++annotationRequestId.current;
    setAnnotationsLoading(true);
    setAnnotationError('');
    setAnnotationPage(undefined);
    try {
      const page = await novelApi<ParagraphAnnotationPage>(feedbackPath(bookId, 'annotations', pageIndex), 'author');
      if (requestId === annotationRequestId.current) setAnnotationPage(page);
    } catch (reason) {
      if (requestId === annotationRequestId.current) {
        setAnnotationPage(undefined);
        setAnnotationError(failureMessage(reason, '公开段评暂时无法加载。'));
      }
    } finally {
      if (requestId === annotationRequestId.current) setAnnotationsLoading(false);
    }
  }, []);

  useEffect(() => {
    setCommentPageIndex(0);
    setAnnotationPageIndex(0);
  }, [selectedBookId]);

  useEffect(() => {
    if (!selectedBookId) {
      commentRequestId.current += 1;
      setCommentPage(undefined);
      setCommentError('');
      setCommentsLoading(false);
      return;
    }
    void loadAuthorComments(selectedBookId, commentPageIndex);
  }, [commentPageIndex, loadAuthorComments, selectedBookId]);

  useEffect(() => {
    if (!selectedBookId) {
      annotationRequestId.current += 1;
      setAnnotationPage(undefined);
      setAnnotationError('');
      setAnnotationsLoading(false);
      return;
    }
    void loadAuthorAnnotations(selectedBookId, annotationPageIndex);
  }, [annotationPageIndex, loadAuthorAnnotations, selectedBookId]);

  const selectedBook = useMemo(() => books.find((book) => book.id === selectedBookId), [books, selectedBookId]);
  const selectedDraft = useMemo(() => draftChapters.find((chapter) => chapter.id === selectedDraftId), [draftChapters, selectedDraftId]);
  const sharedAnnotations = useMemo(
    () => (annotationPage?.items ?? []).filter((annotation) => annotation.shareIntent),
    [annotationPage],
  );
  const totalWords = useMemo(() => books.reduce((sum, book) => sum + book.words, 0), [books]);
  const pendingBooks = useMemo(() => books.filter((book) => ['PENDING_REVIEW', 'NEEDS_REVIEW'].includes(book.status)).length, [books]);
  const bookStatusAudits = bookStatusAuditPage?.items ?? [];
  const analyticsHasTrendActivity = useMemo(() => (analyticsReport?.dailyTrend ?? []).some((point) => (
    point.favoriteAddCount > 0
    || point.favoriteRemoveCount > 0
    || point.subscriptionAddCount > 0
    || point.subscriptionRemoveCount > 0
    || point.purchaseCount > 0
  )), [analyticsReport]);

  const announce = (message: string, tone: Notice['tone'] = 'success') => setNotice({ message, tone });

  const submitModerationAdvice = async (
    resource: 'comments' | 'annotations',
    interactionId: number,
    recommendVisible: boolean,
  ) => {
    if (!selectedBook) return;
    const actionKey = `moderation-advice-${resource}-${interactionId}`;
    const reason = (moderationAdviceReasons[`${resource}-${interactionId}`] ?? '').trim();
    if (!reason) {
      announce('请先说明建议理由，站长会据此完成最终审核。', 'error');
      return;
    }
    setPendingAction(actionKey);
    try {
      const advice = await novelApi<AuthorModerationAdvice>(
        `author/books/${selectedBook.id}/${resource}/${interactionId}/moderation-advice`,
        'author',
        { method: 'POST', body: JSON.stringify({ recommendVisible, reason }) },
      );
      if (resource === 'comments') {
        setCommentPage((current) => current ? {
          ...current,
          items: current.items.map((item) => item.id === interactionId ? { ...item, authorModerationAdvice: advice } : item),
        } : current);
      } else {
        setAnnotationPage((current) => current ? {
          ...current,
          items: current.items.map((item) => item.id === interactionId ? { ...item, authorModerationAdvice: advice } : item),
        } : current);
      }
      announce(recommendVisible ? '已提交公开建议，等待站长最终审核。' : '已提交驳回建议，等待站长最终审核。');
    } catch (reason) {
      announce(failureMessage(reason, '审核建议暂时无法提交。'), 'error');
    } finally {
      setPendingAction((current) => current === actionKey ? undefined : current);
    }
  };

  const applyRewardFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rewardFrom && rewardTo && rewardFrom > rewardTo) {
      setRewardError('起始日期不能晚于结束日期。');
      return;
    }
    setRewardQuery({ bookId: rewardBookId, from: rewardFrom, to: rewardTo, page: 0 });
  };

  const resetRewardFilters = () => {
    setRewardBookId(undefined);
    setRewardFrom('');
    setRewardTo('');
    setRewardError('');
    setRewardQuery({ bookId: undefined, from: '', to: '', page: 0 });
  };

  const applyAnalyticsFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (Boolean(analyticsFrom) !== Boolean(analyticsTo)) {
      setAnalyticsError('请同时填写起始日期和结束日期。');
      return;
    }
    if (analyticsFrom && analyticsTo && analyticsFrom > analyticsTo) {
      setAnalyticsError('起始日期不能晚于结束日期。');
      return;
    }
    setAnalyticsQuery({ bookId: analyticsBookId, from: analyticsFrom, to: analyticsTo });
  };

  const resetAnalyticsFilters = () => {
    setAnalyticsBookId(undefined);
    setAnalyticsFrom('');
    setAnalyticsTo('');
    setAnalyticsError('');
    setAnalyticsQuery({ bookId: undefined, from: '', to: '' });
  };

  const moveRewardPage = (offset: number) => {
    setRewardQuery((current) => ({ ...current, page: Math.max(0, current.page + offset) }));
  };

  const openBookEditor = (book: Book) => {
    if (!canEditBook(book) && !canManageBookCover(book)) {
      announce('该作品当前状态不能修改作品信息或管理封面。', 'error');
      return;
    }
    setEditingBook(book);
    setBookEditTitle(book.title);
    setBookEditCategory(book.category);
    setBookEditSynopsis(book.synopsis);
    setBookEditSerialStatus(normalizedSerialStatus(book.serialStatus));
    setBookCoverFile(undefined);
    setCoverUploadCandidate(undefined);
    if (bookCoverInputRef.current) bookCoverInputRef.current.value = '';
    setEditError('');
  };

  const closeBookEditor = () => {
    if (pendingAction === 'update-book' || pendingAction === 'upload-cover') return;
    setEditingBook(undefined);
    setBookCoverFile(undefined);
    setCoverUploadCandidate(undefined);
    if (bookCoverInputRef.current) bookCoverInputRef.current.value = '';
    setEditError('');
  };

  const updateBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingBook) return;
    if (!canEditBook(editingBook)) {
      setEditError('已发布作品不能在此修改文字信息；可单独提交封面候选审核。');
      return;
    }
    const nextTitle = bookEditTitle.trim();
    const nextSynopsis = bookEditSynopsis.trim();
    if (!nextTitle || !nextSynopsis) {
      setEditError('请填写作品名称和作品简介后再保存。');
      return;
    }

    setPendingAction('update-book');
    setEditError('');
    try {
      const updated = await novelApi<Book>(`author/books/${editingBook.id}`, 'author', {
        method: 'PUT',
        body: JSON.stringify({
          title: nextTitle,
          category: bookEditCategory,
          synopsis: nextSynopsis,
          serialStatus: bookEditSerialStatus,
        }),
      });
      setBooks((current) => current.map((book) => book.id === updated.id ? updated : book));
      setEditingBook(undefined);
      announce(`《${updated.title}》的作品信息已保存`);
    } catch (reason) {
      const message = failureMessage(reason, '服务暂时无法保存作品信息。');
      setEditError(`作品信息未保存：${message}`);
      announce(`作品信息未保存：${message}`, 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const uploadBookCover = async () => {
    if (!editingBook || !bookCoverFile) {
      setEditError('请先选择 PNG 或 JPEG 封面文件。');
      return;
    }
    if (!canManageBookCover(editingBook)) {
      setEditError('当前作品状态不能管理封面。');
      return;
    }
    setPendingAction('upload-cover');
    setEditError('');
    try {
      const form = new FormData();
      form.append('file', bookCoverFile);
      const result = await novelApi<AuthorCoverUploadResult>(`author/books/${editingBook.id}/cover`, 'author', {
        method: 'POST',
        body: form,
      });
      const updated = result.book;
      setBooks((current) => current.map((book) => book.id === updated.id ? updated : book));
      setEditingBook(updated);
      setBookCoverFile(undefined);
      setCoverUploadCandidate(result.candidate ?? undefined);
      if (bookCoverInputRef.current) bookCoverInputRef.current.value = '';
      announce(result.candidate
        ? `《${updated.title}》的封面候选已提交审核；当前公开封面保持不变。`
        : `《${updated.title}》的新封面已上传`);
    } catch (reason) {
      const message = failureMessage(reason, '服务暂时无法上传封面。');
      setEditError(`封面未上传：${message}`);
      announce(`封面未上传：${message}`, 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const openChapterEditor = (chapter: AuthorChapter) => {
    const pendingCandidate = pendingCandidateByTargetChapterId.get(chapter.id);
    if (!canEditChapter(chapter) || pendingCandidate) {
      announce(
        pendingCandidate?.type === 'NEW_CHAPTER'
          ? '该新章节候选正在审核，通过前不会向读者公开。'
          : '该章节已有候选修改待审核；当前已发布正文仍可阅读，审核结束后才能继续修改。',
        'error',
      );
      return;
    }
    setSelectedBookId(chapter.bookId);
    setEditingChapter(chapter);
    setChapterEditTitle(chapter.title);
    setChapterEditContent(chapter.content);
    setChapterEditVolumeId(undefined);
    setEditError('');
  };

  const closeChapterEditor = () => {
    if (pendingAction === 'update-chapter') return;
    setEditingChapter(undefined);
    setEditError('');
  };

  const updateChapter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingChapter) return;
    const nextTitle = chapterEditTitle.trim();
    const nextContent = chapterEditContent.trim();
    if (!nextTitle || !nextContent) {
      setEditError('请填写章节标题和正文后再保存。');
      return;
    }

    const isPublishedRevision = editingChapter.status === 'PUBLISHED';
    setPendingAction('update-chapter');
    setEditError('');
    try {
      const updated = await novelApi<AuthorChapter>(`author/books/${editingChapter.bookId}/chapters/${editingChapter.id}`, 'author', {
        method: 'PUT',
        body: JSON.stringify({
          title: nextTitle,
          content: nextContent,
          ...(chapterEditVolumeId !== undefined ? { volumeId: chapterEditVolumeId } : {}),
        }),
      });
      if (!isPublishedRevision) {
        setChapters((current) => current.map((chapter) => chapter.id === updated.id ? updated : chapter));
      }
      setEditingChapter(undefined);
      announce(
        isPublishedRevision
          ? `《${nextTitle}》的修订候选已提交审核；当前已发布正文保持可读。`
          : `《${updated.title}》已保存`,
      );
      await Promise.all([loadBooks(booksPageIndex), loadBookWorkspace(updated.bookId)]);
    } catch (reason) {
      const message = failureMessage(reason, '服务暂时无法保存章节。');
      setEditError(`章节未保存：${message}`);
      announce(`章节未保存：${message}`, 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const openVolumeEditor = (volume: Volume) => {
    setEditingVolume(volume);
    setVolumeEditTitle(volume.title);
    setEditError('');
  };

  const closeVolumeEditor = () => {
    if (pendingAction === 'update-volume') return;
    setEditingVolume(undefined);
    setEditError('');
  };

  const updateVolume = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingVolume) return;
    const nextTitle = volumeEditTitle.trim();
    if (!nextTitle) {
      setEditError('请填写卷册名称后再保存。');
      return;
    }

    setPendingAction('update-volume');
    setEditError('');
    try {
      const updated = await novelApi<Volume>(`author/books/${editingVolume.bookId}/volumes/${editingVolume.id}`, 'author', {
        method: 'PUT',
        body: JSON.stringify({ title: nextTitle }),
      });
      setVolumes((current) => current.map((volume) => volume.id === updated.id ? updated : volume));
      setEditingVolume(undefined);
      announce(`《${updated.title}》卷册信息已保存`);
    } catch (reason) {
      const message = failureMessage(reason, '服务暂时无法保存卷册信息。');
      setEditError(`卷册未保存：${message}`);
      announce(`卷册未保存：${message}`, 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const moveVolume = async (volume: Volume, offset: number) => {
    if (!selectedBookId) return;
    const orderNo = volume.orderNo + offset;
    if (orderNo < 1 || orderNo > volumes.length) return;

    setPendingAction('reorder-volume');
    try {
      const reordered = await novelApi<Volume[]>(`author/books/${selectedBookId}/volumes/${volume.id}/order`, 'author', {
        method: 'PUT',
        body: JSON.stringify({ orderNo }),
      });
      setVolumes(reordered);
      announce(`《${volume.title}》已移动到第 ${orderNo} 卷`);
    } catch (reason) {
      announce(`卷册排序未保存：${failureMessage(reason, '服务暂时无法调整卷册顺序。')}`, 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const openDeleteConfirmation = (target: DeleteTarget) => {
    setDeleteTarget(target);
    setDeleteError('');
  };

  const closeDeleteConfirmation = () => {
    if (pendingAction === 'delete-book' || pendingAction === 'delete-chapter' || pendingAction === 'delete-volume') return;
    setDeleteTarget(undefined);
    setDeleteError('');
  };

  const deleteTargetItem = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const isBook = target.kind === 'book';
    const isVolume = target.kind === 'volume';
    const bookId = isBook ? target.item.id : target.item.bookId;
    const action = isBook ? 'delete-book' : isVolume ? 'delete-volume' : 'delete-chapter';
    setPendingAction(action);
    setDeleteError('');
    try {
      if (isBook) {
        await novelApi(`author/books/${bookId}`, 'author', { method: 'DELETE' });
        setSelectedBookId((current) => current === bookId ? undefined : current);
        setRewardBookId((current) => current === bookId ? undefined : current);
        setRewardQuery((current) => current.bookId === bookId ? { ...current, bookId: undefined, page: 0 } : current);
        announce(`《${target.item.title}》及其未发布内容已删除`);
        await loadBooks(booksPageIndex);
      } else if (isVolume) {
        const result = await novelApi<VolumeDeleteResult>(`author/books/${bookId}/volumes/${target.item.id}`, 'author', { method: 'DELETE' });
        setVolumes((current) => current.filter((volume) => volume.id !== target.item.id));
        setChapters((current) => current.map((chapter) => chapter.volumeId === target.item.id ? { ...chapter, volumeId: null } : chapter));
        setSelectedVolumeId((current) => current === target.item.id ? undefined : current);
        announce(`《${target.item.title}》已删除，${result.detachedChapterCount} 个章节已保留为未归入卷册内容`);
        await loadBookWorkspace(bookId);
      } else {
        await novelApi(`author/books/${bookId}/chapters/${target.item.id}`, 'author', { method: 'DELETE' });
        setChapters((current) => current.filter((chapter) => chapter.id !== target.item.id));
        setSelectedDraftId((current) => current === target.item.id ? undefined : current);
        announce(`《${target.item.title}》已删除`);
        await Promise.all([loadBooks(booksPageIndex), loadBookWorkspace(bookId)]);
      }
      setDeleteTarget(undefined);
    } catch (reason) {
      const message = failureMessage(reason, '服务暂时无法删除该内容。');
      setDeleteError(`删除未完成：${message}`);
      announce(`删除未完成：${message}`, 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const createBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingAction('book');
    try {
      const book = await novelApi<Book>('author/books', 'author', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), category, synopsis: synopsis.trim() }),
      });
      setTitle('');
      setSynopsis('');
      setSelectedBookId(book.id);
      announce(`《${book.title}》已保存为草稿`);
      if (booksPageIndex === 0) await loadBooks(0);
      else setBooksPageIndex(0);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '新建作品失败，请检查必填内容。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const createVolume = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBookId) {
      announce('请先在作品库中选择一部作品。', 'error');
      return;
    }
    if (!volumeTitle.trim()) {
      announce('请填写卷册名称。', 'error');
      return;
    }
    setPendingAction('volume');
    try {
      const volume = await novelApi<Volume>(`author/books/${selectedBookId}/volumes`, 'author', {
        method: 'POST',
        body: JSON.stringify({ title: volumeTitle.trim() }),
      });
      setVolumeTitle('');
      setSelectedVolumeId(volume.id);
      announce(`《${selectedBook?.title ?? '当前作品'}》已新建${volume.title}`);
      await loadBookWorkspace(selectedBookId);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '新建卷册失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const saveChapter = async (submit: boolean) => {
    if (!selectedBookId || !chapterTitle.trim() || !chapterContent.trim()) {
      announce('请先选择作品，并补全章节标题和正文。', 'error');
      return;
    }
    if (!submit && !selectedVolumeId) {
      announce('请先创建并选择一个卷册，再保存章节草稿。', 'error');
      return;
    }
    setPendingAction(submit ? 'submit-chapter' : 'draft-chapter');
    try {
      const path = submit
        ? `author/books/${selectedBookId}/chapters`
        : `author/books/${selectedBookId}/volumes/${selectedVolumeId}/chapters`;
      const result = await novelApi<AuthorChapter>(path, 'author', {
        method: 'POST',
        body: JSON.stringify(submit
          ? {
              title: chapterTitle.trim(),
              content: chapterContent.trim(),
              submit: true,
              ...(selectedVolumeId ? { volumeId: selectedVolumeId } : {}),
            }
          : { title: chapterTitle.trim(), content: chapterContent.trim() }),
      });
      setChapterTitle('');
      setChapterContent('');
      announce(submit
        ? (result.published
          ? '章节已通过自动筛查并发布'
          : selectedBook?.status === 'PUBLISHED'
            ? '章节候选已提交人工审核；已发布作品保持可读。'
            : '章节候选已提交人工审核')
        : '章节草稿已保存');
      await loadBooks(booksPageIndex);
      await loadBookWorkspace(selectedBookId);
      if (!submit) setSelectedDraftId(result.id);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '章节保存失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const scheduleDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBookId || !selectedDraft) {
      announce('请先从草稿列表中选择一个章节。', 'error');
      return;
    }
    const timestamp = new Date(publishAt);
    if (!publishAt || Number.isNaN(timestamp.getTime()) || timestamp.getTime() <= Date.now()) {
      announce('发布时间必须是当前时间之后的有效日期。', 'error');
      return;
    }
    setPendingAction('schedule');
    try {
      const chapter = await novelApi<AuthorChapter>(`author/books/${selectedBookId}/chapters/${selectedDraft.id}/schedule`, 'author', {
        method: 'POST',
        body: JSON.stringify({ publishAt: timestamp.toISOString() }),
      });
      setPublishAt('');
      announce(`《${chapter.title}》已排期，将在 ${formatPublishTime(chapter.scheduledPublishAt)} 自动复核后发布`);
      await loadBookWorkspace(selectedBookId);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '章节排期失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const submitBook = async () => {
    if (!selectedBookId) {
      announce('请先在作品库中选择一部作品。', 'error');
      return;
    }
    setPendingAction('submit-book');
    try {
      await novelApi(`author/books/${selectedBookId}/submit`, 'author', { method: 'POST' });
      announce('已提交完整作品审核');
      await loadBooks(booksPageIndex);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '提交审核失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  return (
    <NovelShell workspace="author">
      <NovelPageHeader
        eyebrow="作家中心"
        title="今天，写下新的章节。"
        description="从草稿、章节存稿到完整作品审核，所有内容都只在你的作品范围内管理。"
        actions={<Button asChild variant="outline" size="sm" className="h-auto rounded-none border-stone-300 bg-white px-3 py-2 text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><Link href="/"><BookCopy size={16} aria-hidden="true" />返回书城</Link></Button>}
      />

      {notice ? <div className="mt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}

      <section className="mt-7 grid gap-px overflow-hidden border border-stone-200 bg-stone-200 sm:grid-cols-3" aria-label="作者概览" aria-busy={loading}>
        {[
          { label: '我的作品', value: (booksMeta?.total ?? 0).toLocaleString('zh-CN'), icon: BookCopy },
          { label: '本页字数', value: formatWordCount(totalWords), icon: FileText },
          { label: '本页待审核', value: pendingBooks.toLocaleString('zh-CN'), icon: Send },
        ].map((metric) => {
          const Icon = metric.icon;
          return <div key={metric.label} className="bg-white px-5 py-5"><Icon size={18} className="text-emerald-700" aria-hidden="true" />{loading ? <Skeleton className="mt-3 h-8 w-16 rounded-none bg-stone-100" /> : <strong className="mt-3 block text-2xl font-semibold text-stone-950">{metric.value}</strong>}<span className="mt-1 block text-sm text-stone-600">{metric.label}</span></div>;
        })}
      </section>

      <section className="mt-7 border border-stone-200 bg-white" aria-labelledby="author-analytics-heading">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">作品数据</p>
            <h2 id="author-analytics-heading" className="mt-1 text-xl font-semibold text-stone-950">收藏、订阅、评分与阅读数据</h2>
          </div>
          <span className="text-sm text-stone-500" aria-live="polite">
            {analyticsLoading ? '正在加载' : analyticsReport ? `${analyticsReport.meta.from} 至 ${analyticsReport.meta.to}` : '暂未加载'}
          </span>
        </div>

        <form onSubmit={applyAnalyticsFilters} className="grid gap-3 border-b border-stone-100 px-5 py-5 sm:grid-cols-2 xl:grid-cols-[minmax(160px,1fr)_minmax(138px,.8fr)_minmax(138px,.8fr)_auto_auto] xl:items-end">
          <div>
            <Label id="analytics-book-label" className="text-stone-700">作品</Label>
            <Select value={analyticsBookId?.toString() ?? 'all'} onValueChange={(value) => setAnalyticsBookId(value === 'all' ? undefined : Number(value))}>
              <SelectTrigger aria-label="作品数据作品筛选" className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none border-stone-300 bg-white text-stone-900">
                <SelectItem value="all">全部作品</SelectItem>
                {books.map((book) => <SelectItem key={book.id} value={book.id.toString()}>{book.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="analytics-from" className="text-stone-700">起始日期</Label>
            <Input id="analytics-from" aria-label="作品数据起始日期" type="date" value={analyticsFrom} onChange={(event) => setAnalyticsFrom(event.target.value)} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
          </div>
          <div>
            <Label htmlFor="analytics-to" className="text-stone-700">结束日期</Label>
            <Input id="analytics-to" aria-label="作品数据结束日期" type="date" value={analyticsTo} onChange={(event) => setAnalyticsTo(event.target.value)} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
          </div>
          <Button type="submit" disabled={analyticsLoading} className="h-10 rounded-none bg-emerald-700 px-3 hover:bg-emerald-800 disabled:cursor-wait"><RefreshCw size={16} aria-hidden="true" className={analyticsLoading ? 'animate-spin' : ''} />查询</Button>
          <Button type="button" variant="outline" onClick={resetAnalyticsFilters} disabled={analyticsLoading && !analyticsReport} className="h-10 rounded-none border-stone-300 bg-white px-3 text-stone-700 hover:border-emerald-700 hover:text-emerald-800">重置</Button>
        </form>

        {analyticsError ? (
          <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <InlineNotice tone="error">作品数据无法显示：{analyticsError}</InlineNotice>
            <Button type="button" variant="outline" onClick={() => void loadAnalyticsReport(analyticsQuery)} className="h-auto shrink-0 rounded-none border-stone-300 bg-white px-3 py-2 text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><RefreshCw size={16} aria-hidden="true" />重试</Button>
          </div>
        ) : null}
        {analyticsLoading && !analyticsReport ? <div className="grid gap-px bg-stone-100 p-px sm:grid-cols-4" aria-live="polite">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32 rounded-none bg-white" />)}</div> : null}
        {!analyticsError && analyticsReport ? (
          <>
            {!analyticsReport.availability.favorite.available || !analyticsReport.availability.subscription.available || !analyticsReport.availability.retention.available ? (
              <div className="space-y-2 border-b border-stone-100 px-5 py-4">
                <AnalyticsAvailabilityNotice label="收藏历史" {...analyticsReport.availability.favorite} />
                <AnalyticsAvailabilityNotice label="免费作品订阅历史" {...analyticsReport.availability.subscription} />
                <AnalyticsAvailabilityNotice label="阅读留存历史" {...analyticsReport.availability.retention} />
              </div>
            ) : null}
            <dl className="grid gap-px border-b border-stone-100 bg-stone-100 sm:grid-cols-2 xl:grid-cols-4">
              <div className="bg-white px-5 py-5">
                <Heart className="text-emerald-700" size={18} aria-hidden="true" />
                <dt className="mt-3 text-sm text-stone-600">当前收藏</dt>
                <dd className="mt-1 text-2xl font-semibold text-stone-950">{analyticsReport.summary.currentFavoriteCount.toLocaleString('zh-CN')}<span className="ml-1 text-sm font-medium text-stone-500">本</span></dd>
              </div>
              <div className="bg-white px-5 py-5">
                <BookCopy className="text-emerald-700" size={18} aria-hidden="true" />
                <dt className="mt-3 text-sm text-stone-600">当前免费订阅</dt>
                <dd className="mt-1 text-2xl font-semibold text-stone-950">{analyticsReport.summary.currentSubscriptionCount.toLocaleString('zh-CN')}<span className="ml-1 text-sm font-medium text-stone-500">本</span></dd>
                <p className="mt-1 text-xs text-stone-500">{analyticsReport.summary.currentSubscriberCount.toLocaleString('zh-CN')} 位订阅读者</p>
              </div>
              <div className="bg-white px-5 py-5">
                <Star className="text-amber-600" size={18} aria-hidden="true" />
                <dt className="mt-3 text-sm text-stone-600">读者评分</dt>
                <dd className="mt-1 text-2xl font-semibold text-stone-950">{formatAnalyticsRating(analyticsReport.summary.averageRating, analyticsReport.summary.ratingCount)}</dd>
                <p className="mt-1 text-xs text-stone-500">{analyticsReport.summary.ratingCount.toLocaleString('zh-CN')} 人评分</p>
              </div>
              <div className="bg-white px-5 py-5">
                <BookOpen className="text-emerald-700" size={18} aria-hidden="true" />
                <dt className="mt-3 text-sm text-stone-600">当前阅读完成度</dt>
                <dd className="mt-1 text-2xl font-semibold text-stone-950">{formatAnalyticsPercent(analyticsReport.summary.averageReadThroughPercent)}</dd>
                <p className="mt-1 text-xs text-stone-500">{analyticsReport.summary.currentReaderCount.toLocaleString('zh-CN')} 位读者 · {analyticsReport.summary.completedReaderBookCount.toLocaleString('zh-CN')} 本读完</p>
              </div>
            </dl>

            <dl className="grid gap-px border-b border-stone-100 bg-stone-100 sm:grid-cols-2 xl:grid-cols-5">
              <div className="bg-white px-5 py-4">
                <dt className="text-sm font-medium text-stone-900">期间活跃阅读</dt>
                <dd className="mt-1 text-2xl font-semibold text-stone-950">{analyticsReport.summary.activeReaderCount.toLocaleString('zh-CN')}<span className="ml-1 text-sm font-medium text-stone-500">位读者</span></dd>
                <p className="mt-1 text-xs text-stone-500">{analyticsReport.summary.activeReaderBookCount.toLocaleString('zh-CN')} 条读者-作品活动</p>
              </div>
              <div className="bg-white px-5 py-4">
                <dt className="text-sm font-medium text-stone-900">付费购书</dt>
                <dd className="mt-1 text-2xl font-semibold text-stone-950">{analyticsReport.summary.purchaseCount.toLocaleString('zh-CN')}<span className="ml-1 text-sm font-medium text-stone-500">笔</span></dd>
                <p className="mt-1 text-xs text-stone-500">{analyticsReport.summary.purchaseTokenAmount.toLocaleString('zh-CN')} 代币</p>
              </div>
              <div className="bg-white px-5 py-4">
                <dt className="text-sm font-medium text-stone-900">作品归因会员兑换</dt>
                <dd className="mt-1 text-2xl font-semibold text-stone-950">{analyticsReport.membershipAttributionMetrics.attributedGrantCount.toLocaleString('zh-CN')}<span className="ml-1 text-sm font-medium text-stone-500">次</span></dd>
                <p className="mt-1 text-xs text-stone-500">{analyticsReport.membershipAttributionMetrics.attributedReaderCount.toLocaleString('zh-CN')} 位读者 · {analyticsReport.membershipAttributionMetrics.membershipDayCount.toLocaleString('zh-CN')} 会员天</p>
              </div>
              <div className="bg-white px-5 py-4">
                <dt className="text-sm font-medium text-stone-900">D1 追读</dt>
                <dd className="mt-1 text-2xl font-semibold text-stone-950">{formatRetentionPercent(analyticsReport.retentionMetrics.day1RetentionPercent)}</dd>
                <p className="mt-1 text-xs text-stone-500">{analyticsReport.retentionMetrics.day1RetainedReaderBookCount.toLocaleString('zh-CN')} / {analyticsReport.retentionMetrics.day1EligibleReaderBookCount.toLocaleString('zh-CN')} 成熟读者-作品</p>
              </div>
              <div className="bg-white px-5 py-4">
                <dt className="text-sm font-medium text-stone-900">D7 追读</dt>
                <dd className="mt-1 text-2xl font-semibold text-stone-950">{formatRetentionPercent(analyticsReport.retentionMetrics.day7RetentionPercent)}</dd>
                <p className="mt-1 text-xs text-stone-500">{analyticsReport.retentionMetrics.day7RetainedReaderBookCount.toLocaleString('zh-CN')} / {analyticsReport.retentionMetrics.day7EligibleReaderBookCount.toLocaleString('zh-CN')} 成熟读者-作品</p>
              </div>
            </dl>

            <div className="grid gap-7 px-5 py-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
              <section aria-labelledby="author-analytics-trend-heading">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="author-analytics-trend-heading" className="text-base font-semibold text-stone-950">互动与订阅趋势</h3>
                  <span className="text-xs text-stone-500">{analyticsReport.meta.timeZone} 自然日</span>
                </div>
                {!analyticsHasTrendActivity ? <p className="mt-3 border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-600" role="status">所选区间暂无互动、订阅或购书事件。</p> : (
                  <div className="mt-3 max-h-80 overflow-y-auto border border-stone-100">
                  <Table className="min-w-[700px]">
                    <TableCaption className="sr-only">所选统计区间内的收藏、订阅和成功购书趋势。</TableCaption>
                    <TableHeader className="border-stone-100 bg-stone-50 text-stone-600">
                      <TableRow className="border-0 hover:bg-transparent">
                        <TableHead className="px-4 py-3">日期</TableHead>
                        <TableHead className="px-4 py-3 text-right">新增收藏</TableHead>
                        <TableHead className="px-4 py-3 text-right">取消收藏</TableHead>
                        <TableHead className="px-4 py-3 text-right">新增订阅</TableHead>
                        <TableHead className="px-4 py-3 text-right">取消订阅</TableHead>
                        <TableHead className="px-4 py-3 text-right">付费购书</TableHead>
                        <TableHead className="px-4 py-3 text-right">代币</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analyticsReport.dailyTrend.map((point) => (
                        <TableRow key={point.date} className="border-stone-100 hover:bg-stone-50">
                          <TableCell className="whitespace-nowrap px-4 py-3 text-stone-700">{point.date}</TableCell>
                          <TableCell className="px-4 py-3 text-right font-medium text-stone-900">{point.favoriteAddCount.toLocaleString('zh-CN')}</TableCell>
                          <TableCell className="px-4 py-3 text-right text-stone-700">{point.favoriteRemoveCount.toLocaleString('zh-CN')}</TableCell>
                          <TableCell className="px-4 py-3 text-right font-medium text-stone-900">{point.subscriptionAddCount.toLocaleString('zh-CN')}</TableCell>
                          <TableCell className="px-4 py-3 text-right text-stone-700">{point.subscriptionRemoveCount.toLocaleString('zh-CN')}</TableCell>
                          <TableCell className="px-4 py-3 text-right font-medium text-stone-900">{point.purchaseCount.toLocaleString('zh-CN')}</TableCell>
                          <TableCell className="px-4 py-3 text-right font-medium text-emerald-800">{point.purchaseTokenAmount.toLocaleString('zh-CN')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                )}
              </section>

              <section aria-labelledby="author-analytics-books-heading">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="author-analytics-books-heading" className="text-base font-semibold text-stone-950">按作品查看</h3>
                  <span className="text-xs text-stone-500">{analyticsReport.meta.bookMetricsTruncated ? `仅显示 ${analyticsReport.bookMetrics.length} / ${analyticsReport.meta.bookMetricTotal} 部` : `共 ${analyticsReport.meta.bookMetricTotal} 部`}</span>
                </div>
                {analyticsReport.bookMetrics.length === 0 ? <p className="mt-3 border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-600">当前筛选范围内还没有作品数据。</p> : (
                  <div className="mt-3 max-h-80 overflow-y-auto border border-stone-100">
                    <Table className="min-w-[690px]">
                      <TableCaption className="sr-only">按作者作品拆分的收藏、免费订阅、评分、期间活跃阅读和当前完成度。</TableCaption>
                      <TableHeader className="border-stone-100 bg-stone-50 text-stone-600">
                        <TableRow className="border-0 hover:bg-transparent">
                          <TableHead className="px-4 py-3">作品</TableHead>
                          <TableHead className="px-4 py-3 text-right">收藏</TableHead>
                          <TableHead className="px-4 py-3 text-right">订阅</TableHead>
                          <TableHead className="px-4 py-3 text-right">评分</TableHead>
                          <TableHead className="px-4 py-3 text-right">期间活跃</TableHead>
                          <TableHead className="px-4 py-3 text-right">当前完成度</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analyticsReport.bookMetrics.map((metric) => (
                          <TableRow key={metric.bookId} className="border-stone-100 hover:bg-stone-50">
                            <TableCell className="max-w-48 px-4 py-3 font-medium text-stone-900"><span className="block truncate">{metric.bookTitle}</span></TableCell>
                            <TableCell className="px-4 py-3 text-right text-stone-700">{metric.currentFavoriteCount.toLocaleString('zh-CN')}</TableCell>
                            <TableCell className="px-4 py-3 text-right text-stone-700">{metric.currentSubscriptionCount.toLocaleString('zh-CN')}</TableCell>
                            <TableCell className="px-4 py-3 text-right text-stone-700">{formatAnalyticsRating(metric.averageRating, metric.ratingCount)}{metric.ratingCount > 0 ? ` · ${metric.ratingCount.toLocaleString('zh-CN')} 人` : ''}</TableCell>
                            <TableCell className="px-4 py-3 text-right text-stone-700">{metric.activeReaderBookCount.toLocaleString('zh-CN')}</TableCell>
                            <TableCell className="px-4 py-3 text-right font-medium text-emerald-800">{formatAnalyticsPercent(metric.averageReadThroughPercent)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            </div>

            <p className="border-t border-stone-100 px-5 py-4 text-xs leading-5 text-stone-500">收藏和免费订阅趋势来自不可变事件；当前收藏、订阅、评分与完成度是查询时快照。免费作品订阅不影响阅读权限、代币、支付或通知。作品归因会员兑换为旧权益账本，不等同于读者订阅。D1/D7 以读者首次阅读后第 1/7 个上海自然日是否再次阅读计算，观测截止至 {analyticsReport.retentionMetrics.observedThrough}；历史观测边界以服务端返回口径为准。代币不是法币收入。</p>
          </>
        ) : null}
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]" aria-label="卷册与章节管理">
        {workspaceError ? <div className="xl:col-span-2"><InlineNotice tone="error">{workspaceError}</InlineNotice></div> : null}

        <section className="border border-stone-200 bg-white" aria-labelledby="author-volumes-heading">
          <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-5">
            <div>
              <p className="text-xs font-semibold text-emerald-700">卷册管理</p>
              <h2 id="author-volumes-heading" className="mt-1 text-xl font-semibold text-stone-950">为故事安排卷册</h2>
            </div>
            <FolderOpen className="shrink-0 text-emerald-700" size={20} aria-hidden="true" />
          </div>

          {!selectedBook ? <div className="px-5 py-10 text-sm leading-6 text-stone-600">选择一部作品后，可在这里建立卷册并把章节归入对应内容线。</div> : null}
          {selectedBook ? (
            <>
              <form onSubmit={createVolume} className="border-b border-stone-100 p-5">
                <Label htmlFor="volume-title" className="text-stone-700">新建卷册</Label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input id="volume-title" aria-label="卷册名称" required value={volumeTitle} onChange={(event) => setVolumeTitle(event.target.value)} placeholder="例如：第一卷 起航" className="h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
                  <Button type="submit" disabled={pendingAction !== undefined} className="h-10 rounded-none bg-emerald-700 px-3 hover:bg-emerald-800 disabled:cursor-wait"><FolderPlus size={16} aria-hidden="true" />{pendingAction === 'volume' ? '创建中' : '新建卷册'}</Button>
                </div>
              </form>

              {workspaceLoading ? <div className="p-5"><Skeleton className="h-24 rounded-none bg-stone-100" /></div> : null}
              {!workspaceLoading && !workspaceError && volumes.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Layers3 className="mx-auto text-stone-400" size={27} aria-hidden="true" />
                  <p className="mt-3 font-medium text-stone-800">还没有卷册</p>
                  <p className="mt-1 text-sm leading-6 text-stone-500">先建立第一卷，再把新章节保存为存稿。</p>
                </div>
              ) : null}
              {!workspaceLoading && !workspaceError && volumes.length > 0 ? (
                <div className="divide-y divide-stone-100" aria-label="卷册列表">
                  {volumes.map((volume) => {
                    const active = volume.id === selectedVolumeId;
                    const chapterCount = chapters.filter((chapter) => chapter.volumeId === volume.id).length;
                    return (
                      <div key={volume.id} className={`flex items-center gap-2 px-5 py-3 ${active ? 'bg-emerald-50' : 'hover:bg-stone-50'}`}>
                        <Button type="button" variant="ghost" onClick={() => setSelectedVolumeId(volume.id)} aria-pressed={active} className="h-auto min-w-0 flex-1 justify-between gap-4 rounded-none px-0 py-1 text-left text-inherit hover:bg-transparent">
                          <span className="min-w-0"><span className="block truncate font-semibold text-stone-950">第 {volume.orderNo} 卷 · {volume.title}</span><span className="mt-1 block text-xs text-stone-500">{chapterCount} 个章节</span></span>
                          <span className="shrink-0 text-sm font-medium text-emerald-800">{active ? '正在使用' : '选用'}</span>
                        </Button>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button type="button" variant="outline" size="icon" title="上移卷册" aria-label={`上移第 ${volume.orderNo} 卷`} onClick={() => void moveVolume(volume, -1)} disabled={pendingAction !== undefined || selectedBook.status === 'OFFLINE' || volume.orderNo === 1} className="size-8 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><ArrowUp size={15} aria-hidden="true" /></Button>
                          <Button type="button" variant="outline" size="icon" title="下移卷册" aria-label={`下移第 ${volume.orderNo} 卷`} onClick={() => void moveVolume(volume, 1)} disabled={pendingAction !== undefined || selectedBook.status === 'OFFLINE' || volume.orderNo === volumes.length} className="size-8 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><ArrowDown size={15} aria-hidden="true" /></Button>
                          <Button type="button" variant="outline" size="icon" title="编辑卷册" aria-label={`编辑第 ${volume.orderNo} 卷`} onClick={() => openVolumeEditor(volume)} disabled={pendingAction !== undefined || selectedBook.status === 'OFFLINE'} className="size-8 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><SquarePen size={15} aria-hidden="true" /></Button>
                          <Button type="button" variant="outline" size="icon" title="删除卷册" aria-label={`删除第 ${volume.orderNo} 卷`} onClick={() => openDeleteConfirmation({ kind: 'volume', item: volume })} disabled={pendingAction !== undefined || selectedBook.status === 'OFFLINE'} className="size-8 rounded-none border-rose-200 bg-white text-rose-700 hover:border-rose-500 hover:bg-rose-50 hover:text-rose-800"><Trash2 size={15} aria-hidden="true" /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="border border-stone-200 bg-white" aria-labelledby="author-chapters-heading">
          <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700">章节与存稿</p>
              <h2 id="author-chapters-heading" className="mt-1 text-xl font-semibold text-stone-950">每一章都有明确状态</h2>
            </div>
            <span className="text-sm text-stone-500">{selectedBook ? `${chapters.length.toLocaleString('zh-CN')} 个章节` : '选择作品后查看'}</span>
          </div>

          {!selectedBook ? <div className="px-5 py-10 text-sm leading-6 text-stone-600">章节、存稿和已排期内容都会按当前作品显示在这里。</div> : null}
          {selectedBook && workspaceLoading ? <div className="p-5"><Skeleton className="h-24 rounded-none bg-stone-100" /></div> : null}
          {selectedBook && !workspaceLoading && !workspaceError && chapters.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <FileText className="mx-auto text-stone-400" size={27} aria-hidden="true" />
              <p className="mt-3 font-medium text-stone-800">暂时还没有章节</p>
              <p className="mt-1 text-sm leading-6 text-stone-500">在下方编辑器保存存稿，或直接提交章节筛查。</p>
            </div>
          ) : null}
          {selectedBook && !workspaceLoading && !workspaceError && chapters.length > 0 ? (
            <div className="divide-y divide-stone-100" aria-label="章节列表">
              {chapters.map((chapter) => {
                const volume = volumes.find((item) => item.id === chapter.volumeId);
                const pendingCandidate = pendingCandidateByTargetChapterId.get(chapter.id);
                const schedule = formatPublishTime(chapter.scheduledPublishAt);
                const canSchedule = chapter.status === 'DRAFT';
                const editable = canEditChapter(chapter) && !pendingCandidate;
                const deletable = canDeleteChapter(chapter) && !pendingCandidate;
                return (
                  <article key={chapter.id} className="px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-stone-950">第 {chapter.orderNo} 章 · {chapter.title}</h3><ChapterStatusBadge status={chapter.status} /></div>
                        <p className="mt-1 text-xs text-stone-500">{volume ? `第 ${volume.orderNo} 卷 · ${volume.title}` : '未归入卷册'}{schedule ? ` · 计划 ${schedule} 发布` : ''}</p>
                        {pendingCandidate ? <p className="mt-2 text-xs leading-5 text-amber-800">{pendingCandidate.type === 'CHAPTER_REVISION' ? `修订候选《${pendingCandidate.title}》待审核：当前已发布正文保持不变且对读者可读。` : `新章节候选《${pendingCandidate.title}》待审核：通过前不会向读者公开。`}{pendingCandidate.reviewReason ? ` ${pendingCandidate.reviewReason}` : ''}</p> : chapter.reviewReason ? <p className="mt-2 text-xs leading-5 text-rose-700">{chapter.reviewReason}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {canSchedule ? <Button type="button" variant="outline" onClick={() => setSelectedDraftId(chapter.id)} aria-pressed={selectedDraftId === chapter.id} className={`h-auto rounded-none px-3 py-2 text-sm ${selectedDraftId === chapter.id ? 'border-emerald-700 bg-emerald-50 text-emerald-800 hover:bg-emerald-50' : 'border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800'}`}>{selectedDraftId === chapter.id ? '待排期草稿' : '选择草稿'}</Button> : null}
                        {editable ? <Button type="button" variant="outline" onClick={() => openChapterEditor(chapter)} aria-label={`编辑章节《${chapter.title}》`} disabled={pendingAction !== undefined} className="h-auto rounded-none border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><SquarePen size={15} aria-hidden="true" />编辑</Button> : null}
                        {deletable ? <Button type="button" variant="outline" onClick={() => openDeleteConfirmation({ kind: 'chapter', item: chapter })} aria-label={`删除章节《${chapter.title}》`} disabled={pendingAction !== undefined} className="h-auto rounded-none border-rose-200 bg-white px-3 py-2 text-sm text-rose-700 hover:border-rose-500 hover:bg-rose-50 hover:text-rose-800"><Trash2 size={15} aria-hidden="true" />删除</Button> : null}
                        {!editable && !deletable ? <p className="text-xs leading-5 text-stone-500">{pendingCandidate?.type === 'NEW_CHAPTER' ? '新章节候选待审核，通过前不可编辑或删除。' : '已有候选修改待审核；当前已发布正文保持不变且对读者可读。'}</p> : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.8fr)]">
        <div className="border border-stone-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700">作品库</p>
              <h2 id="author-books-heading" className="mt-1 text-xl font-semibold text-stone-950">正在创作的故事</h2>
            </div>
            <span className="text-sm text-stone-500">{booksMeta ? `共 ${booksMeta.total.toLocaleString('zh-CN')} 部 · ` : ''}选择作品后即可继续编辑章节</span>
          </div>

          {loading ? <div className="p-5"><Skeleton className="h-24 rounded-none bg-stone-100" /></div> : null}
          {!loading && books.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <PenLine className="mx-auto text-stone-400" size={27} aria-hidden="true" />
              <p className="mt-3 font-medium text-stone-800">你的作品库还是空的</p>
              <p className="mt-1 text-sm text-stone-500">在右侧建立第一部作品，然后开始存稿。</p>
            </div>
          ) : null}
          {!loading && books.length > 0 ? (
            <div className="divide-y divide-stone-100">
              {books.map((book) => {
                const active = book.id === selectedBookId;
                const editable = canEditBook(book);
                const coverManageable = canManageBookCover(book);
                return (
                  <article key={book.id} className={active ? 'bg-emerald-50' : ''}>
                    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <Button type="button" variant="ghost" onClick={() => setSelectedBookId(book.id)} aria-pressed={active} className="grid h-auto min-w-0 flex-1 justify-start rounded-none gap-3 px-0 py-0 text-left text-inherit transition-colors hover:bg-transparent sm:grid-cols-[minmax(0,1fr)_100px_110px_96px] sm:items-center">
                        <span className="min-w-0"><span className="block truncate font-semibold text-stone-950">{book.title}</span><span className="mt-1 block text-xs text-stone-500">{book.category} · {normalizedSerialStatus(book.serialStatus)}</span></span>
                        <span className="hidden text-sm text-stone-600 sm:block">{formatWordCount(book.words)}</span>
                        <span><NovelStatusBadge status={book.status} /></span>
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-800">{active ? '正在编辑' : '继续编辑'}<SquarePen size={15} aria-hidden="true" /></span>
                      </Button>
                      {editable || coverManageable ? (
                        <div className="flex shrink-0 flex-wrap gap-2 border-t border-stone-100 pt-3 sm:border-t-0 sm:pt-0">
                          {coverManageable ? <Button type="button" variant="outline" onClick={() => openBookEditor(book)} aria-label={`${editable ? '编辑作品' : '管理封面'}《${book.title}》`} disabled={pendingAction !== undefined} className="h-auto rounded-none border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><SquarePen size={15} aria-hidden="true" />{editable ? '编辑' : '管理封面'}</Button> : null}
                          {editable ? <Button type="button" variant="outline" onClick={() => openDeleteConfirmation({ kind: 'book', item: book })} aria-label={`删除作品《${book.title}》`} disabled={pendingAction !== undefined} className="h-auto rounded-none border-rose-200 bg-white px-3 py-2 text-sm text-rose-700 hover:border-rose-500 hover:bg-rose-50 hover:text-rose-800"><Trash2 size={15} aria-hidden="true" />删除</Button> : null}
                        </div>
                      ) : <p className="shrink-0 text-xs leading-5 text-stone-500">已进入审核流程，当前仅可查看。</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
          {!loading && booksMeta ? <FeedbackPagination label="作品库" meta={booksMeta} loading={loading} onPageChange={setBooksPageIndex} /> : null}
        </div>

        <form onSubmit={createBook} className="border border-stone-200 bg-white p-5">
          <p className="text-xs font-semibold text-emerald-700">新建作品</p>
          <h2 className="mt-1 text-xl font-semibold text-stone-950">先留下故事的名字</h2>
          <div className="mt-5">
            <Label htmlFor="book-title" className="text-stone-700">作品名称</Label>
            <Input id="book-title" aria-label="作品名称" required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 h-11 rounded-none border-stone-300 bg-white px-3 text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="例如：逆光航线" />
          </div>
          <div className="mt-4">
            <Label id="book-category-label" className="text-stone-700">作品分类</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-labelledby="book-category-label" className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none border-stone-300 bg-white text-stone-900">
                {bookCategories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4">
            <Label htmlFor="book-synopsis" className="text-stone-700">作品简介</Label>
            <Textarea id="book-synopsis" aria-label="作品简介" required value={synopsis} onChange={(event) => setSynopsis(event.target.value)} className="mt-2 h-28 resize-y rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="用几句话介绍这个故事。" />
          </div>
          <Button type="submit" disabled={pendingAction === 'book'} className="mt-5 h-auto rounded-none bg-emerald-700 px-4 py-2.5 hover:bg-emerald-800 disabled:cursor-wait"><Plus size={16} aria-hidden="true" />{pendingAction === 'book' ? '保存中' : '保存草稿'}</Button>
        </form>
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.8fr)]">
        <form onSubmit={(event) => { event.preventDefault(); void saveChapter(true); }} className="border border-stone-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 border-b border-stone-200 pb-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-semibold text-emerald-700">章节编辑器</p>
              <h2 className="mt-1 text-xl font-semibold text-stone-950">写入卷册，再安排发布节奏</h2>
            </div>
            <FileText className="text-emerald-700" size={20} aria-hidden="true" />
          </div>
          <div className="mt-5">
            <Label id="chapter-book-label" className="text-stone-700">选择作品</Label>
            <Select value={selectedBookId?.toString() ?? ''} onValueChange={(value) => setSelectedBookId(Number(value))}>
              <SelectTrigger aria-labelledby="chapter-book-label" aria-label="选择作品" className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"><SelectValue placeholder="请选择作品" /></SelectTrigger>
              <SelectContent className="rounded-none border-stone-300 bg-white text-stone-900">
                {books.map((book) => <SelectItem key={book.id} value={book.id.toString()}>{book.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4">
            <Label id="chapter-volume-label" className="text-stone-700">归属卷册</Label>
            <Select value={selectedVolumeId?.toString() ?? 'unassigned'} onValueChange={(value) => setSelectedVolumeId(value === 'unassigned' ? undefined : Number(value))}>
              <SelectTrigger aria-labelledby="chapter-volume-label" aria-label="归属卷册" className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none border-stone-300 bg-white text-stone-900">
                <SelectItem value="unassigned">暂不归入卷册</SelectItem>
                {volumes.map((volume) => <SelectItem key={volume.id} value={volume.id.toString()}>第 {volume.orderNo} 卷 · {volume.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs leading-5 text-stone-500">保存草稿需要先选定卷册；直接提交章节可暂不归入卷册。</p>
          </div>
          <div className="mt-4">
            <Label htmlFor="chapter-title" className="text-stone-700">章节标题</Label>
            <Input id="chapter-title" aria-label="章节标题" required value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} className="mt-2 h-11 rounded-none border-stone-300 bg-white px-3 text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="例如：第一章 雨落旧港" />
          </div>
          <div className="mt-4">
            <Label htmlFor="chapter-content" className="text-stone-700">正文</Label>
            <Textarea id="chapter-content" aria-label="章节正文" required value={chapterContent} onChange={(event) => setChapterContent(event.target.value)} className="mt-2 h-56 resize-y rounded-none border-stone-300 bg-white leading-7 text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="开始写作..." />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => void saveChapter(false)} disabled={pendingAction !== undefined} className="h-auto rounded-none border-stone-300 bg-white px-4 py-2.5 text-stone-700 hover:border-emerald-700 hover:text-emerald-800 disabled:cursor-wait"><Save size={16} aria-hidden="true" />保存章节草稿</Button>
            <Button type="submit" disabled={pendingAction !== undefined} className="h-auto rounded-none bg-emerald-700 px-4 py-2.5 hover:bg-emerald-800 disabled:cursor-wait"><Send size={16} aria-hidden="true" />{pendingAction === 'submit-chapter' ? '筛查中' : '提交并自动筛查'}</Button>
          </div>
        </form>

        <aside className="border border-stone-200 bg-[#eef4ef] p-5 sm:p-6">
          <p className="text-xs font-semibold text-emerald-700">当前作品</p>
          {selectedBook ? (
            <>
              <div className="mt-3 flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-stone-950">{selectedBook.title}</h2><p className="mt-1 text-sm text-stone-600">{selectedBook.category} · {formatWordCount(selectedBook.words)}</p></div><NovelStatusBadge status={selectedBook.status} /></div>
              <p className="mt-5 text-sm leading-6 text-stone-600">章节提交后会先经过自动筛查；完整作品仍需站长人工审核才会在线上书城显示。</p>
              <div className="mt-5 border-l-2 border-emerald-700 bg-white/70 px-4 py-3" aria-labelledby="book-status-feedback-heading">
                <p id="book-status-feedback-heading" className="text-xs font-semibold text-emerald-700">站长处置反馈</p>
                {bookStatusAuditsLoading ? <Skeleton className="mt-3 h-12 rounded-none bg-stone-100" /> : null}
                {bookStatusAuditsError ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm leading-6 text-rose-800">处置反馈暂时无法显示：{bookStatusAuditsError}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadBookStatusAudits(selectedBook.id, bookStatusAuditPageIndex)} className="h-auto rounded-none border-rose-200 bg-white px-2.5 py-1.5 text-rose-800 hover:border-rose-500 hover:text-rose-900"><RefreshCw size={14} aria-hidden="true" />重试</Button>
                  </div>
                ) : null}
                {!bookStatusAuditsLoading && !bookStatusAuditsError && bookStatusAudits.length === 0 ? <p className="mt-2 text-sm leading-6 text-stone-600">当前没有下线或恢复处置记录。</p> : null}
                {!bookStatusAuditsLoading && !bookStatusAuditsError && bookStatusAudits.length > 0 ? (
                  <>
                    <ol className="mt-3 space-y-3">{bookStatusAudits.map((audit) => <li key={audit.id} className="text-sm leading-6 text-stone-700"><div className="flex flex-wrap items-center gap-2"><strong className="text-stone-950">{audit.action === 'TAKEDOWN' ? '作品已下线' : '已提交重新审核'}</strong><span>{audit.previousStatus} → {audit.status}</span><time className="text-xs text-stone-500" dateTime={audit.createdAt}>{formatCommentTime(audit.createdAt) || '时间未知'}</time></div><p className="mt-1 whitespace-pre-wrap">{audit.reason}</p></li>)}</ol>
                  </>
                ) : null}
                {!bookStatusAuditsLoading && !bookStatusAuditsError && bookStatusAuditPage ? <FeedbackPagination label="作品处置反馈" meta={bookStatusAuditPage.meta} loading={bookStatusAuditsLoading} onPageChange={setBookStatusAuditPageIndex} /> : null}
              </div>
              {['DRAFT', 'REJECTED'].includes(selectedBook.status) ? <Button type="button" variant="outline" onClick={() => void submitBook()} disabled={pendingAction !== undefined} className="mt-6 h-auto rounded-none border-stone-800 bg-white px-4 py-2.5 text-stone-800 hover:border-emerald-700 hover:text-emerald-800 disabled:cursor-wait"><Send size={16} aria-hidden="true" />{pendingAction === 'submit-book' ? '提交中' : '提交完整作品'}</Button> : <p className="mt-5 text-xs leading-5 text-stone-600">{selectedBook.status === 'OFFLINE' ? '该作品已下线，等待站长根据处置反馈决定是否重新进入审核。' : '该作品已进入审核或发布流程，当前仅可查看审核与处置反馈。'}</p>}

              <div className="mt-6 border-t border-emerald-950/10 pt-5">
                <div className="flex items-start gap-2"><CalendarClock className="mt-0.5 text-emerald-700" size={18} aria-hidden="true" /><div><p className="text-xs font-semibold text-emerald-700">草稿排期</p><h2 className="mt-1 text-lg font-semibold text-stone-950">选择存稿，设置未来发布时间</h2></div></div>
                {draftChapters.length === 0 ? <p className="mt-3 text-sm leading-6 text-stone-600">尚无可排期的草稿。先在选定卷册中保存一章内容。</p> : (
                  <form onSubmit={scheduleDraft} className="mt-4">
                    <Label id="draft-chapter-label" className="text-stone-700">选择草稿</Label>
                    <Select value={selectedDraftId?.toString() ?? ''} onValueChange={(value) => setSelectedDraftId(Number(value))}>
                      <SelectTrigger aria-labelledby="draft-chapter-label" aria-label="选择草稿" className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"><SelectValue placeholder="请选择草稿" /></SelectTrigger>
                      <SelectContent className="rounded-none border-stone-300 bg-white text-stone-900">
                        {draftChapters.map((chapter) => <SelectItem key={chapter.id} value={chapter.id.toString()}>第 {chapter.orderNo} 章 · {chapter.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="mt-4">
                      <Label htmlFor="publish-at" className="text-stone-700">发布时间</Label>
                      <Input id="publish-at" aria-label="发布时间" type="datetime-local" required value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
                    </div>
                    <Button type="submit" disabled={pendingAction !== undefined || !selectedDraftId} className="mt-4 h-auto rounded-none bg-emerald-700 px-4 py-2.5 hover:bg-emerald-800 disabled:cursor-wait"><CalendarClock size={16} aria-hidden="true" />{pendingAction === 'schedule' ? '排期中' : '安排定时发布'}</Button>
                    <p className="mt-3 text-xs leading-5 text-stone-500">到达发布时间后，系统会再次进行内容筛查；命中风险内容将转入人工复核。</p>
                  </form>
                )}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-stone-600">创建或选择一部作品后，可以继续写作、管理卷册并安排章节发布时间。</p>
          )}
        </aside>
      </section>

      <section className="mt-7 border border-stone-200 bg-white" aria-labelledby="author-feedback-heading">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">读者反馈</p>
            <h2 id="author-feedback-heading" className="mt-1 text-xl font-semibold text-stone-950">{selectedBook ? `《${selectedBook.title}》的互动反馈` : '作品互动反馈'}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">仅展示当前作者作品的评论，以及读者明确发起分享的段评。待审核内容可提交处理建议，最终公开或驳回仍由站长决定。</p>
          </div>
          <span className="text-sm text-stone-500">{selectedBook ? '作者建议不改变审核状态' : '选择作品后查看反馈'}</span>
        </div>

        <Tabs value={feedbackTab} onValueChange={(value) => {
          if (value === 'comments' || value === 'annotations') setFeedbackTab(value);
        }} className="gap-0">
          <TabsList aria-label="读者反馈类型" className="h-auto w-full justify-start gap-1 rounded-none border-b border-stone-200 bg-white p-3">
            <TabsTrigger value="comments" disabled={!selectedBook} className="h-9 flex-none rounded-none px-3 text-stone-600 data-[state=active]:border-emerald-700 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-900">
              <MessageSquareText size={16} aria-hidden="true" />读者评论
            </TabsTrigger>
            <TabsTrigger value="annotations" disabled={!selectedBook} className="h-9 flex-none rounded-none px-3 text-stone-600 data-[state=active]:border-emerald-700 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-900">
              <Highlighter size={16} aria-hidden="true" />分享段评
            </TabsTrigger>
          </TabsList>

          <TabsContent value="comments" className="mt-0">
            {!selectedBook ? <FeedbackSelectionEmpty icon="comments" /> : null}
            {selectedBook && commentsLoading ? <FeedbackLoading label="正在加载评论..." /> : null}
            {selectedBook && !commentsLoading && commentError ? (
              <FeedbackError message={`评论无法显示：${commentError}`} onRetry={() => void loadAuthorComments(selectedBook.id, commentPageIndex)} />
            ) : null}
            {selectedBook && !commentsLoading && !commentError && commentPage?.items.length === 0 ? (
              <FeedbackEmpty icon="comments" title="暂时还没有评论" description="待审核、已公开和未通过的评论都会在这里显示。" />
            ) : null}
            {selectedBook && !commentsLoading && !commentError && commentPage && commentPage.items.length > 0 ? (
              <>
                <Table className="min-w-[860px]">
                  <TableCaption className="sr-only">当前作品的读者评论及其审核状态。</TableCaption>
                  <TableHeader className="border-stone-100 bg-stone-50 text-stone-600">
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableHead className="px-4 py-3">读者</TableHead>
                      <TableHead className="px-4 py-3">位置</TableHead>
                      <TableHead className="px-4 py-3">评论内容</TableHead>
                      <TableHead className="px-4 py-3">状态</TableHead>
                      <TableHead className="px-4 py-3">处理建议</TableHead>
                      <TableHead className="px-4 py-3">时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commentPage.items.map((comment) => (
                      <TableRow key={comment.id} className="border-stone-100 hover:bg-stone-50">
                        <TableCell className="whitespace-nowrap px-4 py-4 font-medium text-stone-900">{comment.authorName}</TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-4 text-sm text-stone-600">{comment.chapterId ? `章节 #${comment.chapterId}` : '书评'}</TableCell>
                        <TableCell className="max-w-xl px-4 py-4 text-sm leading-6 text-stone-700"><span className="block whitespace-pre-wrap">{comment.content}</span></TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-4"><InteractionStatusBadge status={comment.status} /></TableCell>
                        <TableCell className="min-w-72 px-4 py-4 align-top">
                          {comment.status === 'PENDING_REVIEW' ? (
                            <div className="space-y-2">
                              <Label htmlFor={`comment-moderation-advice-${comment.id}`} className="sr-only">评论 {comment.id} 的审核建议说明</Label>
                              <Input
                                id={`comment-moderation-advice-${comment.id}`}
                                aria-label={`评论 ${comment.id} 的审核建议说明`}
                                maxLength={1024}
                                value={moderationAdviceReasons[`comments-${comment.id}`] ?? comment.authorModerationAdvice?.reason ?? ''}
                                onChange={(event) => setModerationAdviceReasons((current) => ({ ...current, [`comments-${comment.id}`]: event.target.value }))}
                                className="h-9 rounded-none border-stone-300 bg-white px-2 text-sm text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"
                                placeholder="说明建议理由"
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" size="sm" aria-label={`建议站长公开评论 ${comment.id}`} disabled={pendingAction === `moderation-advice-comments-${comment.id}`} onClick={() => void submitModerationAdvice('comments', comment.id, true)} className="h-auto rounded-none border-emerald-300 bg-white px-2.5 py-1.5 text-emerald-800 hover:border-emerald-700 hover:text-emerald-950">建议公开</Button>
                                <Button type="button" variant="outline" size="sm" aria-label={`建议站长驳回评论 ${comment.id}`} disabled={pendingAction === `moderation-advice-comments-${comment.id}`} onClick={() => void submitModerationAdvice('comments', comment.id, false)} className="h-auto rounded-none border-rose-200 bg-white px-2.5 py-1.5 text-rose-700 hover:border-rose-500 hover:text-rose-900">建议驳回</Button>
                              </div>
                            </div>
                          ) : comment.authorModerationAdvice ? (
                            <p className="text-xs leading-5 text-stone-600">已建议{comment.authorModerationAdvice.recommendation === 'RECOMMEND_VISIBLE' ? '公开' : '驳回'}，最终状态由站长决定。</p>
                          ) : <p className="text-xs leading-5 text-stone-500">仅待审核内容可提交建议。</p>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-4 text-xs text-stone-500"><time dateTime={comment.createdAt}>{formatCommentTime(comment.createdAt) || '时间未知'}</time></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <FeedbackPagination label="评论" meta={commentPage.meta} loading={commentsLoading} onPageChange={setCommentPageIndex} />
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="annotations" className="mt-0">
            {!selectedBook ? <FeedbackSelectionEmpty icon="annotations" /> : null}
            {selectedBook && annotationsLoading ? <FeedbackLoading label="正在加载分享段评..." /> : null}
            {selectedBook && !annotationsLoading && annotationError ? (
              <FeedbackError message={`分享段评无法显示：${annotationError}`} onRetry={() => void loadAuthorAnnotations(selectedBook.id, annotationPageIndex)} />
            ) : null}
            {selectedBook && !annotationsLoading && !annotationError && sharedAnnotations.length === 0 ? (
              <FeedbackEmpty icon="annotations" title="暂时没有分享段评" description="这里只会展示读者明确发起分享的段评，不展示私密标注。" />
            ) : null}
            {selectedBook && !annotationsLoading && !annotationError && annotationPage && sharedAnnotations.length > 0 ? (
              <>
                <Table className="min-w-[980px]">
                  <TableCaption className="sr-only">当前作品中读者明确分享的段评及其审核状态。</TableCaption>
                  <TableHeader className="border-stone-100 bg-stone-50 text-stone-600">
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableHead className="px-4 py-3">读者</TableHead>
                      <TableHead className="px-4 py-3">位置</TableHead>
                      <TableHead className="px-4 py-3">选中文本</TableHead>
                      <TableHead className="px-4 py-3">段评</TableHead>
                      <TableHead className="px-4 py-3">状态</TableHead>
                      <TableHead className="px-4 py-3">处理建议</TableHead>
                      <TableHead className="px-4 py-3">时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sharedAnnotations.map((annotation) => (
                      <TableRow key={annotation.id} className="border-stone-100 hover:bg-stone-50">
                        <TableCell className="whitespace-nowrap px-4 py-4 font-medium text-stone-900">{annotation.authorName}</TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-4 text-sm text-stone-600">章节 #{annotation.chapterId} · 段 {annotation.paragraphIndex + 1}</TableCell>
                        <TableCell className="max-w-sm px-4 py-4 text-sm leading-6 text-stone-700"><span className="block whitespace-pre-wrap">{annotation.selectedText}</span></TableCell>
                        <TableCell className="max-w-sm px-4 py-4 text-sm leading-6 text-stone-700"><span className="block whitespace-pre-wrap">{annotation.note || '—'}</span></TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-4"><InteractionStatusBadge status={annotation.status} /></TableCell>
                        <TableCell className="min-w-72 px-4 py-4 align-top">
                          {annotation.status === 'PENDING_REVIEW' ? (
                            <div className="space-y-2">
                              <Label htmlFor={`annotation-moderation-advice-${annotation.id}`} className="sr-only">段评 {annotation.id} 的审核建议说明</Label>
                              <Input
                                id={`annotation-moderation-advice-${annotation.id}`}
                                aria-label={`段评 ${annotation.id} 的审核建议说明`}
                                maxLength={1024}
                                value={moderationAdviceReasons[`annotations-${annotation.id}`] ?? annotation.authorModerationAdvice?.reason ?? ''}
                                onChange={(event) => setModerationAdviceReasons((current) => ({ ...current, [`annotations-${annotation.id}`]: event.target.value }))}
                                className="h-9 rounded-none border-stone-300 bg-white px-2 text-sm text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"
                                placeholder="说明建议理由"
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" size="sm" aria-label={`建议站长公开段评 ${annotation.id}`} disabled={pendingAction === `moderation-advice-annotations-${annotation.id}`} onClick={() => void submitModerationAdvice('annotations', annotation.id, true)} className="h-auto rounded-none border-emerald-300 bg-white px-2.5 py-1.5 text-emerald-800 hover:border-emerald-700 hover:text-emerald-950">建议公开</Button>
                                <Button type="button" variant="outline" size="sm" aria-label={`建议站长驳回段评 ${annotation.id}`} disabled={pendingAction === `moderation-advice-annotations-${annotation.id}`} onClick={() => void submitModerationAdvice('annotations', annotation.id, false)} className="h-auto rounded-none border-rose-200 bg-white px-2.5 py-1.5 text-rose-700 hover:border-rose-500 hover:text-rose-900">建议驳回</Button>
                              </div>
                            </div>
                          ) : annotation.authorModerationAdvice ? (
                            <p className="text-xs leading-5 text-stone-600">已建议{annotation.authorModerationAdvice.recommendation === 'RECOMMEND_VISIBLE' ? '公开' : '驳回'}，最终状态由站长决定。</p>
                          ) : <p className="text-xs leading-5 text-stone-500">仅待审核内容可提交建议。</p>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-4 text-xs text-stone-500"><time dateTime={annotation.createdAt}>{formatCommentTime(annotation.createdAt) || '时间未知'}</time></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <FeedbackPagination label="分享段评" meta={annotationPage.meta} loading={annotationsLoading} onPageChange={setAnnotationPageIndex} />
              </>
            ) : null}
          </TabsContent>
        </Tabs>
      </section>

      <section className="mt-7 border border-stone-200 bg-white" aria-labelledby="author-rewards-heading">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">创作收益</p>
            <h2 id="author-rewards-heading" className="mt-1 text-xl font-semibold text-stone-950">读者打赏记录</h2>
          </div>
          <span className="text-sm text-stone-500" aria-live="polite">{rewardLoading ? '正在加载' : rewardReport ? `共 ${rewardReport.meta.total.toLocaleString('zh-CN')} 条` : '暂未加载'}</span>
        </div>

        <div className="grid gap-5 border-b border-stone-100 px-5 py-5 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)] lg:items-end">
          <dl className="grid grid-cols-2 gap-5">
            <div>
              <dt className="text-sm text-stone-600">累计打赏</dt>
              <dd className="mt-1 text-2xl font-semibold text-stone-950">{rewardReport ? rewardReport.summary.totalTokens.toLocaleString('zh-CN') : '—'}<span className="ml-1 text-sm font-medium text-stone-500">代币</span></dd>
            </div>
            <div>
              <dt className="text-sm text-stone-600">打赏次数</dt>
              <dd className="mt-1 text-2xl font-semibold text-stone-950">{rewardReport ? rewardReport.summary.rewardCount.toLocaleString('zh-CN') : '—'}<span className="ml-1 text-sm font-medium text-stone-500">次</span></dd>
            </div>
          </dl>

          <form onSubmit={applyRewardFilters} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(150px,1fr)_minmax(128px,.78fr)_minmax(128px,.78fr)_auto_auto] xl:items-end">
            <div>
              <Label id="reward-book-label" className="text-stone-700">作品</Label>
              <Select value={rewardBookId?.toString() ?? 'all'} onValueChange={(value) => setRewardBookId(value === 'all' ? undefined : Number(value))}>
                <SelectTrigger aria-labelledby="reward-book-label" aria-label="打赏记录作品筛选" className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none border-stone-300 bg-white text-stone-900">
                  <SelectItem value="all">全部作品</SelectItem>
                  {books.map((book) => <SelectItem key={book.id} value={book.id.toString()}>{book.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reward-from" className="text-stone-700">起始日期</Label>
              <Input id="reward-from" aria-label="打赏记录起始日期" type="date" value={rewardFrom} onChange={(event) => setRewardFrom(event.target.value)} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
            </div>
            <div>
              <Label htmlFor="reward-to" className="text-stone-700">结束日期</Label>
              <Input id="reward-to" aria-label="打赏记录结束日期" type="date" value={rewardTo} onChange={(event) => setRewardTo(event.target.value)} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
            </div>
            <Button type="submit" disabled={rewardLoading} className="h-10 rounded-none bg-emerald-700 px-3 hover:bg-emerald-800 disabled:cursor-wait"><RefreshCw size={16} aria-hidden="true" className={rewardLoading ? 'animate-spin' : ''} />查询</Button>
            <Button type="button" variant="outline" onClick={resetRewardFilters} disabled={rewardLoading && !rewardReport} className="h-10 rounded-none border-stone-300 bg-white px-3 text-stone-700 hover:border-emerald-700 hover:text-emerald-800">重置</Button>
          </form>
        </div>

        {rewardError ? (
          <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <InlineNotice tone="error">打赏记录无法显示：{rewardError}</InlineNotice>
            <Button type="button" variant="outline" onClick={() => void loadRewardReport(rewardQuery)} className="h-auto shrink-0 rounded-none border-stone-300 bg-white px-3 py-2 text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><RefreshCw size={16} aria-hidden="true" />重试</Button>
          </div>
        ) : null}
        {rewardLoading && !rewardReport ? <div className="space-y-3 px-5 py-5" aria-busy="true"><span className="sr-only" role="status">正在加载打赏记录...</span><Skeleton className="h-10 rounded-none bg-stone-100" />{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-14 rounded-none bg-stone-100" />)}</div> : null}
        {!rewardLoading && !rewardError && rewardReport && rewardReport.items.length === 0 ? <div className="px-5 py-10 text-center"><Gift className="mx-auto text-stone-400" size={27} aria-hidden="true" /><p className="mt-3 font-medium text-stone-800">暂时没有符合条件的打赏记录</p><p className="mt-1 text-sm text-stone-500">调整作品或日期后可继续查询。</p></div> : null}
        {!rewardError && rewardReport && (rewardReport.items.length > 0 || rewardReport.meta.total > 0) ? (
          <div className="px-5 py-1">
            {rewardReport.items.length > 0 ? (
              <Table className="min-w-[620px]">
                <TableCaption className="sr-only">读者打赏记录，金额单位为平台代币。</TableCaption>
                <TableHeader className="border-stone-100 bg-stone-50 text-stone-600">
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableHead className="px-4 py-3">时间</TableHead>
                    <TableHead className="px-4 py-3">作品</TableHead>
                    <TableHead className="px-4 py-3">读者</TableHead>
                    <TableHead className="px-4 py-3 text-right">代币</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rewardReport.items.map((record) => (
                    <TableRow key={record.id} className="border-stone-100 hover:bg-stone-50">
                      <TableCell className="whitespace-nowrap px-4 py-4 text-xs text-stone-600"><time dateTime={record.rewardedAt}>{formatRewardTime(record.rewardedAt)}</time></TableCell>
                      <TableCell className="max-w-64 px-4 py-4 font-medium text-stone-900"><span className="block truncate">{record.bookTitle}</span></TableCell>
                      <TableCell className="whitespace-nowrap px-4 py-4 text-stone-700">读者 #{record.rewarderUserId}</TableCell>
                      <TableCell className="whitespace-nowrap px-4 py-4 text-right font-semibold text-emerald-800">+{record.tokenAmount.toLocaleString('zh-CN')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
            <div className="flex flex-col gap-3 border-t border-stone-100 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-stone-500">按 {rewardReport.meta.timeZone} 自然日统计</p>
              {rewardReport.meta.total > rewardReport.meta.size || rewardReport.meta.page > 0 ? (() => {
                const previousDisabled = rewardLoading || rewardReport.meta.page === 0;
                const nextDisabled = rewardLoading || (rewardReport.meta.page + 1) * rewardReport.meta.size >= rewardReport.meta.total;

                const changeRewardPage = (event: React.MouseEvent<HTMLAnchorElement>, offset: number, disabled: boolean) => {
                  event.preventDefault();
                  if (!disabled) moveRewardPage(offset);
                };

                return (
                  <Pagination aria-label="打赏记录分页" className="mx-0 w-auto justify-start sm:justify-end">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#author-rewards-heading"
                          onClick={(event) => changeRewardPage(event, -1, previousDisabled)}
                          aria-disabled={previousDisabled}
                          tabIndex={previousDisabled ? -1 : undefined}
                          className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50"
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <span className="inline-flex h-9 min-w-20 items-center justify-center px-2 text-center text-stone-600" aria-live="polite">第 {rewardReport.meta.page + 1} 页</span>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          href="#author-rewards-heading"
                          onClick={(event) => changeRewardPage(event, 1, nextDisabled)}
                          aria-disabled={nextDisabled}
                          tabIndex={nextDisabled ? -1 : undefined}
                          className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50"
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                );
              })() : null}
            </div>
          </div>
        ) : null}
      </section>

      <Dialog open={Boolean(editingBook)} onOpenChange={(open) => { if (!open) closeBookEditor(); }}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-none border-stone-300 bg-white text-stone-900 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingBook && canEditBook(editingBook) ? '修改作品信息' : '管理作品封面'}</DialogTitle>
            <DialogDescription>{editingBook?.status === 'PUBLISHED' ? '已发布作品的文字信息保持不变。上传新封面会创建候选，当前公开封面会保留到站长批准。' : '仅草稿或已驳回的作品可以修改信息。保存后仍需按当前审核状态继续处理。'}</DialogDescription>
          </DialogHeader>
          {editError ? <div role="alert"><InlineNotice tone="error">{editError}</InlineNotice></div> : null}
          <form onSubmit={updateBook}>
            <div>
              <Label htmlFor="edit-book-title" className="text-stone-700">作品名称</Label>
              <Input id="edit-book-title" aria-label="编辑作品名称" required disabled={!editingBook || !canEditBook(editingBook)} value={bookEditTitle} onChange={(event) => setBookEditTitle(event.target.value)} className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Label id="edit-book-category-label" className="text-stone-700">作品分类</Label>
                <Select value={bookEditCategory} onValueChange={setBookEditCategory} disabled={!editingBook || !canEditBook(editingBook)}>
                  <SelectTrigger aria-labelledby="edit-book-category-label" aria-label="编辑作品分类" className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none border-stone-300 bg-white text-stone-900">
                    {bookCategories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label id="edit-book-serial-status-label" className="text-stone-700">连载状态</Label>
                <Select value={bookEditSerialStatus} onValueChange={setBookEditSerialStatus} disabled={!editingBook || !canEditBook(editingBook)}>
                  <SelectTrigger aria-labelledby="edit-book-serial-status-label" aria-label="编辑连载状态" className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none border-stone-300 bg-white text-stone-900">
                    {serialStatuses.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4">
              <Label htmlFor="edit-book-synopsis" className="text-stone-700">作品简介</Label>
              <Textarea id="edit-book-synopsis" aria-label="编辑作品简介" required disabled={!editingBook || !canEditBook(editingBook)} value={bookEditSynopsis} onChange={(event) => setBookEditSynopsis(event.target.value)} className="mt-2 h-32 resize-y rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
            </div>
            <div className="mt-5 border-t border-stone-200 pt-5">
              <div className="flex gap-4">
                <BookCover cover={editingBook?.cover} title={editingBook?.title ?? '作品'} category={editingBook?.category} showLabel={false} className="h-24 w-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Label htmlFor="edit-book-cover" className="text-stone-700">作品封面</Label>
                  <Input ref={bookCoverInputRef} id="edit-book-cover" aria-label="上传作品封面" type="file" accept="image/png,image/jpeg" onChange={(event) => setBookCoverFile(event.target.files?.[0])} disabled={!editingBook || !canManageBookCover(editingBook) || pendingAction !== undefined} className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
                  <p className="mt-2 text-xs leading-5 text-stone-500">仅 PNG 或 JPEG，最大 5 MB；上传后由服务端验证图片内容。</p>
                  {bookCoverFile ? <p className="mt-1 truncate text-xs text-stone-600">已选择：{bookCoverFile.name}</p> : null}
                  {coverUploadCandidate ? <p className="mt-2 text-xs leading-5 text-amber-800" role="status">封面候选 #{coverUploadCandidate.id} 待审核：当前公开封面保持不变。</p> : null}
                  <Button type="button" variant="outline" onClick={() => void uploadBookCover()} disabled={!bookCoverFile || !editingBook || !canManageBookCover(editingBook) || pendingAction !== undefined} className="mt-3 h-auto rounded-none border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:border-emerald-700 hover:text-emerald-800 disabled:cursor-wait"><ImageUp size={16} aria-hidden="true" />{pendingAction === 'upload-cover' ? '上传中' : '上传新封面'}</Button>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={closeBookEditor} disabled={pendingAction === 'update-book' || pendingAction === 'upload-cover'} className="rounded-none border-stone-300 bg-white text-stone-700">取消</Button>
              {editingBook && canEditBook(editingBook) ? <Button type="submit" disabled={pendingAction === 'update-book' || pendingAction === 'upload-cover'} className="rounded-none bg-emerald-700 hover:bg-emerald-800 disabled:cursor-wait"><Save size={16} aria-hidden="true" />{pendingAction === 'update-book' ? '保存中' : '保存作品信息'}</Button> : null}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingChapter)} onOpenChange={(open) => { if (!open) closeChapterEditor(); }}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-none border-stone-300 bg-white text-stone-900 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>修改章节</DialogTitle>
            <DialogDescription>{editingChapter?.status === 'PUBLISHED' ? '修改已发布章节会创建修订候选等待审核；当前已发布正文持续对读者可读，批准后才会原子替换。' : '草稿和已排期章节会保留现有的发布状态与发布时间。'}</DialogDescription>
          </DialogHeader>
          {editError ? <div role="alert"><InlineNotice tone="error">{editError}</InlineNotice></div> : null}
          <form onSubmit={updateChapter}>
            <div>
              <Label htmlFor="edit-chapter-title" className="text-stone-700">章节标题</Label>
              <Input id="edit-chapter-title" aria-label="编辑章节标题" required value={chapterEditTitle} onChange={(event) => setChapterEditTitle(event.target.value)} className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
            </div>
            <div className="mt-4">
              <Label id="edit-chapter-volume-label" className="text-stone-700">归属卷册</Label>
              <Select value={chapterEditVolumeId?.toString() ?? 'current'} onValueChange={(value) => setChapterEditVolumeId(value === 'current' ? undefined : Number(value))}>
                <SelectTrigger aria-labelledby="edit-chapter-volume-label" aria-label="编辑章节归属卷册" className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none border-stone-300 bg-white text-stone-900">
                  <SelectItem value="current">保持当前归属</SelectItem>
                  {volumes.map((volume) => <SelectItem key={volume.id} value={volume.id.toString()}>第 {volume.orderNo} 卷 · {volume.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4">
              <Label htmlFor="edit-chapter-content" className="text-stone-700">正文</Label>
              <Textarea id="edit-chapter-content" aria-label="编辑章节正文" required value={chapterEditContent} onChange={(event) => setChapterEditContent(event.target.value)} className="mt-2 h-64 resize-y rounded-none border-stone-300 bg-white leading-7 text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={closeChapterEditor} disabled={pendingAction === 'update-chapter'} className="rounded-none border-stone-300 bg-white text-stone-700">取消</Button>
              <Button type="submit" disabled={pendingAction === 'update-chapter'} className="rounded-none bg-emerald-700 hover:bg-emerald-800 disabled:cursor-wait"><Save size={16} aria-hidden="true" />{pendingAction === 'update-chapter' ? '保存中' : '保存章节'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingVolume)} onOpenChange={(open) => { if (!open) closeVolumeEditor(); }}>
        <DialogContent className="rounded-none border-stone-300 bg-white text-stone-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改卷册</DialogTitle>
            <DialogDescription>卷册名称会同步显示在目录和章节归属中，不会改动章节正文或发布状态。</DialogDescription>
          </DialogHeader>
          {editError ? <div role="alert"><InlineNotice tone="error">{editError}</InlineNotice></div> : null}
          <form onSubmit={updateVolume}>
            <Label htmlFor="edit-volume-title" className="text-stone-700">卷册名称</Label>
            <Input id="edit-volume-title" aria-label="编辑卷册名称" required value={volumeEditTitle} onChange={(event) => setVolumeEditTitle(event.target.value)} className="mt-2 h-11 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={closeVolumeEditor} disabled={pendingAction === 'update-volume'} className="rounded-none border-stone-300 bg-white text-stone-700">取消</Button>
              <Button type="submit" disabled={pendingAction === 'update-volume'} className="rounded-none bg-emerald-700 hover:bg-emerald-800 disabled:cursor-wait"><Save size={16} aria-hidden="true" />{pendingAction === 'update-volume' ? '保存中' : '保存卷册'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) closeDeleteConfirmation(); }}>
        <AlertDialogContent className="rounded-none border-stone-300 bg-white text-stone-900">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.kind === 'book' ? '删除作品' : deleteTarget?.kind === 'volume' ? '删除卷册' : '删除章节'}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === 'book'
                ? `确定删除《${deleteTarget.item.title}》吗？只有未进入发布审核、且没有读者或交易记录的作品可以删除。`
                : deleteTarget?.kind === 'volume'
                  ? `确定删除《${deleteTarget.item.title}》吗？其中的章节会保留全部正文和发布状态，但改为未归入卷册。`
                  : `确定删除《${deleteTarget?.item.title ?? ''}》吗？只有草稿或已排期章节且没有读者记录时，服务端才会允许删除。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <div role="alert"><InlineNotice tone="error">{deleteError}</InlineNotice></div> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction === 'delete-book' || pendingAction === 'delete-chapter' || pendingAction === 'delete-volume'} className="rounded-none border-stone-300 bg-white text-stone-700">取消</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={() => void deleteTargetItem()} disabled={pendingAction === 'delete-book' || pendingAction === 'delete-chapter' || pendingAction === 'delete-volume'} className="rounded-none disabled:cursor-wait"><Trash2 size={16} aria-hidden="true" />{pendingAction === 'delete-book' || pendingAction === 'delete-chapter' || pendingAction === 'delete-volume' ? '删除中' : '确认删除'}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NovelShell>
  );
}
