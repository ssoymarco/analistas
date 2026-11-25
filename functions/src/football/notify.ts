/**
 * football/notify.ts
 *
 * Push delivery for football changes detected by live-detect.ts.
 *
 * Topic taxonomy = the legacy one with an `fb_` prefix (see FbTopics in
 * shared/football/model.ts). Modo Estadio (delay buckets d0/d2/d5/d10) and
 * Modo Rival work exactly as before; delayed buckets reuse the existing
 * `deliverDelayedPush` task queue.
 *
 * LEGACY DUAL-SEND (transition window): users still on a Sportmonks-era build
 * are subscribed to `team_{sportmonksId}_*` topics. For every change we also
 * send the IMMEDIATE (_d0 / kickoff / reminders / lineups / rival) push to the
 * legacy topic of each team we can map back (legacy.ts). The payload omits
 * `matchId` so tapping it opens the app (and its update prompt) instead of a
 * match screen the old build can no longer load. Disable with
 * FB_LEGACY_DUAL_SEND=false once adoption of the new build is high.
 */

import { getFunctions } from 'firebase-admin/functions';
import * as logger from 'firebase-functions/logger';
import { admin } from '../admin-init';
import type { DelayedPushPayload } from '../deliver-delayed-push';
import { FbTopics, type FbDelayBucket } from '../shared/football/model';
import { legacyTeamIdFor } from '../shared/football/legacy';
import type { FbChange } from './live-detect';

const ESTADIO_DELAY_ENABLED = process.env.ESTADIO_DELAY_ENABLED !== 'false';
const LEGACY_DUAL_SEND = process.env.FB_LEGACY_DUAL_SEND !== 'false';

// ── Spanish names for national teams (clubs pass through unchanged) ─────────
const TEAMS_ES: Record<string, string> = {
  'Afghanistan': 'Afganistán', 'Algeria': 'Argelia', 'Armenia': 'Armenia',
  'Azerbaijan': 'Azerbaiyán', 'Bahrain': 'Baréin', 'Belgium': 'Bélgica',
  'Bosnia & Herzegovina': 'Bosnia y Herzegovina', 'Bosnia and Herzegovina': 'Bosnia y Herzegovina',
  'Brazil': 'Brasil', 'Cameroon': 'Camerún', 'Canada': 'Canadá', 'Cape Verde Islands': 'Cabo Verde',
  'China': 'China', 'Congo DR': 'Congo RD', 'Croatia': 'Croacia', 'Curacao': 'Curazao', 'Curaçao': 'Curazao',
  'Czech Republic': 'República Checa', 'Czechia': 'República Checa', 'Denmark': 'Dinamarca',
  'Egypt': 'Egipto', 'England': 'Inglaterra', 'Finland': 'Finlandia', 'France': 'Francia',
  'Germany': 'Alemania', 'Greece': 'Grecia', 'Hungary': 'Hungría', 'Iran': 'Irán', 'Iraq': 'Irak',
  'Ireland': 'Irlanda', 'Rep. Of Ireland': 'Irlanda', 'Italy': 'Italia', 'Ivory Coast': 'Costa de Marfil',
  'Japan': 'Japón', 'Jordan': 'Jordania', 'Kenya': 'Kenia', 'North Korea': 'Corea del Norte',
  'South Korea': 'Corea del Sur', 'Mali': 'Malí', 'Mexico': 'México', 'Morocco': 'Marruecos',
  'Netherlands': 'Países Bajos', 'New Zealand': 'Nueva Zelanda', 'Norway': 'Noruega', 'Oman': 'Omán',
  'Panama': 'Panamá', 'Peru': 'Perú', 'Poland': 'Polonia', 'Qatar': 'Catar', 'Romania': 'Rumanía',
  'Russia': 'Rusia', 'Saudi Arabia': 'Arabia Saudita', 'Scotland': 'Escocia', 'Slovakia': 'Eslovaquia',
  'Slovenia': 'Eslovenia', 'South Africa': 'Sudáfrica', 'Spain': 'España', 'Sweden': 'Suecia',
  'Switzerland': 'Suiza', 'Thailand': 'Tailandia', 'Tunisia': 'Túnez', 'Turkey': 'Turquía',
  'Türkiye': 'Turquía', 'Ukraine': 'Ucrania', 'United Arab Emirates': 'Emiratos Árabes',
  'USA': 'Estados Unidos', 'United States': 'Estados Unidos', 'Wales': 'Gales', 'Zimbabwe': 'Zimbabue',
  'Northern Ireland': 'Irlanda del Norte', 'Haiti': 'Haití', 'Uzbekistan': 'Uzbekistán',
};
const loc = (name: string): string => TEAMS_ES[name] ?? name;

