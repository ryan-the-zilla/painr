export type UserRole = 'developer' | 'designer' | 'marketer' | 'founder' | 'other';
export type ProfileOnboardingStatus = 'unseen' | 'skipped' | 'completed';

export interface UserProfile {
  name: string;
  role: UserRole;
  skills: string[];
}

const STORAGE_KEY = 'rppe_profile';
const ONBOARDING_STORAGE_KEY = 'rppe_profile_onboarding';

export function saveProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'completed');
  } catch {}
}

export function getProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasProfile(): boolean {
  return !!getProfile();
}

export function isProfileComplete(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return profile.role.trim().length > 0;
}

export function getProfileOnboardingStatus(): ProfileOnboardingStatus {
  if (hasProfile()) return 'completed';

  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    return raw === 'skipped' || raw === 'completed' ? raw : 'unseen';
  } catch {
    return 'unseen';
  }
}

export function setProfileOnboardingStatus(status: ProfileOnboardingStatus): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, status);
  } catch {}
}

// Categorieën per rol die als "relevant" worden beschouwd
export const ROLE_CATEGORIES: Record<UserRole, string[]> = {
  developer: ['Technical', 'API', 'Integration', 'Bug', 'Performance', 'Development', 'Tooling', 'Infrastructure'],
  designer: ['UX', 'Design', 'UI', 'Accessibility', 'User Experience', 'Visual'],
  marketer: ['Growth', 'SEO', 'Content', 'Conversion', 'Marketing', 'Acquisition', 'Retention'],
  founder: [],  // alles even gewogen
  other: [],
};

export function isRelevantCategory(category: string, profile: UserProfile | null): boolean {
  if (!profile) return false;
  const relevant = ROLE_CATEGORIES[profile.role];
  if (relevant.length === 0) return false;
  return relevant.some(r => category.toLowerCase().includes(r.toLowerCase()));
}
