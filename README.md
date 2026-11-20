# Gramasetu - Walk-Up Passenger Guide

React walk-up passenger guide backed by a Node.js HTTP API. Transit data lives in `server/guide-data.js`.

## Requirements
- Node.js 18 or later (Node.js 20 LTS recommended)
- npm

## Run locally
```bash
npm install
npm run dev
```
Open the local URL printed by Vite (usually http://localhost:5173).

## Production build
```bash
npm run build
npm run preview
```
Deploy the generated `dist/` folder to a static host.

## VS Code Go Live

Open the project folder in VS Code and run `npm run build`. To use checkout or the admin dashboard, leave the Node server running, then click **Go Live**. The workspace serves `dist/` on port 5500 and forwards API requests to the Node server at `http://127.0.0.1:5173`. If Live Server was already running, stop and restart it to apply the workspace settings. Rebuild after editing the source, or use `npm run dev` for automatic source updates.

## Included

- Stop-to-stop search across the routes in the guide, with route stop lists and example fares.
- A Bus Timings page with example departures. Confirm current service with the operator before traveling.
- Bus tracking and service previews with simulated locations and occupancy. Browser location is optional.
- English and Telugu interface and page guides. Telugu read-aloud uses bundled audio.

## Google Maps tracking

To use Google Maps on **Track Bus**, enable the Maps JavaScript API in your Google Cloud project and add a website-restricted browser key to `.env.local`. Allow your actual local and deployed origins in the key's website restrictions.

```dotenv
VITE_GOOGLE_MAPS_API_KEY=
VITE_GOOGLE_MAPS_MAP_ID=
```

Set a JavaScript map ID for production. The tracker uses Google's demo map ID if the map ID is omitted. Restart Vite or run `npm run build` again for the built preview. The tracker uses the existing map when the key is missing or Google Maps fails to load. The map displays simulated bus positions and the passenger's device location when permission is granted.

See [Maps JavaScript API key setup](https://developers.google.com/maps/documentation/javascript/get-api-key) and [map ID setup](https://developers.google.com/maps/documentation/javascript/advanced-markers/start).

## Passenger fare checkout

Open **Quick Ticket** on the home page or **Pay Fare** in the navigation. Checkout works through `npm run dev`, `npm run preview`, or `npm start`. Go Live can use checkout while the Node server is running.

### Razorpay Test Mode

Generate **Test Mode** keys in the Razorpay dashboard and set these variables in the Node process environment:

```dotenv
PAYMENT_MODE=razorpay-test
RAZORPAY_TEST_KEY_ID=
RAZORPAY_TEST_KEY_SECRET=
```

Use a key ID that begins with `rzp_test_`. Keep the secret server-side. For local use, you can add the variables to the ignored `.env.local` and run `node --env-file=.env.local server/index.js` on Node 20.6+ after building. Restart any existing server to apply the variables. Without Razorpay keys or an explicit payment mode, the existing local simulator is available.

**Continue to payment** opens Razorpay Checkout automatically and displays the test methods available for the account and device. When UPI is available, use `success@razorpay` or `failure@razorpay`. When Razorpay offers Netbanking, its mock bank page can also simulate success or failure. The backend checks the Checkout callback signature and looks up captured payments for the exact Razorpay order and fare. An authorized payment stays pending until capture. Enable automatic capture in Razorpay Test Mode. On a second device, scan **Demo Payment QR** with a camera to open the same test order. The page's address must be reachable from that device, so use a shared HTTPS preview address for cross-device tests. The checkout QR is separate from the signed demo boarding QR.

See [Razorpay Web Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).

### Razorpay production checkout

The sandbox and real-payment modes use separate keys and stores. For a production deployment, use Node.js 24 and run the built site and its API together behind an HTTPS reverse proxy. Set the following variables server-side and start `node server/index.js`:

| Variable | Value |
| --- | --- |
| `PAYMENT_MODE` | `razorpay-live` |
| `RAZORPAY_LIVE_KEY_ID`, `RAZORPAY_LIVE_KEY_SECRET` | Live keys for the activated operator account |
| `RAZORPAY_LIVE_WEBHOOK_SECRET` | Separate random secret of at least 32 characters, also configured in Razorpay |
| `PAYMENT_ROUTE_FARES` | Operator-approved flat fares by route ID, in integer paise |
| `PAYMENT_DATABASE_PATH` | Absolute SQLite path on a private, persistent volume with an existing parent directory |
| `PAYMENT_TICKET_VALIDITY_MINUTES` | Operator-approved period from payment confirmation, between 1 and 10,080 minutes |
| `BOARDING_API_TOKEN` | Random staff-only API credential of at least 32 characters |

Enable automatic capture and register `POST /api/checkout/razorpay/webhook` for `payment.captured`, `payment.failed`, and `refund.processed` in Live Mode. The browser also checks the order directly through the backend after Checkout returns. Verified capture issues one ticket, and a processed refund revokes the ticket. The app does not initiate refunds. Do not use a static host or Live Server as your production payment server.

Integrate the staff scanner with `POST /api/checkout/redeem`. Send the full scanned QR text as `ticket`, the bus's `routeId`, and the staff credential as an `Authorization: Bearer …` header. Success returns the reference, route, and passenger count. Expired, refunded, already used, or wrong-route codes return HTTP 409. Scan once for the full party. Keep the staff credential on a trusted staff device or server. The production form omits Aadhaar and the order store contains only fare, provider, and boarding records. The current passenger checkout is restored from the same browser tab, and passengers can print or save the ticket. Account-based ticket recovery and a staff scanner interface require separate integrations.

Before launch, confirm the account and website are approved, verify the enabled payment methods, provision HTTPS, set proxy rate limits and alerting for checkout and failed webhook deliveries, and configure database backups using SQLite-compatible tooling. Use one application instance with a persistent SQLite database. Complete staging tests for capture, retry, refund, and boarding using the actual scanner before enabling real sales. See the [Razorpay security checklist](https://razorpay.com/security/checklist/) and [webhook validation guide](https://razorpay.com/docs/webhooks/validate-test/).

### Admin monitoring

Open **Admin** and sign in with a staff username and password. The dashboard refreshes every 30 seconds while visible. **Sign out** revokes the browser session. Sessions expire after eight hours or when the server restarts.

| Role | Read access |
| --- | --- |
| `admin` | Orders, payments, gross captures, refunds, boarding, and fleet |
| `finance` | Orders, payments, gross captures, and refunds |
| `operations` | Boarding status, route and passenger counts for those tickets, and fleet |

Configure `ADMIN_USERS` as a JSON array of records with `username`, `role`, and `passwordHash`. Store the roster in the Node environment and use unique usernames. Encode password hashes as `scrypt:<16-byte salt as hex>:<64-byte digest as hex>` using Node's default scrypt parameters and a different random salt for each staff member. Keep passwords in your credential manager. Restart the server after adding, rotating, or revoking access. An empty roster disables sign-in. Live Mode and production deployments require passwords of at least 12 characters and use secure cookies over HTTPS. Dashboard credentials grant read access only. The scanner uses its own boarding credential.

Live Mode shows all-time payment and boarding totals from SQLite and the 50 most recently updated orders. Subscribe to `payment.failed` alongside capture and refund webhooks to track declines independently of the passenger's browser. Test Mode shows recent Razorpay sandbox orders, and older orders may lack route and passenger metadata. Demo fleet data is labeled simulated in every mode. For hosted deployments use HTTPS and restrict access to the admin endpoint to staff through your network or identity provider.

### Live service with a separate UPI provider

For live service, set these variables in the Node process environment:

| Variable | Value |
| --- | --- |
| `PAYMENT_MODE` | `live` |
| `PAYMENT_UPI_ID`, `PAYMENT_UPI_NAME`, `PAYMENT_UPI_MCC` | Verified merchant UPI details from the operator's payment provider |
| `PAYMENT_ROUTE_FARES` | JSON object mapping route IDs to the operator's flat per-passenger fare in integer paise |
| `PAYMENT_STATUS_URL` | HTTPS status adapter for the operator's PSP or payment aggregator |
| `PAYMENT_STATUS_TOKEN` | Private bearer token for the status adapter |
| `PAYMENT_SIGNING_SECRET` | Stable, private random signing secret of at least 32 characters |

The adapter receives an authenticated GET with a `reference` query parameter. Return JSON containing `reference`, `payee`, `amountPaise` (integer), `currency` (`INR`), and `status` (`pending`, `paid`, or `failed`). Use `paid` only for a confirmed payment in the provider's records. Use `failed` only for a terminal failure. An unavailable or mismatched response keeps checkout unconfirmed. Confirm that the provider supports looking up the merchant reference from both the UPI intent and the QR payload before enabling live service.

After a verified payment the server signs a separate boarding QR payload identifying the route, passenger count, and payment reference. The boarding QR uses the prefix `GIRI-RADHAM-BOARDING:`, followed by a base64url JSON payload and a base64url HMAC-SHA256 signature separated by a dot. A deployment that scans tickets needs to integrate this format with its boarding scanner and enforce its boarding and redemption rules.

## Project structure
```
smartbus/
  index.html
  package.json
  server/
  src/
    main.jsx
    style.css
  README.md
```