// ── Copy ─────────────────────────────────────────────────────────────────────

interface Copy { title: string; body: string }

const H = (c: FbChange) => loc(c.homeTeam.name);
const A = (c: FbChange) => loc(c.awayTeam.name);
const scoreLine = (c: FbChange) => `${H(c)} ${c.homeScore}-${c.awayScore} ${A(c)}`;
const sideName = (c: FbChange) => (c.side === 'home' ? H(c) : A(c));
const min = (c: FbChange) => (c.minute != null ? `${c.minute}' ` : '');

export function buildCopy(c: FbChange): Copy {
  switch (c.type) {
    case 'goal': {
      const h = c.side === 'home' ? `[${c.homeScore}]` : `${c.homeScore}`;
      const a = c.side === 'away' ? `[${c.awayScore}]` : `${c.awayScore}`;
      const scorer = c.scorerName ? `${c.scorerName} · ` : '';
      const title =
        c.goalKind === 'penalty' ? `⚽ ¡Gol de penal de ${sideName(c)}!` :
        c.goalKind === 'own' ? `⚽ Autogol de ${c.side === 'home' ? A(c) : H(c)}` :
        `⚽ ¡GOL de ${sideName(c)}!`;
      return { title, body: `${min(c)}${scorer}${H(c)} ${h}-${a} ${A(c)}`.trim() };
    }
    case 'goalCancelled':
      return { title: `🚫 El VAR anula gol de ${sideName(c)}`, body: `${min(c)}${scoreLine(c)}`.trim() };
    case 'matchStart':
      return { title: '⚽ ¡Empieza el partido!', body: `${H(c)} vs ${A(c)} · ${c.league}` };
    case 'halftime':
      return { title: '⏱️ Medio tiempo · Marcador:', body: scoreLine(c) };
    case 'secondHalfStart':
      return { title: '¡Arranca el segundo tiempo!', body: `${scoreLine(c)} · ${c.league}` };
    case 'matchEnd': {
      const pen = c.homePenScore != null && c.awayPenScore != null ? ` (pen. ${c.homePenScore}-${c.awayPenScore})` : '';
      return { title: '🏁 Final del partido', body: `${H(c)} ${c.homeScore}-${c.awayScore}${pen} ${A(c)} · ${c.league}` };
    }
    case 'redCard':
      return { title: '🟥 TARJETA ROJA', body: `${min(c)}${c.playerName ? c.playerName + ' ' : ''}(${sideName(c)}) · ${scoreLine(c)}`.trim() };
    case 'yellowCard':
      return { title: '🟨 Tarjeta amarilla', body: `${min(c)}${c.playerName ? c.playerName + ' ' : ''}(${sideName(c)}) · ${scoreLine(c)}`.trim() };
    case 'substitution': {
      const out = c.playerName ? `↓ ${c.playerName}` : '';
      const inn = c.relatedPlayerName ? ` ↑ ${c.relatedPlayerName}` : '';
      return { title: `🔄 Cambio · ${sideName(c)}`, body: `${min(c)}${out}${inn}`.trim() || scoreLine(c) };
    }
    case 'extraTimeStart':
      return { title: '⏱️ ¡Prórroga!', body: `${scoreLine(c)} · ${c.league}` };
    case 'penaltiesStart':
      return { title: '🥅 ¡Tanda de penaltis!', body: `${scoreLine(c)} · ${c.league}` };
    case 'matchSuspended':
      return { title: '⚠️ Partido suspendido', body: scoreLine(c) };
    case 'matchReminder':
      return { title: '⏰ ¡El partido comienza pronto!', body: `${H(c)} vs ${A(c)} · ${c.league} · en ~15 min` };
    case 'lineups':
      return { title: '📋 Alineaciones confirmadas', body: `${H(c)} vs ${A(c)} · ${c.league}` };
    case 'rivalLoss':
      return { title: `😈 ${sideName(c)} perdió`, body: `${scoreLine(c)} · a disfrutar 🍿` };
    case 'rivalBigLoss':
      return { title: `😈 ¡Goleada al ${sideName(c)}!`, body: `${scoreLine(c)} · ¡vaya paliza! 🤭` };
    case 'rivalRedCard':
      return { title: `🟥😈 Roja al ${sideName(c)}`, body: `${min(c)}${c.playerName ? c.playerName + ' ' : ''}expulsado · se quedan con 10`.trim() };
    case 'rivalPenMiss':
      return { title: `😈 ${sideName(c)} falló un penal`, body: `${min(c)}${c.playerName ? c.playerName + ' ' : ''}la mandó a volar 🚀`.trim() };
    default:
      return { title: 'Analistas', body: 'Nueva actualización del partido' };
  }
}

