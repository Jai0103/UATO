
yes i see it trainer3 

id	staff_name	staff_email	designation	head_of_training_name	signature_file_id	created_at	updated_at	created_by	updated_by
bc6d8b56-2a30-4669-9bb1-4dbb43bbbd97	Jerry Chan	jerry.chan@apolloglobalacademy.com	Trainer3	Gerald Lim	1dZZcYI8Swbd7tUd-J47VAHDIwFOG0Bt_	2026-08-05 08:52:11.729+00	2026-08-25 13:10:18.794+00	jairus.orolaza@apolloglobalacademy.com	jairus.orolaza@apolloglobalacademy.com
a7a96b17-904c-46b3-b2f0-3d5ece16e1b8	Wong Jin Rong	jinrong.wong@apolloglobalacademy.com	Trainer	Gerald Lim	1STMo5ERgjm7uAjgZa5ZNq7Y_QiQ6vlUP	2026-07-17 14:40:10.461+00	2026-07-17 14:40:10.461+00	jairus.orolaza@apolloglobalacademy.com	jairus.orolaza@apolloglobalacademy.com
5fb686b0-b631-4464-8676-843fb7a89b32	Jairus Orolaza	jairus.orolaza@apolloglobalacademy.com	Trainer / AFE	Gerald Lim	1_F09kFZdokZ10T1t0afjpKXMuwTSlzoB	2026-07-17 14:02:10.481+00	2026-07-17 14:02:10.481+00	jairus.orolaza@apolloglobalacademy.com	jairus.orolaza@apolloglobalacademy.com
25efa849-4a32-46ee-bb3a-4eefdb8d4a87	Jairus Orolaza	jairus.orolaza@apolloglobalacademy.com	Trainer / AFE	Gerald Lim	1ZyxHyrWMhsW834iuK4EvgS7SwDsNyi7V	2026-07-17 14:00:36.911+00	2026-07-17 14:00:36.911+00	jairus.orolaza@apolloglobalacademy.com	jairus.orolaza@apolloglobalacademy.com
063bc159-2d89-4d57-b4de-9e763782297a	Jairus Orolaza	jairus.orolaza@apolloglobalacademy.com	Trainer / AFE	Gerald Lim	1iKdUsBiMxVMVq0YQyf5pYu6yLqsjss2W	2026-07-17 13:59:08.22+00	2026-07-17 13:59:08.22+00	jairus.orolaza@apolloglobalacademy.com	jairus.orolaza@apolloglobalacademy.com
…

Show more
21:10
Excellent. Staff Training is now saving to Supabase.

Migrated so far:

Flight Logs: Supabase
Flight Log entries: Supabase
Flight Log record list/detail: Supabase
Master Data: Supabase
Staff Training records: Supabase
Staff Training entries: Supabase
Staff Training descriptions: Supabase
Report uploads: Supabase Storage
Next module I recommend: UA Maintenance, because it has the same pattern as Staff Training:

ua_maintenance_master_data
ua_maintenance_records
ua_maintenance_entries
We can migrate:

fetchUaMaintenanceMasterData
saveUaMaintenanceMasterData
fetchUaMaintenanceRecordsPage
fetchUaMaintenanceRecord
saveUaMaintenanceRecord
deleteUaMaintenanceRecord
21:10
oh no my credits on netify hsa been over

21:14
Oof, okay. Stop deploying for now so you don’t burn more.

Do This First

Go to Netlify.
Open your site.
Go to:
Project configuration > Build & deploy > Continuous deployment
Look for Build status.
Click:
Stop builds
or:

Pause builds
This prevents every GitHub commit from triggering another Netlify build.

For the next code changes
We can still prepare files one by one, but don’t commit/deploy until you’re ready.

Options now:

Option A: Wait until Netlify credits reset
Option B: Upgrade Netlify
Option C: Move hosting to Vercel
Option D: Use GitHub Pages temporarily
Since this is a Next.js static export, Vercel or GitHub Pages can work, but because you’re using Supabase env vars, Vercel is the easier replacement if you don’t want to pay Netlify.

For now: pause Netlify builds first.

21:14
when will this reset

21:14

Worked for 10s
Netlify resets on your billing cycle, not necessarily on the 1st day of the calendar month.

To see the exact reset date:

Go to Netlify.
Click your team/account, likely J.
Go to:
Usage & billing
Look for:
Current billing period
It should show dates like:

Aug 12 - Sep 12
Your credits/build minutes reset at the start of the next billing period.

Netlify docs say monthly plan credits reset at the start of each billing cycle, and billing dates are shown on the team’s Billing page. On Free plans, usage is monthly with a hard limit.

For now, keep builds paused so more commits do not trigger deploys.

21:15
ok, in this case, we will go back to google sheets.. now please revert all netify and supabase we did.. and use github and google sheets again

21:15

Worked for 23s
Yes. Roll back in this order.

Before Reverting
If you need records created during the Supabase test, export/copy them first. For example, your Trainer3 staff training edit and any new Supabase-only flight logs may not be in Google Sheets.

I prepared original files from your zip here:

revert_to_google_sheets

GitHub Revert Steps

Replace this file with the original:
uapl-lms-flight-log/src/lib/google-api.ts
Use:

google-api.ts

Replace this file:
uapl-lms-flight-log/src/lib/staff-training-api.ts
Use:

staff-training-api.ts

Replace this file:
uapl-lms-flight-log/package.json
Use:

package.json

This removes @supabase/supabase-js.

Delete this file from GitHub:
uapl-lms-flight-log/src/lib/supabase.ts
Restore GitHub Pages config:
uapl-lms-flight-log/next.config.ts
Use:

next.config.ts

Re-enable GitHub Actions.
If you renamed/disabled:

.github/workflows/deploy.yml
restore it using:

deploy.yml

Commit all changes to main.
Netlify
In Netlify, pause/stop builds or leave it alone. Your app will go back to GitHub Pages + Google Sheets once GitHub Actions builds successfully.

After Commit
Check GitHub:

Actions > Deploy UATO to GitHub Pages
When it succeeds, your app is back to the old Google Sheets/App Script setup.

21:15




Outputs

Google Sheet

Sources

import type { FlightLogRecord } from "@/lib/flight-log-storage"; import type { …


codex-clipboard-a625b32a-4a2b-446f-8e7e-027f98fd0c96.png

Skip to main content J Switch teams Upgrade J Projects aga-uato Switch projects…

View all
i-wa
outputs
revert_to_google_sheets
next.config.ts
import type { NextConfig } from "next";

const repoName = "UATO";
const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProduction ? `/${repoName}` : "",
  assetPrefix: isProduction ? `/${repoName}/` : "",
  images: {
    unoptimized: true
  },
  trailingSlash: true
};

export default nextConfig;


