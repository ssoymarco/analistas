// ── Analistas — Live Activity de partido (Widget Extension) ──────────────────
//
// Lock screen + Dynamic Island con marcador y minuto en vivo.
//
// ⚠️ CONTRATO ESPEJADO: `MatchActivityAttributes` debe coincidir NOMBRE y KEYS
// exactas con:
//   • modules/expo-live-activity/ios/LiveActivityModule.swift (el puente)
//   • src/data/liveActivityContract.ts  +  functions/src/live-activity-contract.ts
// ActivityKit empareja la Activity entre app y extensión por el NOMBRE del tipo
// y decodifica el `content-state` de los push con estas keys JSON literales.
// Un rename aquí rompe la Activity en silencio.
//
// Minuto en vivo: el timer corre LOCAL con Text(timerInterval:) anclado a
// periodStartedAt (misma semántica que Match.liveClock / computeLiveMinuteSeconds
// en el app). Formato v1: "2T · 22:31" (etiqueta de fase + tiempo del período).
// Cero pushes por tick — los push solo llegan en gol/cambio de fase.

import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

// ── Contrato ──────────────────────────────────────────────────────────────────

struct MatchActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var homeScore: Int
    var awayScore: Int
    /// 'pre' | '1H' | 'HT' | '2H' | 'ET' | 'PEN' | 'SUSP' | 'FT'
    var phase: String
    /// Unix seconds del arranque del período actual (ausente si la fase no corre).
    var periodStartedAt: Double?
    /// 0 (1T) | 45 (2T) | 90 (TE1) | 105 (TE2)
    var periodMinuteOffset: Int?
    /// Fallback sin ancla: último minuto conocido del servidor (estático).
    var minute: Int?
    /// Unix seconds del kickoff — countdown en phase 'pre'.
    var kickoffAt: Double?
    /// Tanda de penales — "PENALES · 4-2" (en vivo) / "FINAL · 4-2 pen".
    var penHome: Int?
    var penAway: Int?
    /// "⚽ Oyarzabal 36'" — ya localizado por el app al enviarlo.
    var lastEventText: String?
    // ── Contrato v2 (rediseño, build 1.5.0) — todos opcionales: un servidor o
    //    un JS que no los mande deja el widget en su forma básica. ───────────
    /// Expulsados por lado → tarjeta roja junto al escudo.
    var homeRed: Int?
    var awayRed: Int?
    /// Jugadas clave de cada lado ya redactadas por el servidor
    /// ("⚽ H. Martín 52', 78'" / "🟥 R. Chávez 11'"; hasta dos renglones).
    var homeEvents: String?
    var awayEvents: String?
    /// Franja de estadísticas (solo partidos con estadísticas en vivo).
    var possHome: Int?
    var sotHome: Int?
    var sotAway: Int?
    var cornersHome: Int?
    var cornersAway: Int?
    var yellowHome: Int?
    var yellowAway: Int?
  }

  struct TeamInfo: Codable, Hashable {
    var name: String
    var shortName: String
    var colorHex: String
    var flagEmoji: String?
  }

  var matchId: String
  var home: TeamInfo
  var away: TeamInfo
  var leagueName: String
}

// ── Helpers ───────────────────────────────────────────────────────────────────

extension Color {
  /// "#RRGGBB" → Color. Fallback gris si el hex viene malformado.
  init(hex: String) {
    let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var value: UInt64 = 0
    guard Scanner(string: cleaned).scanHexInt64(&value), cleaned.count == 6 else {
      self = Color(white: 0.5)
      return
    }
    self.init(
      red: Double((value >> 16) & 0xff) / 255.0,
      green: Double((value >> 8) & 0xff) / 255.0,
      blue: Double(value & 0xff) / 255.0
    )
  }
}

extension Color {
  /// Color del equipo, aclarado cuando es demasiado oscuro para distinguirse
  /// sobre el fondo casi negro de la Activity (azul marino, negro, granate).
  static func visibleTeamColor(hex: String) -> Color {
    let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var value: UInt64 = 0
    guard Scanner(string: cleaned).scanHexInt64(&value), cleaned.count == 6 else {
      return Color(white: 0.6)
    }
    var r = Double((value >> 16) & 0xff) / 255.0
    var g = Double((value >> 8) & 0xff) / 255.0
    var b = Double(value & 0xff) / 255.0
    let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if luminance < 0.28 {
      let lift = 0.45
      r += (1 - r) * lift
      g += (1 - g) * lift
      b += (1 - b) * lift
    }
    return Color(red: r, green: g, blue: b)
  }
}

