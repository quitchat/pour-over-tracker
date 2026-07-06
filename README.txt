# Coffee Brew Tracker — Technical Feature Inventory

## Application Architecture

- Node.js / Express web application architecture
- TypeScript-based server-side application code
- PostgreSQL relational database backend
- Prisma ORM data access layer
- EJS server-rendered view layer
- Bootstrap 5 responsive UI framework
- Chart.js charting and visualization layer
- Zod request/input validation layer
- PM2-managed production runtime on Raspberry Pi 4

## Authentication and User Administration

- Session-based authenticated access
- Login-protected application routes
- Administrative user management
- User activation/deactivation controls
- Deactivated-user access restriction
- Per-user AI access permission
- Admin-only AI access enablement
- Per-user temperature unit preference during signup and profile editing
- Per-user timezone preference during signup and profile editing, with popular worldwide timezone options for new-brew date defaults
- Per-user preferred currency and bag weight unit defaults for bean inventory purchases
- Password reset workflow with email-based reset links

## Coffee Bean Management

- Coffee bean CRUD workflow
- Coffee bean list, detail, create, and edit screens
- Roaster-first bean form layout on create, edit, and detail views
- Persistent roaster catalog
- Roaster autosuggest/autocomplete during bean entry
- Free-text roaster entry for new roaster names
- Bean image/photo upload workflow
- Icon-based photo upload control
- Paginated coffee bean list
- Separate bean country and origin/region fields
- Mini country flag image display next to bean country when available
- Bean-level 0–5 star rating
- Bean-level Decaf flag shown on bean detail and beside the bean name in the bean list
- Bean Info field for factual/structured bean information
- Bean Notes field for user-entered personal notes
- Bean usage statistics derived from brew sessions:
  - Total grams brewed
  - Brew count
- Bean inventory and replenishment tracking under reusable coffee bean records
- Low-friction new-bean creation focused on coffee identity, with inventory added later from the dedicated inventory screen
- Bean identity fields stay focused on reusable coffee details; roast dates and purchase costs are tracked on inventory/replenishment records
- Add Replenishment workflow for repeat purchases of the same bean
- Set Current Inventory / Opening Balance workflow for partially used beans
- Multi-bag purchase support with shared order-level cost details
- Bag size entry in grams or ounces with normalized gram calculations
- Purchase cost tracking with currency, subtotal, discount, shipping, tax, and total paid fields
- Effective cost per bag reporting for inventory cost analytics
- Inventory remaining-weight calculation from starting grams, linked brew doses, and adjustment history
- Read-only remaining inventory link on bean detail that opens a dedicated inventory maintenance screen
- Dedicated bean inventory screen for listing and maintaining bags, replenishments, opening balances, and adjustments
- Optional brew-session link to a specific bean inventory bag for inventory reporting
- Automatic behind-the-scenes inventory bag association during brew creation
- Finish Bag / Zero Out Remaining workflow using inventory adjustments
- Manual inventory adjustment history for corrections, discarded beans, and leftover handling
- Editable and deletable inventory adjustment records
- Inventory bag deletion that preserves brew sessions by unlinking them from the deleted bag

## Grinder and Brewer Management

- Grinder CRUD workflow
- Brewer CRUD workflow
- Equipment selection from brew session forms
- Grinder usage statistics derived from brew sessions:
  - Total grams ground
  - Brew count
- Grinder-level aggregation without grind-setting/click-level breakdown
- Location-aware equipment configuration
- Saved geographic location support for grinders and brewers
- Mobile-friendly responsive grinder and brewer tables on small screens
- Browser/device geolocation-based equipment suggestion during brew creation
- Manual equipment override for denied location permission, unavailable geolocation, inaccurate geolocation, or multiple equipment matches

## Brew Session Management

