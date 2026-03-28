import { type UserRole } from './profile';

export interface RoleOption {
  value: UserRole;
  label: string;
  description: string;
}

export interface SkillGroup {
  label: string;
  options: string[];
}

export const ROLE_OPTIONS: RoleOption[] = [
  { value: 'developer', label: 'Developer', description: 'Focus op bugs, APIs, integraties en tooling.' },
  { value: 'designer', label: 'Designer', description: 'Focus op UX, UI, interactie en toegankelijkheid.' },
  { value: 'marketer', label: 'Marketeer', description: 'Focus op groei, content, acquisitie en conversie.' },
  { value: 'founder', label: 'Founder / Builder', description: 'Focus op prioriteiten, kansen en bedrijfsmatige signalen.' },
  { value: 'other', label: 'Andere rol', description: 'Neutrale ranking met brede skill-opties.' },
];

const GENERAL_SKILLS = [
  'AI',
  'Analytics',
  'Automation',
  'B2B SaaS',
  'Branding',
  'Community',
  'Customer Support',
  'Data',
  'E-commerce',
  'Growth',
  'No-code',
  'Pricing',
  'Product Strategy',
  'Research',
  'Sales',
  'SEO',
];

const ROLE_SKILLS: Record<UserRole, string[]> = {
  developer: [
    'APIs',
    'Backend',
    'CI/CD',
    'Database',
    'DevOps',
    'Frontend',
    'Integrations',
    'Mobile',
    'Performance',
    'React',
    'Security',
    'TypeScript',
  ],
  designer: [
    'Accessibility',
    'Design Systems',
    'Figma',
    'Interaction Design',
    'Motion Design',
    'Prototyping',
    'UX Research',
    'UI Design',
    'Usability',
    'Visual Design',
    'Wireframing',
  ],
  marketer: [
    'Ads',
    'CRM',
    'Content Marketing',
    'Email Marketing',
    'Lead Gen',
    'Lifecycle',
    'Paid Social',
    'Positioning',
    'Retention',
    'Social Media',
    'Web Analytics',
  ],
  founder: [
    'Customer Discovery',
    'Fundraising',
    'Go-To-Market',
    'Hiring',
    'Monetization',
    'Operations',
    'Roadmapping',
    'User Interviews',
    'Validation',
  ],
  other: [
    'Collaboration',
    'Consulting',
    'Documentation',
    'Enablement',
    'Operations',
    'Workflows',
  ],
};

export function getRoleLabel(role: UserRole): string {
  return ROLE_OPTIONS.find(option => option.value === role)?.label ?? role;
}

export function buildSkillGroups(role: UserRole | null, selectedSkills: string[]): SkillGroup[] {
  const roleSkills = role ? ROLE_SKILLS[role] : [];
  const catalogSet = new Set([...GENERAL_SKILLS, ...roleSkills]);
  const legacySkills = selectedSkills.filter(skill => !catalogSet.has(skill));
  const generalOptions = GENERAL_SKILLS.filter(skill => !roleSkills.includes(skill));

  return [
    legacySkills.length > 0 ? { label: 'Bestaande skills', options: legacySkills } : null,
    roleSkills.length > 0 ? { label: 'Aanbevolen voor jouw rol', options: roleSkills } : null,
    { label: 'Algemeen', options: generalOptions },
  ].filter((group): group is SkillGroup => Boolean(group));
}
