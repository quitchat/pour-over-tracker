Brew Suggestion AI Prompt Management
====================================

This package adds an Admin page to manage the AI Brew Assistant prompt.

Files included:
- prisma/schema.prisma
- src/services/brewAssistant.service.ts
- src/routes/admin.routes.ts
- views/admin/brew-suggestion-ai-prompt.ejs

What changed:
1. Added Prisma model BrewSuggestionAiPrompt.
2. Updated brewAssistant.service.ts to read the prompt from the database.
3. Added /admin/brew-suggestion-ai-prompt GET/POST routes.
4. Added a new admin view for editing/resetting the prompt.

After copying the files, run on Windows dev:

npx.cmd prisma migrate dev --name add_brew_suggestion_ai_prompt
npx.cmd prisma generate
npm.cmd run dev

Open:
http://localhost:3000/admin/brew-suggestion-ai-prompt

For Raspberry Pi deployment later, after pulling the changes:

npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart pour-over-tracker

Optional navbar link:
Add this wherever your Admin links are shown:

<a class="dropdown-item" href="/admin/brew-suggestion-ai-prompt">Brew Suggestion Prompt</a>

If your admin.routes.ts already has custom changes, merge carefully. This replacement keeps the earlier User Management and Bean Detail AI Prompt routes, then adds Brew Suggestion AI Prompt routes.
