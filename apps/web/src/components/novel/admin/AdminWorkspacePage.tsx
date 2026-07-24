'use client';

import Link from 'next/link';
import { BookOpen, Check, ClipboardCheck, Clock3, History, MessageSquareText, Plus, Power, Save, ShieldAlert, ShieldCheck, TextQuote, Trash2, Users, X } from 'lucide-react';
import { FormEvent, MouseEvent, useCallback, useEffect, useState } from 'react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/app/components/ui/pagination';
import { InlineNotice, NovelStatusBadge, formatWordCount } from '@/components/novel/NovelShell';
import { AdminOperationsPanels } from '@/components/novel/AdminOperationsPanels';
import { CommercialRulesPanel } from '@/components/novel/CommercialRulesPanel';
import { EmailDeliverySettingsPanel } from '@/components/novel/EmailDeliverySettingsPanel';
import { EditorialOperationsPanel } from '@/components/novel/EditorialOperationsPanel';
import { HomeCarouselOperationsPanel } from '@/components/novel/HomeCarouselOperationsPanel';
import { CoverCandidateReviewPanel } from '@/components/novel/CoverCandidateReviewPanel';
import { AuthorApplication, AuthorApplicationPage, Book, BookPresentation, BookPresentationPage, BookStatusAuditPage, ChapterCandidate, ModerationReviewQueueItem, ModerationReviewQueuePage, ParagraphAnnotation, ParagraphAnnotationPage, PlatformRetentionReport, SensitiveWord, SensitiveWordAudit, SensitiveWordAuditPage, SensitiveWordPage, novelApi } from '@/features/novel/api';

type Dashboard = { activeReaders: number; todayReads: number; publishedBooks: number; pendingReviews: number; auditLog: string[] };
type Comment = { id: number; bookId: number; chapterId: number | null; userId: number; authorName: string; content: string; status: string; createdAt: string };
type CommentPage = { items: Comment[]; meta: { total: number; page: number; size: number } };
type RedemptionCode = {
  code: string;
  batchNo: string;
  benefitType: string;
  tokenAmount: number;
  bookId: number | null;
  membershipDays: number;
  status: string;
  expiresAt: string | null;
  redeemedByUserId: number | null;
  redeemedAt: string | null;
};
type RedemptionCodePage = { items: RedemptionCode[]; page: number; size: number; total: number };
type GeneratedRedemptionCodeBatch = { batchNo: string; codes: RedemptionCode[] };
type RedemptionBenefitsDraft = { tokenAmount: string; membershipDays: string; bookId: string; expiresAt: string };
type Notice = { message: string; tone: 'success' | 'error' };
type PageMeta = { total: number; page: number; size: number };

const BOOK_PAGE_SIZE = 12;
const REVIEW_PAGE_SIZE = 20;

function authorApplicationPath(page: number) {
  return `admin/author-applications?page=${page}&size=${REVIEW_PAGE_SIZE}`;
}

export type AdminWorkspaceView =
  | 'all'
  | 'overview'
  | 'review-books'
  | 'review-covers'
  | 'review-comments'
  | 'review-annotations'
  | 'content-books'
  | 'content-words'
  | 'accounts-applications'
  | 'operations-redemption-codes'
  | 'operations-discovery'
  | 'operations-home-carousel'
  | 'analytics-retention'
  | 'settings-commercial'
  | 'settings-email'
  | 'accounts-users'
  | 'content-catalog';

const emptyRedemptionBenefits: RedemptionBenefitsDraft = { tokenAmount: '', membershipDays: '', bookId: '', expiresAt: '' };

function optionalInteger(value: string, label: string, minimum: number) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${label}必须是${minimum === 0 ? '非负' : '正'}整数。`);
  return parsed;
}

function redemptionBenefitsPayload(values: RedemptionBenefitsDraft) {
  const tokenAmount = optionalInteger(values.tokenAmount, '代币数量', 0);
  const membershipDays = optionalInteger(values.membershipDays, '会员天数', 0);
  const bookId = optionalInteger(values.bookId, '书籍 ID', 1);
  const expiresAt = values.expiresAt ? new Date(values.expiresAt) : undefined;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new Error('到期时间格式无效。');
  if (!(tokenAmount || membershipDays || bookId)) throw new Error('请至少填写一种兑换权益。');
  return {
    tokenAmount: tokenAmount || undefined,
    membershipDays: membershipDays || undefined,
    bookId,
    expiresAt: expiresAt?.toISOString(),
  };
}

function formatRedemptionBenefits(code: RedemptionCode) {
  const benefits = [
    code.tokenAmount > 0 ? `${code.tokenAmount.toLocaleString('zh-CN')} 代币` : '',
    code.membershipDays > 0 ? `${code.membershipDays} 天会员` : '',
    code.bookId ? `书籍 #${code.bookId}` : '',
  ].filter(Boolean);
  return benefits.join(' + ') || code.benefitType;
}

