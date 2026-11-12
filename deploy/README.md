# Deploying the deck advisor to Cloud Run

One Cloud Run service serves the API and the web app. Everything except the chat is local data and local code; the chat calls Gemini through Vertex AI as the service's own identity, with no API key.

**Status: written, not yet run.** The commands were checked against Google's documentation on 2026-11-12, and nothing here has been executed against the project. Expect to fix something on the first pass, and update this file when you do.

## What limits the bill

| Limit | Where | Holds when |
|-------|-------|-----------|
| $0.30 of model spend a day, 100 messages a day, 10 a minute | In the app (`apps/api/src/chat-budget.ts`) | The instance keeps running. The counts are in memory: a restart forgets the day. |
| 8 model calls and 6 tool runs per message, 40,000 tokens of history per conversation | In the agent | Always. |
| One instance, scaled to zero when idle | Cloud Run (`--max-instances=1`) | Nearly always; Cloud Run may briefly exceed it in a spike. |
| A monthly amount per service | Spend cap budgets on the billing account | Always, with a delay: cost estimates lag usage. |

The spend cap budgets are the hard stop. A spend cap is Google's own: once a service's estimated cost for the month passes the amount, new usage of that service in the project is paused until the next month or until the cap is lifted by hand. Nothing is deleted. Enforcement is not instant, so set each cap a little under what you are willing to pay.

Create these three in the console (Billing → Budgets & alerts → Create budget → **Spend cap enforcement**). Each covers one project and one service; the project is `maassel-mtg-advisor`.

| Service | Suggested monthly cap | Stops |
|---------|-----------------------|-------|
| Gemini Enterprise Agent Platform (Vertex AI) | $6 | The chat, which is the only thing that costs money per request. The rest of the site keeps working. |
| Cloud Run | $2 | The whole site. Normal traffic stays inside the free tier; this is for someone hammering the deck check. |
| Gemini API | $2 | The development key used for `pnpm eval:agent`. The deployed service does not use it. |

That is $10 a month at most, plus the lag. A spend cap budget cannot be converted from an alerts-only one, so the existing `$10/mo` alert budget stays as it is and keeps sending its emails. Creating a cap needs Billing Account Administrator.

Not covered by any cap: image storage in Artifact Registry (free to 0.5 GiB, then about ten cents per GiB a month), Cloud Build minutes (2,500 free a month; a build takes about ten), and the build's staging bucket. All are cents unless images pile up.

## Accounts and permissions

| Identity | Can | Cannot |
|----------|-----|--------|
| `deck-advisor-run` (runs the service) | Call Gemini through Vertex AI (`roles/aiplatform.user`) | Read secrets, deploy, change IAM |
| The Compute Engine default account (runs Cloud Build) | Build and push images (`roles/cloudbuild.builds.builder`) | It is Google's default builder for a project with no organization; nothing else here uses it |

Neither has a key. The visitor's collection is sent with each request and never stored.

## First deploy

Needs `gcloud` signed in as an owner of the project.

```bash
deploy/1-setup.sh          # APIs, image repository, the service's identity, the builder's role
# create the three spend cap budgets in the console (above)
deploy/2-deploy.sh         # build with Cloud Build (about ten minutes) and deploy, still private
```

Check it while it is private. This calls the service with your own identity:

```bash
URL=$(gcloud run services describe deck-advisor --region us-central1 --project maassel-mtg-advisor --format='value(status.url)')
TOKEN=$(gcloud auth print-identity-token)
curl -s -H "Authorization: Bearer $TOKEN" "$URL/api/advisor/status"
# expect: ready true, agent.available true, meta for standard and pioneer, a combos count
curl -s -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"message":"What does Opt do?"}' "$URL/api/advisor/chat"
# expect: an answer, with lookup_cards among its steps
```

If the chat answers 502, read the service's log. The usual causes are the model's name or its location: `gemini-3.8-flash` is served from `global`, `us` and `eu`, not from single regions. `MODEL_LOCATION=us deploy/2-deploy.sh` moves it. To change the model, set `ADVISOR_AGENT_MODEL` on the service (and `ADVISOR_AGENT_PRICE_IN` / `ADVISOR_AGENT_PRICE_OUT` to its prices); later deploys leave those in place.

Then open it:

```bash
deploy/3-open.sh
until [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/health")" = 200 ]; do sleep 10; done   # access changes take a few minutes
```

## Afterwards

| To | Run |
|----|-----|
| Deploy a change, or refresh the cards, the meta and the combos (the image holds a snapshot) | `deploy/2-deploy.sh` |
| Take the site down by hand | `deploy/3-open.sh close` |
| Roll back | `gcloud run services update-traffic deck-advisor --region us-central1 --project maassel-mtg-advisor --to-revisions=REVISION=100` |
| See what chat cost | The service's log: each answered turn logs `advisor chat turn` with its tokens and price |
| Resume after a cap paused a service | It resumes on the first of the month. Sooner: Billing → Budgets & alerts → the budget → Lift spend cap |

The meta snapshot is 45 days of tournaments ending at build time. Redeploy every week or two to keep it current; nothing does that on a schedule yet.

## Known gaps

- The in-app daily ceiling is forgotten when the instance restarts, which Cloud Run does after about fifteen idle minutes. Someone patient could spend the daily amount several times a day, until the month's cap on Vertex AI pauses the chat. Keeping the day's count outside the instance would fix that and is not built.
- The evals ran against the Gemini API with a key, not against Vertex AI. Same model, different endpoint: after the first deploy, run `pnpm eval:agent` once with `GOOGLE_GENAI_USE_ENTERPRISE=true`, `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` set.
- Old images accumulate in the repository. Delete them by hand or add a cleanup policy.
- What a visitor sees while a spend cap has paused Cloud Run is not documented by Google and has not been tried here.
