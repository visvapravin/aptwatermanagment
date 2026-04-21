# Smart Water Usage Dashboard

Realtime React dashboard connected to Firebase Realtime Database for:

- live flow and usage monitoring
- pump command controls (ON/OFF)
- community limit updates
- approximate tank level status (Full, Medium, Low)
- over-limit fine calculation with acceptance checkbox

## Tech Stack

- React + Vite
- Firebase Web SDK (`firebase/app` and `firebase/database`)

## Run Locally

```bash
npm install
npm run dev
```

Build production bundle:

```bash
npm run build
```

## Firebase Data Path Used

- root: `waterMonitor`
- metrics: `waterMonitor/current`
- commands: `waterMonitor/commands`

Key fields read:

- `flowRateLpm` or `flowRate`
- `totalUsageLiters` or `totalLitres`
- `communityLimitLiters` or `limit`
- `pumpOn`
- `cutoff`/`cutoffTriggered`
- `updatedAt`

Fields written by the UI:

- `waterMonitor/commands/desiredPumpOn`
- `waterMonitor/commands/updatedAt`
- `waterMonitor/current/communityLimitLiters`
- `waterMonitor/current/limit`
- `waterMonitor/current/updatedAt`

## Tank Level Estimation Logic

Approximate level is derived from community limit usage:

- usage % = `totalUsageLiters / communityLimitLiters * 100`
- remaining % = `100 - usage %`
- level mapping:
	- `> 66%` remaining: **Full**
	- `33% to 66%` remaining: **Medium**
	- `< 33%` remaining: **Low**

## Fine Calculation Logic

- exceeded liters = `max(totalUsageLiters - communityLimitLiters, 0)`
- fine amount = `exceeded liters * fineRatePerLiter`
- payable amount shows only when user accepts fine terms

## Important Security Note

Never expose Firebase Admin service account JSON in frontend code or public repos.
If a private key was shared accidentally, rotate/revoke it immediately in Firebase/Google Cloud IAM.
