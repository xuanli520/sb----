export type Book = { id:number; title:string; author:string; category:string; words:number; synopsis:string; status:string; serialStatus:string; cover:string | null; heat?:number; purchasePrice:number };
export type BookStatusAudit = {
  id:number;
  bookId:number;
  action:'TAKEDOWN' | 'RESTORE_FOR_REVIEW';
  previousStatus:'PUBLISHED' | 'OFFLINE';
  status:'OFFLINE' | 'PENDING_REVIEW';
  reason:string;
  operatorUserId:number;
  createdAt:string;
};
/** Zero-based audit-history page returned to the affected author and stationmaster. */
export type BookStatusAuditPage = {
  items:BookStatusAudit[];
  meta:{ total:number; page:number; size:number };
};
export type EditorialRecommendation = { book:Book; rank:number };
export type EditorialRecommendationAudit = {
  id:number;
  bookId:number;
  action:string;
  previousRank:number | null;
  rank:number | null;
  details:string;
  operatorUserId:number;
  createdAt:string;
};
export type HotSearchTerm = {
  id:number;
  term:string;
  enabled:boolean;
  rank:number;
  createdByUserId:number | null;
  updatedByUserId:number | null;
  createdAt:string;
  updatedAt:string;
};
export type HotSearchTermAudit = {
  id:number;
  termId:number;
  term:string;
  action:string;
  previousRank:number | null;
  rank:number | null;
  details:string;
  operatorUserId:number;
  createdAt:string;
};
export type AccountProfile = { id:number; name:string; roles:string[]; passwordChangeRequired:boolean };
export type AccountProfileUpdate = { displayName:string };
/** Credential-free SMTP configuration returned only to the station super administrator. */
export type EmailDeliverySettings = {
  source:'DEPLOYMENT' | 'ADMIN';
  enabled:boolean;
  host:string;
  port:number;
  username:string;
  from:string;
  smtpAuth:boolean;
  sslEnabled:boolean;
  passwordConfigured:boolean;
  verificationHashSecretConfigured:boolean;
  updatedByUserId:number | null;
  updatedAt:string | null;
};
export type AccountMembershipEntitlement = { expiresAt:string; active:boolean };
export type AccountBookEntitlement = {
  bookId:number;
  bookTitle:string;
  sourceType:string;
  sourceReference:string;
  purchaseAmount:number;
  amountUnit:string;
  acquiredAt:string;
};
export type AccountEntitlements = {
  membership:AccountMembershipEntitlement | null;
  books:AccountBookEntitlement[];
};
/** A free reader follow for one published work. It is unrelated to bookshelf or paid access. */
export type BookSubscription = {
  bookId:number;
  subscribed:boolean;
  subscribedAt:string | null;
};
export type CommercialRules = {
  membershipDaysMaximumPerCode:number;
  recommendationVotesPerDay:number;
  monthlyVotesPerMonth:number;
  rewardMinimumTokens:number;
  rewardMaximumTokensPerReward:number;
  rewardMaximumTokensPerDay:number;
  updatedAt:string;
};
export type CommercialRuleAudit = {
  id:number;
  previousRules:CommercialRules;
  updatedRules:CommercialRules;
  reason:string;
  operatorUserId:number;
  createdAt:string;
};
export type NovelCommentStatus = 'PENDING_REVIEW' | 'VISIBLE' | 'REJECTED';
export type AuthorModerationAdvice = {
  recommendation:'RECOMMEND_VISIBLE' | 'RECOMMEND_REJECTED';
  reason:string;
  updatedAt:string;
};
export type NovelComment = {
  id:number;
  bookId:number;
  chapterId:number | null;
  userId:number;
  authorName:string;
  content:string;
  status:NovelCommentStatus;
  createdAt:string;
  authorModerationAdvice?:AuthorModerationAdvice;
};
export type NovelCommentPage = {
  items:NovelComment[];
  meta:{ total:number; page:number; size:number };
};
export type AuthorCommentStatus = NovelCommentStatus;
export type AuthorComment = NovelComment;
export type AuthorCommentPage = NovelCommentPage;
export type ParagraphAnnotationStatus = 'PRIVATE' | 'PENDING_REVIEW' | 'VISIBLE' | 'REJECTED';
export type ParagraphAnnotation = {
  id:number;
  bookId:number;
  chapterId:number;
  userId:number;
  authorName:string;
  paragraphIndex:number;
  selectionStart:number;
  selectionEnd:number;
  selectedText:string;
  note:string;
  shareIntent:boolean;
  status:ParagraphAnnotationStatus;
  createdAt:string;
  authorModerationAdvice?:AuthorModerationAdvice;
};
export type ParagraphAnnotationPage = {
  items:ParagraphAnnotation[];
  meta:{ total:number; page:number; size:number };
};
export type PublicParagraphAnnotation = {
  id:number;
  bookId:number;
  chapterId:number;
  authorName:string;
  paragraphIndex:number;
  selectionStart:number;
  selectionEnd:number;
  selectedText:string;
  note:string;
  createdAt:string;
};
export type PublicParagraphAnnotationPage = {
  items:PublicParagraphAnnotation[];
  meta:{ total:number; page:number; size:number };
};
export type InteractionStats = {
  visibleCommentCount:number;
  ratingCount:number;
  averageRating:number;
  recommendationVoteCount:number;
  monthlyVoteCount:number;
};
/** Public and workspace read models include the durable interaction projection. */
export type BookPresentation = Book & { metrics:InteractionStats };
/** Shared zero-based envelope returned by author and stationmaster book listings. */
export type BookPresentationPage = {
  items:BookPresentation[];
  meta:{ total:number; page:number; size:number };
};
export type ChapterCandidateType = 'NEW_CHAPTER' | 'CHAPTER_REVISION';
export type ChapterCandidateStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
/** Immutable review candidate; a public chapter is not replaced until this candidate is approved. */
export type ChapterCandidate = {
  id:number;
  bookId:number;
  targetChapterId:number;
  volumeId:number | null;
  type:ChapterCandidateType;
  title:string;
  content:string;
  orderNo:number;
  status:ChapterCandidateStatus;
  reviewReason:string | null;
  moderationAuditId:number | null;
  createdByUserId:number;
  createdAt:string;
  reviewedByUserId:number | null;
  reviewedAt:string | null;
};
/** A staged replacement for a public cover; its private object is never exposed to public catalog readers. */
export type BookCoverCandidate = {
  id:number;
  bookId:number;
  assetId:string;
  approvedAssetId:string | null;
  status:'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewReason:string | null;
  createdByUserId:number;
  createdAt:string;
  reviewedByUserId:number | null;
  reviewedAt:string | null;
};
/** A draft cover is active immediately; a published cover returns a retained review candidate. */
export type AuthorCoverUploadResult = {
  book:BookPresentation;
  candidate:BookCoverCandidate | null;
};
/** Exactly one field is actionable: `book` for whole-work review or `candidate` for an incremental change. */
export type ModerationReviewQueueItem = {
  scope:'WHOLE_BOOK' | 'NEW_CHAPTER' | 'CHAPTER_REVISION';
  book:Book | null;
  candidate:ChapterCandidate | null;
};
export type ModerationReviewQueuePage = {
  items:ModerationReviewQueueItem[];
  meta:{ total:number; page:number; size:number };
};
export type HomeCarouselSlide = {
  slideId:number;
  book:BookPresentation;
  bannerAssetId:string | null;
  bannerUrl:string | null;
  headline:string | null;
  copy:string | null;
  enabled:boolean;
  rank:number;
  version:number;
  createdAt:string;
  updatedAt:string;
};
export type AdminHomeCarouselSlide = Omit<HomeCarouselSlide, 'version' | 'createdAt' | 'updatedAt'> & {
  version:number;
  createdAt:string;
  updatedAt:string;
};
export type HomeCarouselSlideAudit = {
  id:number;
  slideId:number;
  bookId:number;
  action:string;
  details:string;
  operatorUserId:number | null;
  createdAt:string;
};
export type PlatformBannerAsset = {
  id:string;
  ownerScope:'PLATFORM';
  ownerUserId:null;
  purpose:'HOME_CAROUSEL_BANNER';
  objectKey:string;
  publicUrl:string;
  sha256:string;
  contentType:string;
  width:number;
  height:number;
  byteSize:number;
  label:string | null;
  state:'ACTIVE' | 'ARCHIVED' | 'PENDING_DELETE' | 'DELETED';
  createdAt:string;
  updatedAt:string;
  archivedAt:string | null;
  deletedAt:string | null;
};
export type PlatformBannerAssetPage = {
  items:PlatformBannerAsset[];
  meta:{ total:number; page:number; size:number };
};
export type MediaAssetBinding = {
  id:number;
  assetId:string;
  bindingType:'BOOK_COVER' | 'HOME_CAROUSEL_BANNER';
  targetId:number;
  createdByUserId:number | null;
  createdAt:string;
};
export type MediaAssetAudit = {
  id:number;
  assetId:string;
  action:string;
  details:string;
  operatorUserId:number | null;
  createdAt:string;
};
export type DiscoveryWordCountRange = { key:string; label:string; minWords:number | null; maxWords:number | null };
export type DiscoveryFacets = { categories:string[]; serialStatuses:string[]; wordCountRanges:DiscoveryWordCountRange[] };
export type PublicTaxonomyItem = { id:number; type:string; name:string; enabled:boolean; sortOrder:number };
export type PublicCatalogPage = {
  items:BookPresentation[];
  meta:{
    total:number;
    page:number;
    size:number;
    facets:DiscoveryFacets;
    query:{ query:string; category:string; serialStatus:string; minWords:number | null; maxWords:number | null };
  };
};
/** Author-owned work list, paged by the server to avoid loading a whole catalog in the workspace. */
export type AuthorBookPage = BookPresentationPage;
export type PublicDiscoveryHome = {
  carousel:HomeCarouselSlide[];
  recommendations:BookPresentation[];
  hot:BookPresentation[];
  hotSearchTerms:HotSearchTerm[];
  facets:DiscoveryFacets;
};
export type AuthorAnalyticsTrendPoint = {
  date:string;
  favoriteAddCount:number;
  favoriteRemoveCount:number;
  subscriptionAddCount:number;
  subscriptionRemoveCount:number;
  purchaseCount:number;
  purchaseTokenAmount:number;
};
export type AuthorAnalyticsBookMetric = {
  bookId:number;
  bookTitle:string;
  currentFavoriteCount:number;
  currentSubscriptionCount:number;
  subscriptionAddCount:number;
  subscriptionRemoveCount:number;
  ratingCount:number;
  averageRating:number;
  purchaseCount:number;
  purchaseTokenAmount:number;
  activeReaderBookCount:number;
  averageReadThroughPercent:number;
};
export type AuthorAnalyticsMetricAvailability = { available:boolean; reason:string };
export type AuthorAnalyticsSubscriptionMetrics = {
  currentSubscriptionCount:number;
  currentSubscriberCount:number;
  subscriptionAddCount:number;
  subscriptionRemoveCount:number;
};
/**
 * Historical membership-redemption attribution is deliberately separate from
 * a reader following a free work. It must never be labelled as a subscription.
 */
