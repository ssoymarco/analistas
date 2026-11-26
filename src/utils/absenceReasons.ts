// ── Why a player is out, in the app's language ───────────────────────────────
//
// The data provider describes absences in English free text ("Knee Injury",
// "Red Card", "Knock", "National selection"…). The common ones have a
// translation under `absences.reasons.*`; anything unknown falls back to the
// generic word for its kind, and only as a last resort to the original text.
import i18n from '../i18n';

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Other ways the provider writes a reason we already have. */
const ALIASES: Record<string, string> = {
  hamstring: 'hamstring_injury',
  suspension: 'suspended',
  ban: 'suspended',
  banned: 'suspended',
  yellow_card: 'yellow_cards',
  international_duty: 'national_selection',
  national_team: 'national_selection',
  coach_s_decision: 'coach_decision',
  coaches_decision: 'coach_decision',
  technical_decision: 'coach_decision',
  rested: 'rest',
  ill: 'illness',
  sick: 'illness',
  flu: 'illness',
  match_fitness: 'lacking_match_fitness',
  not_in_squad: 'off_the_roster',
  discomfort: 'physical_discomfort',
  bruise: 'knock',
  contusion: 'knock',
};

const lookup = (key: string): string => {
  const v = i18n.t(`absences.reasons.${key}`, { defaultValue: '' });
  // A missing key comes back empty (or as the key itself in some setups).
  return typeof v === 'string' && v && !v.startsWith('absences.') ? v : '';
};

/** "Knee Injury" → "Lesión de rodilla" (in the current language). */
export function translateAbsenceReason(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) return '';
  const key = slug(text);
  const direct = lookup(ALIASES[key] ?? key);
  if (direct) return direct;

  // Families of wordings.
  let family = '';
  if (/surgery|operation/.test(key)) family = 'surgery';
  else if (/fractur|broken/.test(key)) family = 'fracture';
  else if (/cruciate|(^|_)acl(_|$)/.test(key)) family = 'cruciate_ligament_injury';
  else if (/ligament/.test(key)) family = 'ligament_injury';
  else if (/hamstring/.test(key)) family = 'hamstring_injury';
  else if (/muscle|muscular|strain/.test(key)) family = 'muscle_injury';
  else if (/suspen/.test(key)) family = 'suspended';
  else if (/injur/.test(key)) family = 'injury';
  return (family && lookup(family)) || text;
}

/** "En duda" / "Doubtful"… */
export function absenceDoubtfulLabel(): string {
  const v = i18n.t('absences.doubtful', { defaultValue: 'En duda' }) as string;
  return v && !v.startsWith('absences.') ? v : 'En duda';
}

/** Text for an absence that came without a reason. */
export function absenceFallbackLabel(type: 'injury' | 'suspension' | 'international' | 'doubtful' | 'other'): string {
  if (type === 'injury') return lookup('injury') || 'Lesión';
  if (type === 'suspension') return lookup('suspended') || 'Suspendido';
  if (type === 'international') return lookup('national_selection') || 'Con su selección';
  if (type === 'doubtful') return absenceDoubtfulLabel();
  const v = i18n.t('absences.unavailable', { defaultValue: 'No disponible' }) as string;
  return v && !v.startsWith('absences.') ? v : 'No disponible';
}