// ── Routing ──────────────────────────────────────────────────────────────────

type BucketedTopic = (teamId: string, b: FbDelayBucket) => string;
type PlainTopic = (teamId: string) => string;

interface Route {
  /** Delay-bucketed topic family + the team ids it applies to. */
  bucketed?: { topic: BucketedTopic; teams: string[]; delayed: boolean };
  /** Immediate-only topic family + team ids. */
  immediate?: { topic: PlainTopic; teams: string[] };
}

function route(c: FbChange): Route {
  const h = c.homeTeam.id;
  const a = c.awayTeam.id;
  const s = c.side === 'home' ? h : a;
  switch (c.type) {
    case 'goal':            return { bucketed: { topic: FbTopics.goals, teams: [h, a], delayed: true } };
    case 'goalCancelled':   return { bucketed: { topic: FbTopics.goals, teams: [h, a], delayed: false } };
    case 'halftime':
    case 'secondHalfStart':
    case 'matchEnd':
    case 'extraTimeStart':
    case 'penaltiesStart':  return { bucketed: { topic: FbTopics.live, teams: [h, a], delayed: true } };
    case 'redCard':
    case 'yellowCard':      return { bucketed: { topic: FbTopics.cards, teams: [s], delayed: true } };
    case 'substitution':    return { bucketed: { topic: FbTopics.live, teams: [s], delayed: true } };
    case 'matchStart':      return { immediate: { topic: FbTopics.kickoff, teams: [h, a] } };
    case 'matchSuspended':  return { immediate: { topic: FbTopics.kickoff, teams: [h, a] } };
    case 'matchReminder':   return { immediate: { topic: FbTopics.reminders, teams: [h, a] } };
    case 'lineups':         return { immediate: { topic: FbTopics.lineups, teams: [h, a] } };
    case 'rivalLoss':       return { immediate: { topic: FbTopics.rivalLoss, teams: [s] } };
    case 'rivalBigLoss':    return { immediate: { topic: FbTopics.rivalBigLoss, teams: [s] } };
    case 'rivalRedCard':    return { immediate: { topic: FbTopics.rivalRedCard, teams: [s] } };
    case 'rivalPenMiss':    return { immediate: { topic: FbTopics.rivalPenMiss, teams: [s] } };
    default:                return {};
  }
}

/** Legacy (Sportmonks-era) topic for a new-format topic, or null when unmappable. */
export function legacyTopicFor(fbTopic: string): string | null {
  const m = /^fb_team_(\d+)_(.+)$/.exec(fbTopic);
  if (!m) return null;
  const smId = legacyTeamIdFor(m[1]);
  if (!smId) return null;
  // Old builds have no `matchSuspended` routing on _kickoff — they used _start.
  return `team_${smId}_${m[2]}`;
}

// ── FCM helpers ──────────────────────────────────────────────────────────────

/** FCM allows at most 5 topics per condition. */
function condition(topics: string[]): string {
  return topics.map(t => `'${t}' in topics`).join(' || ');
}

