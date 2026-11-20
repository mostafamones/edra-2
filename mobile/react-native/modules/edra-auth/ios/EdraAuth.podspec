Pod::Spec.new do |s|
  s.name           = 'EdraAuth'
  s.version        = '1.0.0'
  s.summary        = 'Edra iOS auth bridge to the Supabase Swift session'
  s.description    = 'Exposes the existing SupabaseAuthService and selectedAcademyID preference to React Native.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  # Same package and exact version as the SwiftUI app's Package.resolved, so the Keychain session format matches.
  spm_dependency(s,
    url: 'https://github.com/supabase/supabase-swift',
    requirement: { kind: 'exactVersion', version: '2.55.3' },
    products: ['Supabase']
  )

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    # AppConfiguration allows development HTTP hosts only under DEBUG, as in the SwiftUI app.
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS[config=Debug]' => '$(inherited) DEBUG',
  }
  # Shared/ is the single source of AuthService and AppConfiguration; the SwiftUI comparison app compiles the same files.
  s.source_files = '**/*.swift'
end