private func phaseLabel(_ phase: String) -> String {
  switch phase {
  case "pre":  return "EMPIEZA EN"
  case "1H":   return "1T"
  case "HT":   return "MT"
  case "2H":   return "2T"
  case "ET":   return "TE"
  case "PEN":  return "PENALES"
  case "SUSP": return "SUSPENDIDO"
  case "FT":   return "FINAL"
  default:     return phase
  }
}

/// ¿La fase lleva reloj corriendo?
private func phaseTicks(_ phase: String) -> Bool {
  return phase == "1H" || phase == "2H" || phase == "ET"
}

/// Deep link del tap: `analistas://match/{id}?home=..&away=..&hs=..&as=..&phase=..`
/// El lado JS (src/utils/deepLinks.ts) lo traduce a navegación directa al
/// partido; los query params pintan el primer frame del header mientras
/// MatchDetail carga el fixture real (el JS también acepta el path pelón que
/// mandaba el build 44).
private func deepLinkURL(
  _ attrs: MatchActivityAttributes,
  _ state: MatchActivityAttributes.ContentState
) -> URL? {
  var comps = URLComponents()
  comps.scheme = "analistas"
  comps.host = "match"
  comps.path = "/\(attrs.matchId)"
  comps.queryItems = [
    URLQueryItem(name: "home", value: attrs.home.name),
    URLQueryItem(name: "away", value: attrs.away.name),
    URLQueryItem(name: "hs", value: String(state.homeScore)),
    URLQueryItem(name: "as", value: String(state.awayScore)),
    URLQueryItem(name: "phase", value: state.phase),
  ]
  return comps.url
}

/// Tope nominal del período según su offset (espejo de getPeriodNominalCap en
/// src/hooks/useLiveTick.ts): 1T→45' · 2T→90' · TE1→105' · TE2→120'.
private func periodNominalCap(_ offsetMinutes: Int) -> Int {
  // La prórroga de SM es UN periodo continuo 90→120 (ver useLiveTick.ts).
  if offsetMinutes >= 90 { return 120 }
  if offsetMinutes >= 45 { return 90 }
  return 45
}

// ── Sub-vistas compartidas ────────────────────────────────────────────────────

// ── Escudos desde el App Group ────────────────────────────────────────────────
// El app los descarga a group.app.analistas/crests/crest_{matchId}_{side}.png
// ANTES de iniciar la Activity (ver modules/expo-live-activity). Aquí solo se
// leen del disco — WidgetKit no puede hacer red. Convención en sync con el módulo.

private let APP_GROUP_ID = "group.app.analistas"

func crestImage(matchId: String, side: String) -> UIImage? {
  guard let container = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: APP_GROUP_ID) else { return nil }
  let path = container
    .appendingPathComponent("crests", isDirectory: true)
    .appendingPathComponent("crest_\(matchId)_\(side).png").path
  return UIImage(contentsOfFile: path)
}

/// Escudo PRE-MINIATURIZADO para la Isla compacta. El sistema RECHAZA bitmaps
/// "grandes" en las presentaciones compactas y los pinta como cuadro gris
/// (confirmado en device: el archivo de 128px se ve perfecto en la isla
/// expandida y gris en la compacta — 4-5 jul 2026). Redibujar a los puntos
/// exactos de la ranura produce una imagen diminuta que la Isla sí acepta.
func compactCrestImage(matchId: String, side: String, pt: CGFloat) -> UIImage? {
  guard let full = crestImage(matchId: matchId, side: side) else { return nil }
  let canvas = CGSize(width: pt, height: pt)
  // Aspect-fit dentro del lienzo cuadrado (los escudos no siempre son 1:1).
  let scale = min(canvas.width / max(full.size.width, 1),
                  canvas.height / max(full.size.height, 1))
  let drawSize = CGSize(width: full.size.width * scale, height: full.size.height * scale)
  let origin = CGPoint(x: (canvas.width - drawSize.width) / 2,
                       y: (canvas.height - drawSize.height) / 2)
  let renderer = UIGraphicsImageRenderer(size: canvas)
  return renderer.image { _ in
    full.draw(in: CGRect(origin: origin, size: drawSize))
  }
}

