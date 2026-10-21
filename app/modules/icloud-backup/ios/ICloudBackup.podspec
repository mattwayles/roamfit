Pod::Spec.new do |s|
  s.name           = 'ICloudBackup'
  s.version        = '1.0.0'
  s.summary        = 'Hidden iCloud container backup of the Wanderlift database'
  s.description    = 'Copies a SQLite snapshot into the app\'s iCloud container and back. No record sync.'
  s.license        = 'MIT'
  s.author         = 'Wanderlift'
  s.homepage       = 'https://github.com/mattwayles/wanderlift'
  s.platforms      = {
    :ios => '16.4',
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
