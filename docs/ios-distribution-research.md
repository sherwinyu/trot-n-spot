# iOS development and private distribution

## Private release and OTA updates, 2026-09-20

- Apple Developer membership is active for team `D78RH24K5G`, renewing September 17, 2027. EAS is authenticated as `sherwinyu`.
- EAS CLI was upgraded to 24.7.0. Versions before 24.4.1 fail Apple authentication with `iTunes service key is empty`; the CLI minimum now excludes those versions.
- Registered `xyz.sherwinyu.trotnspot`, enabled its Push Notifications capability, and created the Apple distribution certificate. Push delivery has not been verified.
- Nadia completed phone registration on September 21. EAS created an active ad hoc provisioning profile including her device and assigned an Apple push key. Signing credentials are ready; push delivery remains unverified.
- Build from this release branch with `eas build --platform ios --profile preview`. Share the completed build's install URL. This is a standalone app using hosted Supabase with email/password login; Google remains disabled.
- The first cloud build (`c6bd5fa7-c3bf-415b-b1c3-ec3d91530848`) failed during dependency installation: the receipts workspace's Sharp dependency attempted a source build and required `node-addon-api`. The preview build sets `SHARP_IGNORE_GLOBAL_LIBVIPS=1` to use Sharp's prebuilt binaries. Locally, forcing global libvips reproduced the exact error; setting this flag made the installer pass, and the prebuilt library successfully generated a PNG. See [Sharp installation](https://sharp.pixelplumbing.com/install/).

### Publish subsequent JavaScript and asset updates

The app uses EAS Update with separate `development`, `preview`, and `production` channels. Nadia's private build uses `preview`. `runtimeVersion.policy: fingerprint` restricts updates to compatible native builds; native dependency/configuration changes can require another install.

The EAS project `preview` environment contains the hosted Supabase URL/public anon key and email/Google flags matching the build profile. Keep these public app values synchronized: **EAS Update does not inherit `build.preview.env` from eas.json**. The Sharp installation flag is build-only. SDK 55 requires the update command's `--environment` argument. Never publish a local-backend configuration to this channel.

After validating a JavaScript or asset change, publish explicitly:

```bash
source scripts/env.sh
eas update --platform ios --channel preview --environment preview --message "Describe the verified change"
```

Updates download in the background on launch and apply on a subsequent launch. To verify on the phone, fully close and reopen the app up to twice. The first physical-device build and an actual on-device OTA update remain unverified until the app is built and installed. The store `production` environment must be configured separately before using it.

Sources: [EAS Update setup](https://docs.expo.dev/eas-update/getting-started/), [runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/), [Apple security delay](https://support.apple.com/en-us/120340), [EAS Apple login fix](https://github.com/expo/eas-cli/issues/4392).

Researched 2026-09-14 against Apple and Expo documentation. Initial repository audit used commit `f6c2f80`. Local setup results below were verified on the same date; physical-device installation remains pending.

## Local setup progress, 2026-09-14

Completed after the initial audit:

- Installed the lockfile dependencies with `npm ci`.
- Installed `xcodes 2.1.0`, CocoaPods `1.17.0`, and EAS CLI `24.4.0`. The existing Node `22.20.0` satisfies Expo's minimum.
- Started Docker Desktop and removed unused Docker build-cache entries older than seven days; Docker reported 9.41 GB reclaimed.
- `npx tsc --noEmit` passed; all 6 Jest suites / 32 tests passed.
- `npx expo export --platform ios` successfully generated the iOS JavaScript bundle (1,606 modules). This is not native compilation or simulator verification.
- Generated the ignored `ios/` native project with `npx expo prebuild --platform ios --no-install`.
- Xcode **26.2 (17C52)** is selected at `/Applications/Xcode-26.2.0.app/Contents/Developer`; its first-launch check passes. The Apple Silicon iOS 26.2 runtime (23C52) is installed and ready. CocoaPods installed 125 pods, and the Debug arm64 simulator native build passed with local simulator signing enabled. The app is installed on the dedicated iPhone 17 simulator.
- Started iOS Metro with file watching at `http://localhost:8082`. Its development bundle returned HTTP 200 and contains the local Supabase URL. Start Metro with `NODE_OPTIONS=--dns-result-order=ipv4first`: otherwise Node binds IPv6 (`::1`) while Expo advertises an IPv4 bundle URL, causing a connection error on the simulator. The verified listener is `127.0.0.1:8082`.
- Started local Supabase with `npx supabase start --exclude logflare,vector`. The optional logging containers failed their health checks; the remaining stack is healthy. The CLI help's `analytics` exclusion name is rejected by its underlying startup command, which requires `logflare`.
- Created ignored `.env.ios.local` with the local API URL and anon key. Auth health, seeded email/password login, and authenticated pack retrieval each returned HTTP 200; the seeded user sees one shared pack.
- Installed and launched the signed native app, signed in through its UI as the seeded local account, and verified all four seeded quest cards appeared. SecureStore errors stopped after simulator signing was enabled. Push permission was declined for this simulator smoke test; camera, offline replay, and physical-device push remain untested.
- `npx expo install --check` reports newer compatible SDK 55 patch releases. Package upgrades were not applied as part of machine setup.

The installer initially returned `403 Unauthorized`. The user resolved authentication and completed installation. A dedicated `TrotNSpot iPhone 17` simulator is booted, with UDID `CA50A4B9-C725-4855-8AE4-CD2C107C5573`.

Disk space was tight during concurrent iOS/Android setup (approximately 6 GB free after native compilation). On September 15, the user confirmed removal of the superseded Xcode 16.2 application. The unused Logflare and Vector images downloaded during backend setup were also removed.

September 17 distribution update: Expo login was verified as `sherwinyu`. The user paid for Apple Developer Program membership; activation is still pending. The hosted Auth health and settings endpoints returned HTTP 200, and the intended recipient has a confirmed email/password account and active pack membership. Her password sign-in and the physical-device install remain unverified.

If authentication fails again, sign in at [Apple Developer](https://developer.apple.com/account/) and accept any pending agreement, then refresh the installer session:

```bash
xcodes signout
xcodes install 26.2 --select
```

The install command requires interactive Apple authentication and administrator access. The agent's `sudo -n true` check returned `a password is required`. A paid membership is not required for this download. If the CLI still returns 403, download the Xcode 26.2 `.xip` from [Apple Downloads](https://developer.apple.com/download/all/?q=Xcode%2026.2), then run `xcodes install 26.2 --path /absolute/path/to/Xcode_26.2.xip --select`. [Apple download access](https://developer.apple.com/xcode/resources/).

For a future fresh installation, finish Xcode's first-launch setup and install its iOS runtime:

```bash
sudo xcodebuild -runFirstLaunch
xcodebuild -downloadPlatform iOS
xcrun simctl list devices available
```

Then build with the iOS-specific local environment and a separate Metro port, since another agent is preparing Android in this checkout:

```bash
source scripts/env.sh
set -a
source .env.ios.local
set +a
NODE_OPTIONS=--dns-result-order=ipv4first npx expo run:ios --port 8082
```

The first native build used a four-job limit to share resources with Android setup:

```bash
# After loading .env.ios.local as above:
RCT_NO_LAUNCH_PACKAGER=1 RCT_METRO_PORT=8082 xcodebuild \
  -workspace ios/TrotNSpot.xcworkspace -scheme TrotNSpot \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build-output/ios -jobs 4 \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO \
  CODE_SIGN_IDENTITY=- build
```

Keep local simulator signing enabled. The initial unsigned build launched, but SecureStore failed with `A required entitlement isn't present`; simulator signing supplies the keychain application entitlement without a paid Apple account.

For subsequent JavaScript iteration, load the same environment and run `NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --localhost --port 8082`. The iOS simulator uses `127.0.0.1` to reach local Supabase on the Mac; Android's emulator uses `10.0.2.2`. `.env.ios.local` is deliberately not one of Expo's auto-loaded shared env files. A simulator camera fallback remains separate app work. The initial audit below is retained as the pre-setup snapshot.

## Local artifacts

- Native app: `build-output/ios/Build/Products/Debug-iphonesimulator/TrotNSpot.app` (ignored).
- Native build log: `/tmp/trot-n-spot-ios-setup/native-build.log`.
- Metro log: `/tmp/trot-n-spot-ios-setup/metro-ios.log`.
- Simulator screenshot: `/tmp/trot-n-spot-ios-setup/ios-app.png`.

## Initial audit snapshot (before setup)

The observations in this section describe the pre-setup state; completed work is recorded above.

Already configured:

- [app.json](../app.json) declares iOS bundle identifier `xyz.sherwinyu.trotnspot`, camera/location/photo permissions, and the existing Expo project.
- [eas.json](../eas.json) has a simulator `development` profile, a standalone internal `preview` profile, and a store `production` profile. The preview profile includes hosted Supabase configuration and enables email login.

Local simulator setup:

1. Install Xcode **26.2 or a compatible newer version**. The installed Xcode reports **16.2**. This Mac runs **macOS 15.6**, which supports Xcode 26.2; use Apple's versioned download if the current App Store Xcode requires a newer OS. [Apple compatibility table](https://developer.apple.com/xcode/system-requirements).
2. Complete Xcode first-launch setup, select its command-line tools, and install an iOS Simulator runtime. `xcode-select -p` currently returns `/Library/Developer/CommandLineTools`; plain `xcrun simctl` fails with `unable to find utility "simctl"`. Runtime readiness remains unverified. Available disk space was approximately 27 GiB, so check space before the downloads.
3. Run `source scripts/env.sh` and `npm ci`. This checkout has no `node_modules`. Node is currently 22.20.0, while `.nvmrc` requests 20; if using Node 20, use at least 20.19.x per Expo's requirement.
4. Create local `.env` configuration from `.env.example`, pointing development at local Supabase with its actual anon key. No `.env` exists here. [config/supabase.ts](../config/supabase.ts) otherwise supplies empty strings. Prepare the local backend before login testing; production data is not a test fixture.
5. Build/install with `npx expo run:ios`, then use `npx expo start --dev-client` for subsequent debugging. The existing `npm run ios` starts Metro and opens iOS; it does not compile the first development client.
6. Add a simulator-only photo-library/fixture path in [lib/photos.ts](../lib/photos.ts). It currently calls `launchCameraAsync` on every native platform. This is needed to test photo-dependent quest flows, not to launch the app itself.

Physical phone setup:

1. Enroll in Apple's paid program and log in to Expo. `npx --yes eas-cli@latest whoami` returned `Not logged in`; existing remote builds, signing credentials, and environment variables could not be verified. A global `eas` command is also absent, so the examples below can be run with `npx eas-cli@latest` in place of `eas`.
2. Register Nadia's device and build the existing `preview` profile, following the steps below. **EAS cloud builds can proceed before local Xcode is upgraded.** The Xcode requirement applies to local native compilation; cloud compilation and locally running a compatible simulator are separate requirements.
3. Confirm her actual email account can authenticate against the hosted backend. [lib/auth.ts](../lib/auth.ts) implements email/password; Google sign-in remains a stub. Do not enable the Google button until implemented.
4. Before TestFlight, verify the EAS `production` environment supplies `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_ENABLE_EMAIL_LOGIN=true`. Production does not inherit preview's inline variables. The login screen hides email auth in release builds without that flag. These remote settings are **unverified**, not known to be missing.
5. Verify login, pack join, quest creation/completion, photo upload, location permissions, and offline replay on a physical iPhone. Configure/verify Apple push credentials through EAS and test delivery plus notification taps; current push registration failures return `null`, so a working app does not prove push works. [Local push code](../lib/notifications.ts), [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).

The existing Android Maestro scripts use Android-specific deep links and do not establish iOS coverage. The initial audit changed documentation only. The subsequent setup completed native compilation; hosted backend health and physical-phone behavior remain unverified.

## Recommended route

Use the iOS Simulator for everyday development. For the first standalone install on Nadia's iPhone, use an EAS **preview / internal distribution** build with ad hoc signing. Move to **TestFlight** when its familiar installation and update experience is worth the additional App Store Connect setup and beta review. These recommendations assume a small private test group.

| Route | Apple account | Installation and maintenance |
| --- | --- | --- |
| iOS Simulator | No paid membership required | Native simulator build on the Mac; developer build connects to Metro. |
| Local personal-device testing | Free Apple Account in Xcode | Personal Team provisioning expires after seven days; rebuild and reinstall. Suitable for short development tests. |
| EAS preview / ad hoc | Paid Apple Developer Program | Register the phone before signing, install from the build URL, enable Developer Mode. Renew signing before the provisioning profile expires. |
| TestFlight | Paid membership for the developer | Nadia installs TestFlight and accepts an invitation. Each build expires 90 days after upload. External testing requires beta review. |

Sources: [Expo simulator builds](https://docs.expo.dev/build-reference/simulators/), [Apple Personal Team limits](https://developer.apple.com/help/account/basics/about-your-developer-account), [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/), [Apple TestFlight](https://developer.apple.com/testflight/), [TestFlight build lifetime](https://testflight.apple.com/).

## Account and costs

The paid account is the **Apple Developer Program**, not an SDK subscription. Individual enrollment is appropriate for a personal project. Membership costs **US$99 per year**, with local prices varying by region. Apple requires an Apple Account with two-factor authentication and identity verification during enrollment. Nadia does not need her own paid developer membership to receive an invited TestFlight build. [Apple enrollment](https://developer.apple.com/programs/enroll/), [Apple TestFlight](https://developer.apple.com/testflight/).

Free Personal Team signing supports personal-device testing, but its seven-day provisioning lifecycle makes it inconvenient for a spouse's ongoing use. It also has capability and registration limits. [Apple developer account overview](https://developer.apple.com/help/account/basics/about-your-developer-account).

## Simulator development

For Expo SDK 55, Expo currently lists **Xcode 26.2+**, **iOS 15.1+**, and **Node 20.19.x minimum**. Xcode 26.2 itself requires macOS Sequoia 15.6 or later. These are SDK compatibility requirements, not a reason to upgrade this app's Expo SDK. [Expo SDK 55 reference](https://docs.expo.dev/versions/v55.0.0/), [Apple Xcode 26.2 release notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-26_2-release-notes).

Install/select the full Xcode application and an iOS Simulator runtime. With project dependencies and backend configuration ready, the native local workflow is:

```bash
source scripts/env.sh
set -a
source .env.ios.local
set +a
NODE_OPTIONS=--dns-result-order=ipv4first npx expo run:ios --port 8082
# Subsequent JavaScript/TypeScript iteration:
NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --localhost --port 8082
```

`run:ios` generates the native iOS project if absent, builds and installs the app, and starts Metro. Native dependency or configuration changes require another native build; ordinary JavaScript edits do not. [Expo local development](https://docs.expo.dev/guides/local-app-development/).

An EAS profile with `ios.simulator: true` can instead build a simulator binary in the cloud, installed using `eas build:run -p ios`. A simulator binary cannot substitute for the signed device build installed on an iPhone. Keep separate simulator and phone profiles. [Expo simulator builds](https://docs.expo.dev/build-reference/simulators/), [Expo build profiles](https://docs.expo.dev/build/eas-json/).

The Xcode minimum above applies to **native compilation**. EAS can perform that compilation on its cloud Macs; the local simulator still needs a compatible installed runtime. A cloud-built physical-device preview can proceed independently of fixing the Mac's Xcode installation. [Expo local/cloud build overview](https://docs.expo.dev/guides/local-app-overview/), [Expo TestFlight cloud workflow](https://docs.expo.dev/submit/testflight/).

The SDK 55 simulator path cannot validate real camera capture. Expo documents camera hardware as unavailable; use a photo-library/fixture fallback to exercise the rest of the quest flow and verify capture on a physical iPhone. Expo's ImagePicker changelog places a later simulator invocation change in **56.0.16**, so do not assume that behavior exists in SDK 55. [Expo simulator limitations](https://docs.expo.dev/workflow/ios-simulator/), [ImagePicker changelog](https://github.com/expo/expo/blob/main/packages/expo-image-picker/CHANGELOG.md).

## First private install: EAS preview

1. Enroll in the Apple Developer Program and sign in to the existing Expo project.
2. Run `eas device:create`; open the registration URL on Nadia's phone to collect its device identifier (UDID).
3. Build with `eas build --platform ios --profile preview`. The profile must target a physical device, use `distribution: internal`, and omit/disable `developmentClient`.
4. Open the completed build's installation URL on that registered phone.
5. On iOS 16+, enable Developer Mode under Settings > Privacy & Security, restart, and confirm it.

Ad hoc distribution requires a paid account and includes an allow-list of devices in the signed provisioning profile; adding a phone later requires a new build or `eas build:resign`. There is no App Store review step. [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/), [Expo installation walkthrough](https://docs.expo.dev/tutorial/eas/internal-distribution-builds/), [Expo Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/).

Preview builds provide the standalone app experience without developer tools. The app's backend still needs to be reachable from the phone; a working native build alone does not prove login, storage, or push setup. [Expo build profiles](https://docs.expo.dev/build/eas-json/).

Plan signing renewal: provisioning profiles generally expire after 12 months; an earlier certificate expiry/revocation can require regeneration. Inspect the actual profile expiry instead of promising exactly one year of install lifetime. [Expo credentials](https://docs.expo.dev/app-signing/app-credentials/), [Apple provisioning profile internals](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles).

## TestFlight for ongoing private beta use

Create an App Store Connect app record matching the bundle identifier, then build a store-signed production binary and submit it:

```bash
eas build --platform ios --profile production
eas submit --platform ios
```

TestFlight requires a store build, not the ad hoc preview artifact. Uploading a build does **not** publish the app publicly; App Store release is a separate submission. [Expo TestFlight setup](https://docs.expo.dev/submit/testflight/).

Invite Nadia as an **external tester** by email. Provide beta test information and, if login is required, review credentials; the first external build must clear Apple's Beta App Review. Later builds may also be reviewed. An internal tester must be an eligible App Store Connect user; that is a different concept from EAS internal distribution. [Apple external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers), [Apple TestFlight](https://developer.apple.com/testflight/).

TestFlight avoids collecting her UDID and offers automatic build updates. Every uploaded build expires after 90 days, so ongoing beta use requires fresh uploads. A public App Store listing is unnecessary for this workflow. [Apple TestFlight tester guide](https://testflight.apple.com/), [Expo TestFlight setup](https://docs.expo.dev/submit/testflight/).
