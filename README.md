# Sneaky Clean Field

Static React dashboard on GitHub Pages, with Google Identity Services sign-in and a Cloudflare Worker gateway. Existing Field records, quotes, appointments, photos and sales automation remain in their original services. This repository contains application code only.

## Development

Use Node 24. Run `npm ci`, `npm test`, then `npm run build`. `npm run dev` serves the UI on loopback. Google must authorize the exact browser origin; production API origins are explicitly configured in `gateway/wrangler.jsonc`.

## Authentication

The browser obtains a Google ID token using the dedicated web client. The gateway verifies Google's signature, issuer, audience, authorized party, expiry, verified email and the manager allowlist on every request. Tokens stay in browser memory; they are never placed in URLs, persistent storage or upstream service requests. Reloading the page or token expiry requires sign-in again. Switching between Field and Sales uses hash navigation to preserve the in-memory session. Sign out clears the token and unmounts private views.

The static login page and application JavaScript are public. Customer records and photographs require verified manager access at the gateway. Quote photos use authenticated fetch and short-lived browser blob URLs. Their URLs and Google credentials are not shared with GitHub Pages.

## API deployment

`npm run deploy:api` deploys only the new gateway. It does not deploy the native Field or Sales Assistant workers. The gateway calls those services over Cloudflare service bindings and uses their existing manager credential. It forwards only the listed dashboard routes and preserves existing business authorization.

Set these server values before use:

- `GOOGLE_CLIENT_ID`: dedicated Google web client ID (public configuration).
- `MANAGER_EMAILS`: comma-separated approved manager emails (Worker secret).
- `FIELD_MANAGER_KEY`: existing Field manager key (Worker secret).

Supply secrets through Wrangler's standard input or the Cloudflare secret API. Never add them to this repository or frontend build variables. Do not use the Gmail or Drive desktop OAuth clients for web sign-in.

## Publishing and recovery

Push to `main` to run authentication tests, type checking, the production build and GitHub Pages publication. Only `dist/` is uploaded to Pages. Configure the repository's Pages custom domain as `field.sneakycleantn.com`; the domain's DNS CNAME targets `drewmartintn.github.io`. After publishing, the workflow waits for GitHub's certificate and enables HTTPS automatically. It fails visibly if certificate issuance takes more than 65 minutes. The separate public website uses a different repository and remains unchanged.

The original Sites project and source are retained during cutover for recovery. To roll back a frontend release, revert the relevant GitHub commit and let the Pages workflow publish. The server-side manager allowlist can revoke dashboard access independently of the static deployment.

## October 20, 2026 migration

Google sign-in was verified on the GitHub Pages publication with live Field and Sales Assistant data. The existing production manager allowlist and manager credential were transferred to the gateway as Worker secrets. All 12 authentication/gateway tests passed, and GitHub Actions passed the production build and publication checks. The GoDaddy `field` CNAME was changed from `custom-domains.chatgpt.site` to `drewmartintn.github.io`, after assigning the custom domain to this repository. Legacy `/callback` links discard their expired query parameters and return to Field. The native app, booking website, Square integration and Sales Assistant worker were not redeployed.