/// Tarjeta roja pegada al escudo: ese equipo juega con menos. Con dos o más
/// expulsados muestra el número.
struct RedCardBadge: View {
  let count: Int

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 2.5)
        .fill(Color(red: 1.0, green: 0.27, blue: 0.23))
        .frame(width: 10, height: 14)
        .overlay(
          RoundedRectangle(cornerRadius: 2.5)
            .stroke(Color.black.opacity(0.55), lineWidth: 1)
        )
      if count > 1 {
        Text("\(count)")
          .font(.system(size: 8, weight: .heavy))
          .foregroundStyle(.white)
      }
    }
  }
}

/// Columna de equipo. Prioridad visual: escudo real (App Group) → bandera
/// emoji → punto del color del equipo. `fullName` (lock screen, hay espacio)
/// muestra el nombre completo traducido; si no, el código corto. `redCards`
/// > 0 cuelga una tarjeta roja de la esquina del escudo.
struct TeamBlock: View {
  let team: MatchActivityAttributes.TeamInfo
  let matchId: String
  /// "home" | "away" — clave del archivo de escudo.
  let side: String
  var compact: Bool = false
  var fullName: Bool = false
  var redCards: Int = 0

  @ViewBuilder
  private var crest: some View {
    if let image = crestImage(matchId: matchId, side: side) {
      Image(uiImage: image)
        .resizable()
        .scaledToFit()
        .frame(width: compact ? 16 : 34, height: compact ? 16 : 34)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    } else if let flag = team.flagEmoji, !flag.isEmpty {
      Text(flag).font(compact ? .body : .system(size: 32))
    } else {
      Circle()
        .fill(Color(hex: team.colorHex))
        .frame(width: compact ? 12 : 22, height: compact ? 12 : 22)
    }
  }

  var body: some View {
    VStack(spacing: compact ? 0 : 3) {
      ZStack(alignment: .topTrailing) {
        crest
        if redCards > 0 && !compact {
          RedCardBadge(count: redCards)
            .offset(x: 10, y: -3)
        }
      }
      Text(fullName ? team.name : team.shortName)
        .font(compact ? .caption2 : .caption)
        .fontWeight(.bold)
        .foregroundStyle(.white.opacity(0.9))
        .lineLimit(1)
        .minimumScaleFactor(0.65)
        .frame(maxWidth: fullName ? 100 : 60)
    }
  }
}

/// Insignia para la Dynamic Island compacta. Prioridad: bandera EMOJI
/// (selecciones — texto, nítido y con color garantizado) → ESCUDO mini sobre
/// chip circular claro (clubes — el chip garantiza contraste: un escudo
/// oscuro directo sobre la Isla negra desaparecía, los "cuadros grises" del
/// 2 jul 2026; con fondo claro cualquier escudo se ve, estilo FotMob.
/// Petición del dueño 4 jul 2026) → siglas → punto de color.
struct CompactBadge: View {
  let team: MatchActivityAttributes.TeamInfo
  let matchId: String
  let side: String

  var body: some View {
    if let flag = team.flagEmoji, !flag.isEmpty {
      Text(flag).font(.body)
    } else if let crest = compactCrestImage(matchId: matchId, side: side, pt: 14) {
      ZStack {
        Circle()
          .fill(Color.white.opacity(0.92))
          .frame(width: 19, height: 19)
        Image(uiImage: crest)
          .frame(width: 14, height: 14)
      }
    } else if !team.shortName.isEmpty {
      Text(team.shortName.prefix(3).uppercased())
        .font(.system(size: 11, weight: .heavy))
        .foregroundStyle(Color(hex: team.colorHex))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    } else {
      Circle().fill(Color(hex: team.colorHex)).frame(width: 10, height: 10)
    }
  }
}

/// Línea de tiempo: "2T · 22:31" (timer local) o etiqueta estática (MT/FINAL…).
struct PhaseTimeline: View {
  let state: MatchActivityAttributes.ContentState

