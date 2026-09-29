# Hillside Mobile Auto — Website

Single self-contained static landing page (`index.html`) for Hillside Mobile Auto,
a mobile oil-change, light-maintenance, and pre-purchase-inspection business in
Cache Valley, Utah.

Hosted on GitHub Pages, custom domain `hillsidemobileauto.com` (see `CNAME`).

## What's in the page
- On-brand design: navy `#1E2D3D`, amber `#E0A02E`, cream `#F7F3E8`, maroon `#A01B23`.
- Vehicle checker: VIN decode + Year/Make/Model, both via the free NHTSA vPIC API.
  Routes vehicles into two lanes — in-scope (green, text-to-book) or "let's confirm"
  (amber) for European, pre-2000, or diesel vehicles.
- Services & pricing, how-it-works, service area & hours, contact.
- No backend, no build step. Booking is text/email until Square Appointments is
  set up — paste a Square URL into `CONFIG.bookingUrl` in `index.html` to switch
  every "Book" button to online booking.

## Editing
This is one plain HTML file with inline CSS/JS — open it in any editor, edit,
commit, and push. GitHub Pages redeploys automatically within a minute or two.

## Deploy
GitHub Pages, serving from the repo root on the default branch. Custom domain
configured via the `CNAME` file plus DNS records at the domain's DNS provider.
