# Troubleshooting

## The iPad says the home server is unavailable

The child draft is kept in IndexedDB and queued mutations stay on the iPad. Restore Wi-Fi or the server, then reopen Leafmark. The queue retries in order and mutation IDs prevent duplicate journal actions.

## Book lookup cannot identify an ISBN

Leafmark validates the ISBN checksum locally first. A valid ISBN is then sent only to the metadata provider. If Open Library has no reliable record, the child can enter title/author manually. Leafmark does not invent missing metadata.

## Bonsai is offline or returns malformed JSON

The model is behind `LearningModel`. Each response is schema-validated. A timeout, malformed JSON, wrong skill, or unavailable model falls back to deterministic pedagogy prompts/evaluation that do not pretend to know book content. Technical details are logged server-side, never shown to a child.

## Parent Mode rejects the PIN

Confirm `PARENT_PIN` in `.env`, restart the service, and sign out/reopen Parent Mode. Parent cookies expire independently from child cookies.

## PWA does not update immediately

The service worker uses auto-update. Fully close and relaunch the Home Screen app after a server update if iOS keeps an old shell for a short period.

## Database recovery

Run `npm run backup` regularly and copy backups to a different physical device. To restore, stop Leafmark and run `RESTORE_FROM=/path/to/backup.sqlite npm run restore`. The restore script checks SQLite integrity first and preserves a pre-restore copy of the existing database.
