# Deploying the deck advisor to Cloud Run

One Cloud Run service serves the API and the web app. Everything except the chat is local data and local code; the chat calls Gemini through Vertex AI as the service's own identity, with no API key.

One other route can call a model: the Commander Builder's deck explanation (`POST /api/ai/explain-deck`). It only does so when the service has a `GEMINI_API_KEY`, `GOOGLE_API_KEY` or `ANTHROPIC_API_KEY`, which this deployment does not set, so here it returns a fixed text and costs nothing. If a key is ever added, each explanation counts against the same daily ceiling as the chat, but its spend goes to that key and not to the Vertex AI cap.

**Status: written, not yet run.** The commands were checked against Google's documentation on 2026-11-12, and nothing here has been executed against the project. Expect to fix something on the first pass, and update this file when you do.

## What limits the bill

| Limit | Where | Holds when |
|-------|-------|-----------|
| $0.30 of model spend a day, 100 messages a day, 10 a minute, 2 answers at once | In the app (`apps/api/src/chat-budget.ts`) | The instance keeps running. The counts are in memory: a restart forgets the day. A turn is priced when it ends, so a day can end two turns over: $1.70 at the very most for one instance (worked out in J-013). |
| 8 model calls and 6 tool runs per message, 4,096 tokens written per model call, 400,000 bytes sent to the model per message, 40,000 tokens of history per conversation | In the agent | Always. |
| One instance, scaled to zero when idle | Cloud Run (`--max-instances=1`) | Nearly always; Cloud Run may briefly exceed it in a spike. |
| A monthly amount per service | Spend cap budgets on the billing account | Until someone lifts one by hand (see below), and with a delay: cost estimates lag usage. |

The spend cap budgets are the hard stop. A spend cap is Google's own: once a service's estimated cost for the month passes the amount, new usage of that service in the project is paused until the next month or until the cap is lifted by hand. Nothing is deleted. Enforcement is not instant, so set each cap a little under what you are willing to pay.

**Lifting a cap by hand switches it off for the rest of the month.** Google does not trigger it again until the 1st unless you then raise its amount. So after a lift the only limits left on that service are the ones in the app, which a restart forgets. If you lift a cap, raise its amount in the same sitting to arm it again, and say by how much you are willing to go over.

Create these three in the console (Billing → Budgets & alerts → Create budget → **Spend cap enforcement**). Each covers one project and one service; the project is `maassel-mtg-advisor`.

| Service | Suggested monthly cap | Stops |
|---------|-----------------------|-------|
| Gemini Enterprise Agent Platform (Vertex AI) | $6 | The chat, which is the only thing that costs money per request. The rest of the site keeps working. |
| Cloud Run | $2 | The whole site. This is for someone hammering the deck check. A cap counts list price before the free tier and credits, so it may count usage that would have cost nothing: $2 is roughly twenty busy hours of the one instance in a month. |
| Gemini API | $5 | The development key used for `pnpm eval:agent`. The deployed service does not use it. |

The amounts are Nick's (2026-11-13) and are lines in the workspace spend plan, [homelab ADR-044](https://github.com/nsmaassel/homelab/blob/main/docs/decisions/ADR-044-one-spend-plan-for-every-project.md), which also withdrew the billing-detach function #7 had asked for. The three caps add up to $13 a month. The bill is not capped at that: the lag comes on top, and so does everything no cap covers, below. A spend cap budget cannot be converted from an alerts-only one, so the existing `$10/mo` alert budget stays as it is and keeps sending its emails. Creating a cap needs Billing Account Administrator.

Not covered by any cap, because caps exist for four services only (Gemini API, Vertex AI, Cloud Run and Cloud Run functions):

- **Cloud Logging.** Cloud Run writes a line for every request, including the ones it turns away, and the app writes two more. The first 50 GiB a month are free; a flood of requests could go past that, and logging keeps going whatever the Cloud Run cap does. The `$10/mo` alert budget is what would tell you. To take the risk away, exclude the request logs (`gcloud logging sinks update _Default --add-exclusion=name=run-requests,filter='logName:"run.googleapis.com%2Frequests"'`) at the price of not having them.
- **Image storage** in Artifact Registry (free to 0.5 GiB, then about ten cents per GiB a month), **Cloud Build** minutes (2,500 free a month; a build takes about ten), and the build's staging bucket. Cents, unless images pile up.
- **Vertex AI beyond chat.** A cap pauses new usage; it does not stop a job already running or a resource already deployed. Nothing here creates either, but see the service's identity below.
- **Data sent to visitors.** The container serves the web app itself. Whether Cloud Run's outbound data is billed under the Cloud Run service, and so under its cap, is not something Google's pages say; treat it as not covered.

