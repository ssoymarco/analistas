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
  case "pre":  return "POR COMENZAR"
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

// ── Sub-vistas compartidas ────────────────────────────────────────────────────

/// Columna de equipo: bandera emoji (o punto de color) + código corto.
struct TeamBlock: View {
  let team: MatchActivityAttributes.TeamInfo
  var compact: Bool = false

  var body: some View {
    VStack(spacing: compact ? 0 : 2) {
      if let flag = team.flagEmoji, !flag.isEmpty {
        Text(flag).font(compact ? .body : .title2)
      } else {
        Circle()
          .fill(Color(hex: team.colorHex))
          .frame(width: compact ? 12 : 18, height: compact ? 12 : 18)
      }
      Text(team.shortName)
        .font(compact ? .caption2 : .caption)
        .fontWeight(.bold)
        .foregroundStyle(.white.opacity(0.9))
    }
  }
}

/// Línea de tiempo: "2T · 22:31" (timer local) o etiqueta estática (MT/FINAL…).
struct PhaseTimeline: View {
  let state: MatchActivityAttributes.ContentState

  var body: some View {
    HStack(spacing: 4) {
      Text(phaseLabel(state.phase))
        .font(.caption2)
        .fontWeight(.heavy)
        .foregroundStyle(Color(red: 1.0, green: 0.27, blue: 0.23)) // live red

      if phaseTicks(state.phase), let startedAt = state.periodStartedAt {
        Text("·").font(.caption2).foregroundStyle(.white.opacity(0.5))
        // Timer local del período — sin pushes por segundo. Rango generoso
        // hacia adelante; el push de cambio de fase reemplaza el estado.
        Text(
          timerInterval: Date(timeIntervalSince1970: startedAt)...Date(
            timeIntervalSince1970: startedAt + 4 * 3600),
          countsDown: false,
          showsHours: false
        )
        .font(.caption2.monospacedDigit())
        .fontWeight(.bold)
        .foregroundStyle(.white.opacity(0.85))
        .frame(maxWidth: 44)
      }
    }
  }
}

/// Marcador central grande.
struct ScoreBlock: View {
  let state: MatchActivityAttributes.ContentState
  var big: Bool = true

  var body: some View {
    Text("\(state.homeScore) – \(state.awayScore)")
      .font(big ? .title.weight(.heavy) : .headline.weight(.heavy))
      .foregroundStyle(.white)
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
        TeamBlock(team: context.attributes.home)
        Spacer()
        VStack(spacing: 3) {
          ScoreBlock(state: context.state)
          PhaseTimeline(state: context.state)
        }
        Spacer()
        TeamBlock(team: context.attributes.away)
      }
      .padding(.horizontal, 18)

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
          TeamBlock(team: context.attributes.home)
            .padding(.leading, 6)
        }
        DynamicIslandExpandedRegion(.trailing) {
          TeamBlock(team: context.attributes.away)
            .padding(.trailing, 6)
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
        HStack(spacing: 3) {
          if let flag = context.attributes.home.flagEmoji, !flag.isEmpty {
            Text(flag).font(.caption2)
          } else {
            Circle().fill(Color(hex: context.attributes.home.colorHex))
              .frame(width: 8, height: 8)
          }
          Text("\(context.state.homeScore)")
            .font(.caption.weight(.heavy)).monospacedDigit()
        }
      } compactTrailing: {
        HStack(spacing: 3) {
          Text("\(context.state.awayScore)")
            .font(.caption.weight(.heavy)).monospacedDigit()
          if let flag = context.attributes.away.flagEmoji, !flag.isEmpty {
            Text(flag).font(.caption2)
          } else {
            Circle().fill(Color(hex: context.attributes.away.colorHex))
              .frame(width: 8, height: 8)
          }
        }
      } minimal: {
        Text("\(context.state.homeScore)-\(context.state.awayScore)")
          .font(.system(size: 10, weight: .heavy)).monospacedDigit()
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