function formatRedemptionTime(value: string | null) {
  if (!value) return '永久有效';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function formatRetentionRate(value: number | null) {
  return value === null ? '待观察' : `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)}%`;
}

function RedemptionStatusBadge({ status }: { status: string }) {
  const meta = {
    ACTIVE: { label: '可使用', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    REDEEMED: { label: '已核销', className: 'border-sky-200 bg-sky-50 text-sky-800' },
    DISABLED: { label: '已禁用', className: 'border-rose-200 bg-rose-50 text-rose-800' },
    EXPIRED: { label: '已到期', className: 'border-stone-300 bg-stone-100 text-stone-700' },
  }[status] ?? { label: status, className: 'border-stone-300 bg-stone-100 text-stone-700' };

  return <Badge variant="outline" className={`rounded-none ${meta.className}`}>{meta.label}</Badge>;
}

function pageWindow(current: number, totalPages: number) {
  const pages = new Set([0, totalPages - 1, current - 1, current, current + 1]);
  return [...pages]
    .filter((page) => page >= 0 && page < totalPages)
    .sort((left, right) => left - right)
    .reduce<Array<number | 'ellipsis'>>((items, page) => {
      const previous = items.at(-1);
      if (typeof previous === 'number' && page - previous > 1) items.push('ellipsis');
      items.push(page);
      return items;
    }, []);
}

function PageNavigation({ meta, onPageChange, label }: { meta: PageMeta; onPageChange: (page: number) => void; label: string }) {
  const totalPages = Math.ceil(meta.total / meta.size);
  if (totalPages <= 1) return null;
  const navigate = (page: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (page >= 0 && page < totalPages && page !== meta.page) onPageChange(page);
  };
  const previousDisabled = meta.page === 0;
  const nextDisabled = meta.page >= totalPages - 1;

  return (
    <Pagination aria-label={label} className="border-t border-stone-100 px-4 py-4">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" aria-disabled={previousDisabled} tabIndex={previousDisabled ? -1 : undefined} onClick={navigate(meta.page - 1)} className={previousDisabled ? 'pointer-events-none opacity-40' : undefined} />
        </PaginationItem>
        {pageWindow(meta.page, totalPages).map((page, index) => page === 'ellipsis' ? (
          <PaginationItem key={`ellipsis-${index}`}><PaginationEllipsis /></PaginationItem>
        ) : (
          <PaginationItem key={page}>
            <PaginationLink href="#" isActive={page === meta.page} aria-label={`第 ${page + 1} 页`} onClick={navigate(page)}>{page + 1}</PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext href="#" aria-disabled={nextDisabled} tabIndex={nextDisabled ? -1 : undefined} onClick={navigate(meta.page + 1)} className={nextDisabled ? 'pointer-events-none opacity-40' : undefined} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function RedemptionBenefitFields({
  prefix,
  values,
  onChange,
}: {
  prefix: string;
  values: RedemptionBenefitsDraft;
  onChange: (field: keyof RedemptionBenefitsDraft, value: string) => void;
}) {
  const idPrefix = prefix === '生成' ? 'generate' : 'import';
  return (
    <fieldset className="mt-4 border-t border-stone-100 pt-4">
      <legend className="px-0 text-sm font-medium text-stone-800">兑换权益</legend>
      <p className="mt-1 text-xs leading-5 text-stone-500">代币、会员和书籍可组合，至少填写一项。</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`${idPrefix}-token-amount`} className="text-stone-700">{prefix}代币数量</Label>
          <Input id={`${idPrefix}-token-amount`} aria-label={`${prefix}代币数量`} type="number" min="0" step="1" inputMode="numeric" value={values.tokenAmount} onChange={(event) => onChange('tokenAmount', event.target.value)} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="例如 100" />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-membership-days`} className="text-stone-700">{prefix}会员天数</Label>
          <Input id={`${idPrefix}-membership-days`} aria-label={`${prefix}会员天数`} type="number" min="0" max="36500" step="1" inputMode="numeric" value={values.membershipDays} onChange={(event) => onChange('membershipDays', event.target.value)} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="例如 30" />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-book-id`} className="text-stone-700">{prefix}书籍 ID</Label>
          <Input id={`${idPrefix}-book-id`} aria-label={`${prefix}书籍 ID`} type="number" min="1" step="1" inputMode="numeric" value={values.bookId} onChange={(event) => onChange('bookId', event.target.value)} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="例如 7" />
        </div>
      </div>
      <div className="mt-3 max-w-xs">
        <Label htmlFor={`${idPrefix}-expires-at`} className="text-stone-700">{prefix}到期时间</Label>
        <Input id={`${idPrefix}-expires-at`} aria-label={`${prefix}到期时间`} type="datetime-local" value={values.expiresAt} onChange={(event) => onChange('expiresAt', event.target.value)} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
      </div>
    </fieldset>
  );
}

export function AdminWorkspacePage({ view = 'all' }: { view?: AdminWorkspaceView }) {
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [reviews, setReviews] = useState<BookPresentation[]>([]);
  const [reviewMeta, setReviewMeta] = useState<PageMeta>({ total: 0, page: 0, size: BOOK_PAGE_SIZE });
  const [reviewPage, setReviewPage] = useState(0);
  const [candidateReviews, setCandidateReviews] = useState<ModerationReviewQueueItem[]>([]);
  const [candidateMeta, setCandidateMeta] = useState<PageMeta>({ total: 0, page: 0, size: BOOK_PAGE_SIZE });
  const [candidatePage, setCandidatePage] = useState(0);
  const [candidateScope, setCandidateScope] = useState<'NEW_CHAPTER' | 'CHAPTER_REVISION'>('NEW_CHAPTER');
  const [candidateReasons, setCandidateReasons] = useState<Record<number, string>>({});
  const [availabilityBooks, setAvailabilityBooks] = useState<BookPresentation[]>([]);
  const [availabilityMeta, setAvailabilityMeta] = useState<PageMeta>({ total: 0, page: 0, size: BOOK_PAGE_SIZE });
  const [availabilityPage, setAvailabilityPage] = useState(0);
  const [bookActionReasons, setBookActionReasons] = useState<Record<number, string>>({});
  const [selectedBookStatusAuditId, setSelectedBookStatusAuditId] = useState<number>();
  const [bookStatusAuditPage, setBookStatusAuditPage] = useState<BookStatusAuditPage>();
  const [bookStatusAuditPageIndex, setBookStatusAuditPageIndex] = useState(0);
  const [bookStatusAuditsLoading, setBookStatusAuditsLoading] = useState(false);
  const [bookStatusAuditsError, setBookStatusAuditsError] = useState('');
  const [applications, setApplications] = useState<AuthorApplication[]>([]);
  const [applicationMeta, setApplicationMeta] = useState<PageMeta>({ total: 0, page: 0, size: REVIEW_PAGE_SIZE });
  const [applicationPage, setApplicationPage] = useState(0);
  const [commentReviews, setCommentReviews] = useState<Comment[]>([]);
  const [commentReviewMeta, setCommentReviewMeta] = useState<PageMeta>({ total: 0, page: 0, size: REVIEW_PAGE_SIZE });
  const [commentReviewPage, setCommentReviewPage] = useState(0);
  const [commentReasons, setCommentReasons] = useState<Record<number, string>>({});
  const [annotationReviews, setAnnotationReviews] = useState<ParagraphAnnotation[]>([]);
  const [annotationReviewMeta, setAnnotationReviewMeta] = useState<PageMeta>({ total: 0, page: 0, size: REVIEW_PAGE_SIZE });
  const [annotationReviewPage, setAnnotationReviewPage] = useState(0);
  const [annotationReasons, setAnnotationReasons] = useState<Record<number, string>>({});
  const [words, setWords] = useState<SensitiveWord[]>([]);
  const [wordMeta, setWordMeta] = useState<PageMeta>({ total: 0, page: 0, size: REVIEW_PAGE_SIZE });
  const [wordPage, setWordPage] = useState(0);
  const [word, setWord] = useState('');
  const [wordEdits, setWordEdits] = useState<Record<string, string>>({});
  const [wordReasons, setWordReasons] = useState<Record<string, string>>({});
  const [wordAudits, setWordAudits] = useState<SensitiveWordAudit[]>([]);
  const [wordAuditMeta, setWordAuditMeta] = useState<PageMeta>();
  const [wordAuditOpen, setWordAuditOpen] = useState(false);
  const [wordAuditsLoading, setWordAuditsLoading] = useState(false);
  const [wordAuditsError, setWordAuditsError] = useState('');
  const [redemptionCodes, setRedemptionCodes] = useState<RedemptionCode[]>([]);
  const [redemptionCodeMeta, setRedemptionCodeMeta] = useState<PageMeta>({ total: 0, page: 0, size: REVIEW_PAGE_SIZE });
  const [redemptionCodePage, setRedemptionCodePage] = useState(0);
  const [generateQuantity, setGenerateQuantity] = useState('10');
  const [generateBatchNo, setGenerateBatchNo] = useState('');
  const [generatePrefix, setGeneratePrefix] = useState('NVC');
  const [generateBenefits, setGenerateBenefits] = useState<RedemptionBenefitsDraft>(emptyRedemptionBenefits);
  const [importCode, setImportCode] = useState('');
  const [importBatchNo, setImportBatchNo] = useState('');
  const [importBenefits, setImportBenefits] = useState<RedemptionBenefitsDraft>(emptyRedemptionBenefits);
  const [generatedBatch, setGeneratedBatch] = useState<GeneratedRedemptionCodeBatch>();
  const [redemptionDialog, setRedemptionDialog] = useState<'generate' | 'import'>();
  const [retentionReport, setRetentionReport] = useState<PlatformRetentionReport>();
  const [retentionLoading, setRetentionLoading] = useState(true);
  const [retentionError, setRetentionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>();
  const [notice, setNotice] = useState<Notice>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === 'all') {
        const [nextDashboard, nextReviews, nextCandidateQueue, nextAvailabilityBooks, nextApplications, nextWords, nextCommentReviews, nextAnnotationReviews, nextRedemptionCodes] = await Promise.all([
          novelApi<Dashboard>('admin/dashboard', 'admin'),
          novelApi<BookPresentationPage>(`admin/reviews?page=${reviewPage}&size=${BOOK_PAGE_SIZE}`, 'admin'),
          novelApi<ModerationReviewQueuePage>(`admin/reviews/queue?scope=${candidateScope}&page=${candidatePage}&size=${BOOK_PAGE_SIZE}`, 'admin'),
          novelApi<BookPresentationPage>(`admin/books?page=${availabilityPage}&size=${BOOK_PAGE_SIZE}`, 'admin'),
          novelApi<AuthorApplicationPage>(authorApplicationPath(applicationPage), 'admin'),
          novelApi<SensitiveWordPage>(`admin/sensitive-words?page=${wordPage}&size=${REVIEW_PAGE_SIZE}`, 'admin'),
          novelApi<CommentPage>(`admin/comments?status=PENDING_REVIEW&page=${commentReviewPage}&size=${REVIEW_PAGE_SIZE}`, 'admin'),
          novelApi<ParagraphAnnotationPage>(`admin/annotations?status=PENDING_REVIEW&page=${annotationReviewPage}&size=${REVIEW_PAGE_SIZE}`, 'admin'),
          novelApi<RedemptionCodePage>(`admin/redemption-codes?page=${redemptionCodePage}&size=${REVIEW_PAGE_SIZE}`, 'admin'),
        ]);
        setDashboard(nextDashboard);
        setReviews(nextReviews.items);
        setReviewMeta(nextReviews.meta);
        setCandidateReviews(nextCandidateQueue.items);
        setCandidateMeta(nextCandidateQueue.meta);
        setAvailabilityBooks(nextAvailabilityBooks.items);
        setAvailabilityMeta(nextAvailabilityBooks.meta);
        setApplications(nextApplications.items);
        setApplicationMeta(nextApplications.meta);
        setWords(nextWords.items);
        setWordMeta(nextWords.meta);
        setCommentReviews(nextCommentReviews.items);
        setCommentReviewMeta(nextCommentReviews.meta);
        setAnnotationReviews(nextAnnotationReviews.items);
        setAnnotationReviewMeta(nextAnnotationReviews.meta);
        setRedemptionCodes(nextRedemptionCodes.items);
        setRedemptionCodeMeta({ total: nextRedemptionCodes.total, page: nextRedemptionCodes.page, size: nextRedemptionCodes.size });
      } else if (view === 'overview') {
        const [nextDashboard, nextReviews, nextApplications, nextCommentReviews, nextAnnotationReviews] = await Promise.all([
          novelApi<Dashboard>('admin/dashboard', 'admin'),
          novelApi<BookPresentationPage>(`admin/reviews?page=${reviewPage}&size=${BOOK_PAGE_SIZE}`, 'admin'),
          novelApi<AuthorApplicationPage>(authorApplicationPath(applicationPage), 'admin'),
          novelApi<CommentPage>(`admin/comments?status=PENDING_REVIEW&page=${commentReviewPage}&size=${REVIEW_PAGE_SIZE}`, 'admin'),
          novelApi<ParagraphAnnotationPage>(`admin/annotations?status=PENDING_REVIEW&page=${annotationReviewPage}&size=${REVIEW_PAGE_SIZE}`, 'admin'),
        ]);
        setDashboard(nextDashboard);
        setReviews(nextReviews.items);
        setReviewMeta(nextReviews.meta);
        setApplications(nextApplications.items);
        setApplicationMeta(nextApplications.meta);
        setCommentReviews(nextCommentReviews.items);
        setCommentReviewMeta(nextCommentReviews.meta);
        setAnnotationReviews(nextAnnotationReviews.items);
        setAnnotationReviewMeta(nextAnnotationReviews.meta);
      } else if (view === 'review-books') {
        const [next, nextCandidateQueue] = await Promise.all([
          novelApi<BookPresentationPage>(`admin/reviews?page=${reviewPage}&size=${BOOK_PAGE_SIZE}`, 'admin'),
          novelApi<ModerationReviewQueuePage>(`admin/reviews/queue?scope=${candidateScope}&page=${candidatePage}&size=${BOOK_PAGE_SIZE}`, 'admin'),
        ]);
        setReviews(next.items);
        setReviewMeta(next.meta);
        setCandidateReviews(nextCandidateQueue.items);
        setCandidateMeta(nextCandidateQueue.meta);
      } else if (view === 'content-books') {
        const next = await novelApi<BookPresentationPage>(`admin/books?page=${availabilityPage}&size=${BOOK_PAGE_SIZE}`, 'admin');
        setAvailabilityBooks(next.items);
        setAvailabilityMeta(next.meta);
      } else if (view === 'accounts-applications') {
        const next = await novelApi<AuthorApplicationPage>(authorApplicationPath(applicationPage), 'admin');
        setApplications(next.items);
        setApplicationMeta(next.meta);
      } else if (view === 'content-words') {
        const next = await novelApi<SensitiveWordPage>(`admin/sensitive-words?page=${wordPage}&size=${REVIEW_PAGE_SIZE}`, 'admin');
        setWords(next.items);
        setWordMeta(next.meta);
      } else if (view === 'review-comments') {
        const next = await novelApi<CommentPage>(`admin/comments?status=PENDING_REVIEW&page=${commentReviewPage}&size=${REVIEW_PAGE_SIZE}`, 'admin');
        setCommentReviews(next.items);
        setCommentReviewMeta(next.meta);
      } else if (view === 'review-annotations') {
        const next = await novelApi<ParagraphAnnotationPage>(`admin/annotations?status=PENDING_REVIEW&page=${annotationReviewPage}&size=${REVIEW_PAGE_SIZE}`, 'admin');
        setAnnotationReviews(next.items);
        setAnnotationReviewMeta(next.meta);
      } else if (view === 'operations-redemption-codes') {
        const next = await novelApi<RedemptionCodePage>(`admin/redemption-codes?page=${redemptionCodePage}&size=${REVIEW_PAGE_SIZE}`, 'admin');
        setRedemptionCodes(next.items);
        setRedemptionCodeMeta({ total: next.total, page: next.page, size: next.size });
      }
      setHasLoaded(true);
    } catch (reason) {
      setNotice({ message: reason instanceof Error ? reason.message : '运营数据暂时无法加载。', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [annotationReviewPage, applicationPage, availabilityPage, candidatePage, candidateScope, commentReviewPage, redemptionCodePage, reviewPage, view, wordPage]);

  useEffect(() => { void load(); }, [load]);

  const loadRetentionReport = useCallback(async () => {
    setRetentionLoading(true);
    setRetentionError('');
    try {
      setRetentionReport(await novelApi<PlatformRetentionReport>('admin/analytics/retention', 'admin'));
    } catch (reason) {
      setRetentionError(reason instanceof Error ? reason.message : '留存报表暂时无法加载。');
    } finally {
      setRetentionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'all' || view === 'overview' || view === 'analytics-retention') void loadRetentionReport();
  }, [loadRetentionReport, view]);

  const announce = (message: string, tone: Notice['tone'] = 'success') => setNotice({ message, tone });

  const decideBook = async (book: Book, approve: boolean) => {
    setPendingAction(`book-${book.id}`);
    try {
      await novelApi(`admin/reviews/${book.id}`, 'admin', {
        method: 'POST',
        body: JSON.stringify({ approve, reason: approve ? '内容符合发布规则' : '请修改后重新提交' }),
      });
      announce(approve ? '作品已发布' : '作品已驳回');
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '审核操作失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const decideCandidate = async (candidate: ChapterCandidate, approve: boolean) => {
    const reason = candidateReasons[candidate.id]?.trim() || (approve ? '候选章节符合发布规则' : '请依据审核意见修改后重新提交');
    setPendingAction(`candidate-${candidate.id}`);
    try {
      await novelApi<ChapterCandidate>(`admin/reviews/candidates/${candidate.id}`, 'admin', {
        method: 'POST',
        body: JSON.stringify({ approve, reason }),
      });
      setCandidateReasons((current) => {
        const next = { ...current };
        delete next[candidate.id];
        return next;
      });
      announce(approve ? '章节候选已批准，读者将继续看到已发布作品。' : '章节候选已驳回，原公开章节未受影响。');
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '章节候选审核失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const loadBookStatusAudits = async (bookId: number, page = bookStatusAuditPageIndex) => {
    setSelectedBookStatusAuditId(bookId);
    setBookStatusAuditsLoading(true);
    setBookStatusAuditsError('');
    try {
      const next = await novelApi<BookStatusAuditPage>(`admin/books/${bookId}/status-audits?page=${page}&size=${REVIEW_PAGE_SIZE}`, 'admin');
      setBookStatusAuditPage(next);
      if (next.meta.page !== page) setBookStatusAuditPageIndex(next.meta.page);
    } catch (reason) {
      setBookStatusAuditPage(undefined);
      setBookStatusAuditsError(reason instanceof Error ? reason.message : '作品处置记录暂时无法加载。');
    } finally {
      setBookStatusAuditsLoading(false);
    }
  };

  const changeBookAvailability = async (book: Book) => {
    const reason = bookActionReasons[book.id]?.trim();
    const takingDown = book.status === 'PUBLISHED';
    if (!reason) {
      announce(takingDown ? '请填写下线说明，系统会将其保留在处置审计中。' : '请填写恢复说明，系统会将其保留在处置审计中。', 'error');
      return;
    }
    const action = takingDown ? 'takedown' : 'restore';
    setPendingAction(`book-status-${book.id}`);
    try {
      const updated = await novelApi<Book>(`admin/books/${book.id}/${action}`, 'admin', {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setBookActionReasons((current) => {
        const next = { ...current };
        delete next[book.id];
        return next;
      });
      announce(takingDown
        ? `《${updated.title}》已下线，读者端不再可见。`
        : `《${updated.title}》已重新进入整书审核，审核通过前不会重新上线。`);
      await load();
      await loadBookStatusAudits(book.id, 0);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '作品处置失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const decideApplication = async (application: AuthorApplication, approve: boolean) => {
    setPendingAction(`application-${application.id}`);
    try {
      await novelApi(`admin/author-applications/${application.id}`, 'admin', {
        method: 'POST',
        body: JSON.stringify({ approve, reason: approve ? '通过作者申请' : '申请材料需补充' }),
      });
      announce(approve ? '作者申请已通过' : '作者申请已驳回');
      if (applications.length === 1 && applicationPage > 0) {
        setApplicationPage((current) => current - 1);
      } else {
        await load();
      }
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '作者申请处理失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const decideComment = async (comment: Comment, approve: boolean) => {
    setPendingAction(`comment-${comment.id}`);
    const reason = commentReasons[comment.id]?.trim() || (approve ? '内容符合社区规范' : '不符合社区规范');
    try {
      await novelApi<Comment>(`admin/comments/${comment.id}/review`, 'admin', {
        method: 'POST',
        body: JSON.stringify({ approve, reason }),
      });
      setCommentReasons((current) => {
        const next = { ...current };
        delete next[comment.id];
        return next;
      });
      announce(approve ? '评论已通过并对读者可见' : '评论已驳回');
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '评论审核失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const decideAnnotation = async (annotation: ParagraphAnnotation, approve: boolean) => {
    setPendingAction(`annotation-${annotation.id}`);
    const reason = annotationReasons[annotation.id]?.trim() || (approve ? '划线分享符合社区规范' : '划线分享不符合社区规范');
    try {
      await novelApi<ParagraphAnnotation>(`admin/annotations/${annotation.id}/review`, 'admin', {
        method: 'POST',
        body: JSON.stringify({ approve, reason }),
      });
      setAnnotationReasons((current) => {
        const next = { ...current };
        delete next[annotation.id];
        return next;
      });
      announce(approve ? '段评与划线已通过并对读者可见' : '段评与划线已驳回');
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '段评审核失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const addWord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedWord = word.trim();
    if (!normalizedWord) return;
    setPendingAction('word');
    try {
      await novelApi('admin/sensitive-words', 'admin', { method: 'POST', body: JSON.stringify({ word: normalizedWord }) });
      setWord('');
      announce('敏感词已加入审核规则');
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '添加敏感词失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const sensitiveWordReason = (entry: SensitiveWord) => wordReasons[entry.normalizedWord]?.trim();

  const saveSensitiveWord = async (entry: SensitiveWord) => {
    const nextWord = wordEdits[entry.normalizedWord]?.trim() ?? entry.word;
    const reason = sensitiveWordReason(entry);
    if (!nextWord || nextWord === entry.word) {
      announce('请先修改敏感词内容。', 'error');
      return;
    }
    if (!reason) {
      announce('请填写修改说明，系统会将其保留在审计记录中。', 'error');
      return;
    }
    setPendingAction(`word-update-${entry.normalizedWord}`);
    try {
      await novelApi<SensitiveWord>(`admin/sensitive-words/${encodeURIComponent(entry.normalizedWord)}`, 'admin', {
        method: 'PUT', body: JSON.stringify({ word: nextWord, reason }),
      });
      setWordEdits((current) => {
        const next = { ...current };
        delete next[entry.normalizedWord];
        return next;
      });
      setWordReasons((current) => {
        const next = { ...current };
        delete next[entry.normalizedWord];
        return next;
      });
      announce('敏感词已更新并写入审计记录。');
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '更新敏感词失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const setSensitiveWordEnabled = async (entry: SensitiveWord, enabled: boolean) => {
    const reason = sensitiveWordReason(entry);
    if (!reason) {
      announce('请填写操作说明，系统会将其保留在审计记录中。', 'error');
      return;
    }
    setPendingAction(`word-enabled-${entry.normalizedWord}`);
    try {
      await novelApi<SensitiveWord>(`admin/sensitive-words/${encodeURIComponent(entry.normalizedWord)}/enabled`, 'admin', {
        method: 'PUT', body: JSON.stringify({ enabled, reason }),
      });
      setWordReasons((current) => {
        const next = { ...current };
        delete next[entry.normalizedWord];
        return next;
      });
      announce(enabled ? '敏感词已恢复生效。' : '敏感词已停用，不再参与拦截。');
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '更新敏感词状态失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const deleteSensitiveWord = async (entry: SensitiveWord) => {
    const reason = sensitiveWordReason(entry);
    if (!reason) {
      announce('请填写删除说明，系统会将其保留在审计记录中。', 'error');
      return;
    }
    setPendingAction(`word-delete-${entry.normalizedWord}`);
    try {
      await novelApi(`admin/sensitive-words/${encodeURIComponent(entry.normalizedWord)}`, 'admin', {
        method: 'DELETE', body: JSON.stringify({ reason }),
      });
      setWordReasons((current) => {
        const next = { ...current };
        delete next[entry.normalizedWord];
        return next;
      });
      announce('已删除停用的敏感词，并保留审计记录。');
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '删除敏感词失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const loadSensitiveWordAudits = async (page: number) => {
    setWordAuditsLoading(true);
    setWordAuditsError('');
    try {
      const next = await novelApi<SensitiveWordAuditPage>(`admin/sensitive-words/audits?page=${page}&size=${REVIEW_PAGE_SIZE}`, 'admin');
      setWordAudits(next.items);
      setWordAuditMeta(next.meta);
    } catch (reason) {
      setWordAuditsError(reason instanceof Error ? reason.message : '敏感词审计记录暂时无法加载。');
    } finally {
      setWordAuditsLoading(false);
    }
  };

  const openSensitiveWordAudits = () => {
    setWordAuditOpen(true);
    void loadSensitiveWordAudits(0);
  };

  const changeGenerateBenefit = (field: keyof RedemptionBenefitsDraft, value: string) => {
    setGenerateBenefits((current) => ({ ...current, [field]: value }));
  };

  const changeImportBenefit = (field: keyof RedemptionBenefitsDraft, value: string) => {
    setImportBenefits((current) => ({ ...current, [field]: value }));
  };

  const generateRedemptionCodes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let benefits: ReturnType<typeof redemptionBenefitsPayload>;
    let quantity: number | undefined;
    try {
      quantity = optionalInteger(generateQuantity, '生成数量', 1);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '生成数量无效。', 'error');
      return;
    }
    if (!quantity || quantity > 1000) {
      announce('生成数量必须为 1 到 1000 之间的整数。', 'error');
      return;
    }
    if (!generateBatchNo.trim()) {
      announce('请填写生成批次，方便后续追踪和筛选。', 'error');
      return;
    }
    try {
      benefits = redemptionBenefitsPayload(generateBenefits);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '兑换权益配置无效。', 'error');
      return;
    }

    setPendingAction('redemption-generate');
    try {
      const batch = await novelApi<GeneratedRedemptionCodeBatch>('admin/redemption-codes/generate', 'admin', {
        method: 'POST',
        body: JSON.stringify({
          quantity,
          batchNo: generateBatchNo.trim(),
          codePrefix: generatePrefix.trim() || undefined,
          ...benefits,
        }),
      });
      setGeneratedBatch(batch);
      setGenerateBenefits(emptyRedemptionBenefits);
      announce(`批次 ${batch.batchNo} 已生成 ${batch.codes.length} 个兑换码`);
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '生成兑换码失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const importRedemptionCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let benefits: ReturnType<typeof redemptionBenefitsPayload>;
    if (!importCode.trim() || !importBatchNo.trim()) {
      announce('请填写兑换码和导入批次。', 'error');
      return;
    }
    try {
      benefits = redemptionBenefitsPayload(importBenefits);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '兑换权益配置无效。', 'error');
      return;
    }

    setPendingAction('redemption-import');
    try {
      const imported = await novelApi<RedemptionCode>('admin/redemption-codes/import', 'admin', {
        method: 'POST',
        body: JSON.stringify({
          code: importCode.trim(),
          batchNo: importBatchNo.trim(),
          ...benefits,
        }),
      });
      setImportCode('');
      setImportBenefits(emptyRedemptionBenefits);
      announce(`兑换码 ${imported.code} 已导入批次 ${imported.batchNo}`);
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '导入兑换码失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const disableRedemptionCode = async (code: RedemptionCode) => {
    setPendingAction(`redemption-disable-${code.code}`);
    try {
      await novelApi<RedemptionCode>(`admin/redemption-codes/${encodeURIComponent(code.code)}/disable`, 'admin', {
        method: 'POST',
        body: JSON.stringify({ reason: '运营中心手动停用' }),
      });
      announce(`兑换码 ${code.code} 已禁用`);
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '停用兑换码失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const metrics = dashboard ? [
    { name: '活跃读者', value: dashboard.activeReaders, icon: Users, note: '当前活跃账户' },
    { name: '今日阅读', value: dashboard.todayReads, icon: BookOpen, note: '今日章节阅读次数' },
    { name: '已发布作品', value: dashboard.publishedBooks, icon: ShieldCheck, note: '书城当前可见' },
    { name: '待复核', value: dashboard.pendingReviews, icon: Clock3, note: '需要站长决定' },
  ] : [];
  const taskQueues = [
    { label: '作品审核', count: dashboard?.pendingReviews ?? reviewMeta.total, href: '/novel-admin/review/books', note: '整书与增量内容等待决定' },
    { label: '作者准入', count: applicationMeta.total, href: '/novel-admin/accounts/applications', note: '等待处理的作者申请' },
    { label: '评论审核', count: commentReviewMeta.total, href: '/novel-admin/review/comments', note: '命中规则的评论' },
    { label: '段评与划线', count: annotationReviewMeta.total, href: '/novel-admin/review/annotations', note: '申请公开的读者内容' },
  ];
  const visible = (...views: AdminWorkspaceView[]) => view === 'all' || views.includes(view);
  const detailedRetention = view === 'all' || view === 'analytics-retention';

  return (
    <>
      {notice ? <div className="mb-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}
      {visible('overview') ? <>
      <div className="flex flex-col gap-3 border-b border-stone-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-semibold text-emerald-700">运营概览</p><p className="mt-1 text-sm text-stone-600">处理待办、查看关键状态与近期运营表现。</p></div>
        <Button asChild variant="outline" size="sm" className="rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><Link href="/"><BookOpen size={16} aria-hidden="true" />查看书城</Link></Button>
      </div>

      <section className="mt-7 grid gap-px overflow-hidden border border-stone-200 bg-stone-200 sm:grid-cols-2 xl:grid-cols-4" aria-label="运营概览">
        {loading && !hasLoaded ? [0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-32 rounded-none bg-white" />) : null}
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return <div key={metric.name} className="bg-white px-5 py-5"><Icon size={18} className="text-emerald-700" aria-hidden="true" /><strong className="mt-3 block text-2xl font-semibold text-stone-950">{metric.value.toLocaleString('zh-CN')}</strong><span className="mt-1 block text-sm text-stone-700">{metric.name}</span><span className="mt-1 block text-xs text-stone-500">{metric.note}</span></div>;
        })}
      </section>
      <section className="mt-7" aria-labelledby="admin-task-queues-heading">
        <div className="flex items-end justify-between gap-4 border-b border-stone-200 pb-4"><div><p className="text-xs font-semibold text-emerald-700">优先待办</p><h2 id="admin-task-queues-heading" className="mt-1 text-xl font-semibold text-stone-950">需要处理的事项</h2></div><span className="text-xs text-stone-500">按任务直达处理页</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {taskQueues.map((task) => <Link key={task.href} href={task.href} className="border border-stone-200 bg-white px-4 py-4 transition-colors hover:border-emerald-700 hover:bg-emerald-50"><span className="text-sm font-medium text-stone-900">{task.label}</span>{loading && !hasLoaded ? <Skeleton className="mt-3 h-8 w-12 rounded-none bg-stone-100" /> : <strong className="mt-3 block text-2xl font-semibold text-stone-950">{task.count.toLocaleString('zh-CN')}</strong>}<span className="mt-1 block text-xs leading-5 text-stone-500">{task.note}</span></Link>)}
        </div>
      </section>
      </> : null}

      {visible('overview', 'analytics-retention') ? <section className="mt-7 border border-stone-200 bg-white" aria-labelledby="platform-retention-heading">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">全站数据</p>
            <h2 id="platform-retention-heading" className="mt-1 text-xl font-semibold text-stone-950">渠道与读者留存</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">按读者首次阅读日期计算 D1/D7；渠道只保留受控首触分类，不采集原始来源或设备标识。</p>
          </div>
          <span className="text-sm text-stone-500" aria-live="polite">{retentionLoading ? '正在加载' : retentionReport ? `${retentionReport.meta.from} 至 ${retentionReport.meta.to}` : '暂未加载'}</span>
        </div>
        {retentionLoading && !retentionReport ? <div className="grid gap-px bg-stone-100 p-px sm:grid-cols-3"><Skeleton className="h-28 rounded-none bg-white" /><Skeleton className="h-28 rounded-none bg-white" /><Skeleton className="h-28 rounded-none bg-white" /></div> : null}
        {retentionError ? <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"><InlineNotice tone="error">留存报表无法显示：{retentionError}</InlineNotice><Button type="button" variant="outline" onClick={() => void loadRetentionReport()} className="h-auto shrink-0 rounded-none border-stone-300 bg-white px-3 py-2 text-stone-700 hover:border-emerald-700 hover:text-emerald-800">重试</Button></div> : null}
        {!retentionError && retentionReport ? (
          <>
            <dl className="grid gap-px border-b border-stone-100 bg-stone-100 sm:grid-cols-3">
              <div className="bg-white px-5 py-4"><dt className="text-sm text-stone-600">窗口活跃读者</dt><dd className="mt-1 text-2xl font-semibold text-stone-950">{retentionReport.summary.activeReaderCount.toLocaleString('zh-CN')}</dd><p className="mt-1 text-xs text-stone-500">{retentionReport.summary.metric.cohortReaderCount.toLocaleString('zh-CN')} 位首次阅读读者</p></div>
              <div className="bg-white px-5 py-4"><dt className="text-sm text-stone-600">D1 留存</dt><dd className="mt-1 text-2xl font-semibold text-stone-950">{formatRetentionRate(retentionReport.summary.metric.day1RetentionPercent)}</dd><p className="mt-1 text-xs text-stone-500">{retentionReport.summary.metric.day1RetainedReaderCount.toLocaleString('zh-CN')} / {retentionReport.summary.metric.day1EligibleReaderCount.toLocaleString('zh-CN')} 成熟读者</p></div>
              <div className="bg-white px-5 py-4"><dt className="text-sm text-stone-600">D7 留存</dt><dd className="mt-1 text-2xl font-semibold text-stone-950">{formatRetentionRate(retentionReport.summary.metric.day7RetentionPercent)}</dd><p className="mt-1 text-xs text-stone-500">{retentionReport.summary.metric.day7RetainedReaderCount.toLocaleString('zh-CN')} / {retentionReport.summary.metric.day7EligibleReaderCount.toLocaleString('zh-CN')} 成熟读者</p></div>
            </dl>
            {detailedRetention ? <><div className="overflow-x-auto px-5 py-5">
              <Table className="min-w-[700px]">
                <TableHeader className="border-stone-100 bg-stone-50 text-stone-600"><TableRow className="border-0 hover:bg-transparent"><TableHead className="px-4 py-3">渠道</TableHead><TableHead className="px-4 py-3 text-right">活跃读者</TableHead><TableHead className="px-4 py-3 text-right">首读队列</TableHead><TableHead className="px-4 py-3 text-right">D1</TableHead><TableHead className="px-4 py-3 text-right">D7</TableHead></TableRow></TableHeader>
                <TableBody>{retentionReport.channels.map((channel) => <TableRow key={channel.channel} className="border-stone-100 hover:bg-stone-50"><TableCell className="px-4 py-3 font-medium text-stone-900">{channel.channel}</TableCell><TableCell className="px-4 py-3 text-right text-stone-700">{channel.activeReaderCount.toLocaleString('zh-CN')}</TableCell><TableCell className="px-4 py-3 text-right text-stone-700">{channel.metric.cohortReaderCount.toLocaleString('zh-CN')}</TableCell><TableCell className="px-4 py-3 text-right font-medium text-emerald-800">{formatRetentionRate(channel.metric.day1RetentionPercent)}</TableCell><TableCell className="px-4 py-3 text-right font-medium text-emerald-800">{formatRetentionRate(channel.metric.day7RetentionPercent)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
            <p className="border-t border-stone-100 px-5 py-4 text-xs leading-5 text-stone-500">统计时区：{retentionReport.meta.timeZone}。D1/D7 仅在首读后第 1/7 个自然日已到达观测截止日时进入分母；未归因的历史账户归为 DIRECT。</p></> : <div className="flex items-center justify-between gap-4 px-5 py-5"><p className="text-sm text-stone-600">渠道明细已移至数据分析页，便于在工作台快速扫描核心留存。</p><Button asChild variant="outline" size="sm" className="shrink-0 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><Link href="/novel-admin/analytics/retention">查看渠道明细</Link></Button></div>}
          </>
        ) : null}
      </section> : null}

      {visible('operations-redemption-codes') ? <section className="mt-7" aria-labelledby="redemption-code-heading">
        <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">权益运营</p>
            <h2 id="redemption-code-heading" className="mt-1 text-xl font-semibold text-stone-950">兑换码管理</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">批量发放、单码导入与未核销码停用都保留在运营审计中。</p>
          </div>
          <span className="text-sm text-stone-500">{redemptionCodeMeta.total ? `共 ${redemptionCodeMeta.total.toLocaleString('zh-CN')} 个兑换码` : '尚未创建兑换码'}</span>
        </div>

        {generatedBatch ? (
          <Alert role="status" className="mt-5 rounded-none border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950">
            <AlertDescription className="text-inherit">
              <p className="font-medium">批次 {generatedBatch.batchNo} 已生成 {generatedBatch.codes.length} 个兑换码，请在离开页面前保存。</p>
              <div className="mt-3 flex flex-wrap gap-2" aria-label="刚生成的兑换码">
                {generatedBatch.codes.map((code) => <code key={code.code} className="border border-emerald-200 bg-white px-2 py-1 font-mono text-xs text-emerald-950">{code.code}</code>)}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-5 grid gap-6 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,.8fr)]">
          <div className="min-w-0 border border-stone-200 bg-white">
            <div className="flex flex-col gap-2 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-semibold text-stone-950">最近兑换码</h3>
              <span className="text-xs text-stone-500">每页 {REVIEW_PAGE_SIZE} 条记录</span>
            </div>
            {loading && redemptionCodes.length === 0 ? <div className="p-5"><Skeleton className="h-40 rounded-none bg-stone-100" /></div> : null}
            {!loading && hasLoaded && redemptionCodes.length === 0 ? <div className="px-5 py-12 text-center"><ClipboardCheck className="mx-auto text-stone-400" size={28} aria-hidden="true" /><p className="mt-3 font-medium text-stone-800">当前没有兑换码</p><p className="mt-1 text-sm text-stone-500">可通过右侧表单生成批次或导入已有兑换码。</p></div> : null}
            {redemptionCodes.length > 0 ? (
              <Table className="min-w-[820px] text-stone-700">
                  <TableHeader className="border-stone-100 bg-stone-50 text-stone-600">
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableHead scope="col" className="px-4 py-3 font-medium">兑换码</TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">状态</TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">批次</TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">权益</TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">到期</TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">已核销</TableHead>
                      <TableHead scope="col" className="px-4 py-3 text-right font-medium">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-stone-700">
                    {redemptionCodes.map((code) => {
                      const canDisable = code.status === 'ACTIVE' && !code.redeemedAt;
                      return (
                        <TableRow key={code.code} className="border-stone-100 hover:bg-stone-50">
                          <TableCell className="whitespace-nowrap px-4 py-4"><code className="font-mono text-xs font-medium text-stone-950">{code.code}</code></TableCell>
                          <TableCell className="px-4 py-4"><RedemptionStatusBadge status={code.status} /></TableCell>
                          <TableCell className="whitespace-nowrap px-4 py-4 text-xs font-medium text-stone-800">{code.batchNo}</TableCell>
                          <TableCell className="max-w-48 px-4 py-4 leading-5 text-stone-700">{formatRedemptionBenefits(code)}</TableCell>
                          <TableCell className="whitespace-nowrap px-4 py-4 text-xs text-stone-600">{formatRedemptionTime(code.expiresAt)}</TableCell>
                          <TableCell className="px-4 py-4 text-xs leading-5 text-stone-600">{code.redeemedAt ? <><span>用户 #{code.redeemedByUserId ?? '未知'}</span><br /><time dateTime={code.redeemedAt}>{formatRedemptionTime(code.redeemedAt)}</time></> : '未核销'}</TableCell>
                          <TableCell className="px-4 py-4 text-right">
                            {canDisable ? <Button type="button" variant="outline" size="sm" aria-label={`禁用 ${code.code}`} onClick={() => void disableRedemptionCode(code)} disabled={pendingAction === `redemption-disable-${code.code}`} className="h-auto rounded-none border-rose-200 bg-white px-2.5 py-1.5 text-rose-700 hover:border-rose-500 hover:text-rose-800">禁用</Button> : <span className="text-xs text-stone-400">{code.status === 'REDEEMED' ? '已核销' : '不可停用'}</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
              </Table>
            ) : null}
            <PageNavigation meta={redemptionCodeMeta} onPageChange={setRedemptionCodePage} label="兑换码分页" />
          </div>

          <div className="border border-stone-200 bg-white p-5">
            <p className="text-xs font-semibold text-emerald-700">操作</p>
            <h3 className="mt-1 text-lg font-semibold text-stone-950">发放兑换码</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">生成批次和导入单码会在独立表单中完成，不影响当前列表浏览。</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" onClick={() => setRedemptionDialog('generate')} className="rounded-none bg-emerald-700 hover:bg-emerald-800"><Plus size={15} aria-hidden="true" />生成兑换码</Button>
              <Button type="button" variant="outline" onClick={() => setRedemptionDialog('import')} className="rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><ClipboardCheck size={15} aria-hidden="true" />导入单码</Button>
            </div>
          </div>
          <Dialog open={redemptionDialog === 'generate'} onOpenChange={(open) => setRedemptionDialog(open ? 'generate' : undefined)}>
            <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-none border-stone-200 bg-white p-5 sm:max-w-2xl">
              <DialogHeader><DialogTitle className="text-stone-950">生成兑换码</DialogTitle><DialogDescription className="text-stone-600">设置批次、数量与兑换权益。</DialogDescription></DialogHeader>
              <form onSubmit={generateRedemptionCodes} className="pt-2">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-700">批量发放</p><h3 className="mt-1 text-lg font-semibold text-stone-950">生成兑换码</h3></div><Plus className="text-emerald-700" size={20} aria-hidden="true" /></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="generate-quantity" className="text-stone-700">生成数量</Label>
                  <Input id="generate-quantity" aria-label="生成数量" type="number" min="1" max="1000" required value={generateQuantity} onChange={(event) => setGenerateQuantity(event.target.value)} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
                </div>
                <div>
                  <Label htmlFor="generate-batch-no" className="text-stone-700">生成批次</Label>
                  <Input id="generate-batch-no" aria-label="生成批次" required maxLength={64} value={generateBatchNo} onChange={(event) => setGenerateBatchNo(event.target.value.toUpperCase())} className="mt-2 h-10 rounded-none border-stone-300 bg-white font-mono text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="SUMMER-2026" />
                </div>
                <div>
                  <Label htmlFor="generate-prefix" className="text-stone-700">码前缀</Label>
                  <Input id="generate-prefix" aria-label="码前缀" maxLength={20} value={generatePrefix} onChange={(event) => setGeneratePrefix(event.target.value.toUpperCase())} className="mt-2 h-10 rounded-none border-stone-300 bg-white font-mono text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="NVC" />
                </div>
              </div>
              <RedemptionBenefitFields prefix="生成" values={generateBenefits} onChange={changeGenerateBenefit} />
              <Button type="submit" disabled={pendingAction === 'redemption-generate'} className="mt-5 h-auto rounded-none bg-emerald-700 px-3 py-2 hover:bg-emerald-800"><Plus size={15} aria-hidden="true" />生成兑换码</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={redemptionDialog === 'import'} onOpenChange={(open) => setRedemptionDialog(open ? 'import' : undefined)}>
            <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-none border-stone-200 bg-white p-5 sm:max-w-2xl">
              <DialogHeader><DialogTitle className="text-stone-950">导入兑换码</DialogTitle><DialogDescription className="text-stone-600">录入已有兑换码并设置其权益。</DialogDescription></DialogHeader>
              <form onSubmit={importRedemptionCode} className="pt-2">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-700">单码录入</p><h3 className="mt-1 text-lg font-semibold text-stone-950">导入兑换码</h3></div><ClipboardCheck className="text-emerald-700" size={20} aria-hidden="true" /></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="import-code" className="text-stone-700">兑换码内容</Label>
                  <Input id="import-code" aria-label="兑换码内容" required maxLength={64} value={importCode} onChange={(event) => setImportCode(event.target.value.toUpperCase())} className="mt-2 h-10 rounded-none border-stone-300 bg-white font-mono text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="PARTNER-2026-A1B2" />
                </div>
                <div>
                  <Label htmlFor="import-batch-no" className="text-stone-700">导入批次</Label>
                  <Input id="import-batch-no" aria-label="导入批次" required maxLength={64} value={importBatchNo} onChange={(event) => setImportBatchNo(event.target.value.toUpperCase())} className="mt-2 h-10 rounded-none border-stone-300 bg-white font-mono text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="PARTNER-2026" />
                </div>
              </div>
              <RedemptionBenefitFields prefix="导入" values={importBenefits} onChange={changeImportBenefit} />
              <Button type="submit" disabled={pendingAction === 'redemption-import'} className="mt-5 h-auto rounded-none bg-emerald-700 px-3 py-2 hover:bg-emerald-800"><ClipboardCheck size={15} aria-hidden="true" />导入单个码</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </section> : null}

      {visible('review-books') ? <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.8fr)]">
        <div className="border border-stone-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700">审核队列</p>
              <h2 className="mt-1 text-xl font-semibold text-stone-950">待处理作品</h2>
            </div>
            <span className="text-sm text-stone-500">完整作品上线前必须由站长决定</span>
          </div>
          {loading ? <div className="p-5"><Skeleton className="h-24 rounded-none bg-stone-100" /></div> : null}
          {!loading && hasLoaded && reviews.length === 0 ? <div className="px-5 py-12 text-center"><ClipboardCheck className="mx-auto text-stone-400" size={28} aria-hidden="true" /><p className="mt-3 font-medium text-stone-800">当前没有待审核作品</p><p className="mt-1 text-sm text-stone-500">新提交的完整作品会在这里出现。</p></div> : null}
          {!loading && reviews.length > 0 ? (
            <div className="divide-y divide-stone-100">
              {reviews.map((book) => (
                <article key={book.id} className="px-5 py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-stone-950">{book.title}</h3><NovelStatusBadge status={book.status} /></div>
                      <p className="mt-1 text-sm text-stone-500">{book.author} · {book.category} · {formatWordCount(book.words)}</p>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{book.synopsis}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void decideBook(book, false)} disabled={pendingAction === `book-${book.id}`} className="h-auto rounded-none border-rose-200 bg-white px-3 py-2 text-rose-700 hover:border-rose-500 hover:text-rose-800"><X size={15} aria-hidden="true" />驳回</Button>
                      <Button type="button" size="sm" onClick={() => void decideBook(book, true)} disabled={pendingAction === `book-${book.id}`} className="h-auto rounded-none bg-emerald-700 px-3 py-2 hover:bg-emerald-800"><Check size={15} aria-hidden="true" />批准上线</Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          <PageNavigation meta={reviewMeta} onPageChange={setReviewPage} label="整书审核分页" />
        </div>

        <aside className="border border-stone-200 bg-[#eef4ef] p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-700">审计记录</p><h2 className="mt-1 text-xl font-semibold text-stone-950">最近变更</h2></div><ShieldCheck className="text-emerald-700" size={20} aria-hidden="true" /></div>
          <div className="mt-5 space-y-3 border-l border-emerald-300 pl-4 text-sm leading-6 text-stone-600">
            {dashboard?.auditLog.length ? dashboard.auditLog.slice(0, 8).map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>) : <p>审核、兑换和内容规则的变更会记录在这里。</p>}
          </div>
        </aside>

        <div className="border border-stone-200 bg-white xl:col-span-2">
          <div className="flex flex-col gap-4 border-b border-stone-200 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700">增量内容审核</p>
              <h2 className="mt-1 text-xl font-semibold text-stone-950">章节候选</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">批准后才会发布新章或替换公开章节；驳回不会改变读者当前可见内容。</p>
            </div>
            <div className="inline-flex w-fit border border-stone-300 bg-white p-1" role="group" aria-label="候选章节类型">
              <Button type="button" variant={candidateScope === 'NEW_CHAPTER' ? 'default' : 'ghost'} size="sm" onClick={() => { setCandidateScope('NEW_CHAPTER'); setCandidatePage(0); }} className={candidateScope === 'NEW_CHAPTER' ? 'h-8 rounded-none bg-emerald-700 px-3 hover:bg-emerald-800' : 'h-8 rounded-none px-3 text-stone-700 hover:bg-stone-100'}>新章</Button>
              <Button type="button" variant={candidateScope === 'CHAPTER_REVISION' ? 'default' : 'ghost'} size="sm" onClick={() => { setCandidateScope('CHAPTER_REVISION'); setCandidatePage(0); }} className={candidateScope === 'CHAPTER_REVISION' ? 'h-8 rounded-none bg-emerald-700 px-3 hover:bg-emerald-800' : 'h-8 rounded-none px-3 text-stone-700 hover:bg-stone-100'}>已发布章节修订</Button>
            </div>
          </div>
          {loading ? <div className="p-5"><Skeleton className="h-24 rounded-none bg-stone-100" /></div> : null}
          {!loading && hasLoaded && candidateReviews.length === 0 ? <div className="px-5 py-12 text-center"><ClipboardCheck className="mx-auto text-stone-400" size={28} aria-hidden="true" /><p className="mt-3 font-medium text-stone-800">当前没有待审核章节候选</p><p className="mt-1 text-sm text-stone-500">提交的新章和已发布章节修订会分别进入此队列。</p></div> : null}
          {!loading && candidateReviews.length > 0 ? <div className="divide-y divide-stone-100">{candidateReviews.map((item) => {
            const candidate = item.candidate;
            if (!candidate) return null;
            const busy = pendingAction === `candidate-${candidate.id}`;
            return <article key={candidate.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.7fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-stone-950">{candidate.title}</h3><Badge variant="outline" className="rounded-none border-amber-200 bg-amber-50 text-amber-800">{candidate.type === 'NEW_CHAPTER' ? '新章' : '章节修订'}</Badge></div>
                <p className="mt-1 text-xs text-stone-500">作品 #{candidate.bookId} · 目标章节 #{candidate.targetChapterId} · 排序 {candidate.orderNo}</p>
                <details className="mt-3 border border-stone-200 bg-stone-50 px-3 py-2 text-sm leading-6 text-stone-700"><summary className="cursor-pointer font-medium text-stone-800">查看候选正文</summary><p className="mt-3 whitespace-pre-wrap">{candidate.content}</p></details>
              </div>
              <div className="border-t border-stone-100 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                <Label htmlFor={`candidate-reason-${candidate.id}`} className="text-stone-700">审核说明</Label>
                <Textarea id={`candidate-reason-${candidate.id}`} aria-label={`章节候选审核说明 ${candidate.id}`} value={candidateReasons[candidate.id] ?? ''} onChange={(event) => setCandidateReasons((current) => ({ ...current, [candidate.id]: event.target.value }))} disabled={busy} maxLength={900} className="mt-2 min-h-20 resize-y rounded-none border-stone-300 bg-white px-3 py-2 text-sm leading-6 text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="可补充审核意见" />
                <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void decideCandidate(candidate, false)} disabled={busy} className="h-auto rounded-none border-rose-200 bg-white px-3 py-2 text-rose-700 hover:border-rose-500 hover:text-rose-800"><X size={15} aria-hidden="true" />驳回</Button><Button type="button" size="sm" onClick={() => void decideCandidate(candidate, true)} disabled={busy} className="h-auto rounded-none bg-emerald-700 px-3 py-2 hover:bg-emerald-800"><Check size={15} aria-hidden="true" />批准候选</Button></div>
              </div>
            </article>;
          })}</div> : null}
          <PageNavigation meta={candidateMeta} onPageChange={setCandidatePage} label="章节候选审核分页" />
        </div>
      </section> : null}

      {visible('content-books') ? <section className="mt-7 border border-stone-200 bg-white" aria-labelledby="book-availability-heading">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">违规处置</p>
            <h2 id="book-availability-heading" className="mt-1 text-xl font-semibold text-stone-950">作品下线与恢复</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">下线会立即移除读者书城与阅读入口；恢复只能重新进入整书审核，不能直接重新上线。</p>
          </div>
          <span className="text-sm text-stone-500">仅显示已上线或已下线作品</span>
        </div>
        {loading ? <div className="p-5"><Skeleton className="h-24 rounded-none bg-stone-100" /></div> : null}
        {!loading && hasLoaded && availabilityBooks.length === 0 ? <div className="px-5 py-12 text-center"><ShieldCheck className="mx-auto text-stone-400" size={28} aria-hidden="true" /><p className="mt-3 font-medium text-stone-800">当前没有可处置作品</p><p className="mt-1 text-sm text-stone-500">已上线和已下线作品会在这里显示。</p></div> : null}
        {!loading && availabilityBooks.length > 0 ? (
          <div className="divide-y divide-stone-100">
            {availabilityBooks.map((book) => {
              const takingDown = book.status === 'PUBLISHED';
              const reasonLabel = takingDown ? `下线说明 ${book.id}` : `恢复说明 ${book.id}`;
              const actionLabel = takingDown ? `下线《${book.title}》` : `提交复核《${book.title}》`;
              return (
                <article key={book.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.7fr)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-stone-950">{book.title}</h3><NovelStatusBadge status={book.status} /></div>
                    <p className="mt-1 text-sm text-stone-500">{book.author} · {book.category} · {formatWordCount(book.words)}</p>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{book.synopsis}</p>
                  </div>
                  <div className="border-t border-stone-100 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                    <Label htmlFor={`book-status-reason-${book.id}`} className="text-stone-700">{takingDown ? '下线说明' : '恢复说明'}</Label>
                    <Textarea id={`book-status-reason-${book.id}`} aria-label={reasonLabel} value={bookActionReasons[book.id] ?? ''} onChange={(event) => setBookActionReasons((current) => ({ ...current, [book.id]: event.target.value }))} disabled={pendingAction === `book-status-${book.id}`} maxLength={1024} className="mt-2 min-h-20 resize-y rounded-none border-stone-300 bg-white px-3 py-2 text-sm leading-6 text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder={takingDown ? '说明违规事实与处置依据' : '说明整改或申诉复核依据'} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" aria-expanded={selectedBookStatusAuditId === book.id} onClick={() => {
                        if (selectedBookStatusAuditId === book.id) {
                          setSelectedBookStatusAuditId(undefined);
                          setBookStatusAuditPage(undefined);
                          setBookStatusAuditPageIndex(0);
                          setBookStatusAuditsError('');
                          return;
                        }
                        setBookStatusAuditPageIndex(0);
                        void loadBookStatusAudits(book.id, 0);
                      }} disabled={pendingAction === `book-status-${book.id}`} className="h-auto rounded-none border-stone-300 bg-white px-3 py-2 text-stone-700 hover:border-emerald-700 hover:text-emerald-800">查看处置记录</Button>
                      <Button type="button" size="sm" aria-label={actionLabel} onClick={() => void changeBookAvailability(book)} disabled={pendingAction === `book-status-${book.id}`} className={takingDown ? 'h-auto rounded-none bg-rose-700 px-3 py-2 hover:bg-rose-800' : 'h-auto rounded-none bg-emerald-700 px-3 py-2 hover:bg-emerald-800'}>{takingDown ? <><ShieldAlert size={15} aria-hidden="true" />下线</> : <><Clock3 size={15} aria-hidden="true" />提交复核</>}</Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
        <PageNavigation meta={availabilityMeta} onPageChange={setAvailabilityPage} label="作品处置分页" />
        {selectedBookStatusAuditId ? (
          <div className="border-t border-stone-200 bg-stone-50 px-5 py-5" aria-live="polite">
            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-stone-950">作品处置审计</h3><span className="text-xs text-stone-500">作品 #{selectedBookStatusAuditId}</span></div>
            {bookStatusAuditsLoading ? <Skeleton className="mt-4 h-20 rounded-none bg-white" /> : null}
            {bookStatusAuditsError ? <InlineNotice tone="error">处置记录无法显示：{bookStatusAuditsError}</InlineNotice> : null}
            {!bookStatusAuditsLoading && !bookStatusAuditsError && bookStatusAuditPage?.items.length === 0 ? <p className="mt-3 text-sm text-stone-500">尚无作品下线或恢复记录。</p> : null}
            {!bookStatusAuditsLoading && !bookStatusAuditsError && bookStatusAuditPage?.items.length ? <ol className="mt-4 space-y-3 border-l border-emerald-300 pl-4">{bookStatusAuditPage.items.map((audit) => <li key={audit.id} className="text-sm leading-6 text-stone-700"><div className="flex flex-wrap items-center gap-2"><strong className="text-stone-950">{audit.action === 'TAKEDOWN' ? '已下线' : '已提交重新审核'}</strong><span>{audit.previousStatus} → {audit.status}</span><time className="text-xs text-stone-500" dateTime={audit.createdAt}>{formatRedemptionTime(audit.createdAt)}</time></div><p className="mt-1 whitespace-pre-wrap">{audit.reason}</p></li>)}</ol> : null}
            {bookStatusAuditPage ? <PageNavigation meta={bookStatusAuditPage.meta} onPageChange={(page) => {
              if (selectedBookStatusAuditId === undefined) return;
              setBookStatusAuditPageIndex(page);
              void loadBookStatusAudits(selectedBookStatusAuditId, page);
            }} label="作品处置审计分页" /> : null}
          </div>
        ) : null}
      </section> : null}

      {visible('review-comments') ? <section className="mt-7 border border-stone-200 bg-white" aria-labelledby="comment-review-heading">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">互动审核</p>
            <h2 id="comment-review-heading" className="mt-1 text-xl font-semibold text-stone-950">待审核评论</h2>
          </div>
          <span className="text-sm text-stone-500">{commentReviewMeta.total ? `${commentReviewMeta.total.toLocaleString('zh-CN')} 条等待人工决定` : '仅显示命中规则的评论'}</span>
        </div>
        {loading ? <div className="p-5"><Skeleton className="h-24 rounded-none bg-stone-100" /></div> : null}
        {!loading && hasLoaded && commentReviews.length === 0 ? <div className="px-5 py-12 text-center"><MessageSquareText className="mx-auto text-stone-400" size={28} aria-hidden="true" /><p className="mt-3 font-medium text-stone-800">当前没有待审核评论</p><p className="mt-1 text-sm text-stone-500">命中内容规则的评论会在这里等待处理。</p></div> : null}
        {!loading && commentReviews.length > 0 ? (
          <div className="divide-y divide-stone-100">
            {commentReviews.map((comment) => (
              <article key={comment.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(270px,.55fr)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-stone-950">{comment.authorName}</h3><NovelStatusBadge status={comment.status} /></div>
                  <p className="mt-1 text-xs text-stone-500">作品 #{comment.bookId}{comment.chapterId ? ` · 章节评论 #${comment.chapterId}` : ' · 书评'}</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">{comment.content}</p>
                </div>
                <div className="border-t border-stone-100 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                  <Label htmlFor={`comment-reason-${comment.id}`} className="text-stone-700">审核说明</Label>
                  <Input id={`comment-reason-${comment.id}`} aria-label={`审核说明 ${comment.id}`} value={commentReasons[comment.id] ?? ''} onChange={(event) => setCommentReasons((current) => ({ ...current, [comment.id]: event.target.value }))} disabled={pendingAction === `comment-${comment.id}`} className="mt-2 h-10 rounded-none border-stone-300 bg-white px-3 text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="可补充审核说明" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void decideComment(comment, false)} disabled={pendingAction === `comment-${comment.id}`} className="h-auto rounded-none border-rose-200 bg-white px-3 py-2 text-rose-700 hover:border-rose-500 hover:text-rose-800"><X size={15} aria-hidden="true" />驳回</Button>
                    <Button type="button" size="sm" onClick={() => void decideComment(comment, true)} disabled={pendingAction === `comment-${comment.id}`} className="h-auto rounded-none bg-emerald-700 px-3 py-2 hover:bg-emerald-800"><Check size={15} aria-hidden="true" />通过</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        <PageNavigation meta={commentReviewMeta} onPageChange={setCommentReviewPage} label="评论审核分页" />
      </section> : null}

      {visible('review-annotations') ? <section className="mt-7 border border-stone-200 bg-white" aria-labelledby="annotation-review-heading">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">互动审核</p>
            <h2 id="annotation-review-heading" className="mt-1 text-xl font-semibold text-stone-950">待审核段评与划线</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">读者申请公开的划线会在站长审核通过后显示在章节旁。</p>
          </div>
          <span className="text-sm text-stone-500">{annotationReviewMeta.total ? `${annotationReviewMeta.total.toLocaleString('zh-CN')} 条等待人工决定` : '仅显示申请公开的段评'}</span>
        </div>
        {loading ? <div className="p-5"><Skeleton className="h-24 rounded-none bg-stone-100" /></div> : null}
        {!loading && hasLoaded && annotationReviews.length === 0 ? <div className="px-5 py-12 text-center"><TextQuote className="mx-auto text-stone-400" size={28} aria-hidden="true" /><p className="mt-3 font-medium text-stone-800">当前没有待审核段评与划线</p><p className="mt-1 text-sm text-stone-500">申请公开的读者划线会在这里等待处理。</p></div> : null}
        {!loading && annotationReviews.length > 0 ? (
          <div className="divide-y divide-stone-100">
            {annotationReviews.map((annotation) => (
              <article key={annotation.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(270px,.55fr)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-stone-950">{annotation.authorName}</h3><NovelStatusBadge status={annotation.status} /></div>
                  <p className="mt-1 text-xs text-stone-500">作品 #{annotation.bookId} · 章节 #{annotation.chapterId} · 第 {annotation.paragraphIndex + 1} 段</p>
                  <blockquote className="mt-3 border-l-2 border-emerald-600 bg-emerald-50 px-3 py-3 text-sm leading-6 text-stone-800"><TextQuote className="mr-2 inline text-emerald-700" size={16} aria-hidden="true" />{annotation.selectedText}</blockquote>
                  {annotation.note ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700"><span className="font-medium text-stone-800">读者附言：</span>{annotation.note}</p> : null}
                </div>
                <div className="border-t border-stone-100 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                  <Label htmlFor={`annotation-reason-${annotation.id}`} className="text-stone-700">审核说明</Label>
                  <Input id={`annotation-reason-${annotation.id}`} aria-label={`段评审核说明 ${annotation.id}`} value={annotationReasons[annotation.id] ?? ''} onChange={(event) => setAnnotationReasons((current) => ({ ...current, [annotation.id]: event.target.value }))} disabled={pendingAction === `annotation-${annotation.id}`} className="mt-2 h-10 rounded-none border-stone-300 bg-white px-3 text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="可补充审核说明" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" aria-label={`驳回段评 ${annotation.id}`} onClick={() => void decideAnnotation(annotation, false)} disabled={pendingAction === `annotation-${annotation.id}`} className="h-auto rounded-none border-rose-200 bg-white px-3 py-2 text-rose-700 hover:border-rose-500 hover:text-rose-800"><X size={15} aria-hidden="true" />驳回</Button>
                    <Button type="button" size="sm" aria-label={`通过段评 ${annotation.id}`} onClick={() => void decideAnnotation(annotation, true)} disabled={pendingAction === `annotation-${annotation.id}`} className="h-auto rounded-none bg-emerald-700 px-3 py-2 hover:bg-emerald-800"><Check size={15} aria-hidden="true" />通过</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        <PageNavigation meta={annotationReviewMeta} onPageChange={setAnnotationReviewPage} label="段评审核分页" />
      </section> : null}

      {visible('accounts-applications', 'content-words') ? <section className="mt-7 grid gap-6 xl:grid-cols-2">
        {visible('accounts-applications') ? <div className="border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-5 py-5"><p className="text-xs font-semibold text-emerald-700">作者申请</p><h2 className="mt-1 text-xl font-semibold text-stone-950">创作者准入</h2></div>
          {loading ? <div className="p-5"><Skeleton className="h-20 rounded-none bg-stone-100" /></div> : null}
          {!loading && hasLoaded && applications.length === 0 ? <p className="px-5 py-10 text-sm text-stone-500">当前没有待处理申请。</p> : null}
          {!loading && applications.length > 0 ? <div className="divide-y divide-stone-100">{applications.map((application) => <article key={application.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><h3 className="font-semibold text-stone-950">{application.penName}</h3><NovelStatusBadge status={application.status} /></div><p className="mt-2 text-sm leading-6 text-stone-600">{application.statement}</p></div><div className="flex shrink-0 gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void decideApplication(application, false)} disabled={pendingAction === `application-${application.id}`} className="h-auto rounded-none border-rose-200 bg-white px-3 py-2 text-rose-700 hover:border-rose-500 hover:text-rose-800">驳回</Button><Button type="button" size="sm" onClick={() => void decideApplication(application, true)} disabled={pendingAction === `application-${application.id}`} className="h-auto rounded-none bg-emerald-700 px-3 py-2 hover:bg-emerald-800">通过</Button></div></article>)}</div> : null}
          <PageNavigation meta={applicationMeta} onPageChange={setApplicationPage} label="作者申请分页" />
        </div> : null}

        {visible('content-words') ? <>
        <form onSubmit={addWord} className="border border-stone-200 bg-white p-5" aria-busy={loading || undefined}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-700">内容规则</p><h2 className="mt-1 text-xl font-semibold text-stone-950">敏感词库</h2></div><div className="flex shrink-0 items-center gap-2"><span className="text-xs text-stone-500">{wordMeta.total.toLocaleString('zh-CN')} 条</span><Button type="button" variant="outline" size="icon" title="查看敏感词审计" aria-label="查看敏感词审计" onClick={openSensitiveWordAudits} disabled={wordAuditsLoading} className="h-9 w-9 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><History size={16} aria-hidden="true" /></Button><ShieldAlert className="text-emerald-700" size={20} aria-hidden="true" /></div></div>
          <p className="mt-3 text-sm leading-6 text-stone-600">词条命中时，章节会进入人工复核，而不会自动上线。</p>
          <div className="mt-5">
            <Label htmlFor="sensitive-word" className="text-stone-700">敏感词</Label>
            <span className="mt-2 flex">
              <Input id="sensitive-word" aria-label="敏感词" required value={word} onChange={(event) => setWord(event.target.value)} className="h-11 min-w-0 flex-1 rounded-none border-stone-300 bg-white px-3 text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="输入需要拦截的词条" />
              <Button type="submit" disabled={pendingAction === 'word'} className="h-11 shrink-0 rounded-none bg-emerald-700 px-3 hover:bg-emerald-800"><Plus size={15} aria-hidden="true" />添加</Button>
            </span>
          </div>
          <div className="mt-5 divide-y divide-stone-100 border-y border-stone-100" aria-label="当前敏感词">
            {loading && !hasLoaded ? <div className="space-y-4 py-4">{[0, 1].map((item) => <div key={item} className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 flex-1 items-center gap-2"><Skeleton className="h-9 w-48 rounded-none bg-stone-100" /><Skeleton className="h-5 w-14 rounded-none bg-stone-100" /></div><div className="flex gap-1"><Skeleton className="size-8 rounded-none bg-stone-100" /><Skeleton className="size-8 rounded-none bg-stone-100" /></div></div><Skeleton className="h-9 w-full rounded-none bg-stone-100" /></div>)}</div> : null}
            {words.length ? words.map((entry) => {
              const busy = pendingAction?.endsWith(`-${entry.normalizedWord}`) ?? false;
              return (
                <div key={entry.normalizedWord} className="grid gap-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Input
                        aria-label={`敏感词 ${entry.word}`}
                        value={wordEdits[entry.normalizedWord] ?? entry.word}
                        onChange={(event) => setWordEdits((current) => ({ ...current, [entry.normalizedWord]: event.target.value }))}
                        disabled={busy}
                        className="h-9 min-w-0 max-w-48 rounded-none border-stone-300 bg-white px-2 text-sm text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"
                      />
                      <Badge variant="outline" className={`shrink-0 rounded-none ${entry.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-stone-100 text-stone-600'}`}>
                        {entry.enabled ? '生效中' : '已停用'}
                      </Badge>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Button type="button" variant="ghost" size="icon" title="保存敏感词修改" aria-label={`保存敏感词 ${entry.word}`} onClick={() => void saveSensitiveWord(entry)} disabled={busy} className="size-8 rounded-none text-emerald-800 hover:bg-emerald-50"><Save size={15} aria-hidden="true" /></Button>
                      <Button type="button" variant="ghost" size="icon" title={entry.enabled ? '停用敏感词' : '启用敏感词'} aria-label={`${entry.enabled ? '停用' : '启用'}敏感词 ${entry.word}`} onClick={() => void setSensitiveWordEnabled(entry, !entry.enabled)} disabled={busy} className="size-8 rounded-none text-stone-600 hover:bg-stone-100"><Power size={15} aria-hidden="true" /></Button>
                      {!entry.enabled ? <Button type="button" variant="ghost" size="icon" title="删除已停用敏感词" aria-label={`删除敏感词 ${entry.word}`} onClick={() => void deleteSensitiveWord(entry)} disabled={busy} className="size-8 rounded-none text-rose-700 hover:bg-rose-50"><Trash2 size={15} aria-hidden="true" /></Button> : null}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`sensitive-word-reason-${entry.normalizedWord}`} className="text-xs text-stone-600">操作说明</Label>
                    <Input id={`sensitive-word-reason-${entry.normalizedWord}`} aria-label={`敏感词操作说明 ${entry.word}`} value={wordReasons[entry.normalizedWord] ?? ''} onChange={(event) => setWordReasons((current) => ({ ...current, [entry.normalizedWord]: event.target.value }))} disabled={busy} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="修改、启停或删除前填写" />
                  </div>
                </div>
              );
            }) : null}
            {!loading && hasLoaded && words.length === 0 ? <p className="py-4 text-sm text-stone-500">暂未配置词条</p> : null}
          </div>
          <PageNavigation meta={wordMeta} onPageChange={setWordPage} label="敏感词分页" />
        </form>
        <Dialog open={wordAuditOpen} onOpenChange={(open) => {
          setWordAuditOpen(open);
          if (!open) {
            setWordAudits([]);
            setWordAuditMeta(undefined);
            setWordAuditsError('');
          }
        }}>
          <DialogContent className="rounded-none border-stone-200 bg-white p-5 sm:max-w-xl">
            <DialogHeader><DialogTitle className="text-stone-950">敏感词审计</DialogTitle><DialogDescription className="text-stone-600">词条增删、修改与启停均保留操作人和原因。</DialogDescription></DialogHeader>
            <div className="max-h-80 overflow-y-auto divide-y divide-stone-100 border-y border-stone-100">
              {wordAuditsLoading ? <div className="space-y-3 py-5"><Skeleton className="h-14 rounded-none bg-stone-100" /><Skeleton className="h-14 rounded-none bg-stone-100" /></div> : null}
              {!wordAuditsLoading && wordAuditsError ? <div className="py-5"><InlineNotice tone="error">{wordAuditsError}</InlineNotice></div> : null}
              {!wordAuditsLoading && !wordAuditsError && wordAudits.length === 0 ? <p className="py-6 text-center text-sm text-stone-500">暂无敏感词操作记录。</p> : null}
              {!wordAuditsLoading && !wordAuditsError && wordAudits.map((audit) => <article key={audit.id} className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-stone-900">{audit.action} · {audit.word ?? audit.normalizedWord}</p><time className="text-xs text-stone-500" dateTime={audit.createdAt}>{formatRedemptionTime(audit.createdAt)}</time></div><p className="mt-2 text-sm leading-6 text-stone-700">{audit.reason}</p><p className="mt-2 text-xs text-stone-500">操作人 #{audit.operatorUserId}</p></article>)}
            </div>
            {!wordAuditsLoading && !wordAuditsError && wordAuditMeta ? <PageNavigation meta={wordAuditMeta} onPageChange={(page) => void loadSensitiveWordAudits(page)} label="敏感词审计分页" /> : null}
          </DialogContent>
        </Dialog>
        </> : null}
      </section> : null}
      {visible('settings-commercial') ? <CommercialRulesPanel /> : null}
      {visible('settings-email') ? <EmailDeliverySettingsPanel /> : null}
      {visible('operations-discovery') ? <EditorialOperationsPanel /> : null}
      {view === 'operations-home-carousel' ? <HomeCarouselOperationsPanel /> : null}
      {view === 'review-covers' ? <CoverCandidateReviewPanel /> : null}
      {visible('accounts-users', 'content-catalog') ? <AdminOperationsPanels mode={view === 'content-catalog' ? 'catalog' : view === 'accounts-users' ? 'accounts' : 'all'} /> : null}
    </>
  );
}
