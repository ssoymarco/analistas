/**
 * deepLinks.ts — maneja las URLs `analistas://match/{id}` del Live Activity.
 *
 * El widget (targets/live-activity/index.swift) SIEMPRE tuvo su widgetURL
 * apuntando aquí, pero nadie del lado JS la escuchaba: el tap abría la app en
 * la pantalla de inicio (reporte del dueño, 4 jul 2026). Este módulo traduce
 * la URL a navegación usando la misma maquinaria que los taps de
 * notificaciones FCM (navigateToMatch + stub; MatchDetail carga el fixture
 * real vía useFixtureDetail(id), el stub solo pinta el primer frame).
 *
 * Formato aceptado (query params opcionales — el widget de builds ≥45 los
 * manda para un primer frame con nombres/marcador; el de build 44 solo manda
 * el path con el id):
 *   analistas://match/123?home=Canad%C3%A1&away=Marruecos&hs=0&as=1&phase=2H
 */

import { Linking } from 'react-native';
import { navigateToMatch } from './navigationRef';
import type { Match } from '../data/types';

function matchFromUrl(url: string): Match | null {
  // Parsing MANUAL a propósito: `new URL()`/searchParams no tienen precedente
  // en este cliente y el polyfill varía por runtime — un deep link no puede
  // depender de eso. Formato: analistas://match/{id}[?k=v&...]
  const m = /^analistas:\/\/match\/([^/?#]+)(?:\?([^#]*))?/i.exec(url);
  if (!m) return null;
  const matchId = decodeURIComponent(m[1]);
  if (!matchId) return null;

  const q: Record<string, string> = {};
  if (m[2]) {
    for (const pair of m[2].split('&')) {
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      try {
        q[decodeURIComponent(pair.slice(0, eq))] =
          decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
      } catch { /* param malformado — ignorar */ }
    }
  }

  const num = (v: string | undefined): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const phase = q.phase ?? '';
  const status: Match['status'] =
    phase === 'FT' ? 'finished' : phase === 'pre' ? 'scheduled' : 'live';

  const homeName = q.home ?? '';
  const awayName = q.away ?? '';
  return {
    id: matchId,
    homeTeam: { id: '', name: homeName, shortName: homeName, logo: '' },
    awayTeam: { id: '', name: awayName, shortName: awayName, logo: '' },
    homeScore: num(q.hs),
    awayScore: num(q.as),
    league: '',
    leagueId: '',
    date: new Date().toISOString().slice(0, 10),
    isFavorite: false,
    status,
    time: '',
  } as Match;
}

/** Registra los listeners de deep link (evento + URL inicial de cold start).
 *  Devuelve el cleanup. navigateToMatch ya maneja la cola pre-navigator y el
 *  dedup, así que aquí solo se traduce URL → stub. */
export function initDeepLinks(): () => void {
  const handle = (url: string | null) => {
    if (!url) return;
    const match = matchFromUrl(url);
    if (match) navigateToMatch(match);
  };

  // App ya abierta (background → tap del Live Activity)
  const sub = Linking.addEventListener('url', e => handle(e.url));
  // App cerrada (cold start desde el tap)
  Linking.getInitialURL().then(handle).catch(() => {});

  return () => sub.remove();
}
