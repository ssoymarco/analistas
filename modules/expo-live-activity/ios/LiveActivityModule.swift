// ── ExpoLiveActivity — puente ActivityKit ↔ JS ────────────────────────────────
//
// Expone a JS: isSupported / areActivitiesEnabled / getActiveMatchIds /
// startMatchActivity / updateMatchActivity / endMatchActivity, y emite
// `onActivityPushToken` cuando ActivityKit entrega/rota el push token de una
// Activity (el JS lo registra en Firestore para que el backend empuje updates).
//
// ⚠️ CONTRATO ESPEJADO: `MatchActivityAttributes` debe coincidir NOMBRE y KEYS
// con targets/live-activity/index.swift y src/data/liveActivityContract.ts.
// ActivityKit empareja app ↔ widget por el nombre del tipo; los JSON de
// attrs/state llegan de JS como strings y se decodifican aquí con JSONDecoder.
//
// Compat: el pod compila con min iOS 15.1 (el del app); TODO uso de ActivityKit
// está detrás de #available(iOS 16.2, *). En dispositivos < 16.2 isSupported()
// devuelve false y el botón nunca se muestra.

import ExpoModulesCore

#if canImport(ActivityKit)
import ActivityKit
#endif

// ── Contrato (espejo exacto del widget y del TS) ─────────────────────────────

#if canImport(ActivityKit)
@available(iOS 16.2, *)
struct MatchActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var homeScore: Int
    var awayScore: Int
    var phase: String
    var periodStartedAt: Double?
    var periodMinuteOffset: Int?
    var kickoffAt: Double?
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
#endif

// ── Módulo ────────────────────────────────────────────────────────────────────

public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoLiveActivity")

    Events("onActivityPushToken")

    /// true solo en iOS 16.2+ (y por definición, solo cuando el binario trae
    /// este módulo — los runtimes viejos ni lo encuentran).
    Function("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) { return true }
      return false
    }

    /// El usuario puede tener las Live Activities apagadas en Ajustes.
    Function("areActivitiesEnabled") { () -> Bool in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      #endif
      return false
    }

    /// matchIds con Activity viva — para que el botón refleje estado tras
    /// reinicios del app.
    Function("getActiveMatchIds") { () -> [String] in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        return Activity<MatchActivityAttributes>.activities.map { $0.attributes.matchId }
      }
      #endif
      return []
    }

    /// Inicia la Activity. attrs/state llegan como JSON strings (contrato TS).
    /// Devuelve el activityId; el push token se emite por evento cuando
    /// ActivityKit lo entrega (asíncrono, puede rotar).
    AsyncFunction("startMatchActivity") { (attrsJson: String, stateJson: String) -> String in
      #if canImport(ActivityKit)
      guard #available(iOS 16.2, *) else {
        throw NSError(domain: "ExpoLiveActivity", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "Live Activities requiere iOS 16.2+"])
      }
      let decoder = JSONDecoder()
      let attrs = try decoder.decode(
        MatchActivityAttributes.self, from: Data(attrsJson.utf8))
      let state = try decoder.decode(
        MatchActivityAttributes.ContentState.self, from: Data(stateJson.utf8))

      // Una sola Activity por partido: si ya existe, actualiza y reutiliza.
      if let existing = Activity<MatchActivityAttributes>.activities
        .first(where: { $0.attributes.matchId == attrs.matchId }) {
        Task { await existing.update(ActivityContent(state: state, staleDate: nil)) }
        return existing.id
      }

      let activity = try Activity.request(
        attributes: attrs,
        content: ActivityContent(state: state, staleDate: nil),
        pushType: .token
      )

      // Stream de push tokens → evento a JS (hex). Puede emitir varias veces
      // (rotación); el JS siempre upsertea el registro en Firestore.
      Task {
        for await tokenData in activity.pushTokenUpdates {
          let hex = tokenData.map { String(format: "%02x", $0) }.joined()
          self.sendEvent("onActivityPushToken", [
            "matchId": attrs.matchId,
            "activityId": activity.id,
            "token": hex,
          ])
        }
      }

      return activity.id
      #else
      throw NSError(domain: "ExpoLiveActivity", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "ActivityKit no disponible"])
      #endif
    }

    /// Update local (lo usa el app en foreground; los updates remotos van por
    /// APNs directo a la Activity, sin pasar por aquí).
    AsyncFunction("updateMatchActivity") { (matchId: String, stateJson: String) in
      #if canImport(ActivityKit)
      guard #available(iOS 16.2, *) else { return }
      let state = try JSONDecoder().decode(
        MatchActivityAttributes.ContentState.self, from: Data(stateJson.utf8))
      for activity in Activity<MatchActivityAttributes>.activities
      where activity.attributes.matchId == matchId {
        await activity.update(ActivityContent(state: state, staleDate: nil))
      }
      #endif
    }

    /// Termina la Activity del partido (estado final opcional). Dismissal a
    /// los 30 min para que el marcador final se quede un rato en lock screen.
    AsyncFunction("endMatchActivity") { (matchId: String, finalStateJson: String?) in
      #if canImport(ActivityKit)
      guard #available(iOS 16.2, *) else { return }
      var content: ActivityContent<MatchActivityAttributes.ContentState>? = nil
      if let json = finalStateJson,
         let state = try? JSONDecoder().decode(
           MatchActivityAttributes.ContentState.self, from: Data(json.utf8)) {
        content = ActivityContent(state: state, staleDate: nil)
      }
      for activity in Activity<MatchActivityAttributes>.activities
      where activity.attributes.matchId == matchId {
        await activity.end(
          content ?? activity.content,
          dismissalPolicy: .after(Date().addingTimeInterval(30 * 60))
        )
      }
      #endif
    }
  }
}