  var body: some View {
    HStack(spacing: 4) {
      if state.phase == "pre", let kickoff = state.kickoffAt,
         kickoff > Date().timeIntervalSince1970 {
        // ── Previa: CUENTA REGRESIVA al kickoff (countsDown, local) ──────────
        Text(phaseLabel("pre"))
          .font(.caption2)
          .fontWeight(.heavy)
          .foregroundStyle(Color(red: 0.0, green: 0.88, blue: 0.59)) // accent
        Text(
          timerInterval: Date()...Date(timeIntervalSince1970: kickoff),
          countsDown: true
        )
        .font(.caption2.monospacedDigit())
        .fontWeight(.bold)
        .foregroundStyle(.white.opacity(0.85))
        .frame(maxWidth: 64)
      } else if phaseTicks(state.phase), let startedAt = state.periodStartedAt {
        // ── Fase con reloj corriendo (1T/2T/TE): SOLO el minuto acumulado,
        //    sin prefijo "1T/2T" (petición del dueño 4 jul 2026, estilo
        //    FotMob). El punto rojo del reloj es la señal de "en vivo". ──
        // Minuto ACUMULADO estilo 90'/120' ("102:59", NO reinicia a 0 en el
        // 2T) — anclado a periodStartedAt − offset. showsHours:false mantiene
        // los minutos corriendo más allá de 60. El rango TERMINA en tope
        // nominal + 25' de stoppage máximo: si el push de cambio de fase no
        // llegara, el timer se CONGELA ahí en vez de correr al infinito (el
        // "196:58" reportado por el dueño). 25' y no 15': el POR-CRO del 2 jul
        // 2026 jugó 90+18 REALES — con +15 el paracaídas habría congelado el
        // reloj en pleno agregado.
        let offsetMin = state.periodMinuteOffset ?? 0
        let anchor = startedAt - Double(offsetMin) * 60
        let freezeAt = anchor + Double(periodNominalCap(offsetMin) + 25) * 60
        Circle()
          .fill(Color(red: 1.0, green: 0.27, blue: 0.23)) // live red dot
          .frame(width: 6, height: 6)
        Text(
          timerInterval: Date(timeIntervalSince1970: anchor)...Date(
            timeIntervalSince1970: freezeAt),
          countsDown: false,
          showsHours: false
        )
        .font(.caption2.monospacedDigit())
        .fontWeight(.bold)
        .foregroundStyle(.white.opacity(0.9))
        .frame(maxWidth: 56)

        // Tanda de penales durante el juego (raro, pero por consistencia).
        if let ph = state.penHome, let pa = state.penAway {
          Text("· \(ph)-\(pa)")
            .font(.caption2.monospacedDigit())
            .fontWeight(.bold)
            .foregroundStyle(.white.opacity(0.85))
        }
      } else if phaseTicks(state.phase), let minute = state.minute {
        // ── Fase corriendo SIN ancla del período (amistosos de bajo perfil
        //    donde SM no manda periods.ticking — 11 jul 2026): mostrar el
        //    último minuto conocido del servidor, ESTÁTICO. Se refresca con
        //    cada push. Mucho mejor que la etiqueta de fase sola. ──
        Circle()
          .fill(Color(red: 1.0, green: 0.27, blue: 0.23)) // live red dot
          .frame(width: 6, height: 6)
        Text("\(minute)'")
          .font(.caption2.monospacedDigit())
          .fontWeight(.bold)
          .foregroundStyle(.white.opacity(0.9))
      } else {
        // ── Fase SIN reloj (MT/FINAL/PENALES/SUSPENDIDO): solo la etiqueta,
        //    porque no hay minuto que mostrar. ──
        Text(phaseLabel(state.phase))
          .font(.caption2)
          .fontWeight(.heavy)
          .foregroundStyle(Color(red: 1.0, green: 0.27, blue: 0.23)) // live red

        // Tanda de penales: "PENALES · 4-2" (en vivo) / "FINAL · 4-2 pen".
        if let ph = state.penHome, let pa = state.penAway {
          Text(state.phase == "FT" ? "· \(ph)-\(pa) pen" : "· \(ph)-\(pa)")
            .font(.caption2.monospacedDigit())
            .fontWeight(.bold)
            .foregroundStyle(.white.opacity(0.85))
        }
      }
    }
  }
}

/// Marcador central grande.
struct ScoreBlock: View {
  let state: MatchActivityAttributes.ContentState
  var big: Bool = true

  var body: some View {
    // Previa: "VS" en lugar de un 0–0 engañoso.
    Text(state.phase == "pre" ? "VS" : "\(state.homeScore) – \(state.awayScore)")
      .font(big ? .title.weight(.heavy) : .headline.weight(.heavy))
      .foregroundStyle(state.phase == "pre" ? .white.opacity(0.6) : .white)
      .monospacedDigit()
  }
}