async function send(
  target: { topic: string } | { condition: string },
  copy: Copy,
  data: Record<string, string>,
  dedupId: string,
): Promise<void> {
  try {
    await admin.messaging().send({
      ...target,
      notification: { title: copy.title, body: copy.body },
      data,
      android: {
        priority: 'high',
        collapseKey: dedupId,
        notification: { channelId: 'analistas-live', sound: 'default', tag: dedupId },
      },
      apns: {
        headers: { 'apns-collapse-id': dedupId },
        payload: { aps: { sound: 'default', badge: 0 } },
      },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'messaging/invalid-argument' && code !== 'messaging/registration-token-not-registered') {
      logger.warn('FCM send failed', { target, code, err: String(err) });
    }
  }
}

function payloadFor(c: FbChange): Record<string, string> {
  const d: Record<string, string> = {
    sport: 'football',
    v: '2',
    type: c.type,
    matchId: c.matchId,
    homeTeam: c.homeTeam.name,
    awayTeam: c.awayTeam.name,
    homeTeamId: c.homeTeam.id,
    awayTeamId: c.awayTeam.id,
    homeScore: String(c.homeScore),
    awayScore: String(c.awayScore),
    leagueId: c.leagueId,
  };
  if (c.side) d.scoringTeamSide = c.side;
  if (c.goalKind) d.goalKind = c.goalKind;
  if (c.scorerName) d.scorerName = c.scorerName;
  if (c.playerName) d.playerName = c.playerName;
  if (c.minute != null) d.minute = String(c.minute);
  return d;
}

function legacyPayloadFor(c: FbChange): Record<string, string> {
  // No matchId: old builds would try to open a match they can't load.
  const { matchId: _m, sport: _s, v: _v, homeTeamId: _h, awayTeamId: _a, ...rest } = payloadFor(c);
  return { ...rest, legacy: '1' };
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export async function dispatchFootballChanges(changes: FbChange[]): Promise<void> {
  if (!changes.length) return;
  const sends: Promise<void>[] = [];
  const queue = ESTADIO_DELAY_ENABLED ? getFunctions().taskQueue('deliverDelayedPush') : null;

  for (const c of changes) {
    const copy = buildCopy(c);
    const data = payloadFor(c);
    const dedupId = `fb${c.matchId}_${c.type}_${c.homeScore}-${c.awayScore}`.slice(0, 64);
    const r = route(c);

    // Immediate (d0 / plain) topics for this change.
    const immediateTopics = r.bucketed
      ? r.bucketed.teams.map(t => r.bucketed!.topic(t, 'd0'))
      : (r.immediate?.teams.map(t => r.immediate!.topic(t)) ?? []);
    const uniq = [...new Set(immediateTopics)];
    if (!uniq.length) continue;

    // One condition → a user following both teams gets exactly one push.
    sends.push(send(uniq.length === 1 ? { topic: uniq[0] } : { condition: condition(uniq) }, copy, data, dedupId));

    // Modo Estadio delayed buckets.
    if (queue && r.bucketed?.delayed) {
      for (const delayMin of [2, 5, 10] as const) {
        const bucket = `d${delayMin}` as FbDelayBucket;
        const topics = [...new Set(r.bucketed.teams.map(t => r.bucketed!.topic(t, bucket)))];
        const payload: DelayedPushPayload = {
          ...(topics.length === 1 ? { topic: topics[0] } : { condition: condition(topics) }),
          title: copy.title, body: copy.body, data, dedupId,
          changeType: c.type, matchId: c.matchId,
          homeScore: c.homeScore, awayScore: c.awayScore,
          matchCollection: 'fb_matches',
        };
        const taskId = `fb_${dedupId}_${r.bucketed.teams.join('_')}_d${delayMin}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 499);
        queue.enqueue(payload, { scheduleDelaySeconds: delayMin * 60, id: taskId }).catch((err: unknown) => {
          const msg = String(err);
          if (!/already ?exists/i.test(msg)) logger.warn(`Cloud Task enqueue failed: ${taskId}`, { err: msg });
        });
      }
    }

    // Legacy dual-send (immediate only).
    if (LEGACY_DUAL_SEND) {
      const legacy = [...new Set(uniq.map(legacyTopicFor).filter((t): t is string => !!t))];
      if (legacy.length) {
        sends.push(send(legacy.length === 1 ? { topic: legacy[0] } : { condition: condition(legacy) },
          copy, legacyPayloadFor(c), `l${dedupId}`.slice(0, 64)));
      }
    }

    logger.info(`📣 ${c.type} — ${copy.title} · ${copy.body}`, { matchId: c.matchId, topics: uniq });
  }

  await Promise.allSettled(sends);
}
