Pod::Spec.new do |s|
  s.name           = 'ExpoLiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Puente ActivityKit para la Live Activity de partidos de Analistas'
  s.description    = 'Inicia/actualiza/termina la Live Activity de marcador y expone los push tokens de ActivityKit a JS.'
  s.author         = 'Analistas'
  s.homepage       = 'https://analistasapp.com'
  s.license        = { :type => 'MIT' }
  # Min del APP (15.1) — el módulo hace gating runtime con #available(iOS 16.2).
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
