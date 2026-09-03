# AI evaluation harness

Run `npm run eval:ai` while the configured OpenAI-compatible local model is online. The suite covers excellent/incomplete/incorrect recall, one-word/nonsense/off-topic answers, supported/unsupported inference, comprehension-vs-writing separation, spelling, answer requests, missing certainty, and prompt-injection-like student input. Results report schema/safety pass status and latency so a future `LearningModel` implementation can be compared against Bonsai 27B with the same cases.
