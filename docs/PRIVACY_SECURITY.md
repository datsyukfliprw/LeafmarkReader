# Privacy and security model

Leafmark’s default student-data path is iPad → home server → local SQLite / local model. It contains no third-party analytics and no cloud AI integration. Book ISBN metadata is the intentional exception: only the ISBN needed for metadata lookup is sent to Open Library.

The browser never talks directly to the local LLM. Child and parent sessions use signed, HTTP-only, same-site cookies. Parent Mode has a separate PIN. API routes enforce the authenticated child ID server-side rather than accepting a child ID from the browser for child data access.

Student writing is stored as original and revised records. The application never replaces an original journal response when a revision is saved. SQLite foreign keys and WAL mode are enabled, and offline retry mutations use unique idempotency keys.

For LAN-only HTTP, signed cookies prevent session forgery but network traffic is not encrypted. Use local HTTPS if other users on the network are not trusted or if the service is reachable outside the home LAN.