- Brew session CRUD workflow
- Brew session list, detail, create, and edit screens
- Paginated brew session list
- Bean, grinder, and brewer association per brew session
- Grind size tracking
- Coffee dose tracking
- Water temperature tracking with Celsius/Fahrenheit user preference
- Output/yield tracking
- Brew timing and recipe-related fields
- Two-step new-brew workflow: Brew Setup first, then Continue opens Brew Variables for grind size, water temperature, pour structure, total yield, and total brew time before the brew record is saved
- Guided Pour Plan entry for pour structure with editable pour rows, per-row add/remove controls, optional method selection after the first Bloom row, and automatic parsing back into rows when editing saved guided notes
- Brew pour step tracking
- Tasting note tracking
- Free-form brew comments saved with each brew session
- Brew-session scoring separate from bean-level rating
- Brew tasting quality scores that clarify pleasantness, balance, and execution rather than raw intensity
- Optional Acidity Level tracking for perceived acidity intensity separate from acidity quality
- Rating-only workflow for saved unrated brews
- Radar-chart tasting visualization
- Pour structure entry supports both manual notes and a guided pour plan with pour weight, target time, and method rows
- Brew session duplication workflow that carries forward core brew variables while keeping recipe steps and adjustment notes fresh
- Brew detail previous/next navigation with mobile swipe support
- Brew comparison workflow
- AI suggestion support through adjustment notes
- Previous-brew comments included in AI recipe suggestion context
- Temperature-aware AI recipe prompts and structured recipe output
- AI brew suggestion context that distinguishes tasting-score quality from acidity intensity

## Dashboard, Analytics, and Visualization

- Dashboard summary view
- Brew statistics and analytics views
- Cost Analytics for inventory-linked purchase cost, consumed coffee cost, purchased coffee cost, average cost per brew, cost by bean, cost by roaster, best value beans, and most expensive brews
- Bean Inventory Summary analytics for total coffee on hand, low-stock beans, oldest inventory, recent replenishments, inventory value estimates, and monthly coffee consumption
- Currency-aware cost reporting with separate subtotals when multiple purchase currencies are present
- Brew comparison interface
- Chart.js-based visualizations
- Interactive coffee origin world map using bean country/countries and origin/region data
- Origin map geocoding that tries country plus region first, then falls back to country-level pins and caches resolved coordinates
- Multi-country origin map support for countries separated by comma or semicolon
- Bean detail origin map link for opening the map focused on that bean's country/region location
- Radar diagram for tasting/scoring characteristics with quality/balance scoring guidance
- Derived usage statistics for beans and grinders
- Date formatting and display normalization

## AI Bean Information Lookup

- AI-assisted coffee bean information lookup
- Official roaster website preference for bean data sourcing
- Retailer, review, Reddit, blog, and marketplace fallback avoidance unless necessary
- Structured bean detail extraction:
  - Country / countries
  - Origin / region
  - Process
  - Roast level
  - Decaf status
  - Flavor notes
  - Source URL
  - Confirmed factual bean notes
- Official product page URL storage
- Bean country display supports one or more countries separated by comma or semicolon, with matching country flag images when recognized
- Null/empty-value handling for unsupported fields
- Admin-managed Bean Detail AI prompt
- Per-user AI feature availability controls

## Admin Database Backup

- Admin Database section
- Admin-only PostgreSQL backup creation
- Downloadable database backup from the admin area
- Backup-focused database administration without database editing tools

## AI Logging, Costing, and Administration

- AI call logging
- AI call log list view
- AI call log detail view
- Paginated API/AI call log list
- AI model/request metadata tracking
- AI call status tracking
- AI duration tracking
- Web/tool usage tracking
- Estimated AI cost tracking
- Input token, output token, and total token tracking
- Token label format: `Tokens (input/output/total)`
- Admin-configurable AI cost settings:
  - Web/tool call base cost
  - Input token cost per 1M tokens
  - Output token cost per 1M tokens
- Detailed token/tool/cost breakdown on AI call detail page
- Simplified AI call log list layout

## UI and Usability

- Bootstrap 5 responsive layout
- Mobile-friendly screens
- Icon-enhanced navigation and action controls
- Equipment-focused navigation structure
- Active navigation state handling
- Large-list pagination for:
  - Coffee beans
  - Brew sessions
  - API/AI call logs

## Deployment and Operations

- Raspberry Pi 4 deployment target
- Git-based deployment workflow
- Production rebuild workflow
- Prisma migration/deployment workflow
- PM2 process management
- PM2 startup/reboot persistence
- Runtime log inspection through PM2
- Production environment configuration
- Raspberry Pi reboot-safe application hosting


- Editable purchase/order cost records for bean inventory replenishments, with auto-calculated total paid.

### Inventory backfill utility

Existing brew sessions that were created before inventory tracking can be linked to bean inventory with a dry-run-first utility. The script uses advisory matching: for each brew, it links the oldest inventory bag for the same bean that has enough remaining grams. It does not create or delete brew sessions.

```bash
npm run inventory:backfill-links
npm run inventory:backfill-links:apply
```

Optional filters are available through the underlying script, such as `--user-id=<id>`, `--bean-id=<id>`, and `--overwrite`.
