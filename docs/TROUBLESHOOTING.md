# Troubleshooting

## The app says the server is unavailable

The child draft is kept in IndexedDB and queued mutations stay on the iPad. Restore connectivity, then reopen Leafmark. The queue retries in order and mutation IDs prevent duplicate journal actions.

## Render fails during startup with DATABASE_URL required

Add `DATABASE_URL` to the Render service Environment settings. Use the PostgreSQL connection string from your database provider. Redeploy after saving it.

## Render reports a database connection error

Confirm the database is active, the connection string is complete, and it includes the provider's required SSL parameters. If using Neon, prefer the pooled connection string for the Render web service.

## Book lookup cannot identify an ISBN

Leafmark validates the ISBN checksum locally first. A valid ISBN is then sent only to the metadata provider. If Open Library has no reliable record, the child can enter title/author manually. Leafmark does not invent missing metadata.

## Bonsai is offline or returns malformed JSON

The model is behind `LearningModel`. Each response is schema-validated. A timeout, malformed JSON, wrong skill, or unavailable model falls back to deterministic pedagogy prompts/evaluation that do not pretend to know book content. Technical details are logged server-side, never shown to a child.

## Parent Mode rejects the PIN

Confirm `PARENT_PIN` in Render or `.env`, restart/redeploy the service, and sign out/reopen Parent Mode. Parent cookies expire independently from child cookies.

## PWA does not update immediately

The service worker uses auto-update. Fully close and relaunch the Home Screen app after a deployment if iOS keeps an old shell briefly.

## Database recovery

Use your PostgreSQL provider's restore/export tooling. Leafmark no longer relies on a local SQLite file, so Render redeploys do not erase permanent student data.
