# Data Lake Pricing

Prices the Data Lake product (IMOS database replicated via AWS DMS/S3 into Snowflake) for customers. Replaces the "Data Lake Pricing Dashboard" Excel workbook: quoting, the cost model that derives prices, and the per-customer data that feeds it.

## Language

**Environment**:
An IMOS database being replicated into the Data Lake. The unit of pricing — every cost line (DMS task, Snowpipe, storage) scales with one Environment's database. A Customer with two production databases has two Environments and two priceable line items.
_Avoid_: Client env, database (alone), instance

**Customer**:
An organization that owns one or more Environments, identified by its 4-letter Company Code. Some Customers exist commercially (have ACV) without any measured Environment, and vice versa.
_Avoid_: Client, account (Salesforce sense), company

**Company Code**:
The 4-letter identifier of a Customer (e.g. `MOLH`). Maps 1:1 to a Salesforce Account Name.

**Sales**:
Role that uses the quote screen — sees List Price, options, and multi-year totals, but never OPEX, margin, or contingency.
_Avoid_: Commercial (as a role name)

**Admin**:
Role that owns the cost model — edits assumptions, price floors, and imports data.
_Avoid_: Pricing owner, analyst

**IMOS DB Size**:
The measured size of an Environment's database, expressed in GB everywhere in the app. Source data feeds export megabytes; conversion happens once, at import.
_Avoid_: spaceused, unqualified "size" figures without a unit

**Growth Rate**:
An Environment's forecast annual database-size growth, expressed as a ratio (0.20 = 20%) and subject to an Admin-set floor. The single growth concept in the system: it inflates database size in the cost model and drives Multi-Year Projections.
_Avoid_: Yearly growth rate, uplift, forecast growth, price escalator

**OPEX**:
The full yearly cost of running an Environment's Data Lake: fixed costs, variable costs scaled by database size, contingency, and the Snowflake credit allocation.
_Avoid_: Cost (unqualified), total cost

**Gross Margin**:
The fraction of List Price that is not OPEX. List Price is derived as OPEX ÷ (1 − margin); currently 60%. See ADR-0001.
_Avoid_: Markup, default margin

**List Price**:
The yearly price quoted for one Environment: OPEX grossed up to the target Gross Margin, then subject to the price floor. There is no value-based uplift (ADR-0002).
_Avoid_: LP, price (unqualified), value uplift LP

**Multi-Year Projection**:
The total price over N years, computed by growing an Environment's database size and re-running the cost model for each year — never by compounding the price itself. Year 1 grows by the Environment's own Growth Rate; later years grow by the floor rate, since a ramp-up trend is not a steady state.

**ACV**:
A Customer's annual contract value, imported from Salesforce. Consumed only by the Proportionality Guardrail; not a pricing input.

**Proportionality Guardrail**:
A warning shown when an Environment's List Price exceeds an Admin-set share of the Customer's ACV (currently 25%). It flags, never blocks — the judgment call belongs to Sales.
_Avoid_: Over 25% of ACV flag

**Assumption**:
Any Admin-editable constant the cost model depends on — unit costs, behavioral assumptions (turnover, contingency, growth floor), and commercial policy (margin, floors, tiers, add-on prices). Every edit is recorded in a change log (when, what, old → new).
_Avoid_: Constant, setting, magic number

**Refresh Rate**:
How often an Environment's Data Lake is updated: 30 Minutes (included in List Price), 15 Minutes, or 1 Minute. The 10-Minute option was retired in late 2024.

**Accelerated Updates**:
The optional add-on license for a faster-than-included Refresh Rate. Priced per GB of the Environment's grown database size (an Admin-set rate with per-tier floors) — not by comparison to a reference client.
_Avoid_: RTEU comparison

**Alternative Destination**:
Optional add-on to deliver the Data Lake somewhere other than the standard Snowflake destination, at a flat price.

## Flagged ambiguities

- The workbook uses "Company Code", "Client Env", and "Account Name" interchangeably as row keys. They are not the same: Company Code identifies a **Customer**; an **Environment** belongs to a Customer (usually 1:1, not always — `MOLH` has two).

## Example dialogue

> **Dev:** Sales wants a quote for MOLH — do I look up one price?
> **Expert:** No. MOLH is a Customer with two Environments, MPCC_PROD and MOLDB_prod. Each Environment gets its own cost calculation and price; the quote can list both.
> **Dev:** And the 52 codes in the ACV import with no database size?
> **Expert:** Those are Customers with no measured Environment yet. They exist, but nothing is priceable until an Environment's size is imported.
