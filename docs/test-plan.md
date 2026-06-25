# IntellBank — Test Plan

Covers every function changed in the authentication feature work **and** the
Minimalist Modern design-system rebrand.

## Preconditions / setup

- **Backend** running on `:8080` with Gmail SMTP configured
  (`MAIL_USERNAME=samchew323@gmail.com`, `MAIL_PASSWORD=<app password>` in the
  OS environment), started **after** those vars were set.
- **Frontend** running via `npm run dev` on `:5173`.
- A known test account, e.g. `test@example.com` / `Password1`.
- DB access (Supabase) to inspect `users` and `password_reset_tokens` and to
  force token expiry for one case.

Legend: **API** = REST call (Postman/curl), **UI** = browser, **DB** = database check.

---

## A. Backend — `AuthService`

| ID | Function | Steps | Expected |
|----|----------|-------|----------|
| A1 | `register` (min length) | API POST `/api/auth/register` with `password:"short"` | 400 — "Password must be at least 8 characters" |
| A2 | `register` (letter+number) | register with `password:"password"` (no digit) | 400 — "must contain at least one letter and one number" |
| A3 | `register` (forced STUDENT) | register with `role:"ADMIN"` + valid password | 200; **DB** `users.role = STUDENT`; a `students` row exists, no admin row |
| A4 | `register` (duplicate) | register an existing email | 409 — "That email is already registered" |
| A5 | `register` (happy) | register new email, `Password1` | 200; returns token + userId + role STUDENT |
| A6 | `login` (wrong password) | API POST `/api/auth/login` wrong password | 401 — "Invalid email or password" |
| A7 | `login` (unknown email) | login a non-existent email | 401 — **same** generic message (no enumeration) |
| A8 | `login` (happy) | correct credentials | 200 + token |
| A9 | `login` (deactivated) | set `users.is_active=false` in DB, then login | 403 — "Account is deactivated…" |
| A10 | `forgotPassword` (real) | API POST `/api/auth/forgot-password` `{email:test@example.com}` | 200 generic msg; **DB** new row in `password_reset_tokens`; console `Password reset email sent` |
| A11 | `forgotPassword` (unknown) | forgot-password with unregistered email | 200 **same** generic msg; **DB** no token row; no email |
| A12 | `forgotPassword` (supersede) | call twice for same email | older token row deleted; only newest valid |
| A13 | `resetPassword` (happy) | use emailed link token → API POST `/api/auth/reset-password` `{token, password:"NewPass1"}` | 200 "password has been reset"; login works with new password (A8) |
| A14 | `resetPassword` (reuse) | reuse the same token | 400 — "already been used" |
| A15 | `resetPassword` (expired) | **DB** set a token's `expires_at` to the past, then use it | 400 — "expired" |
| A16 | `resetPassword` (bad token) | API POST with `token:"garbage"` | 400 — "invalid or has already been used" |
| A17 | `resetPassword` (policy) | valid token, `password:"short"` | 400 policy error; token **not** consumed (still usable) |

## B. Backend — `EmailService.sendPasswordResetEmail`

| ID | Steps | Expected |
|----|-------|----------|
| B1 | Mail configured, trigger A10 | Real email arrives at the recipient (check **spam**); console `Password reset email sent to …` |
| B2 | Blank `MAIL_USERNAME`, restart backend, trigger A10 | No email sent; console logs the reset **link** + `MAIL_USERNAME not configured` |
| B3 | Wrong app password, trigger A10 | Request still returns 200; console logs `Failed to send password reset email…` (never a 500) |

## C. Frontend — `api.js` (storage, interceptors, calls)

| ID | Function | Steps | Expected |
|----|----------|-------|----------|
| C1 | `tokenStorage` (remember ON) | UI login with "Remember me" checked | token in **localStorage**; persists after closing/reopening browser |
| C2 | `tokenStorage` (remember OFF) | UI login with it unchecked | token in **sessionStorage**; gone after closing the browser |
| C3 | request interceptor | any authed call after login | request carries `Authorization: Bearer …` header |
| C4 | response interceptor (401) | corrupt/replace the stored token, then trigger an authed API call | redirected to `/login?expired=1`, storage cleared |
| C5 | interceptor excludes auth | wrong login (401 on `/api/auth/login`) | stays on login page, shows error — **no** redirect loop |
| C6 | `getLocalUser` (corrupt) | set `intellbank_user="{bad"` in storage, reload | no crash; treated as logged-out; storage cleared |
| C7 | `logout` | click Logout | both storages cleared; redirected to `/login` |

