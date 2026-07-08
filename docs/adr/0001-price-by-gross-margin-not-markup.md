# Price by 60% gross margin, not 70% markup

The Excel workbooks disagreed on how List Price is derived from OPEX: the Pricing Worksheet (which priced all ~300 clients served to Sales) used `OPEX × 1.7` — a 70% *markup*, yielding only a 41% gross margin — while the formulas workbook used `OPEX ÷ (1 − 0.6)`, a true 60% gross margin. Both called their number "margin". We decided the gross-margin rule is the intended one and the worksheet's markup arithmetic was the mistake.

## Consequences

- App-generated List Prices are ~47% higher than the legacy Excel dashboard for the same client (2.5× vs 1.7× OPEX, before floors and uplifts). Do not "fix" the app to match the old spreadsheet — the discrepancy is deliberate.
- The term "margin" always means gross margin (`price = OPEX / (1 − margin)`). "Markup" is banned from the model's vocabulary.