// ── Piezas del rediseño (contrato v2) ─────────────────────────────────────────

/// Jugadas clave de cada equipo bajo su nombre: goleadores con minuto y
/// expulsados. Si el servidor no las manda, cae a la línea única de "última
/// jugada" (la que ya pintaba el widget anterior).
struct SideEvents: View {
  let state: MatchActivityAttributes.ContentState
  /// Un renglón por lado (cuando la franja de estadísticas ocupa el alto).
  var singleLine: Bool = false

  private func text(_ raw: String?) -> String {
    let value = raw ?? ""
    return singleLine ? value.replacingOccurrences(of: "\n", with: "  ") : value
  }

  var body: some View {
    let home = text(state.homeEvents)
    let away = text(state.awayEvents)
    if !home.isEmpty || !away.isEmpty {
      HStack(alignment: .top, spacing: 10) {
        Text(home)
          .multilineTextAlignment(.leading)
          .frame(maxWidth: .infinity, alignment: .leading)
        Text(away)
          .multilineTextAlignment(.trailing)
          .frame(maxWidth: .infinity, alignment: .trailing)
      }
      .font(.system(size: 10.5, weight: .semibold))
      .foregroundStyle(.white.opacity(0.8))
      .lineLimit(singleLine ? 1 : 2)
      .minimumScaleFactor(0.85)
    } else if let event = state.lastEventText, !event.isEmpty {
      Text(event)
        .font(.caption2)
        .foregroundStyle(.white.opacity(0.65))
        .lineLimit(1)
        .frame(maxWidth: .infinity)
    }
  }
}

/// Un par "etiqueta local · visitante" de la franja de estadísticas.
struct StatPair: View {
  let label: String
  let home: Int?
  let away: Int?

  var body: some View {
    HStack(spacing: 4) {
      Text(label)
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(.white.opacity(0.6))
      Text("\(home ?? 0) · \(away ?? 0)")
        .font(.system(size: 10, weight: .heavy).monospacedDigit())
        .foregroundStyle(.white)
    }
    .lineLimit(1)
  }
}

/// Franja inferior: barra de posesión con los colores de los equipos y tres
/// pares de números (tiros a puerta, córners, amarillas). Solo se pinta
/// cuando el servidor manda estadísticas (ligas principales).
struct StatsStrip: View {
  let state: MatchActivityAttributes.ContentState
  let homeHex: String
  let awayHex: String

  var body: some View {
    let poss = min(max(state.possHome ?? 50, 0), 100)
    VStack(spacing: 5) {
      HStack(spacing: 8) {
        Text("\(poss)%")
        GeometryReader { geo in
          HStack(spacing: 2) {
            Capsule()
              .fill(Color.visibleTeamColor(hex: homeHex))
              .frame(width: max(3, (geo.size.width - 2) * CGFloat(poss) / 100))
            Capsule()
              .fill(Color.visibleTeamColor(hex: awayHex))
          }
        }
        .frame(height: 5)
        Text("\(100 - poss)%")
      }
      .font(.system(size: 10.5, weight: .bold).monospacedDigit())
      .foregroundStyle(.white.opacity(0.92))

      HStack(spacing: 0) {
        StatPair(label: "Tiros a puerta", home: state.sotHome, away: state.sotAway)
        Spacer(minLength: 6)
        StatPair(label: "Córners", home: state.cornersHome, away: state.cornersAway)
        Spacer(minLength: 6)
        HStack(spacing: 4) {
          RoundedRectangle(cornerRadius: 1.5)
            .fill(Color(red: 1.0, green: 0.84, blue: 0.04))
            .frame(width: 7, height: 10)
          Text("\(state.yellowHome ?? 0) · \(state.yellowAway ?? 0)")
            .font(.system(size: 10, weight: .heavy).monospacedDigit())
            .foregroundStyle(.white)
        }
      }
    }
    .padding(.horizontal, 16)
    .padding(.top, 7)
    .padding(.bottom, 9)
    .frame(maxWidth: .infinity)
    .background(Color.black.opacity(0.22))
  }
}

/// Fondo: un velo con el color de cada equipo en su lado, sobre el tinte oscuro.
struct TeamGlow: View {
  let homeHex: String
  let awayHex: String