## D. Frontend — `authStore`

| ID | Function | Steps | Expected |
|----|----------|-------|----------|
| D1 | `login` | valid creds | `isAuthenticated=true`, `user` populated, navigates onward |
| D2 | `resolveError` (server) | bad creds | error shows server message "Invalid email or password" |
| D3 | `resolveError` (network) | stop backend, attempt login | error = "Can't reach the server. Check your connection and try again." |
| D4 | `register` | submit valid form | resolves; navigates to `/login` |
| D5 | `forgotPassword` | submit email | resolves; returns the generic message string |
| D6 | `resetPassword` | submit token + password | resolves; success state set |

## E. Frontend — pages & routing

| ID | Area | Steps | Expected |
|----|------|-------|----------|
| E1 | Login show/hide | click the eye icon | password toggles between dots and text |
| E2 | Login forgot link | click "Forgot password?" | navigates to `/forgot-password` |
| E3 | Redirect-after-login | logged out, visit `/analytics` → bounced to login → sign in | lands back on `/analytics` (not `/dashboard`) |
| E4 | Session-expired notice | visit `/login?expired=1` | blue "Your session expired" info alert |
| E5 | ProtectedRoute | logged out, visit `/dashboard` | redirected to `/login` |
| E6 | Register requirements | type `abc`, then `abcd1234` | checklist items tick green; strength meter fills/labels |
| E7 | Register mismatch | mismatched confirm password | "Passwords do not match" |
| E8 | Register no role | open page | **no** role dropdown present (public signup = STUDENT) |
| E9 | Reset no token | visit `/reset-password` (no `?token`) | "invalid or incomplete" + "Request New Link" |
| E10 | Reset success | complete a valid reset | success panel → "Go to Sign In" |
| E11 | Forgot success panel | submit a valid email | "Check your email" success panel with spam-folder hint |

## F. Design system — visual checklist

| ID | Check |
|----|-------|
| F1 | Auth pages: split layout, animated hero (floating cards + rotating ring), gradient headline word, mono section label |
| F2 | Primary buttons: blue gradient, lift + arrow-slide on hover, scale on click |
| F3 | Headlines render in **Calistoga**; body/UI in Inter; section labels in JetBrains Mono |
| F4 | Main sidebar: gradient logo tile; active nav item is blue-tinted |
| F5 | Dashboard: KPI stat icons are gradient tiles; cards lift on hover; eyebrow label visible |
| F6 | OS "reduce motion" enabled → continuous animations stop |
| F7 | Window < 900px: auth brand panel hides, form centers, mobile brand appears |

## G. Workspace (Project editor) — rebrand consistency

| ID | Check |
|----|-------|
| G1 | Project Explorer panel is **light** (white/paper), not the old dark navy |
| G2 | "Generate AI Paper" is a blue gradient button; "Practice Past Year Paper" and "Create Blank Doc" are unified dashed **accent** ghost buttons (no teal/purple) |
| G3 | Active document in the explorer list shows blue-tinted background + accent text; its delete icon is visible (accent), not invisible white |
| G4 | Editor toolbar accents (More, Export PDF, page-number pill, header/footer edit outline) use electric blue `#0052FF`, not Google blue |
| G5 | Editor canvas backdrop is light slate (`--inset`), document sheets are white with the new shadow |
| G6 | Generate-Paper modal: topic chips, checked topics, and the format box use accent/slate tokens (no dark-on-dark or low-contrast text) |
| G7 | Page Setup side panel + status bar use light token surfaces and borders |

---

## Notes

- **A15 (expired)** requires a manual DB edit to force `expires_at` into the past.
- **B-series** depends on real SMTP; if testing without it, set `MAIL_USERNAME`
  blank and use the console-logged link (B2) to still exercise A13–A17.
- **C/D/E/F/G** are browser checks — run with `npm run dev`.
- Code for all areas was verified to compile via `vite build`; this plan covers
  the runtime/visual behavior that a build can't confirm.
