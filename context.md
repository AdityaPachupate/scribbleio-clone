# Project changelog / step-by-step annotation

Purpose  
A short, human- and AI-readable chronological record of what changed, why, and where to look in the codebase. Place this near the top of a repository README or a root source file so contributors and tools can quickly understand history and current state.

Format (single-line entries)  
`[YYYY-MM-DD] [Author] - <Short title> - <Brief details> - <Affected files / modules>`

Examples  
`[2024-01-20] [alice] - Add auth - Implemented JWT login and middleware - server/auth.js, server/routes/*.js`  
`[2024-02-02] [bob]   - Add tests - Unit tests for user service - server/tests/user.test.js`

How to add a new step
1. Add a new entry at the top following the Format.
2. Keep entries short and factual: what changed, why, and where.
3. Note required manual steps or migrations (prefix with "Migration:").

Notes for contributors and automation
- Keep entries concise and include file/module references.
- Newest entries first (chronological, descending).
- For reverts/hotfixes include explicit "Revert:" or "Hotfix:" with rollback steps.
- Use this log to connect features/bugs to code locations and tests.
- Update references and commands when project structure changes.

`[2026-02-18] [dev] - Add GameRoom model - Implemented GameRoom, GameState enum, and ChatMessage; added word pool, chat history, round timing and CreatedAt - scribble.API/Models/GameRoom.cs`
