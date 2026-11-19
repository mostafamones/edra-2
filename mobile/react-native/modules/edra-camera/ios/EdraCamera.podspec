Pod::Spec.new do |s|
  s.name           = 'EdraCamera'
  s.version        = '0.1.0'
  s.summary        = 'Edra rear-camera code scanner preview'
  s.author         = 'Edra'
  s.homepage       = 'https://github.com/edra'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '17.0' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'AVFoundation'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'
end
