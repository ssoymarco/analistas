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
import UIKit

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
    var penHome: Int?
    var penAway: Int?
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

// ── Escudos vía App Group ─────────────────────────────────────────────────────
// WidgetKit NO puede descargar imágenes al renderizar. El app las baja AQUÍ
// (antes de iniciar la Activity), las reduce a 128 pt y las escribe al
// contenedor del App Group; el widget las lee por convención de nombre:
//   crests/crest_{matchId}_{home|away}.png
// (misma convención en targets/live-activity/index.swift — mantener en sync).

private let APP_GROUP_ID = "group.app.analistas"

private func crestsDirectory() -> URL? {
  guard let container = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: APP_GROUP_ID) else { return nil }
  let dir = container.appendingPathComponent("crests", isDirectory: true)
  try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  return dir
}

/// Descarga → downscale 128pt (límite de memoria de widgets) → PNG al App Group.
private func downloadCrest(from urlString: String, to fileURL: URL) async -> Bool {
  guard let url = URL(string: urlString) else { return false }
  do {
    let (data, _) = try await URLSession.shared.data(from: url)
    guard let image = UIImage(data: data) else { return false }
    let side: CGFloat = 128
    let scale = min(side / max(image.size.width, 1), side / max(image.size.height, 1), 1)
    let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    let renderer = UIGraphicsImageRenderer(size: newSize)
    let resized = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
    guard let png = resized.pngData() else { return false }
    try png.write(to: fileURL, options: .atomic)
    return true
  } catch {
    return false
  }
}

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

    /// matchIds con Activity ACTIVA — para que el botón refleje estado tras
    /// reinicios del app. Filtra por .active: una Activity terminada que sigue
    /// visible en lock screen (linger de dismissal) NO cuenta como "siguiendo".
    Function("getActiveMatchIds") { () -> [String] in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        return Activity<MatchActivityAttributes>.activities
          .filter { $0.activityState == .active }
          .map { $0.attributes.matchId }
      }
      #endif
      return []
    }

    /// Descarga los escudos al App Group ANTES de iniciar la Activity (el
    /// widget no puede hacer red). Best-effort: si falla, el widget cae a
    /// bandera emoji / punto de color. Devuelve [homeOk, awayOk].
    AsyncFunction("prepareTeamCrests") { (matchId: String, homeUrl: String?, awayUrl: String?) -> [Bool] in
      guard let dir = crestsDirectory() else { return [false, false] }
      var results = [false, false]
      if let home = homeUrl, !home.isEmpty {
        results[0] = await downloadCrest(
          from: home, to: dir.appendingPathComponent("crest_\(matchId)_home.png"))
      }
      if let away = awayUrl, !away.isEmpty {
        results[1] = await downloadCrest(
          from: away, to: dir.appendingPathComponent("crest_\(matchId)_away.png"))
      }
      return results
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

      // Una sola Activity por partido: reutilizar SOLO si sigue .active.
      // Una Activity terminada (linger de dismissal en lock screen) no se puede
      // actualizar ni "revivir" — reutilizarla dejaba al usuario sin Dynamic
      // Island al reactivar (bug #3). Limpieza: cualquier resto no-activo del
      // mismo partido se descarta de inmediato antes de crear la nueva.
      for stale in Activity<MatchActivityAttributes>.activities
      where stale.attributes.matchId == attrs.matchId {
        if stale.activityState == .active {
          Task { await stale.update(ActivityContent(state: state, staleDate: nil)) }
          return stale.id
        }
        await stale.end(stale.content, dismissalPolicy: .immediate)
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

    /// Termina la Activity del partido (estado final opcional).
    ///   immediate = true  → desaparece YA de lock screen/Isla (toggle manual
    ///                       del usuario — bug #4: antes se quedaba 30 min).
    ///   immediate = false → linger de 30 min con el marcador final (fin
    ///                       natural del partido, FT).
    AsyncFunction("endMatchActivity") { (matchId: String, finalStateJson: String?, immediate: Bool) in
      #if canImport(ActivityKit)
      guard #available(iOS 16.2, *) else { return }
      var content: ActivityContent<MatchActivityAttributes.ContentState>? = nil
      if let json = finalStateJson,
         let state = try? JSONDecoder().decode(
           MatchActivityAttributes.ContentState.self, from: Data(json.utf8)) {
        content = ActivityContent(state: state, staleDate: nil)
      }
      let policy: ActivityUIDismissalPolicy = immediate
        ? .immediate
        : .after(Date().addingTimeInterval(10 * 60))
      for activity in Activity<MatchActivityAttributes>.activities
      where activity.attributes.matchId == matchId {
        await activity.end(content ?? activity.content, dismissalPolicy: policy)
      }
      #endif
    }
  }
}
