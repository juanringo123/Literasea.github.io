# Literasea Project Structure

Literasea is now organized around two static entry pages:

- `index.html` for the member-facing application.
- `admin.html` for admin and owner workflows.

## Assets

- `assets/css/index.css` contains member page styling.
- `assets/css/admin.css` contains admin page styling.
- `assets/images/logoPerpus2_bgremoved.png` is the shared logo asset.
- `assets/js/supabase.js` creates the shared Supabase client.

## Member JavaScript

- `assets/js/books.js` handles catalog loading, book normalization, realtime book refresh, and cover helpers.
- `assets/js/dashboard.js` handles categories, navigation, dashboard news, and suspension UI.
- `assets/js/auth.js` handles member login, register, logout, session restore, and app bootstrap.
- `assets/js/profile.js` handles the member card, local photo state, and profile photo sync.
- `assets/js/helpdesk.js` handles user helpdesk chat and book suggestions.
- `assets/js/borrow.js` handles member borrowing flows and fine-payment request helpers.
- `assets/js/return.js` handles member return status and fine panels.
- `assets/js/utils.js` contains shared browser helpers such as escaping, toast, password toggle, and theme controls.

## Admin JavaScript

Admin code is split with an `admin-` prefix to avoid name collisions with member-page functions:

- `assets/js/admin-auth.js`
- `assets/js/admin-dashboard.js`
- `assets/js/admin-books.js`
- `assets/js/admin-profile.js`
- `assets/js/admin-borrow.js`
- `assets/js/admin-return.js`
- `assets/js/admin-owner.js`
- `assets/js/admin-helpdesk.js`

## SQL

Database migration files are stored in `sql/`.

## Supabase Functions

Existing Supabase Edge Function source remains under `supabase/function/` because it is backend source code, not a SQL migration. The frontend currently calls `functions/v1/quick-api` for owner-created admin accounts, so verify the deployed function name before renaming local function folders.
