## Track: settings-polish — Settings screen clean-up
Last updated: 2026-10-21
### Done
- [x] Motivation / iCloud explanations moved under their labels and shortened; Passport label and its
  privacy copy removed; quiet hours removed everywhere (UI, prefs, scheduler clamp); daily
  motivation times use the native iOS time picker; version line in the footer; "Send feedback"
  row (mailto draft).
### Next
- Set `FEEDBACK_EMAIL` in `app/src/lib/feedback.ts` (placeholder `feedback@example.com`).
- Rebuild the dev client (new native dependency) and check the picker and Mail hand-off on device.
### Decisions / gotchas
- New dependencies: `@react-native-community/datetimepicker` (native; needs pod install + dev-client
  rebuild) and `expo-application` (app version). No config plugin needed on iOS.
- Old stored `quietHours*` keys in `notification_prefs` JSON are simply ignored now.
