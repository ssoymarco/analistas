// ── Spanish translations (default language) ─────────────────────────────────
// Key naming conventions:
//   • Nested objects for logical grouping (nav, tabs, dates, etc.)
//   • camelCase for leaf keys
//   • {{variable}} for interpolation (i18next syntax)
//   • _plural suffix handled automatically by i18next (count-based)

const es = {
  // ── Common / reusable ───────────────────────────────────────────────────────
  common: {
    cancel: 'Cancelar',
    save: 'Guardar',
    close: 'Cerrar',
    share: 'Compartir',
    error: 'Error',
    done: 'Listo',
    delete: 'Borrar',
    search: 'Buscar',
    loading: 'Cargando...',
    noResults: 'Sin resultados',
    back: 'Volver',
    next: 'Siguiente',
    previous: 'Anterior',
    seeMore: 'Ver más',
    seeLess: 'Ver menos',
    available: '✓ Disponible',
    unavailable: '✗ No disponible',
    comingSoon: 'Próximamente',
    vs: 'VS',
  },

  // ── Bottom tab navigation ──────────────────────────────────────────────────
  nav: {
    matches: 'Partidos',
    favorites: 'Favoritos',
    news: 'Noticias',
    profile: 'Perfil',
  },

  // ── Match detail tabs ──────────────────────────────────────────────────────
  matchTabs: {
    preview: 'Previa',
    live: 'En vivo',
    summary: 'Resumen',
    lineup: 'Alineación',
    standings: 'Tabla',
    bracket: 'Clasificación',
    news: 'Noticias',
  },

  // ── Date & time ────────────────────────────────────────────────────────────
  dates: {
    today: 'Hoy',
    yesterday: 'Ayer',
    tomorrow: 'Mañana',
    matchCount: '{{count}} partidos',
    // Short day names (Su Mo Tu We Th Fr Sa)
    daysShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    // Full day names
    daysFull: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    // Short month names
    monthsShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    // Full month names
    monthsFull: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    // Calendar month abbreviations (3 letters capitalized)
    monthsAbbr: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    // Date preposition ("15 De Abril De 2026")
    of: 'De',
    goToToday: '↩ Volver a Hoy',
    goToTodayCal: '↩ Hoy',
  },

  // ── Filter tabs (PartidosScreen) ───────────────────────────────────────────
  filters: {
    all: 'Todos',
    live: 'En vivo',
    finished: 'Finalizados',
    upcoming: 'Próximos',
  },

  // ── Match statuses ─────────────────────────────────────────────────────────
  matchStatus: {
    finished: 'FT',
    live: 'EN VIVO',
    halfTime: 'HT',
    scheduled: 'Programado',
    postponed: 'Aplazado',
    cancelled: 'Cancelado',
    suspended: 'Suspendido',
  },

  // ── PartidosScreen ─────────────────────────────────────────────────────────
  matches: {
    title: 'Partidos',
    noMatches: 'Sin partidos',
    noMatchesFilter: 'No hay partidos en esta categoría',
    noMatchesDay: 'No hay partidos en este día',
    detailUnavailable: 'Detalle no disponible',
    scrollToTop: 'Volver arriba',
    recentMatches: 'Partidos recientes',
    noMatchesAvailable: 'Sin partidos disponibles',
    upcoming: 'PRÓXIMOS',
    matchesViewed: 'Partidos vistos',
  },

  // ── Cup bracket ────────────────────────────────────────────────────────────
  cup: {
    elimination: 'Eliminatoria',
    season: 'Temporada {{season}}',
    bracketUnavailable: 'Bracket no disponible',
    inProgress: 'EN CURSO · {{count}} llaves',
    finished: 'FINALIZADO · {{count}} llaves',
    next: 'PRÓXIMO · {{count}} llaves',
    global: 'Global',
    projection: 'Proyección',
    toBeDefined: 'Por definir',
    showDetails: '▼ ver ida y vuelta',
    hideDetails: '▲ ocultar detalles',
    firstLeg: 'IDA',
    secondLeg: 'VUELTA',
    winner: 'Ganador {{teams}}',
  },

  // ── Favorites ──────────────────────────────────────────────────────────────
  favorites: {
    title: 'Favoritos',
    teams: 'Equipos',
    leagues: 'Ligas',
    players: 'Jugadores',
    searchTeams: 'Buscar equipos...',
    searchLeagues: 'Buscar ligas o torneos...',
    searchPlayers: 'Buscar jugadores...',
    count: 'Favoritos',
  },

  // ── News ───────────────────────────────────────────────────────────────────
  news: {
    title: 'Noticias',
    forYou: 'Para ti',
    following: 'Siguiendo',
    latest: 'Últimas',
    breakingNow: '⚡ AHORA',
    searchPlaceholder: 'Buscar noticias...',
    noNews: 'Sin noticias',
    tryAnotherSearch: 'Prueba con otra búsqueda',
    moreNews: 'MÁS NOTICIAS',
    allNews: 'TODAS LAS NOTICIAS',
    relatedNews: 'Noticias relacionadas con {{teams}}',
    newsRead: 'Noticias leídas',
  },

  // ── Profile ────────────────────────────────────────────────────────────────
  profile: {
    title: 'Perfil',
    editProfile: 'Editar perfil',
    substitute: 'SUPLENTE',
    starter: 'TITULAR',
    premium: '👑 PREMIUM',
    promoTitle: 'Es hora del cambio',
    promoSubtitle: 'Sal de la banca y juega con todo',
    levelUp: 'Subir de nivel',
    seePlans: 'Ver planes',
    language: 'Español',
    clearCache: 'Borrar caché',
    clearCacheConfirm: '¿Estás seguro? Se eliminarán datos temporales. Tu cuenta y favoritos no se verán afectados.',
    cacheCleared: 'Caché eliminado correctamente.',
    cacheClearError: 'No se pudo borrar el caché.',
    testNotification: '🔔 Test Notificación',
  },

  // ── Edit profile modal ─────────────────────────────────────────────────────
  editProfileModal: {
    title: 'Editar perfil',
    nameLabel: 'Nombre',
    namePlaceholder: 'Tu nombre',
    usernameLabel: 'Username',
    usernamePlaceholder: 'tu_username',
    usernameInUse: 'Ese @username ya está en uso',
    saveError: 'Error al guardar. Intenta de nuevo.',
    usernameHint: 'Mín. 3 caracteres (letras, números, . _)',
  },

  // ── Streak modal ───────────────────────────────────────────────────────────
  streak: {
    daySingular: 'día de racha',
    dayPlural: 'días de racha',
    days: 'días',
    nextAchievement: 'Siguiente logro',
    daysRemaining: 'faltan {{count}} días',
    yourAchievements: 'TUS LOGROS',
    dontBreakStreak: '¡No rompas la racha!',
    streakNotification: 'Te avisaremos si estás a punto de perderla para que entres a activarla.',
    // Milestone names
    milestones: {
      firstSprout: 'Primer brote',
      firstSproutDesc: '¡Ya diste el primer paso, sigue así!',
      onFire: 'En llamas',
      onFireDesc: 'Una semana sin fallar. ¡Verdadero hincha!',
      electrifying: 'Electrizante',
      electrifyingDesc: 'Tu compromiso con el fútbol habla por sí solo.',
      champion: 'Campeón',
      championDesc: 'Un mes entero. No eres un aficionado cualquiera.',
      diamond: 'Diamante',
      diamondDesc: '60 días sin parar. Eres un analista de élite.',
      legend: 'Leyenda',
      legendDesc: 'Triple dígito. Tu pasión no tiene límites.',
      immortal: 'Inmortal',
      immortalDesc: 'Un año entero. Eres historia viva del fútbol.',
    },
    // Motivational quotes
    quotes: [
      { quote: '"El fútbol se vive mejor cada día."', desc: 'Abre la app diario y descubre más.' },
      { quote: '"Tu equipo juega aunque tú no lo veas."', desc: 'Pero los verdaderos hinchas nunca faltan.' },
      { quote: '"La constancia define al verdadero fan."', desc: 'Una semana seguida no es casualidad.' },
      { quote: '"Estar al día es una forma de respeto al deporte."', desc: 'Tu dedicación marca la diferencia.' },
      { quote: '"No eres cualquier aficionado. Eres un Analista."', desc: 'Un mes entero demuestra quién eres.' },
      { quote: '"Tu pasión por el fútbol no tiene límites."', desc: 'Aquí está la prueba de tu compromiso.' },
    ],
  },

  // ── Hazte Titular (subscription) ───────────────────────────────────────────
  subscription: {
    title: 'Hazte Titular',
    starter: 'TITULAR',
    annualPlan: 'Plan anual',
    monthlyPrice: '≈ $6.67 al mes',
    bestPrice: '★ MEJOR PRECIO',
    savingsText: 'Ahorras $40/año 🚀',
    revulsive: 'REVULSIVO',
    monthlyPlan: 'Plan mensual',
    noAds: 'Sin anuncios',
    bench: 'BANCA',
    freePlan: 'Plan gratuito',
    withAds: 'Con anuncios',
    free: 'Gratis',
    perYear: '/año',
    perMonth: '/mes',
    comingSoonAlert: 'La suscripción "{{plan}}" estará disponible cuando lancemos la app. ¡Gracias por tu interés!',
    // Benefits
    benefits: {
      noAds: 'Sin anuncios',
      detailedStats: 'Estadísticas detalladas',
      exclusiveContent: 'Contenido exclusivo',
      priorities: 'Soporte prioritario',
      customIcon: 'Ícono personalizado',
      earlyAccess: 'Acceso anticipado',
    },
    // Icon options
    iconOptions: {
      classic: 'CLÁSICO',
      white: 'BLANCO',
      night: 'NOCHE',
      gold: 'ORO',
    },
  },

  // ── Team detail ────────────────────────────────────────────────────────────
  team: {
    info: 'Información',
    stadium: 'Estadio',
    capacity: 'Capacidad',
    founded: 'Fundado',
    coach: 'Director técnico',
    league: 'Liga',
    featuredPlayers: 'Jugadores destacados',
    shareStandings: 'Compartir tabla de posiciones',
    shareUnavailable: 'La función de compartir no está disponible en este dispositivo.',
    shareTablePrompt: 'Comparte esta tabla con tus amigos.',
    noStandings: 'Sin tabla disponible',
    standingsTitle: 'Tabla de posiciones',
    summaryTab: 'Resumen',
    squadTab: 'Plantilla',
    matchesTab: 'Partidos',
    standingsTab: 'Tabla',
    backToSummary: 'Volver al resumen',
    allMatches: 'TODOS LOS PARTIDOS ({{count}})',
    previous: 'ANTERIORES',
    lastMatch: 'ÚLTIMO PARTIDO',
    lastMatchLabel: 'ÚLTIMO',
    viewAllMatches: 'Ver todos los partidos ({{count}})',
    following: '✓ Siguiendo',
    follow: '+ Seguir',
    positionLabel: 'POSICIÓN',
    pointsLabel: 'PUNTOS',
    formLabel: 'FORMA',
    errorLoading: 'Error cargando equipo',
    // Player positions
    positions: {
      goalkeepers: 'PORTEROS',
      defenders: 'DEFENSAS',
      midfielders: 'MEDIOCAMPISTAS',
      forwards: 'DELANTEROS',
    },
    // Form result labels (W/D/L → G/E/P)
    formLabels: { W: 'G', D: 'E', L: 'P' },
    ageYears: '{{age}} años',
  },

  // ── Player detail ──────────────────────────────────────────────────────────
  player: {
    goals: 'Goles',
    assists: 'Asistencias',
    appearances: 'Partidos',
    minutes: 'Minutos',
    personalInfo: 'Información personal',
    nationality: 'Nacionalidad',
    age: 'Edad',
    height: 'Altura',
    weight: 'Peso',
    position: 'Posición',
    jersey: 'Dorsal',
    ageValue: '{{age}} años',
    jerseyNumber: '#{{number}}',
    performance: 'Rendimiento',
    shots: 'Tiros',
    shotsOnTarget: '{{count}} a puerta',
    passes: 'Pases',
    keyPasses: '{{count}} clave',
    tackles: 'Tackles',
    interceptions: 'Intercepciones',
    dribbles: 'Regates',
    duelsWon: 'Duelos ganados',
    aerialDuels: 'Duelos aéreos',
    crosses: 'Centros',
    clearances: 'Despejes',
    foulsDrawn: 'Faltas recibidas',
    foulsCommitted: 'Faltas cometidas',
    saves: 'Atajadas',
    cleanSheets: 'Portería imbatida',
    noStats: 'Sin estadísticas disponibles',
    summaryTab: 'Resumen',
    statsTab: 'Estadísticas',
    historyTab: 'Historial',
    seasonRating: 'Rating de temporada',
    basedOnAppearances: 'Basado en {{count}} partidos disputados',
    yellowCards: 'T. Amarillas',
    redCards: 'T. Rojas',
    season: 'Temporada {{season}}',
    averagesPer90: 'Promedios por 90 min',
    goalsPer90: 'Goles / 90',
    assistsPer90: 'Asistencias / 90',
    gaPer90: 'G+A / 90',
    minutesPerGoal: 'Minutos / Gol',
    attack: 'Ataque',
    offsides: 'Fueras de juego',
    penalties: 'Penales (anotados/fallados)',
    passesSection: 'Pases',
    defense: 'Defensa',
    goalkeeper: 'Portero',
    noHistory: 'Sin historial disponible',
    recentSeasons: 'Temporadas recientes',
    seasonHeader: 'TEMPORADA',
    careerTotals: 'Totales de carrera',
    matchesPlayed: 'Partidos jugados',
    minutesPlayedLabel: 'Minutos jugados',
    yellowCardsLong: 'Tarjetas amarillas',
    redCardsLong: 'Tarjetas rojas',
    goalsShort: 'Goles',
    assistsShort: 'Asist.',
    matchesShort: 'PJ',
    ratingLabel: 'Rating',
    following: '✓ Siguiendo',
    follow: '+ Seguir',
    unavailable: 'Jugador no disponible',
  },

  // ── League detail ──────────────────────────────────────────────────────────
  league: {
    standingsUnavailable: 'Clasificación no disponible',
    teamHeader: 'EQUIPO',
    noScorers: 'Sin datos de goleadores',
    scorersTitle: 'Goleadores',
    playerHeader: 'JUGADOR',
    goalsHeader: 'GOLES',
    noTeams: 'Sin equipos disponibles',
    teamsTitle: 'Equipos ({{count}})',
    noFixtures: 'Sin partidos recientes o próximos',
    upcomingFixtures: 'Próximos partidos',
    recentResults: 'Resultados recientes',
    live: 'EN VIVO',
    standingsTab: 'Clasificación',
    scorersTab: 'Goleadores',
    teamsTab: 'Equipos',
    calendarTab: 'Calendario',
    teamsLabel: 'Equipos',
    matchdaysLabel: 'Jornadas',
    followingLeague: '✓ Siguiendo',
    followLeague: 'Seguir liga',
    noData: 'Sin datos disponibles',
    // Zone legends
    zones: {
      champion: 'Campeón',
      championsLeague: 'Champions League',
      europaLeague: 'Europa League',
      relegation: 'Descenso',
    },
  },

  // ── Lineup tab ─────────────────────────────────────────────────────────────
  lineup: {
    shareLineup: 'Compartir alineación',
    noLineup: 'Sin alineaciones disponibles',
    confirmed: 'Alineación confirmada',
    probable: 'Alineación probable — pendiente de confirmación',
    aiPrediction: 'Predicción IA — alineación esperada',
    availableSoon: 'Las alineaciones se publicarán 1 hora antes del partido',
  },

  // ── Statistics tab ─────────────────────────────────────────────────────────
  stats: {
    noStats: 'Sin estadísticas disponibles',
    showMore: 'Mostrar más ▾',
    showLess: 'Mostrar menos ▴',
  },

  // ── Onboarding ─────────────────────────────────────────────────────────────
  onboarding: {
    welcome: 'TE DAMOS LA BIENVENIDA',
    tagline: 'Tu experiencia como analista\nempieza ahora',
    start: 'Empezar',
    defaultName: 'ANALISTA',
    personalizing: 'Personalizando',
    // Notification types
    notifications: {
      transfers: 'Fichajes',
      transfersDesc: 'Noticias de transferencias de tus equipos',
      news: 'Noticias',
      newsDesc: 'Artículos y análisis relevantes',
    },
  },
};

export default es;

// ── Type utility: captures the KEY structure but allows any string values ────
// This lets en.ts (and future locales) match the structure without
// TypeScript complaining that "Cancel" ≠ "Cancelar".
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? string[]
      : T[K] extends readonly { quote: string; desc: string }[]
        ? { quote: string; desc: string }[]
        : T[K] extends object
          ? DeepStringify<T[K]>
          : T[K];
};

export type TranslationKeys = DeepStringify<typeof es>;
