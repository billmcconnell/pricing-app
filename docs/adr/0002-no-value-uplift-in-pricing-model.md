# No Value Uplift in the pricing model

The Excel Pricing Worksheet added a flat $43,500 "Value Uplift" to List Price for big Customers (User Count > 50 or ACV > $300K), and the legacy dashboard served that uplifted column to Sales. We decided the app's cost model does not include it: value-based pricing on top of cost-plus was a commercial-policy hack calibrated to the old (incorrect) markup arithmetic, and pricing judgment for large accounts belongs to Sales, not the calculator.

## Consequences

- App List Prices for big Customers will be $43,500 lower than the legacy dashboard's (before the ADR-0001 margin correction, which pushes prices the other way). Both deltas are deliberate.
- If Commercial later wants value-based pricing, it is a new policy decision — not a restoration of the old column.
