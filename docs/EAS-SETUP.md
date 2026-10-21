# EAS builds (no cable)

`app/eas.json` has two profiles. Run everything from `app/`. `eas-cli` is not a project dependency;
use `npx eas-cli …` (or install it globally).

## Dev client on a phone you can't plug in

```sh
npx eas-cli login
npx eas-cli device:create        # open the URL/QR on the iPhone, install the profile (registers its UDID)
npx eas-cli build --platform ios --profile development
```

When the build finishes, open the link EAS prints on the phone to install. Turn on Developer Mode
(Settings > Privacy & Security) if iOS asks, then `./scripts/dev.sh --tunnel` and open the app.
Ad hoc builds only install on registered devices: register any new device *before* building.

Native changes (plugins, permissions, `app.json`) need a new build; JS changes reload over Metro.

## TestFlight

```sh
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

Needs the app to exist in App Store Connect first (bundle ID `com.mattwayles.wanderlift`). This is a
Release build: no Metro, no dev client.
