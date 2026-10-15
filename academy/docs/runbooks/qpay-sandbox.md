# QPay sandbox verification (required before enabling QPay)

`src/features/commerce/payments/qpay.ts` is an **unverified draft**. Steps:
1. Get sandbox credentials (client id/secret, invoice code) from QPay.
2. Compare every endpoint and field with the official docs: https://developer.qpay.mn/mn/docs/merchant?version=2.0.0 (auth token, invoice create, payment check, cancel/refund, callback semantics, eBarimt).
3. Write a contract test that creates a sandbox invoice, pays it in the sandbox, and asserts `checkInvoice` returns `paid` with the exact amount. Gate it with `QPAY_SANDBOX_CONTRACT=1`.
4. Confirm the callback method, payload and any signature, and keep confirming via `payment/check`.
5. Decide refund/cancel API usage, and eBarimt issuance with the accountant.
6. Only then set `QPAY_CONTRACT_VERIFIED=true` and `PAYMENT_PROVIDER=qpay`.