  var body: some View {
    LinearGradient(
      stops: [
        Gradient.Stop(color: Color.visibleTeamColor(hex: homeHex).opacity(0.42), location: 0),
        Gradient.Stop(color: Color.clear, location: 0.42),
        Gradient.Stop(color: Color.clear, location: 0.58),
        Gradient.Stop(color: Color.visibleTeamColor(hex: awayHex).opacity(0.38), location: 1),
      ],
      startPoint: .leading,
      endPoint: .trailing
    )
  }
}

// ── Lock screen / banner ──────────────────────────────────────────────────────
//
// Rediseño (nov 2026, aprobado por el dueño sobre maqueta):
//   LIGA · RONDA                                   ● 57:12
//   [escudo 🟥]            0 – 0                  [escudo]
//    Monterrey                                     América
//   🟥 R. Chávez 11'                    ⚽ H. Martín 52'
//   ─────────────────────────────────────────────────────
//   33% ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ 67%
//   Tiros a puerta 0 · 5      Córners 1 · 10      🟨 0 · 2
//
// Alto máximo del sistema: 160 pt. Con la franja de estadísticas las jugadas
// van a un renglón por lado (≈149 pt en total); sin ella, a dos (≈121 pt).

struct LockScreenView: View {
  let context: ActivityViewContext<MatchActivityAttributes>

  var body: some View {
    let attrs = context.attributes
    let state = context.state
    let showStats = state.phase != "pre" && state.possHome != nil

    VStack(spacing: 0) {
      HStack(alignment: .center, spacing: 8) {
        Text(attrs.leagueName.uppercased())
          .font(.system(size: 9.5, weight: .bold))
          .tracking(0.8)
          .foregroundStyle(.white.opacity(0.6))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        Spacer(minLength: 6)
        PhaseTimeline(state: state)
      }
      .padding(.horizontal, 16)
      .padding(.top, 10)

      HStack(alignment: .center) {
        TeamBlock(team: attrs.home, matchId: attrs.matchId, side: "home",
                  fullName: true, redCards: state.homeRed ?? 0)
        Spacer(minLength: 4)
        ScoreBlock(state: state)
        Spacer(minLength: 4)
        TeamBlock(team: attrs.away, matchId: attrs.matchId, side: "away",
                  fullName: true, redCards: state.awayRed ?? 0)
      }
      .padding(.horizontal, 14)
      .padding(.top, 4)

      SideEvents(state: state, singleLine: showStats)
        .padding(.horizontal, 16)
        .padding(.top, 4)

      if showStats {
        StatsStrip(state: state, homeHex: attrs.home.colorHex, awayHex: attrs.away.colorHex)
          .padding(.top, 7)
      }
    }
    .padding(.bottom, showStats ? 0 : 12)
    .frame(maxWidth: .infinity)
    .background {
      TeamGlow(homeHex: attrs.home.colorHex, awayHex: attrs.away.colorHex)
    }
    .activityBackgroundTint(Color(red: 0.05, green: 0.05, blue: 0.05).opacity(0.85))
    .activitySystemActionForegroundColor(.white)
    .widgetURL(deepLinkURL(attrs, state))
  }
}

// ── Familia .small (CarPlay + Apple Watch Smart Stack, iOS 18+) ───────────────
//
// Desde iOS 26, CarPlay muestra Live Activities. Sin adopción explícita, el
// sistema COMPONE las vistas compactas de la Dynamic Island (bandera + gol por
// lado) — sin minuto (foto del dueño, 13 jul 2026, España-Bélgica). Adoptar
// `supplementalActivityFamilies([.small])` nos da una tarjeta propia donde SÍ
// cabe la PhaseTimeline: el mismo timer del minuto (Text(timerInterval:)) con
// su fallback de minuto estático. Si el renderer del coche no tickea el timer,
// cada push (~1/min) re-renderiza y el minuto se ve actualizado igual.
// API iOS 18+ → widget "moderno" gateado; iOS 16.2–17 siguen con el clásico.

@available(iOS 18.0, *)
struct SmallFamilyView: View {
  let context: ActivityViewContext<MatchActivityAttributes>

  var body: some View {
    VStack(spacing: 5) {
      HStack(spacing: 8) {
        CompactBadge(team: context.attributes.home, matchId: context.attributes.matchId, side: "home")
        ScoreBlock(state: context.state, big: false)
        CompactBadge(team: context.attributes.away, matchId: context.attributes.matchId, side: "away")
      }
      PhaseTimeline(state: context.state)
    }
    .padding(.vertical, 6)
    .activityBackgroundTint(Color(red: 0.05, green: 0.05, blue: 0.05).opacity(0.85))
    .activitySystemActionForegroundColor(.white)
    .widgetURL(deepLinkURL(context.attributes, context.state))
  }
}

