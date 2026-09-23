# Publish a preview app update

For JavaScript and asset changes, publish an Expo over-the-air (OTA) update to the
`preview` channel used by our internal iOS and Android apps:

```bash
source scripts/env.sh
node scripts/publish-preview.mjs --message "Fix camera permission on iOS"
```

Run from a clean, committed checkout containing the changes you intend to release,
normally updated `main`. The script publishes **the current checkout**, not code
downloaded from GitHub. Use a separate worktree when another session is working.
Install dependencies with `npm ci` first and authenticate with `eas login` if needed.
A separate access token is unnecessary for a logged-in local CLI.

The script:

1. Rejects uncommitted or untracked files and prints the commit being released.
2. Runs TypeScript checking and the app's Jest suite.
3. Computes each platform's fingerprint with the remote EAS `preview` environment.
4. Requires it to match the latest finished internal `preview` build for that platform.
5. Publishes fresh iOS and Android bundles using the same channel and environment.

To run the checks without publishing:

```bash
node scripts/publish-preview.mjs --check
```

The runtime check covers the latest device build per platform. Older installations
receive the update only if their runtime also matches. A mismatch requires restoring
compatible native configuration or building and distributing a new app; this script
does not create native builds or force an incompatible update onto a phone.

Keep `eas.json` unchanged for existing installations: it contributes to the native
fingerprint. In particular, Google login's OTA flag comes from the remote environment;
see [Google login](google-login.md). Local `.env` files are disabled for release commands.
The script deliberately has no `package.json` entry, to avoid changing fingerprint
inputs just to add a release helper.

After publishing, check EAS's output for both platforms and their runtime versions.
On a phone, open the app with internet access, wait briefly for the update download,
then fully close and reopen it. For the camera fix, tap **Take a Photo** and grant
camera access; if it was previously denied, enable it in the phone's app settings.
An uploaded update still needs this physical-device verification.

This publishes only the app bundle. Backend deployments, database migrations, and
App Store/Play Store submissions are separate operations.

Reference: [EAS Update](https://docs.expo.dev/eas-update/getting-started/).
