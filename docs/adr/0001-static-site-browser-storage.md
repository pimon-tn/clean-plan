# Static site, data in the browser, no backend

The app is plain HTML + ES-module JavaScript (AdminLTE v4 and FullCalendar loaded from jsDelivr, pinned versions) served by GitHub Pages straight from `main`, with all data in the organiser's browser `localStorage` and JSON export/import as the backup. One person builds the roster on one device and others read it from a print/PDF, so a backend, login and build step would be cost with no user. We first chose the DropX Admin theme but rejected it because it is a Next.js app that needs a build.

## Consequences

- Data lives on one browser only; clearing site data loses it unless exported. Exported JSON holds member names and must never be committed, because the repo is public.
- Letting members view the roster themselves would need a backend; that is a new decision, not a tweak.
