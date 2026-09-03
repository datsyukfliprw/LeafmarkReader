# Privacy and security model

In the free cloud deployment, Leafmark's permanent student records travel from the iPad to the Render web service and are stored in the configured PostgreSQL provider (for example, Neon). In-progress drafts and queued retry mutations remain in IndexedDB on the iPad. Leafmark contains no third-party analytics. Book ISBN metadata lookup intentionally sends the ISBN to Open Library.

The browser never talks directly to the configured LLM endpoint. Child and parent sessions use signed, HTTP-only, same-site cookies. Parent Mode has a separate PIN. API routes enforce the authenticated child ID server-side rather than accepting a child ID from the browser for child data access.

Student writing is stored as original and revised records. The application never replaces an original journal response when a revision is saved. PostgreSQL foreign keys protect relational integrity, and offline retry mutations use unique idempotency keys.

Keep `DATABASE_URL`, `COOKIE_SECRET`, child PINs, and parent PIN private. Cloud deployments should remain HTTPS-only; Render's public service URL provides HTTPS by default.