export type AuthorAnalyticsMembershipAttributionMetrics = {
  attributedGrantCount:number;
  attributedReaderCount:number;
  membershipDayCount:number;
};
export type AuthorAnalyticsRetentionMetrics = {
  cohortReaderBookCount:number;
  day1EligibleReaderBookCount:number;
  day1RetainedReaderBookCount:number;
  day1RetentionPercent:number | null;
  day7EligibleReaderBookCount:number;
  day7RetainedReaderBookCount:number;
  day7RetentionPercent:number | null;
  observedThrough:string;
};
export type AuthorAnalyticsReport = {
  summary:{
    currentFavoriteCount:number;
    currentSubscriptionCount:number;
    currentSubscriberCount:number;
    ratingCount:number;
    averageRating:number;
    purchaseCount:number;
    purchaseTokenAmount:number;
    activeReaderBookCount:number;
    activeReaderCount:number;
    currentReaderBookCount:number;
    currentReaderCount:number;
    completedReaderBookCount:number;
    averageReadThroughPercent:number;
    amountUnit:string;
  };
  dailyTrend:AuthorAnalyticsTrendPoint[];
  bookMetrics:AuthorAnalyticsBookMetric[];
  subscriptionMetrics:AuthorAnalyticsSubscriptionMetrics;
  membershipAttributionMetrics:AuthorAnalyticsMembershipAttributionMetrics;
  retentionMetrics:AuthorAnalyticsRetentionMetrics;
  availability:{
    subscription:AuthorAnalyticsMetricAvailability;
    favorite:AuthorAnalyticsMetricAvailability;
    retention:AuthorAnalyticsMetricAvailability;
  };
  meta:{
    from:string;
    to:string;
    timeZone:string;
    dateBoundary:string;
    maximumWindowDays:number;
    bookMetricTotal:number;
    returnedBookMetricLimit:number;
    bookMetricsTruncated:boolean;
    favoriteTrendInclusion:string;
    purchaseInclusion:string;
    readThroughDefinition:string;
    activeReadingDefinition:string;
    subscriptionInclusion:string;
    membershipAttributionInclusion:string;
    historicalObservationBoundary:string;
    retentionDefinition:string;
  };
};
export type RetentionMetric = {
  cohortReaderCount:number;
  day1EligibleReaderCount:number;
  day1RetainedReaderCount:number;
  day1RetentionPercent:number | null;
  day7EligibleReaderCount:number;
  day7RetainedReaderCount:number;
  day7RetentionPercent:number | null;
};
export type PlatformRetentionReport = {
  summary:{ activeReaderCount:number; metric:RetentionMetric };
  dailyCohorts:Array<{ cohortDate:string; channel:string; metric:RetentionMetric }>;
  channels:Array<{ channel:string; activeReaderCount:number; metric:RetentionMetric }>;
  meta:{
    from:string;
    to:string;
    asOf:string;
    timeZone:string;
    cohortDefinition:string;
    day1Definition:string;
    day7Definition:string;
    channelAttributionDefinition:string;
    privacyBoundary:string;
  };
};
function csrfToken(){return typeof document==='undefined'?'':document.cookie.split('; ').find(item=>item.startsWith('novel_csrf='))?.slice('novel_csrf='.length)||'';}
function isFormDataBody(body: BodyInit | null | undefined): body is FormData { return typeof FormData !== 'undefined' && body instanceof FormData; }
export async function novelApi<T>(path:string, _role='reader', init:RequestInit={}):Promise<T> {
  // The BFF derives identity from the server-side session. Retain this argument
  // temporarily so existing role-aware call sites do not transmit a spoofable role.
  void _role;
  const method=(init.method||'GET').toUpperCase();const headers=new Headers(init.headers);if(!isFormDataBody(init.body)&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');if(['POST','PUT','PATCH','DELETE'].includes(method))headers.set('X-Novel-CSRF',csrfToken());const response=await fetch(`/api/novel/${path}`,{...init,headers});const body=await response.json();if(!response.ok)throw new Error(body.msg||'请求失败');return body.data as T;
}
