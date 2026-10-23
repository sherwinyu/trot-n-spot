# Google sign-in

Google sign-in uses Supabase Auth's OAuth flow with PKCE. On iOS and Android,
Expo opens the system authentication browser and returns to `quest://auth/callback`.
On web, the browser returns to `/auth/callback` on the same origin. Supabase owns
sessions and user IDs; existing email/password login remains available.

No new native dependency is needed: `expo-web-browser` and `expo-crypto` are already
installed. The native crypto adapter supplies secure random values and SHA-256 to
Supabase on Hermes. Sign-in refuses a plain PKCE challenge. Google credentials
live only in the Supabase provider configuration, never in app environment variables.

## Google Cloud setup

1. Select/create a TrotNSpot project in [Google Auth Platform](https://console.cloud.google.com/auth/overview).
2. Configure Branding (app name, support email, developer contact) and an External
   audience. During testing, add the intended Google accounts as test users if
   required by the console. Request only `openid`, `email`, and `profile`.
3. Create an OAuth client of type **Web application**. This client is for Supabase's
   hosted callback; separate native clients and Android signing fingerprints are
   not required for this browser-based flow.
4. Set the authorized redirect URI exactly to:

   ```text
   https://xbegbjicfgsozazlbysc.supabase.co/auth/v1/callback
   ```

   Do not enter `quest://auth/callback` in Google's redirect field. Google returns
   to Supabase first, and Supabase returns to the app. Authorized JavaScript origins
   are not used by this server-redirect flow (there is no Google One Tap JS widget).
5. Copy the client ID and client secret into the TrotNSpot Supabase project's
   **Authentication → Sign In / Providers → Google**, then enable the provider.
   Retain Google's default nonce checks; this flow does not need to disable them.

## Supabase redirects

In **Authentication → URL Configuration → Redirect URLs**, add:

```text
quest://auth/callback
```

If testing web, also allow each exact callback you actually use, for example:

```text
http://localhost:8081/auth/callback
http://localhost:8084/auth/callback
https://YOUR-DEPLOYED-WEB-ORIGIN/auth/callback
```

Leave unrelated existing redirects and the Site URL unchanged. Avoid wildcards in
production. The callback route handles a cold start and shares one code exchange
when both Expo Router and the browser return the same link. Provider rejection or
an expired/missing code produces a recoverable sign-in screen.

Local Supabase needs its own Google provider configuration and Google web client's
redirect `http://127.0.0.1:54321/auth/v1/callback`. An Android emulator cannot reach
the Mac at `127.0.0.1`; use a separate development Supabase project with HTTPS for
real cross-platform OAuth tests. Unit tests require no Google credentials. The local
config only adds callback allow-list entries; it does not enable Google's provider.

## Enable in a build

Only after Google is configured in the target backend, set:

```text
EXPO_PUBLIC_ENABLE_GOOGLE_LOGIN=true
EXPO_PUBLIC_ENABLE_EMAIL_LOGIN=true
```

For an OTA update to the existing preview apps, enable the Google flag in the
EAS `preview` environment and publish with `--environment preview`. Keep
`eas.json` unchanged: Expo includes that file in the native fingerprint, so even
an inline environment flag change creates a different runtime and prevents the
existing apps from receiving the update. The inline `false` value records the
original native build configuration; OTA bundles use the EAS environment value.

When creating the next native preview build, also set the flag to `true` in
`build.preview.env` in `eas.json`. This intentionally creates a new runtime. For a
store build, set it in the EAS `production` environment along with the Supabase URL,
public key, and email flag. These are build-time public flags; restart Metro for
local development and rebuild/re-export the release bundle after changing them.
Do not add the Google client secret or a Supabase service-role key to these envs.

The Google button is hidden unless explicitly enabled, including in development.
HTTPS (or localhost) is required on web for browser WebCrypto. On mobile, an Expo
development client or standalone app is required for the registered `quest` scheme.

## Verification before giving the build to a tester

1. Sign in with Google using an email that already has a confirmed Supabase account.
   Verify that the user ID, existing pack membership, and quest data are preserved.
   Supabase automatically links matching verified identities; a different Google
   account represents a different user and should use normal pack onboarding.
2. Close the app, reopen it, and verify the persisted session. Sign out, then verify
   email/password login and Google login both still work. Sign-out clears this app's
   Supabase session; it does not sign the user out of their Google browser account.
3. Cancel the system browser and retry. Deny consent and verify the callback gives
   a useful error and a way back to login. Reopen an expired callback and verify
   the same recovery path. Do not log authorization codes or session tokens.
4. Test a cold-start callback on iOS and Android. PKCE must complete on the same
   device/browser that started sign-in because that device stores the verifier.
5. Verify the correct account selection and existing-account linking with the actual
   intended tester before calling production login verified. Mocked exchanges and
   simulator screenshots alone do not establish Google Console correctness.

For App Store distribution, review Apple's login-service requirements and plan an
equivalent privacy-preserving option (usually Sign in with Apple). Google-only
private preview installation does not require App Store review.

## Sources

- [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase mobile redirects](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Apple login-services guideline](https://developer.apple.com/app-store/review/guidelines/#login-services)
