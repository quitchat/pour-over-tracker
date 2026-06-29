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
- Bean-level 0–5 star rating
- Bean Info field for factual/structured bean information
- Bean Notes field for user-entered personal notes
- Bean usage statistics derived from brew sessions:
  - Total grams brewed
  - Brew count

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
- Brew pour step tracking
- Tasting note tracking
- Brew-session scoring separate from bean-level rating
- Radar-chart tasting visualization
- Brew session duplication workflow
- Brew detail previous/next navigation with mobile swipe support
- Brew comparison workflow
- AI suggestion support through adjustment notes
- Temperature-aware AI recipe prompts and structured recipe output

## Dashboard, Analytics, and Visualization

- Dashboard summary view
- Brew statistics and analytics views
- Brew comparison interface
- Chart.js-based visualizations
- Radar diagram for tasting/scoring characteristics
- Derived usage statistics for beans and grinders
- Date formatting and display normalization

## AI Bean Information Lookup

- AI-assisted coffee bean information lookup
- Official roaster website preference for bean data sourcing
- Retailer, review, Reddit, blog, and marketplace fallback avoidance unless necessary
- Structured bean detail extraction:
  - Origin
  - Process
  - Roast level
  - Flavor notes
  - Source URL
  - Confirmed factual bean notes
- Official product page URL storage
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
