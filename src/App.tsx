import React, { useState, useRef, useEffect } from 'react';
import { Download, Loader2, AlertCircle, FileText, CheckCircle2, Search, ArrowRight, ArrowLeft, Crosshair, Check, Copy, ExternalLink, Zap, Lock, User, RotateCcw } from 'lucide-react';
import { ProfileForm } from './components/profile/ProfileForm';
import { SkillsMultiSelect } from './components/profile/SkillsMultiSelect';
import { fetchAllPosts, timeAgo, type RedditPost, type FetchProgress } from './utils/reddit';
import { findStaticSubreddits } from './utils/niches';
import { discoverSubredditsAI } from './utils/discover';
import { saveSession, listSessions, deleteSession, generateId, type Session } from './utils/session';
import { getRemainingFree, incrementUsage, isPro, activateSession, activateDev, getProData, getAuthHeaders, MONTHLY_URL, LIFETIME_URL, FREE_VISIBLE_PAIN_POINTS } from './utils/paywall';
import { saveProfile, getProfile, getProfileOnboardingStatus, setProfileOnboardingStatus as persistProfileOnboardingStatus, isProfileComplete, isRelevantCategory, type ProfileOnboardingStatus, type UserProfile, type UserRole } from './utils/profile';
import { buildSkillGroups, getRoleLabel } from './utils/profileCatalog';

const AI_ENDPOINT = '/api/ai';

interface PainPoint {
  title: string;
  pain_summary: string;
  category: string;
  reddit_link: string;
  score: number;
}

interface Summary {
  summary: string[];
  top_categories: string[];
}

const BATCH_SIZE = 20;

const MODEL_CHAIN = [
  'glm-5',
  'glm-4.7',
];

type Step = 1 | 2 | 3 | 4;
type ProfileOnboardingStep = 'intro' | 'details';
type ProfileTab = 'basis' | 'skills' | 'pro';

const PROFILE_TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: 'basis', label: 'Basis' },
  { id: 'skills', label: 'Skills' },
  { id: 'pro', label: 'Pro' },
];

function buildPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages: (number | 'ellipsis')[] = [0];
  const start = Math.max(1, current - 2);
  const end = Math.min(total - 2, current + 2);
  if (start > 1) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 2) pages.push('ellipsis');
  pages.push(total - 1);
  return pages;
}

function PostCard({ post, num }: { post: RedditPost; num: number }) {
  const permalink = 'https://www.reddit.com' + (post.permalink || '');
  const selftext = post.selftext.length > 250 ? post.selftext.substring(0, 250) + '\u2026' : post.selftext;
  return (
    <div className="post-card">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: '#3a3a3a', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0, minWidth: 28 }}>{num}</span>
        <a href={permalink} target="_blank" rel="noreferrer" className="post-title">{post.title || '(geen titel)'}</a>
      </div>
      <div style={{ fontSize: '0.72rem', color: '#555', marginTop: 4, paddingLeft: 36, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <span style={{ color: '#5eadd1' }}>u/{post.author}</span>
        <span className="sep">&middot;</span>
        <span style={{ color: '#8b7cc8' }}>r/{post.subreddit}</span>
        <span className="sep">&middot;</span>
        <span style={{ color: '#c9a227' }}>{post.score} pts</span>
        <span className="sep">&middot;</span>
        <span>{post.num_comments} comments</span>
        <span className="sep">&middot;</span>
        <span>{post.created_utc ? timeAgo(post.created_utc) : '?'}</span>
        {post.link_flair_text && (
          <>
            <span className="sep">&middot;</span>
            <span className="flair-badge">{post.link_flair_text}</span>
          </>
        )}
      </div>
      {post.is_self && post.selftext ? (
        <div className="post-selftext">{selftext}</div>
      ) : !post.is_self && post.url ? (
        <a href={post.url} target="_blank" rel="noreferrer" className="post-link-url">{post.url}</a>
      ) : null}
    </div>
  );
}

