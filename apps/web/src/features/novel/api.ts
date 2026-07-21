export type Book = { id:number; title:string; author:string; category:string; words:number; synopsis:string; status:string; serialStatus:string; cover:string; heat?:number; purchasePrice:number };
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
export type AccountProfile = { id:number; name:string; roles:string[] };
export type AccountProfileUpdate = { displayName:string };
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
export type NovelCommentStatus = 'PENDING_REVIEW' | 'VISIBLE' | 'REJECTED';
export type NovelComment = {
  id:number;
  bookId:number;
  chapterId:number | null;
  userId:number;
  authorName:string;
  content:string;
  status:NovelCommentStatus;
  createdAt:string;
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
};
export type ParagraphAnnotationPage = {
  items:ParagraphAnnotation[];
  meta:{ total:number; page:number; size:number };
};
export type DiscoveryWordCountRange = { key:string; label:string; minWords:number | null; maxWords:number | null };
export type DiscoveryFacets = { categories:string[]; serialStatuses:string[]; wordCountRanges:DiscoveryWordCountRange[] };
export type PublicTaxonomyItem = { id:number; type:string; name:string; enabled:boolean; sortOrder:number };
export type PublicCatalogPage = {
  items:Book[];
  meta:{
    total:number;
    facets:DiscoveryFacets;
    query:{ query:string; category:string; serialStatus:string; minWords:number | null; maxWords:number | null };
  };
};
export type PublicDiscoveryHome = { carousel:Book[]; recommendations:Book[]; hot:Book[]; hotSearchTerms?:HotSearchTerm[]; facets?:DiscoveryFacets };
export type AuthorAnalyticsTrendPoint = {
  date:string;
  favoriteAddCount:number;
  purchaseCount:number;
  purchaseTokenAmount:number;
};
export type AuthorAnalyticsBookMetric = {
  bookId:number;
  bookTitle:string;
  currentFavoriteCount:number;
  purchaseCount:number;
  purchaseTokenAmount:number;
  activeReaderBookCount:number;
  averageReadThroughPercent:number;
};
export type AuthorAnalyticsMetricAvailability = { available:boolean; reason:string };
export type AuthorAnalyticsSubscriptionMetrics = {
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
    purchaseCount:number;
    purchaseTokenAmount:number;
    activeReaderBookCount:number;
    activeReaderCount:number;
    completedReaderBookCount:number;
    averageReadThroughPercent:number;
    amountUnit:string;
  };
  dailyTrend:AuthorAnalyticsTrendPoint[];
  bookMetrics:AuthorAnalyticsBookMetric[];
  subscriptionMetrics:AuthorAnalyticsSubscriptionMetrics;
  retentionMetrics:AuthorAnalyticsRetentionMetrics;
  availability:{ subscription:AuthorAnalyticsMetricAvailability; retention:AuthorAnalyticsMetricAvailability };
  meta:{
    from:string;
    to:string;
    timeZone:string;
    dateBoundary:string;
    maximumWindowDays:number;
    bookMetricTotal:number;
    returnedBookMetricLimit:number;
    bookMetricsTruncated:boolean;
    shelfTrendInclusion:string;
    purchaseInclusion:string;
    readThroughDefinition:string;
    subscriptionInclusion:string;
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