/// Enruta por familia: .small (CarPlay/Watch) → tarjeta compacta con minuto;
/// resto → lock screen completa de siempre.
@available(iOS 18.0, *)
struct FamilyAwareLockView: View {
  @Environment(\.activityFamily) private var family
  let context: ActivityViewContext<MatchActivityAttributes>

  var body: some View {
    switch family {
    case .small:
      SmallFamilyView(context: context)
    default:
      LockScreenView(context: context)
    }
  }
}

// ── Widget (Activity) ─────────────────────────────────────────────────────────

/// DynamicIsland compartida por el widget clásico (iOS 16.2–17) y el moderno
/// (iOS 18+) — una sola fuente de verdad para la Isla.
func matchDynamicIsland(_ context: ActivityViewContext<MatchActivityAttributes>) -> DynamicIsland {
  DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          // Alineado hacia el CENTRO (junto al marcador) — pegados a los
          // bordes se veían "muy separados" (feedback dueño).
          TeamBlock(team: context.attributes.home, matchId: context.attributes.matchId, side: "home",
                    redCards: context.state.homeRed ?? 0)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
            .padding(.trailing, 6)
        }
        DynamicIslandExpandedRegion(.trailing) {
          TeamBlock(team: context.attributes.away, matchId: context.attributes.matchId, side: "away",
                    redCards: context.state.awayRed ?? 0)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .padding(.leading, 6)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 3) {
            ScoreBlock(state: context.state)
            PhaseTimeline(state: context.state)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          // Jugadas por lado (o la última jugada, si el servidor no las manda).
          SideEvents(state: context.state, singleLine: true)
            .padding(.horizontal, 6)
        }
      } compactLeading: {
        HStack(spacing: 4) {
          CompactBadge(team: context.attributes.home, matchId: context.attributes.matchId, side: "home")
          if context.state.phase != "pre" {
            Text("\(context.state.homeScore)")
              .font(.subheadline.weight(.heavy)).monospacedDigit()
              .foregroundStyle(.white)
          }
        }
        .padding(.leading, 2)
      } compactTrailing: {
        HStack(spacing: 4) {
          if context.state.phase != "pre" {
            Text("\(context.state.awayScore)")
              .font(.subheadline.weight(.heavy)).monospacedDigit()
              .foregroundStyle(.white)
          }
          CompactBadge(team: context.attributes.away, matchId: context.attributes.matchId, side: "away")
        }
        .padding(.trailing, 2)
  } minimal: {
    if context.state.phase == "pre" {
      Text("VS").font(.system(size: 10, weight: .heavy))
    } else {
      Text("\(context.state.homeScore)-\(context.state.awayScore)")
        .font(.system(size: 10, weight: .heavy)).monospacedDigit()
    }
  }
  .widgetURL(deepLinkURL(context.attributes, context.state))
  .keylineTint(Color(red: 0.0, green: 0.88, blue: 0.59)) // accent #00E096
}

/// Widget clásico — iOS 16.2–17.x (sin familias suplementarias).
struct MatchLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: MatchActivityAttributes.self) { context in
      LockScreenView(context: context)
    } dynamicIsland: { context in
      matchDynamicIsland(context)
    }
  }
}

/// Widget moderno — iOS 18+: misma Isla + familia .small para CarPlay/Watch.
@available(iOS 18.0, *)
struct MatchLiveActivityModern: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: MatchActivityAttributes.self) { context in
      FamilyAwareLockView(context: context)
    } dynamicIsland: { context in
      matchDynamicIsland(context)
    }
    .supplementalActivityFamilies([.small])
  }
}

// ── Bundle ────────────────────────────────────────────────────────────────────

@main
struct AnalistasLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    // Indirección necesaria: WidgetBundleBuilder NO soporta if/#available.
    // Una función con retorno opaco SÍ admite ramas de disponibilidad con
    // tipos subyacentes distintos (Swift 5.8+).
    widgetForOSVersion()
  }

  private func widgetForOSVersion() -> some Widget {
    if #available(iOS 18.0, *) {
      return MatchLiveActivityModern()
    } else {
      return MatchLiveActivity()
    }
  }
}