function PainPointCard({ point, index, relevant }: { point: PainPoint; index: number; relevant?: boolean }) {
  const link = point.reddit_link.startsWith('http') ? point.reddit_link : `https://reddit.com${point.reddit_link}`;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${point.title}\n\n${point.pain_summary}\n\nCategory: ${point.category} | Score: ${point.score}\n${link}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pain-card" style={{ animationDelay: `${index * 0.05}s` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="category-badge">{point.category}</span>
          {relevant && <span className="relevant-badge">For you</span>}
        </div>
        <span className="score-badge">&uarr; {point.score}</span>
      </div>
      <h3 className="pain-title">{point.title}</h3>
      <p className="pain-summary">{point.pain_summary}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <button onClick={handleCopy} className={`copy-btn ${copied ? 'copied' : ''}`}>
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
        <a href={link} target="_blank" rel="noopener noreferrer" className="pain-link">
          <ExternalLink size={13} /> View post
        </a>
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { n: 1, label: 'Choose niche' },
    { n: 2, label: 'Subreddits' },
    { n: 3, label: 'Browse posts' },
    { n: 4, label: 'Pain points' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={`step-circle ${current > s.n ? 'completed' : current >= s.n ? 'active' : ''}`}>
              {current > s.n ? <Check size={14} strokeWidth={3} /> : s.n}
            </div>
            <span className={`step-label ${current >= s.n ? 'active' : ''}`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`step-line ${current > s.n ? 'active' : ''}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState<Step>(1);

  const [nicheInput, setNicheInput] = useState('');
  const [sortOption, setSortOption] = useState('new');
  const [suggestedSubs, setSuggestedSubs] = useState<string[]>([]);
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryWarning, setDiscoveryWarning] = useState<string | null>(null);

  const [isFetching, setIsFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<FetchProgress | null>(null);
  const [fetchingSub, setFetchingSub] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const [parsedPosts, setParsedPosts] = useState<RedditPost[]>([]);
  const [postPage, setPostPage] = useState(0);
  const [postsPerPage, setPostsPerPage] = useState(25);
  const [analyzeLimit, setAnalyzeLimit] = useState<number>(100);
  const [analyzedCount, setAnalyzedCount] = useState(0);

  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [totalPainPointsFound, setTotalPainPointsFound] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [activeModel, setActiveModel] = useState<string>(MODEL_CHAIN[0]);
  const [ppFilter, setPpFilter] = useState('');
  const [ppCategory, setPpCategory] = useState('all');
  const [ppSort, setPpSort] = useState<'score' | 'category'>('score');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sessions, setSessions] = useState<Session[]>(() => listSessions());
  const [showSessions, setShowSessions] = useState(false);
  const sessionIdRef = useRef<string>(generateId());

  const [error, setError] = useState<string | null>(null);
  const [proStatus, setProStatus] = useState<boolean>(() => isPro());
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  // Profiel state
  const [profile, setProfile] = useState<UserProfile | null>(() => getProfile());
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<ProfileOnboardingStatus>(() => getProfileOnboardingStatus());
  const [onboardingStep, setOnboardingStep] = useState<ProfileOnboardingStep>('intro');
  const [profileName, setProfileName] = useState(() => getProfile()?.name ?? '');
  const [profileRole, setProfileRole] = useState<UserRole | null>(() => getProfile()?.role ?? null);
  const [profileSkills, setProfileSkills] = useState<string[]>(() => getProfile()?.skills ?? []);
  const [profileTab, setProfileTab] = useState<ProfileTab>('basis');
  const [profileFormError, setProfileFormError] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseMsg, setLicenseMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const syncProfileForm = (nextProfile: UserProfile | null = profile) => {
    setProfileName(nextProfile?.name ?? '');
    setProfileRole(nextProfile?.role ?? null);
    setProfileSkills(nextProfile?.skills ?? []);
    setProfileTab('basis');
    setProfileFormError(null);
  };

  const openProfileEditor = () => {
    syncProfileForm();
    setLicenseMsg(null);
    setShowProfileEditor(true);
  };

  const handleProfileButtonClick = () => {
    if (!profile && onboardingStatus === 'unseen' && step === 1) {
      setProfileFormError(null);
      setOnboardingStep('details');
      return;
    }

    openProfileEditor();
  };

  const persistProfile = () => {
    if (!profileRole) {
      setProfileFormError('Please select your role. This helps Painr rank results smarter for you.');
      return false;
    }

    const p: UserProfile = {
      name: profileName.trim(),
      role: profileRole,
      skills: Array.from(new Set(profileSkills.map(skill => skill.trim()).filter((skill): skill is string => Boolean(skill)))) as string[],
    };

    saveProfile(p);
    setProfile(p);
    setOnboardingStatus('completed');
    setOnboardingStep('intro');
    setProfileFormError(null);
    return true;
  };

  const handleOnboardingSave = () => {
    persistProfile();
  };

  const handleProfileEditorSave = () => {
    if (!persistProfile()) return;
    setShowProfileEditor(false);
  };

  const handleSkipProfileSetup = () => {
    persistProfileOnboardingStatus('skipped');
    setOnboardingStatus('skipped');
    setOnboardingStep('intro');
    setProfileFormError(null);
  };

  const activateLicenseKey = () => {
    if (activateDev(licenseKey.trim())) {
      setProStatus(true);
      setLicenseMsg({ ok: true, text: 'Pro activated!' });
    } else {
      setLicenseMsg({ ok: false, text: 'Invalid key' });
    }
  };

  // After Stripe payment
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (!sessionId) return;
    window.history.replaceState({}, '', window.location.pathname);
    setActivating(true);
    activateSession(sessionId).then(result => {
      setActivating(false);
      if (result.success) {
        setProStatus(true);
        setShowUpgrade(false);
      } else {
        setActivateError(result.error ?? 'Activation failed');
      }
    });
  }, []);

  const resetAll = () => {
    setStep(1);
    setNicheInput('');
    setSuggestedSubs([]);
    setSelectedSubs(new Set());
    setDiscoveryWarning(null);
    setParsedPosts([]);
    setPainPoints([]);
    setTotalPainPointsFound(0);
    setFetchStatus(null);
    setFetchingSub(null);
    setError(null);
    setPostPage(0);
    setProgress({ processed: 0, total: 0 });
    setPpFilter('');
    setPpCategory('all');
    setSummary(null);
  };

  const handleDiscoverNiche = async () => {
    if (!nicheInput.trim() || isDiscovering) return;
    setIsDiscovering(true);
    setError(null);
    setDiscoveryWarning(null);
    setSuggestedSubs([]);
    const staticSubs = findStaticSubreddits(nicheInput);
    setSuggestedSubs(staticSubs);
    setSelectedSubs(new Set(staticSubs));

    try {
      const aiSubs = await discoverSubredditsAI(nicheInput);
      const merged = [...new Set([...staticSubs, ...aiSubs])];
      if (merged.length === 0) {
        throw new Error('No subreddits found for this niche.');
      }
      setSuggestedSubs(merged);
      setSelectedSubs(new Set(merged));
      setStep(2);
    } catch (e: any) {
      if (staticSubs.length > 0) {
        setSuggestedSubs(staticSubs);
        setSelectedSubs(new Set(staticSubs));
        setDiscoveryWarning('AI suggestions could not be loaded. You can continue with the static subreddit selection.');
        setStep(2);
      } else {
        setError(e.message || 'Could not find subreddits');
      }
    } finally {
      setIsDiscovering(false);
    }
  };

  const toggleSub = (sub: string) => {
    setSelectedSubs(prev => {
      const next = new Set(prev);
      next.has(sub) ? next.delete(sub) : next.add(sub);
      return next;
    });
  };

  const handleFetchPosts = async () => {
    if (isFetching || selectedSubs.size === 0) return;
    setError(null);
    setParsedPosts([]);
    setPainPoints([]);
    setPostPage(0);
    setIsFetching(true);
    cancelRef.current = false;

    const postsBySub = new Map<string, RedditPost[]>();
    const updateCombined = () => {
      const combined = Array.from(postsBySub.values()).flat();
      setParsedPosts([...combined]);
    };

    try {
      // Fetch all subreddits in parallel
      const selectedSubList = Array.from(selectedSubs.values()) as string[];

      await Promise.allSettled(
        selectedSubList.map(async sub => {
          const posts = await fetchAllPosts('r/' + sub, sortOption, (prog, current) => {
            postsBySub.set(sub, current);
            updateCombined();
            setFetchStatus(prog);
            setFetchingSub(sub);
          }, cancelRef);
          postsBySub.set(sub, posts);
        })
      );

      // Definitieve set na alle fetches — voorkomt inconsistentie door parallel state updates
      const allPosts = Array.from(postsBySub.values()).flat();
      setParsedPosts(allPosts);
      setPostPage(0);
      if (allPosts.length > 0) setStep(3);
    } catch (e: any) {
      setError(e.message || 'Er ging iets mis');
    } finally {
      setIsFetching(false);
      setFetchingSub(null);
      setFetchStatus(null);
    }
  };

  const processPosts = async () => {
    if (parsedPosts.length === 0) return;

    const limit = proStatus ? analyzeLimit : 0;
    const postsToAnalyze = [...parsedPosts]
      .sort((a, b) => b.created_utc - a.created_utc)
      .slice(0, limit === 0 ? undefined : limit);

    setStep(4);
    setIsProcessing(true);
    setError(null);
    setPainPoints([]);
    setSummary(null);
    setAnalyzedCount(postsToAnalyze.length);
    setProgress({ processed: 0, total: postsToAnalyze.length });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ posts: postsToAnalyze.map(p => ({ title: p.title, selftext: p.selftext, permalink: p.permalink, score: p.score })) }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 403 && data.error === 'limit_reached') {
          setShowUpgrade(true);
          setStep(3);
          return;
        }
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setPainPoints(data.painPoints ?? []);
      setTotalPainPointsFound(data.totalFound ?? data.painPoints?.length ?? 0);
      setSummary(data.summary ?? null);
      setAnalyzedCount(data.totalFound ?? data.painPoints?.length ?? 0);
      setProgress({ processed: postsToAnalyze.length, total: postsToAnalyze.length });
      incrementUsage();

      // Auto-save sessie
      const sess: Session = {
        id: sessionIdRef.current,
        niche: nicheInput,
        subreddits: Array.from(selectedSubs),
        posts: parsedPosts,
        painPoints: data.painPoints ?? [],
        summary: data.summary ?? null,
        createdAt: Date.now(),
      };
      saveSession(sess);
      setSessions(listSessions());
    } catch (err: any) {
      setError(`Analysis failed: ${err.message || 'Something went wrong while processing.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const loadSession = (s: Session) => {
    sessionIdRef.current = s.id;
    setNicheInput(s.niche);
    setSelectedSubs(new Set(s.subreddits));
    setSuggestedSubs(s.subreddits);
    setParsedPosts(s.posts);
    setPainPoints(s.painPoints);
    setSummary(s.summary);
    setAnalyzedCount(s.painPoints.length);
    setStep(4);
    setShowSessions(false);
  };

  const removeSession = (id: string) => {
    deleteSession(id);
    setSessions(listSessions());
  };

  const exportToCsv = () => {
    if (painPoints.length === 0) return;
    const headers = ['Title', 'Pain Summary', 'Category', 'Reddit Link', 'Score'];
    const rows = painPoints.map(p => {
      const link = p.reddit_link.startsWith('http') ? p.reddit_link : `https://reddit.com${p.reddit_link}`;
      return [
        `"${(p.title || '').replace(/"/g, '""')}"`,
        `"${(p.pain_summary || '').replace(/"/g, '""')}"`,
        `"${(p.category || '').replace(/"/g, '""')}"`,
        `"${link}"`,
        p.score,
      ];
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'pain_points.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJson = () => {
    if (painPoints.length === 0) return;
    const data = painPoints.map(p => ({ ...p, reddit_link: p.reddit_link.startsWith('http') ? p.reddit_link : `https://reddit.com${p.reddit_link}` }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'pain_points.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const exportToMarkdown = () => {
    if (painPoints.length === 0) return;
    const lines = [`# Pain Points — ${nicheInput}\n`, `> ${painPoints.length} pain points · ${new Date().toLocaleDateString('en-US')}\n`];
    if (summary) {
      lines.push(`## Summary\n`);
      summary.summary.forEach(s => lines.push(`- ${s}`));
      lines.push(`\n**Top categories:** ${summary.top_categories.join(', ')}\n`);
    }
    lines.push(`---\n`);
    painPoints.forEach(p => {
      const link = p.reddit_link.startsWith('http') ? p.reddit_link : `https://reddit.com${p.reddit_link}`;
      lines.push(`## ${p.title}\n`);
      lines.push(`${p.pain_summary}\n`);
      lines.push(`**Category:** ${p.category} | **Score:** ↑${p.score} | [View post](${link})\n`);
      lines.push(`---\n`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'pain_points.md';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // Filter + sort pain points
  const filteredPainPoints = painPoints
    .filter(p => ppCategory === 'all' || p.category === ppCategory)
    .filter(p => !ppFilter || p.title.toLowerCase().includes(ppFilter.toLowerCase()) || p.pain_summary.toLowerCase().includes(ppFilter.toLowerCase()))
    .sort((a, b) => {
      // Relevant voor profiel-rol gaat eerst, daarna normale sort
      const aRel = isRelevantCategory(a.category, profile) ? 1 : 0;
      const bRel = isRelevantCategory(b.category, profile) ? 1 : 0;
      if (bRel !== aRel) return bRel - aRel;
      return ppSort === 'score' ? b.score - a.score : a.category.localeCompare(b.category);
    });
  const uniqueCategories = [...new Set(painPoints.map(p => p.category))].sort();

  // Pagination
  const effectivePerPage = postsPerPage === 0 ? parsedPosts.length || 1 : postsPerPage;
  const totalPages = Math.ceil(parsedPosts.length / effectivePerPage) || 1;
  const pageStart = postPage * effectivePerPage;
  const pageEnd = Math.min(pageStart + effectivePerPage, parsedPosts.length);
  const visiblePosts = parsedPosts.slice(pageStart, pageEnd);
  const pageNumbers = buildPageNumbers(postPage, totalPages);
  const goToPage = (n: number) => setPostPage(Math.max(0, Math.min(n, totalPages - 1)));


  const PaginationBar = () => totalPages <= 1 ? null : (
    <div className="pagination">
      <button className={`page-btn ${postPage === 0 ? 'disabled' : ''}`} disabled={postPage === 0} onClick={() => goToPage(postPage - 1)}>&lsaquo;</button>
      {pageNumbers.map((p, i) =>
        p === 'ellipsis'
          ? <span key={'e' + i} className="page-ellipsis">&hellip;</span>
          : <button key={p} className={`page-btn ${p === postPage ? 'active' : ''}`} onClick={() => goToPage(p)}>{p + 1}</button>
      )}
      <button className={`page-btn ${postPage >= totalPages - 1 ? 'disabled' : ''}`} disabled={postPage >= totalPages - 1} onClick={() => goToPage(postPage + 1)}>&rsaquo;</button>
    </div>
  );

  const containerWidth = step === 4 ? 900 : 720;
  const isComplete = isProfileComplete(profile);
  const shouldShowOnboarding = step === 1 && !profile && onboardingStatus === 'unseen';
  const shouldShowProfileReminder = step === 1 && !shouldShowOnboarding && !isComplete;
  const showProfileAttention = !shouldShowOnboarding && !isComplete;
  const profileButtonLabel = isComplete && profile ? (profile.name.trim() || getRoleLabel(profile.role)) : 'Profile';
  const canSubmitProfile = Boolean(profileRole);
  const profileSkillGroups = buildSkillGroups(profileRole, profileSkills);
  const proData = getProData();

  return (
    <div className="app-root">
      <div className="container" style={{ maxWidth: containerWidth }}>
        <div className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Crosshair size={22} className="header-icon" />
              <h1 className="app-title">Painr</h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Profiel knop */}
              <button onClick={handleProfileButtonClick} className={`btn-secondary profile-trigger ${showProfileAttention ? 'attention' : ''}`} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={13} />
                {profileButtonLabel}
                {showProfileAttention && <span className="profile-trigger-badge">Incomplete</span>}
              </button>
            {sessions.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowSessions(s => !s)} className="btn-secondary" style={{ fontSize: '0.78rem' }}>
                  <FileText size={13} /> Sessions ({sessions.length})
                </button>
                {showSessions && (
                  <div className="sessions-dropdown">
                    {sessions.map(s => (
                      <div key={s.id} className="session-item">
                        <button onClick={() => loadSession(s)} className="session-load">
                          <span style={{ fontWeight: 600 }}>{s.niche}</span>
                          <span style={{ color: '#555', fontSize: '0.75rem' }}>{s.painPoints.length} pain points · {new Date(s.createdAt).toLocaleDateString('en-US')}</span>
                        </button>
                        <button onClick={() => removeSession(s.id)} className="session-delete">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
          <p className="app-subtitle">Discover real user problems. Build what people need.</p>
        </div>

        {/* Activatie loader */}
        {activating && (
          <div className="error-box" style={{ background: 'rgba(99,102,241,0.12)', borderColor: '#6366f1', color: '#a5b4fc' }}>
            <Loader2 size={15} className="spin" /> Verifying payment...
          </div>
        )}
        {activateError && (
          <div className="error-box">
            <AlertCircle size={15} /> {activateError}
          </div>
        )}
        {proStatus && !activating && (
          <div className="error-box" style={{ background: 'rgba(74,222,128,0.08)', borderColor: '#4ade80', color: '#4ade80', marginBottom: 8 }}>
            <Zap size={14} /> Pro active — {proData?.plan === 'lifetime' ? 'Lifetime' : 'Monthly'} · {proData?.email}
          </div>
        )}
        {!proStatus && (
          <div style={{ textAlign: 'right', marginBottom: 8 }}>
            <span style={{ fontSize: '0.75rem', color: '#666' }}>{getRemainingFree()} free analysis{getRemainingFree() !== 1 ? 'es' : ''} remaining · </span>
            <button onClick={() => setShowUpgrade(true)} style={{ fontSize: '0.75rem', color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Upgrade to Pro</button>
          </div>
        )}

        <StepIndicator current={step} />

        {error && (
          <div className="error-box">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}

        {discoveryWarning && step <= 2 && (
          <div className="notice-box">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{discoveryWarning}</span>
          </div>
        )}

        {/* ==================== STEP 1 ==================== */}
        {step === 1 && (
          <>
            {shouldShowOnboarding ? (
              <div className="card onboarding-card fade-in">
                <div className="onboarding-progress">
                  <div className={`onboarding-progress-item ${onboardingStep === 'intro' ? 'active' : 'done'}`}>
                    <span className="onboarding-progress-index">1</span>
                    <span>Welcome</span>
                  </div>
                  <div className={`onboarding-progress-item ${onboardingStep === 'details' ? 'active' : ''}`}>
                    <span className="onboarding-progress-index">2</span>
                    <span>Profile</span>
                  </div>
                </div>

                {onboardingStep === 'intro' ? (
                  <div className="onboarding-shell">
                    <div className="onboarding-hero">
                      <span className="onboarding-kicker">First time in Painr</span>
                      <h2 className="onboarding-title">Set up your profile for better ranking</h2>
                      <p className="onboarding-copy">
                        Painr works best when it knows your role. You can still skip this.
                      </p>
                      <div className="onboarding-benefits">
                        <div className="onboarding-benefit">
                          <span className="onboarding-benefit-dot" />
                          Your role is enough to make ranking smarter.
                        </div>
                        <div className="onboarding-benefit">
                          <span className="onboarding-benefit-dot" />
                          Relevant categories rise to the top.
                        </div>
                        <div className="onboarding-benefit">
                          <span className="onboarding-benefit-dot" />
                          You can add skills later in Profile.
                        </div>
                      </div>
                    </div>

                    <div className="onboarding-panel">
                      <div className="onboarding-panel-box">
                        <span className="onboarding-label">Why now?</span>
                        <h3>A quick setup makes everything feel more personal.</h3>
                        <p>
                          We only ask for your role and optionally your name. No account, no long form.
                        </p>
                      </div>

                      <div className="onboarding-actions">
                        <button type="button" onClick={() => setOnboardingStep('details')} className="btn-primary">
                          Set up profile <ArrowRight size={14} />
                        </button>
                        <button type="button" onClick={handleSkipProfileSetup} className="btn-secondary">
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="onboarding-details fade-in">
                    <div>
                      <span className="onboarding-kicker">Profile</span>
                      <h2 className="onboarding-title onboarding-title-small">Complete your profile</h2>
                      <p className="onboarding-copy">
                        Choose your role to personalize ranking. Name is optional. Add skills later in Profile.
                      </p>
                    </div>

                    <ProfileForm
                      error={profileFormError}
                      name={profileName}
                      onNameChange={value => {
                        setProfileName(value);
                        setProfileFormError(null);
                      }}
                      onRoleChange={value => {
                        setProfileRole(value);
                        setProfileFormError(null);
                      }}
                      role={profileRole}
                    />

                    <p className="profile-panel-note">
                      You can add up to 5 skills later in Profile without interrupting your flow.
                    </p>

                    <div className="onboarding-actions onboarding-actions-end">
                      <button type="button" onClick={() => setOnboardingStep('intro')} className="btn-secondary">
                        <ArrowLeft size={14} /> Back
                      </button>
                      <button type="button" onClick={handleSkipProfileSetup} className="btn-secondary">
                        Skip
                      </button>
                      <button type="button" onClick={handleOnboardingSave} className="btn-primary" disabled={!canSubmitProfile}>
                        <Check size={14} /> Save and continue
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {shouldShowProfileReminder && (
                  <div className="card profile-reminder fade-in">
                    <div>
                      <p className="profile-reminder-title">Finish your profile.</p>
                      <p className="profile-reminder-copy">Choose your role for better ranking. You can add skills later in Profile.</p>
                    </div>
                    <button type="button" onClick={openProfileEditor} className="btn-secondary">
                      Complete profile
                    </button>
                  </div>
                )}

                <div className="card fade-in">
                  <div className="search-row">
                    <input
                      type="text" value={nicheInput}
                      onChange={e => setNicheInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleDiscoverNiche()}
                      placeholder="Enter a niche, e.g. freelancing, fitness, SaaS..."
                      className="input"
                    />
                    <button onClick={handleDiscoverNiche} disabled={isDiscovering || !nicheInput.trim()} className="btn-primary">
                      {isDiscovering ? <><Loader2 size={14} className="spin" /> Searching...</> : <><Search size={14} /> Find subreddits</>}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: '#444' }}>Try:</span>
                    {['freelancing', 'fitness', 'SaaS', 'parenting', 'investing', 'dating'].map(ex => (
                      <button key={ex} onClick={() => { setNicheInput(ex); }} className="sub-chip selected" style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ==================== STEP 2: SUBREDDIT SELECTIE ==================== */}
        {step === 2 && (
          <>
            <div className="card action-bar fade-in">
              <button onClick={() => setStep(1)} className="btn-secondary">
                <ArrowLeft size={14} /> Back
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <select value={sortOption} onChange={e => setSortOption(e.target.value)} className="select">
                  <option value="new">Newest</option>
                  <option value="hot">Hot</option>
                  <option value="top">Top</option>
                  <option value="rising">Rising</option>
                </select>
                <button onClick={handleFetchPosts} disabled={isFetching || selectedSubs.size === 0} className="btn-primary">
                  {isFetching
                    ? <><Loader2 size={14} className="spin" /> {fetchingSub ? `r/${fetchingSub}...` : 'Loading...'}</>
                    : <>Fetch posts ({selectedSubs.size}) <ArrowRight size={14} /></>}
                </button>
              </div>
            </div>

            <div className="card fade-in">
              <div className="posts-heading" style={{ marginBottom: 14 }}>
                Subreddits for <span style={{ color: '#a78bfa' }}>{nicheInput}</span>
                <span className="posts-range"> — click to deselect</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {suggestedSubs.map(sub => (
                  <button
                    key={sub}
                    onClick={() => toggleSub(sub)}
                    className={`sub-chip ${selectedSubs.has(sub) ? 'selected' : ''}`}
                  >
                    {selectedSubs.has(sub) ? <Check size={11} /> : null}
                    r/{sub}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ==================== STEP 3: POSTS BEKIJKEN ==================== */}
        {step === 3 && (
          <>
            <div className="card action-bar fade-in">
              <button onClick={() => setStep(2)} className="btn-secondary">
                <ArrowLeft size={14} /> Subreddits
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="post-count-badge">
                  <CheckCircle2 size={14} /> {parsedPosts.length} posts
                </span>
                {proStatus ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: '0.78rem', color: '#666', whiteSpace: 'nowrap' }}>Analyze top:</label>
                    <select
                      value={analyzeLimit}
                      onChange={e => setAnalyzeLimit(Number(e.target.value))}
                      className="select select-small"
                    >
                      <option value={50}>50 of {parsedPosts.length}</option>
                      <option value={100}>100 of {parsedPosts.length}</option>
                      <option value={200}>200 of {parsedPosts.length}</option>
                      <option value={500}>500 of {parsedPosts.length}</option>
                      <option value={0}>All {parsedPosts.length}</option>
                    </select>
                    <span style={{ fontSize: '0.72rem', color: '#555' }}>
                      = ~{Math.ceil(Math.min(analyzeLimit || parsedPosts.length, parsedPosts.length) / BATCH_SIZE)} batches
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.78rem', color: '#888' }}>Analyzing all {parsedPosts.length} posts</span>
                )}
                {painPoints.length > 0 ? (
                  <>
                    <button onClick={() => setStep(4)} className="btn-primary">
                      <CheckCircle2 size={14} /> View results ({painPoints.length})
                    </button>
                    <button onClick={processPosts} className="btn-secondary" style={{ fontSize: '0.78rem' }}>
                      Re-analyze
                    </button>
                  </>
                ) : (
                  <button onClick={processPosts} className="btn-primary">
                    Analyze <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="card fade-in">
              <div className="posts-toolbar">
                <div className="posts-heading">
                  Posts <span className="posts-range">({pageStart + 1}-{pageEnd} of {parsedPosts.length})</span>
                </div>
                <div className="per-page-wrap">
                  <label>Per page:</label>
                  <select
                    value={postsPerPage}
                    onChange={e => { setPostsPerPage(Number(e.target.value)); setPostPage(0); }}
                    className="select select-small"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={0}>All</option>
                  </select>
                </div>
              </div>

              <PaginationBar />
              {visiblePosts.map((post, i) => (
                <React.Fragment key={pageStart + i}>
                  <PostCard post={post} num={pageStart + i + 1} />
                </React.Fragment>
              ))}
              <PaginationBar />
            </div>
          </>
        )}

        {/* ==================== STEP 4: PAIN POINTS ==================== */}
        {step === 4 && (
          <>
            <div className="card action-bar fade-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setStep(3)} disabled={isProcessing} className={`btn-secondary ${isProcessing ? 'disabled' : ''}`}>
                  <ArrowLeft size={14} /> Back to posts
                </button>
                <button onClick={resetAll} disabled={isProcessing} className={`btn-secondary ${isProcessing ? 'disabled' : ''}`}>
                  <RotateCcw size={14} /> Start over
                </button>
              </div>
              {!isProcessing && painPoints.length > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={exportToCsv} className="btn-secondary"><Download size={13} /> CSV</button>
                  <button onClick={proStatus ? exportToJson : () => setShowUpgrade(true)} className="btn-secondary">
                    {proStatus ? <Download size={13} /> : <Lock size={13} />} JSON {!proStatus && <span className="pro-badge">Pro</span>}
                  </button>
                  <button onClick={proStatus ? exportToMarkdown : () => setShowUpgrade(true)} className="btn-secondary">
                    {proStatus ? <Download size={13} /> : <Lock size={13} />} MD {!proStatus && <span className="pro-badge">Pro</span>}
                  </button>
                </div>
              )}
            </div>

            {isProcessing && (
              <div className="card fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span className="progress-label">
                    <Loader2 size={13} className="spin" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                    Via <span style={{ color: '#a78bfa' }}>{activeModel}</span>
                  </span>
                  <span className="progress-label">
                    <span style={{ color: '#4ade80', fontWeight: 700 }}>{painPoints.length} found</span>
                    <span style={{ color: '#444', margin: '0 8px' }}>·</span>
                    {progress.processed} / {analyzedCount} analyzed
                    <span style={{ color: '#444', margin: '0 4px' }}>of</span>
                    {parsedPosts.length} posts
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill gradient" style={{ width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%` }} />
                </div>
                <p className="progress-hint" style={{ marginTop: 8 }}>
                  Analyzing posts...
                </p>
              </div>
            )}

            {painPoints.length > 0 && (
              <>
                {/* AI Summary */}
                {summary && !isProcessing && (
                  proStatus ? (
                    <div className="card fade-in" style={{ borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Crosshair size={15} style={{ color: '#a78bfa' }} />
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#c7d2fe' }}>Summary</span>
                        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                          {summary.top_categories.map(c => <span key={c} className="category-badge">{c}</span>)}
                        </div>
                      </div>
                      <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {summary.summary.map((s, i) => <li key={i} style={{ fontSize: '0.85rem', color: '#bbb' }}>{s}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <div className="card fade-in summary-locked" onClick={() => setShowUpgrade(true)} style={{ borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Crosshair size={15} style={{ color: '#a78bfa' }} />
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#c7d2fe' }}>Summary</span>
                        <span className="pro-badge" style={{ marginLeft: 8 }}>Pro</span>
                      </div>
                      <div style={{ filter: 'blur(6px)', userSelect: 'none' }}>
                        <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {summary.summary.map((s, i) => <li key={i} style={{ fontSize: '0.85rem', color: '#bbb' }}>{s}</li>)}
                        </ul>
                      </div>
                      <div className="blur-upgrade-cta" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,10,0.5)' }}>
                        <Lock size={16} /> <span style={{ marginLeft: 8 }}>Upgrade for AI summary</span>
                      </div>
                    </div>
                  )
                )}

                {/* Filter toolbar */}
                <div className="card fade-in" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                      <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
                      <input
                        type="text" value={ppFilter} onChange={e => setPpFilter(e.target.value)}
                        placeholder="Search pain points..."
                        className="input" style={{ paddingLeft: 30, fontSize: '0.82rem' }}
                      />
                    </div>
                    <select value={ppCategory} onChange={e => setPpCategory(e.target.value)} className="select select-small">
                      <option value="all">All categories</option>
                      {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={ppSort} onChange={e => setPpSort(e.target.value as 'score' | 'category')} className="select select-small">
                      <option value="score">Score ↓</option>
                      <option value="category">Category A→Z</option>
                    </select>
                    <span style={{ fontSize: '0.78rem', color: '#555', whiteSpace: 'nowrap' }}>
                      {filteredPainPoints.length} of {painPoints.length}
                    </span>
                  </div>
                </div>

                <div className="results-header card fade-in">
                  <div>
                    <h2 className="results-title">
                      {isProcessing ? `${painPoints.length} pain points found (analyzing...)` : `${totalPainPointsFound || painPoints.length} pain points found`}
                    </h2>
                    <p className="results-subtitle">From {analyzedCount} analyzed posts · {parsedPosts.length} total fetched</p>
                  </div>
                </div>

                <div className="pain-grid">
                  {filteredPainPoints.map((point, idx) => (
                    <React.Fragment key={idx}>
                      <PainPointCard point={point} index={idx} relevant={isRelevantCategory(point.category, profile)} />
                    </React.Fragment>
                  ))}
                  {!proStatus && totalPainPointsFound > FREE_VISIBLE_PAIN_POINTS && (
                    <div className="upgrade-banner" onClick={() => setShowUpgrade(true)}>
                      <Zap size={18} style={{ color: '#a78bfa' }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>+{totalPainPointsFound - FREE_VISIBLE_PAIN_POINTS} more pain points available</div>
                        <div style={{ fontSize: '0.8rem', color: '#888' }}>Upgrade to Pro to see everything</div>
                      </div>
                      <ArrowRight size={16} style={{ color: '#a78bfa', marginLeft: 'auto' }} />
                    </div>
                  )}
                </div>
              </>
            )}

            {!isProcessing && painPoints.length === 0 && error && parsedPosts.length > 0 && (
              <div className="card analysis-error-card fade-in">
                <div>
                  <p className="analysis-error-title">AI analysis failed, but your posts are still ready.</p>
                  <p className="analysis-error-copy">
                    {parsedPosts.length} fetched posts are preserved. You can retry immediately or go back to the posts.
                  </p>
                </div>
                <button onClick={processPosts} className="btn-secondary">
                  Retry analysis
                </button>
              </div>
            )}

            {!isProcessing && painPoints.length === 0 && !error && (
              <div className="card fade-in" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: '#555', fontSize: '0.88rem' }}>No pain points found. Try a different niche or fetch more posts.</p>
              </div>
            )}
          </>
        )}
      </div>

      <footer className="app-footer">
        Painr &middot; <a href="#/privacy" className="footer-link">Privacy</a> &middot; <a href="#/terms" className="footer-link">Terms</a>
      </footer>

      {/* Profiel editor modal */}
      {showProfileEditor && (
        <div className="modal-overlay" onClick={() => setShowProfileEditor(false)}>
          <div className="modal-card profile-editor-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowProfileEditor(false)}>×</button>
            <div className="profile-editor-shell">
              <div className="profile-editor-top">
                <div className="profile-editor-header">
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 4 }}>{profile ? 'Your profile' : 'Complete profile'}</h2>
                  <p style={{ fontSize: '0.82rem', color: '#888', margin: 0 }}>
                    {profile
                      ? 'Update your profile without interrupting your workflow.'
                      : 'Choose your role first. Manage skills and Pro in separate tabs.'}
                  </p>
                </div>

                <div className="profile-tabs" role="tablist" aria-label="Profile tabs">
                  {PROFILE_TABS.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={profileTab === tab.id}
                      className={`profile-tab ${profileTab === tab.id ? 'active' : ''}`}
                      onClick={() => setProfileTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="profile-editor-body">
                {profileTab === 'basis' && (
                  <div className="profile-panel">
                    <div className="profile-panel-header">
                      <h3>Basics</h3>
                      <p>Role is required for ranking. Name remains optional.</p>
                    </div>

                    <ProfileForm
                      error={profileFormError}
                      name={profileName}
                      onNameChange={value => {
                        setProfileName(value);
                        setProfileFormError(null);
                      }}
                      onRoleChange={value => {
                        setProfileRole(value);
                        setProfileFormError(null);
                      }}
                      role={profileRole}
                    />

                    <button onClick={handleProfileEditorSave} className="btn-primary profile-save-btn" disabled={!canSubmitProfile}>
                      <Check size={14} /> {profile ? 'Save changes' : 'Save profile'}
                    </button>
                  </div>
                )}

                {profileTab === 'skills' && (
                  <div className="profile-panel">
                    <div className="profile-panel-header">
                      <h3>Skills</h3>
                      <p>Choose up to 5 skills. They are role-aware but won't block your analysis flow.</p>
                    </div>

                    <SkillsMultiSelect
                      disabled={!profileRole}
                      groups={profileSkillGroups}
                      selectedSkills={profileSkills}
                      onChange={setProfileSkills}
                    />

                    <p className="profile-panel-note">
                      {!profileRole
                        ? 'Choose your role in Basics first to unlock skills.'
                        : 'Your selection will be saved when you click Save in Basics.'}
                    </p>
                  </div>
                )}

                {profileTab === 'pro' && (
                  <div className="profile-panel">
                    <div className="profile-panel-header">
                      <h3>Pro</h3>
                      <p>Activate manually with a license key or check your current status.</p>
                    </div>

                    <div className="profile-pro-card">
                      <div className="profile-pro-status">
                        <span className={`profile-status-pill ${proStatus ? 'active' : ''}`}>
                          {proStatus ? 'Pro active' : 'Free plan'}
                        </span>
                        {proData?.email && <span className="profile-status-copy">{proData.email}</span>}
                      </div>

                      <label className="field-label">License key</label>
                      <div className="profile-license-row">
                        <input
                          value={licenseKey}
                          onChange={e => {
                            setLicenseKey(e.target.value);
                            setLicenseMsg(null);
                          }}
                          placeholder="painr-xxxx-xxxx"
                          className="input"
                          style={{ fontSize: '0.88rem', flex: 1 }}
                        />
                        <button onClick={activateLicenseKey} className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>
                          Activate
                        </button>
                      </div>
                      {licenseMsg && (
                        <p className={`profile-license-feedback ${licenseMsg.ok ? 'ok' : 'error'}`}>{licenseMsg.text}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade modal — outside container so footer doesn't overlap */}
      {showUpgrade && (
        <div className="modal-overlay" onClick={() => setShowUpgrade(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowUpgrade(false)}>×</button>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Zap size={32} style={{ color: '#a78bfa', marginBottom: 8 }} />
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 6px' }}>Upgrade to Pro</h2>
              <p style={{ color: '#888', fontSize: '0.88rem', margin: 0 }}>Unlimited niche analysis, all exports, AI summary</p>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <a href={MONTHLY_URL} className="upgrade-option">
                <div className="upgrade-price">€19<span>/mo</span></div>
                <div className="upgrade-label">Monthly</div>
                <ul className="upgrade-features">
                  <li><Check size={11} /> Unlimited analyses</li>
                  <li><Check size={11} /> CSV + JSON + Markdown</li>
                  <li><Check size={11} /> AI summary</li>
                  <li><Check size={11} /> Save 5 sessions</li>
                </ul>
              </a>
              <a href={LIFETIME_URL} className="upgrade-option upgrade-option-featured">
                <div className="upgrade-badge">Best deal</div>
                <div className="upgrade-price">€79<span> one-time</span></div>
                <div className="upgrade-label">Lifetime</div>
                <ul className="upgrade-features">
                  <li><Check size={11} /> Everything in Monthly</li>
                  <li><Check size={11} /> Pay once</li>
                  <li><Check size={11} /> All future updates</li>
                  <li><Check size={11} /> Priority support</li>
                </ul>
              </a>
            </div>
            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#555', margin: 0 }}>
              <Lock size={11} /> Secure payment via Stripe · Active immediately after payment
            </p>
          </div>
        </div>
      )}

      <style>{`
        /* === Base === */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; }

        .app-root {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          background: #0a0a0a; color: #e5e5e5; line-height: 1.6;
          min-height: 100vh; padding: 48px 24px 24px;
          position: relative;
        }
        .app-root::before {
          content: '';
          position: fixed; top: 0; left: 0; right: 0; height: 600px;
          background: radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 70%);
          pointer-events: none; z-index: 0;
        }
        .container { margin: 0 auto; transition: max-width 0.3s ease; position: relative; z-index: 1; }

        /* === Header === */
        .app-header { margin-bottom: 32px; }
        .header-icon { color: #818cf8; }
        .app-title {
          font-size: 1.75rem; font-weight: 800; margin-bottom: 4px;
          background: linear-gradient(135deg, #c7d2fe 0%, #a78bfa 50%, #818cf8 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .app-subtitle { font-size: 0.9rem; color: #555; }

        /* === Cards === */
        .card {
          background: #141414; border: 1px solid rgba(255,255,255,0.06); border-radius: 14px;
          padding: 20px; margin-bottom: 16px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .onboarding-card {
          padding: 22px;
          min-height: 430px;
          background:
            radial-gradient(circle at top right, rgba(99,102,241,0.14), transparent 35%),
            #141414;
          overflow: hidden;
        }

        /* === Step Indicator === */
        .step-circle {
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.78rem; font-weight: 700;
          background: #1a1a1a; color: #555; border: 1px solid #2a2a2a;
          transition: all 0.25s;
        }
        .step-circle.active {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff; border-color: transparent;
          box-shadow: 0 0 16px rgba(99,102,241,0.3);
        }
        .step-circle.completed {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff; border-color: transparent;
        }
        .step-label { font-size: 0.78rem; font-weight: 600; color: #444; white-space: nowrap; transition: color 0.2s; }
        .step-label.active { color: #e5e5e5; }
        .step-line { flex: 1; height: 2px; background: #1a1a1a; margin: 0 14px; min-width: 24px; border-radius: 1px; transition: background 0.3s; }
        .step-line.active { background: linear-gradient(90deg, #6366f1, #8b5cf6); }

        /* === Inputs === */
        .input {
          flex: 1; background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 12px;
          padding: 12px 16px; color: #e5e5e5; font-size: 0.95rem; font-family: inherit;
          outline: none; transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
        .input::placeholder { color: #444; }

        .select {
          background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 12px;
          padding: 10px 32px 10px 12px; color: #e5e5e5; font-size: 0.85rem; font-family: inherit;
          outline: none; cursor: pointer; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%23666' stroke-width='1.5'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .select:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
        .select-small { width: auto; min-width: 60px; font-size: 0.78rem; padding: 5px 26px 5px 10px; border-radius: 8px; }

        .search-row { display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap; }

        /* === Buttons === */
        .btn-primary {
          padding: 12px 28px; border-radius: 12px; font-size: 0.9rem; font-weight: 600;
          cursor: pointer; border: none; font-family: inherit; white-space: nowrap;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff; display: flex; align-items: center; gap: 8px;
          transition: transform 0.1s, box-shadow 0.2s, opacity 0.15s;
          box-shadow: 0 2px 12px rgba(99,102,241,0.25);
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(99,102,241,0.35); }
        .btn-primary:active { transform: translateY(0) scale(0.98); }
        .btn-primary.cancel { background: linear-gradient(135deg, #b45309, #d97706); box-shadow: 0 2px 12px rgba(180,83,9,0.25); }
        .btn-primary.cancel:hover { box-shadow: 0 4px 20px rgba(180,83,9,0.35); }

        .btn-secondary {
          padding: 10px 20px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;
          cursor: pointer; border: 1px solid rgba(255,255,255,0.08); font-family: inherit; white-space: nowrap;
          background: transparent; color: #888; display: flex; align-items: center; gap: 8px;
          transition: all 0.15s;
        }
        .btn-secondary:hover { border-color: rgba(255,255,255,0.15); color: #ccc; background: rgba(255,255,255,0.03); }
        .btn-secondary.disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .profile-trigger.attention {
          border-color: rgba(99,102,241,0.4);
          color: #d9dcff;
          background: rgba(99,102,241,0.08);
        }
        .profile-trigger-badge {
          font-size: 0.62rem;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(99,102,241,0.16);
          color: #c7d2fe;
          letter-spacing: 0.03em;
        }

        /* === Profile onboarding === */
        .onboarding-progress {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }
        .onboarding-progress-item {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          color: #6b7280;
          font-size: 0.78rem;
          font-weight: 600;
        }
        .onboarding-progress-item.active {
          border-color: rgba(99,102,241,0.35);
          background: rgba(99,102,241,0.12);
          color: #e5e7ff;
        }
        .onboarding-progress-item.done {
          color: #c7d2fe;
        }
        .onboarding-progress-index {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.06);
          font-size: 0.72rem;
        }
        .onboarding-progress-item.active .onboarding-progress-index,
        .onboarding-progress-item.done .onboarding-progress-index {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
        }
        .onboarding-shell {
          min-height: 340px;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 20px;
          align-items: stretch;
        }
        .onboarding-hero,
        .onboarding-panel {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.06);
          padding: 28px;
          background: rgba(10,10,10,0.3);
        }
        .onboarding-hero {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 18px;
        }
        .onboarding-panel {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 18px;
          background:
            linear-gradient(180deg, rgba(99,102,241,0.08), transparent 70%),
            rgba(10,10,10,0.4);
        }
        .onboarding-panel-box h3 {
          font-size: 1.05rem;
          line-height: 1.4;
          margin-bottom: 10px;
        }
        .onboarding-panel-box p {
          font-size: 0.84rem;
          color: #a1a1aa;
          line-height: 1.7;
        }
        .onboarding-kicker,
        .onboarding-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #a5b4fc;
        }
        .onboarding-title {
          font-size: 2rem;
          line-height: 1.08;
          letter-spacing: -0.03em;
          max-width: 12ch;
        }
        .onboarding-title-small {
          font-size: 1.45rem;
          max-width: none;
        }
        .onboarding-copy {
          font-size: 0.92rem;
          color: #9ca3af;
          max-width: 52ch;
        }
        .onboarding-benefits {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .onboarding-benefit {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.84rem;
          color: #d4d4d8;
        }
        .onboarding-benefit-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          box-shadow: 0 0 16px rgba(99,102,241,0.4);
          flex-shrink: 0;
        }
        .onboarding-details {
          min-height: 340px;
          display: flex;
          flex-direction: column;
          gap: 22px;
          padding: 10px 4px 0;
        }
        .onboarding-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        .onboarding-actions-end {
          justify-content: flex-end;
        }
        .profile-reminder {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(10,10,10,0.6));
          border-color: rgba(99,102,241,0.28);
        }
        .profile-reminder-title {
          font-size: 0.92rem;
          font-weight: 700;
          color: #eef2ff;
          margin-bottom: 4px;
        }
        .profile-reminder-copy {
          font-size: 0.8rem;
          color: #a1a1aa;
        }

        /* === Profile form === */
        .profile-form-fields {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .field-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }
        .field-label {
          display: block;
          font-size: 0.78rem;
          color: #a1a1aa;
          margin-bottom: 6px;
        }
        .field-hint {
          font-size: 0.72rem;
          color: #6366f1;
        }
        .role-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .role-card {
          border: 1px solid #2a2a2a;
          border-radius: 14px;
          padding: 14px;
          min-height: 96px;
          background: #101010;
          color: #d4d4d8;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 6px;
          cursor: pointer;
          transition: border-color 0.15s, transform 0.15s, box-shadow 0.2s, background 0.15s;
        }
        .role-card:hover {
          border-color: rgba(99,102,241,0.35);
          transform: translateY(-1px);
        }
        .role-card.active {
          border-color: #6366f1;
          background: rgba(99,102,241,0.12);
          box-shadow: 0 12px 24px rgba(17,24,39,0.28);
        }
        .role-card-title {
          font-size: 0.88rem;
          font-weight: 700;
          color: #eef2ff;
        }
        .role-card-copy {
          font-size: 0.76rem;
          color: #a1a1aa;
          line-height: 1.55;
        }
        .profile-form-error {
          font-size: 0.78rem;
          color: #fca5a5;
          background: rgba(127,29,29,0.22);
          border: 1px solid rgba(248,113,113,0.2);
          border-radius: 12px;
          padding: 10px 12px;
        }
        .profile-editor-header {
          margin-bottom: 20px;
        }
        .profile-editor-modal {
          background:
            radial-gradient(circle at top right, rgba(99,102,241,0.1), transparent 35%),
            #141414;
        }
        .profile-secondary-panel {
          border-top: 1px solid rgba(255,255,255,0.06);
          padding-top: 4px;
        }
        .profile-secondary-toggle {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px;
          background: rgba(255,255,255,0.02);
          color: #d4d4d8;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          cursor: pointer;
          font: inherit;
          transition: border-color 0.15s, background 0.15s;
        }
        .profile-secondary-toggle:hover {
          border-color: rgba(99,102,241,0.28);
          background: rgba(99,102,241,0.06);
        }
        .profile-secondary-content {
          margin-top: 12px;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }

        /* === Skills select === */
        .skills-select {
          position: relative;
        }
        .skills-select.disabled {
          opacity: 0.7;
        }
        .skills-trigger {
          width: 100%;
          min-height: 52px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid #2a2a2a;
          background: #0d0d0d;
          color: #e5e5e5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          cursor: pointer;
          text-align: left;
          font: inherit;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .skills-trigger.open {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
        }
        .skills-trigger-body {
          flex: 1;
          min-width: 0;
        }
        .skills-trigger-meta {
          font-size: 0.75rem;
          color: #71717a;
          flex-shrink: 0;
        }
        .skills-placeholder {
          display: block;
          font-size: 0.88rem;
          color: #52525b;
        }
        .skills-chip-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .skills-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(99,102,241,0.14);
          color: #dbe4ff;
          font-size: 0.76rem;
          font-weight: 600;
        }
        .skills-chip-remove {
          border: none;
          background: transparent;
          color: inherit;
          cursor: pointer;
          font-size: 0.9rem;
          line-height: 1;
          padding: 0;
        }
        .skills-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          z-index: 90;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          background: #101010;
          box-shadow: 0 18px 40px rgba(0,0,0,0.45);
          overflow: hidden;
        }
        .skills-dropdown-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .skills-search {
          flex: 1;
          border: 1px solid #2a2a2a;
          border-radius: 12px;
          background: #0d0d0d;
          color: #e5e5e5;
          padding: 10px 12px;
          font: inherit;
          outline: none;
        }
        .skills-search:focus {
          border-color: #6366f1;
        }
        .skills-limit-note {
          font-size: 0.72rem;
          color: #fbbf24;
          white-space: nowrap;
        }
        .skills-groups {
          max-height: 280px;
          overflow: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .skills-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .skills-group-title {
          font-size: 0.72rem;
          font-weight: 700;
          color: #8b8fa3;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .skills-option-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .skills-option {
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px;
          background: rgba(255,255,255,0.02);
          color: #d4d4d8;
          padding: 7px 11px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font: inherit;
          font-size: 0.78rem;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
        }
        .skills-option:hover:not(:disabled) {
          border-color: rgba(99,102,241,0.35);
          color: #eef2ff;
        }
        .skills-option.selected {
          border-color: #6366f1;
          background: rgba(99,102,241,0.12);
          color: #eef2ff;
        }
        .skills-option:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .skills-option-check {
          font-size: 0.68rem;
          color: #a5b4fc;
        }

        /* === Subreddit chips === */
        .sub-chip {
          padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600;
          cursor: pointer; border: 1px solid #2a2a2a; font-family: inherit;
          background: #1a1a1a; color: #888;
          display: flex; align-items: center; gap: 5px;
          transition: all 0.15s;
        }
        .sub-chip:hover { border-color: #6366f1; color: #c7d2fe; }
        .sub-chip.selected { background: rgba(99,102,241,0.15); border-color: #6366f1; color: #c7d2fe; }

        /* === Copy button === */
        .copy-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-family: inherit;
          cursor: pointer; border: 1px solid #2a2a2a; background: #111; color: #666;
          transition: all 0.15s;
        }
        .copy-btn:hover { border-color: #444; color: #aaa; }
        .copy-btn.copied { border-color: #22c55e; color: #4ade80; background: rgba(34,197,94,0.08); }

        /* === Sessions dropdown === */
        .sessions-dropdown {
          position: absolute; right: 0; top: calc(100% + 8px); z-index: 50;
          background: #111; border: 1px solid #222; border-radius: 10px;
          min-width: 280px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .session-item { display: flex; align-items: stretch; border-bottom: 1px solid #1a1a1a; }
        .session-item:last-child { border-bottom: none; }
        .session-load {
          flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
          padding: 10px 14px; background: none; border: none; cursor: pointer; text-align: left;
          font-family: inherit; transition: background 0.15s;
        }
        .session-load:hover { background: #1a1a1a; }
        .session-delete {
          padding: 0 14px; background: none; border: none; border-left: 1px solid #1a1a1a;
          color: #444; cursor: pointer; font-size: 1.1rem; transition: color 0.15s;
        }
        .session-delete:hover { color: #f87171; }

        /* === Spin animation === */
        .spin { animation: spin 1s linear infinite; }

        /* === Action bar === */
        .action-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }

        /* === Summary row === */
        .summary-row { display: flex; gap: 8px; margin-bottom: 16px; }
        .summary-item {
          background: #141414; border: 1px solid rgba(255,255,255,0.06); border-radius: 14px;
          padding: 14px 18px; flex: 1; min-width: 90px;
        }
        .summary-label { font-size: 0.68rem; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
        .summary-value { font-weight: 700; margin-top: 2px; }

        /* === Progress === */
        .progress-wrap { margin-bottom: 16px; }
        .progress-bar { height: 3px; background: #1a1a1a; border-radius: 2px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease-out; }
        .progress-fill:not(.gradient):not(.pulse) { background: #fbbf24; }
        .progress-fill.gradient { background: linear-gradient(90deg, #6366f1, #a78bfa); }
        .progress-fill.pulse { width: 100%; background: linear-gradient(90deg, #6366f1, #a78bfa); animation: pulse 1.5s ease-in-out infinite; }
        .progress-label { font-size: 0.78rem; color: #555; font-weight: 500; }
        .progress-hint { font-size: 0.78rem; color: #444; margin-top: 10px; }

        /* === Error === */
        .error-box {
          background: #1a0a0a; border: 1px solid #4a1515; border-radius: 12px;
          padding: 14px 18px; font-size: 0.85rem; color: #fca5a5; margin-bottom: 16px;
          display: flex; align-items: flex-start; gap: 10px;
        }

        /* === Post count badge === */
        .post-count-badge { font-size: 0.82rem; color: #4ade80; display: flex; align-items: center; gap: 6px; }

        /* === Posts === */
        .posts-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
        .posts-heading { font-size: 0.9rem; font-weight: 600; color: #ccc; }
        .posts-range { color: #555; font-weight: 400; font-size: 0.8rem; }
        .per-page-wrap { display: flex; align-items: center; gap: 6px; }
        .per-page-wrap label { font-size: 0.75rem; color: #555; }

        .post-card { padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .post-card:last-child { border-bottom: none; }

        .post-title {
          font-size: 0.88rem; font-weight: 600; color: #e5e5e5;
          text-decoration: none; line-height: 1.4; transition: color 0.15s;
        }
        .post-title:hover { color: #818cf8; }

        .sep { color: #2a2a2a; }
        .flair-badge {
          font-size: 0.62rem; font-weight: 600; padding: 1px 6px;
          border-radius: 4px; background: rgba(99,102,241,0.12); color: #a78bfa;
        }
        .post-selftext {
          font-size: 0.8rem; color: #555; margin-top: 6px; padding-left: 36px;
          line-height: 1.5; overflow: hidden;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }
        .post-link-url {
          font-size: 0.72rem; color: #3b9e6e; margin-top: 4px; padding-left: 36px;
          text-decoration: none; word-break: break-all; display: block; transition: color 0.15s;
        }
        .post-link-url:hover { color: #4ade80; }

        /* === Pagination === */
        .pagination { display: flex; align-items: center; justify-content: center; gap: 3px; padding: 8px 0; }
        .page-btn {
          min-width: 30px; height: 30px; border-radius: 8px; font-size: 0.78rem;
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0 6px; background: #1a1a1a; color: #888; border: 1px solid rgba(255,255,255,0.06);
          cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .page-btn:hover:not(.disabled) { background: #222; color: #ccc; }
        .page-btn.active {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff; border-color: transparent;
        }
        .page-btn.disabled { opacity: 0.25; cursor: default; }
        .page-ellipsis { color: #444; font-size: 0.78rem; padding: 0 2px; }

        /* === Pain Point Cards === */
        .results-header { padding: 20px; }
        .results-title { font-size: 1.05rem; font-weight: 700; color: #fff; }
        .results-subtitle { font-size: 0.78rem; color: #555; margin-top: 4px; }

        .pain-grid { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }

        .pain-card {
          background: #141414; border: 1px solid rgba(255,255,255,0.06); border-radius: 14px;
          padding: 20px; padding-left: 24px;
          border-left: 4px solid #6366f1;
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
          animation: fadeInUp 0.4s ease-out both;
        }
        .pain-card:hover {
          border-color: rgba(255,255,255,0.1);
          border-left-color: #818cf8;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
          transform: translateY(-1px);
        }

        .category-badge {
          font-size: 0.7rem; font-weight: 600; padding: 3px 10px;
          border-radius: 6px;
          background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15));
          color: #a78bfa;
          letter-spacing: 0.2px;
        }
        .score-badge {
          font-size: 0.72rem; font-weight: 600; padding: 3px 10px;
          border-radius: 6px; background: rgba(201,162,39,0.1); color: #c9a227;
        }
        .pain-title {
          font-size: 0.92rem; font-weight: 600; color: #e5e5e5;
          line-height: 1.4; margin-bottom: 8px;
        }
        .pain-summary {
          font-size: 0.84rem; color: #999; line-height: 1.65;
        }
        .pain-link {
          font-size: 0.78rem; color: #818cf8; text-decoration: none;
          display: flex; align-items: center; gap: 5px; transition: color 0.15s;
        }
        .pain-link:hover { color: #a78bfa; }

        /* === Footer === */
        .app-footer {
          text-align: center; padding: 40px 0 16px;
          font-size: 0.72rem; color: #333; letter-spacing: 0.3px;
          position: relative; z-index: 1;
        }
        .footer-link { color: #444; text-decoration: none; }
        .footer-link:hover { color: #888; }

        /* === Animations === */
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in { animation: fadeInUp 0.35s ease-out; }

        /* === Responsive === */
        @media (max-width: 600px) {
          .app-root { padding: 20px 14px 14px; }
          .app-header > div { gap: 12px; }
          .search-row { flex-direction: column; }
          .btn-primary { width: 100%; justify-content: center; }
          .action-bar { flex-direction: column; align-items: stretch; }
          .summary-row { flex-direction: column; }
          .app-title { font-size: 1.4rem; }
          .upgrade-option { width: 100%; }
          .onboarding-card { min-height: auto; padding: 18px; }
          .onboarding-shell { grid-template-columns: 1fr; min-height: auto; }
          .onboarding-hero, .onboarding-panel { padding: 22px; }
          .onboarding-title { font-size: 1.55rem; max-width: none; }
          .onboarding-actions { flex-direction: column; align-items: stretch; }
          .onboarding-actions .btn-secondary,
          .onboarding-actions .btn-primary { width: 100%; justify-content: center; }
          .profile-reminder { flex-direction: column; align-items: flex-start; }
          .role-grid { grid-template-columns: 1fr; }
          .skills-dropdown {
            position: static;
            margin-top: 10px;
          }
          .skills-dropdown-header {
            flex-direction: column;
            align-items: stretch;
          }
          .skills-limit-note {
            white-space: normal;
          }
          .modal-card { padding: 24px; }
        }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.75);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 20px;
        }
        .modal-card {
          background: #141414; border: 1px solid #2a2a2a; border-radius: 16px;
          padding: 32px; max-width: 520px; width: 100%; position: relative;
        }
        .modal-close {
          position: absolute; top: 16px; right: 16px;
          background: none; border: none; color: #666; font-size: 1.4rem;
          cursor: pointer; line-height: 1;
        }
        .modal-close:hover { color: #aaa; }
        .upgrade-option {
          flex: 1; border: 1px solid #2a2a2a; border-radius: 12px;
          padding: 20px; text-decoration: none; color: inherit;
          transition: border-color .2s; position: relative; display: flex;
          flex-direction: column; gap: 8px;
        }
        .upgrade-option:hover { border-color: #555; }
        .upgrade-option-featured { border-color: #6366f1; background: rgba(99,102,241,0.06); }
        .upgrade-option-featured:hover { border-color: #818cf8; }
        .upgrade-badge {
          position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
          background: #6366f1; color: white; font-size: 0.68rem; font-weight: 700;
          padding: 2px 10px; border-radius: 20px; white-space: nowrap; letter-spacing: .04em;
        }
        .upgrade-price {
          font-size: 1.8rem; font-weight: 800; color: #f0f0f0; line-height: 1;
        }
        .upgrade-price span { font-size: 0.85rem; font-weight: 400; color: #888; }
        .upgrade-label { font-size: 0.8rem; color: #888; }
        .upgrade-features {
          list-style: none; margin: 8px 0 0; padding: 0;
          display: flex; flex-direction: column; gap: 5px;
          font-size: 0.78rem; color: #aaa;
        }
        .upgrade-features li { display: flex; align-items: center; gap: 6px; }
        .upgrade-features svg { color: #4ade80; flex-shrink: 0; }
        .pro-badge {
          font-size: 0.6rem; font-weight: 700; background: #6366f1;
          color: white; padding: 1px 5px; border-radius: 4px; margin-left: 4px; vertical-align: middle;
        }
        .pain-card-blurred {
          cursor: pointer; position: relative; overflow: hidden;
        }
        .pain-card-blurred:hover { border-color: #6366f1; }
        .blur-upgrade-cta {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 12px; padding: 8px 0;
          font-size: 0.82rem; font-weight: 600; color: #a78bfa;
        }
        .summary-locked:hover { border-color: #6366f1; }
        .relevant-badge {
          font-size: 0.62rem; font-weight: 700; background: rgba(74,222,128,0.15);
          color: #4ade80; border: 1px solid rgba(74,222,128,0.3);
          padding: 1px 7px; border-radius: 20px;
        }
        .upgrade-banner {
          grid-column: 1 / -1; display: flex; align-items: center; gap: 14px;
          background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1));
          border: 1px dashed #6366f1; border-radius: 12px;
          padding: 16px 20px; cursor: pointer; transition: border-color .2s;
        }
        .upgrade-banner:hover { border-color: #a78bfa; background: rgba(99,102,241,0.14); }
      `}</style>
    </div>
  );
}