Detaching billing, the hard stop first planned, would have stopped all of these too, along with everything else in the project. That is the trade: caps are narrower and gentler, and leave these to the alert budget.

## Accounts and permissions

| Identity | Can | Cannot |
|----------|-----|--------|
| `deck-advisor-run` (runs the service) | Use Vertex AI (`roles/aiplatform.user`). That is the role approved for this, and it is wider than calling a model: it can also create Vertex AI jobs and endpoints | Read secrets, deploy, change IAM, touch billing |
| `deck-advisor-build` (runs Cloud Build) | Read the uploaded source, write build logs, push images (`roles/cloudbuild.builds.builder`) | Deploy, change IAM, call models |

Neither has a key. The build has its own identity so that it does not use the Compute Engine default account, which this project may not have and which is often an Editor where it exists. A narrower custom role for the service (`aiplatform.endpoints.predict` alone) should be enough to call a model; it has not been tried with the ADK, so it is not what the script grants.

The visitor's collection is sent with each request and never stored. The API has no login and answers any origin, so any page or script can call it: the limits above are what bound that, not who is asking.

## First deploy

Needs `gcloud` signed in as an owner of the project.

```bash
deploy/1-setup.sh          # APIs, image repository, the two identities
# create the three spend cap budgets in the console (above)
deploy/2-deploy.sh         # build with Cloud Build (about ten minutes) and deploy, private
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

If `gcloud builds submit` says it cannot stream the build's log, the build is still running: add `--suppress-logs` to that command in `deploy/2-deploy.sh` and read the log in the console. (The build runs as its own identity and logs to Cloud Logging; whether this version of `gcloud` streams from there has not been tried.)

If the chat answers 502, read the service's log. The usual causes are the model's name or its location: `gemini-3.8-flash` is served from `global`, `us` and `eu`, not from single regions. Every deploy sets the location from `MODEL_LOCATION` in `deploy/config.sh`, so change it there; `IMAGE=<the image just built> deploy/2-deploy.sh` then applies it without building again. To change the model, set `ADVISOR_AGENT_MODEL` on the service (and `ADVISOR_AGENT_PRICE_IN` / `ADVISOR_AGENT_PRICE_OUT` to its prices); deploys leave those in place.

Then open it:

```bash
SPEND_CAPS_SET=yes deploy/3-open.sh open   # refuses without the yes: the caps cannot be checked from a script
until [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/health")" = 200 ]; do sleep 10; done   # access changes take a few minutes
```

## Afterwards

| To | Run |
|----|-----|
| Deploy a change, or refresh the cards, the meta and the combos (the image holds a snapshot) | `deploy/2-deploy.sh` |
| Take the site down by hand | `deploy/3-open.sh close`. It removes the public as an invoker and prints who is left |
| Roll back | `gcloud run services update-traffic deck-advisor --region us-central1 --project maassel-mtg-advisor --to-revisions=REVISION=100`. Cloud Run then keeps traffic pinned there; the next `deploy/2-deploy.sh` sends it to the new revision again |
| See what chat cost | The service's log: each answered turn logs `advisor chat turn` with its tokens and price, and a turn that was stopped or failed logs `advisor chat turn without an answer` |
| Resume after a cap paused a service | It resumes on the first of the month. Sooner: Billing → Budgets & alerts → the budget → Lift spend cap, **then raise its amount**, or the cap stays off until the 1st |

The meta snapshot is 45 days of tournaments ending at build time. Redeploy every week or two to keep it current; nothing does that on a schedule yet.

## Known gaps

- The in-app daily ceiling is forgotten when the instance restarts, which Cloud Run does after about fifteen idle minutes and on every deploy. Someone patient could spend the daily amount and the turns under way, up to $2.00 for one instance, several times a day, until the month's cap on Vertex AI pauses the chat. Keeping the day's count outside the instance would fix that and is not built.
- The evals ran against the Gemini API with a key, not against Vertex AI. Same model, different endpoint: after the first deploy, run `pnpm eval:agent` once with `GOOGLE_GENAI_USE_ENTERPRISE=true`, `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` set.
- Old images accumulate in the repository. Delete them by hand or add a cleanup policy.
- Every build downloads Scryfall's bulk files and Commander Spellbook's variants again: Cloud Build keeps no layers between builds. Both sources ask for about one fetch a day, so do not rebuild in a loop; redeploy an existing image with `IMAGE=...` when only settings change.
- A chat turn has no deadline of its own. The request times out at 120 seconds; a turn slower than that would keep running, and be charged, after the visitor got an error. Since only two turns are answered at once, two turns stuck on a model call that never returns would turn every other visitor's question away until the instance restarts. That costs nothing and the rest of the page keeps working.
- What a visitor sees while a spend cap has paused Cloud Run is not documented by Google and has not been tried here.
