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
    /// Unix seconds del kickoff — countdown en phase 'pre'.
    var kickoffAt: Double?
    /// Tanda de penales — "PENALES · 4-2" (en vivo) / "FINAL · 4-2 pen".
    var penHome: Int?
    var penAway: Int?
    /// "⚽ Oyarzabal 36'" — ya localizado por el app al enviarlo.
    var lastEventText: String?
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

/// Tope nominal del período según su offset (espejo de getPeriodNominalCap en
/// src/hooks/useLiveTick.ts): 1T→45' · 2T→90' · TE1→105' · TE2→120'.
private func periodNominalCap(_ offsetMinutes: Int) -> Int {
  if offsetMinutes >= 105 { return 120 }
  if offsetMinutes >= 90 { return 105 }
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

/// Columna de equipo. Prioridad visual: escudo real (App Group) → bandera
/// emoji → punto del color del equipo. `fullName` (lock screen, hay espacio)
/// muestra el nombre completo traducido; si no, el código corto.
struct TeamBlock: View {
  let team: MatchActivityAttributes.TeamInfo
  let matchId: String
  /// "home" | "away" — clave del archivo de escudo.
  let side: String
  var compact: Bool = false
  var fullName: Bool = false

  var body: some View {
    VStack(spacing: compact ? 0 : 3) {
      if let crest = crestImage(matchId: matchId, side: side) {
        Image(uiImage: crest)
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

/// Insignia para la Dynamic Island compacta. Prioridad: bandera EMOJI (texto —
/// renderiza nítido y con color garantizado en la Isla) → SIGLAS del equipo
/// (texto — igual de nítido; solo para clubes, sin bandera) → punto de color.
/// El escudo bitmap se DESCARTA aquí a propósito: a 18px se ve como un cuadro
/// gris ilegible (confirmado en vivo con clubes reales, 4 jul 2026 — el mismo
/// problema que ya habíamos resuelto para selecciones con la bandera). El
/// bitmap SÍ se usa en TeamBlock (lock screen / isla expandida), donde hay
/// espacio de sobra para que se vea bien.
struct CompactBadge: View {
  let team: MatchActivityAttributes.TeamInfo

  var body: some View {
    if let flag = team.flagEmoji, !flag.isEmpty {
      Text(flag).font(.body)
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

// ── Lock screen / banner ──────────────────────────────────────────────────────

struct LockScreenView: View {
  let context: ActivityViewContext<MatchActivityAttributes>

  var body: some View {
    VStack(spacing: 6) {
      Text(context.attributes.leagueName.uppercased())
        .font(.system(size: 9, weight: .bold))
        .tracking(1)
        .foregroundStyle(.white.opacity(0.45))

      HStack {
        TeamBlock(team: context.attributes.home, matchId: context.attributes.matchId,
                  side: "home", fullName: true)
        Spacer()
        VStack(spacing: 3) {
          ScoreBlock(state: context.state)
          PhaseTimeline(state: context.state)
        }
        Spacer()
        TeamBlock(team: context.attributes.away, matchId: context.attributes.matchId,
                  side: "away", fullName: true)
      }
      .padding(.horizontal, 14)

      if let event = context.state.lastEventText, !event.isEmpty {
        Text(event)
          .font(.caption2)
          .foregroundStyle(.white.opacity(0.65))
          .lineLimit(1)
      }
    }
    .padding(.vertical, 12)
    .activityBackgroundTint(Color(red: 0.05, green: 0.05, blue: 0.05).opacity(0.85))
    .activitySystemActionForegroundColor(.white)
    .widgetURL(URL(string: "analistas://match/\(context.attributes.matchId)"))
  }
}

// ── Widget (Activity) ─────────────────────────────────────────────────────────

struct MatchLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: MatchActivityAttributes.self) { context in
      LockScreenView(context: context)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          // Alineado hacia el CENTRO (junto al marcador) — pegados a los
          // bordes se veían "muy separados" (feedback dueño).
          TeamBlock(team: context.attributes.home, matchId: context.attributes.matchId, side: "home")
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
            .padding(.trailing, 6)
        }
        DynamicIslandExpandedRegion(.trailing) {
          TeamBlock(team: context.attributes.away, matchId: context.attributes.matchId, side: "away")
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
          if let event = context.state.lastEventText, !event.isEmpty {
            Text(event)
              .font(.caption2)
              .foregroundStyle(.white.opacity(0.65))
              .lineLimit(1)
          }
        }
      } compactLeading: {
        HStack(spacing: 4) {
          CompactBadge(team: context.attributes.home)
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
          CompactBadge(team: context.attributes.away)
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
      .widgetURL(URL(string: "analistas://match/\(context.attributes.matchId)"))
      .keylineTint(Color(red: 0.0, green: 0.88, blue: 0.59)) // accent #00E096
    }
  }
}

// ── Bundle ────────────────────────────────────────────────────────────────────

@main
struct AnalistasLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    MatchLiveActivity()
  }
}
