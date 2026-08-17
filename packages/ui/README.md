# packages/ui

Gemeinsame UI-Komponenten der Verevia-Plattform.

## Zweck

Dieses Paket enthält perspektivisch wiederverwendbare React-Komponenten, die von den Anwendungen in `apps/` gemeinsam genutzt werden (z. B. Buttons, Formulare, Layout-Bausteine), abgestimmt auf die [Markenidentität](../../docs/branding/Brand-Identity.md).

## Status

Technisches Skeleton vorhanden (Phase 1). Noch keine Komponentenbibliothek installiert und keine fachlichen Komponenten. Die shadcn/ui-Grundlage (Tailwind-Konfiguration, `cn()`-Helper, `components.json`) liegt in `apps/web`, da shadcn Komponenten-Quellcode direkt in die konsumierende App generiert statt ein vorgefertigtes npm-Paket bereitzustellen.
