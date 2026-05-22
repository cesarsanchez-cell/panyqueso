# Futbol de los martes - Claude Code working agreement

## Product goal

Build a responsive web app to organize friendly football matches with fair, entertaining, and transparent team generation.

The app must help the group create balanced teams while avoiding public exposure of negative player ratings. Internal ratings are for balance only. Public-facing player information, when implemented later, must focus on neutral data and positive achievements.

## Current product scope

Build the first web MVP for admin and veedor/controller only.

Do not implement the player-facing experience yet, but design the data model so it can be added later.

## Roles

### Admin

- Creates and edits players.
- Approves or deactivates players.
- Creates match calls/convocatorias.
- Generates teams.
- Can manually adjust generated teams before confirmation.
- Records match results and basic stats.

### Veedor / controller

- Reviews player ratings and sensitive changes.
- Helps prevent abuse, favoritism, or subjective imbalance.
- Can approve, reject, or flag important rating changes.

### Player

- Not part of the first MVP login flow.
- Future player view must show only neutral or positive information.
- Players must not edit or request direct changes to their own rating.
- Players must not see internal weaknesses, private notes, or exact internal balance ratings.

## Core principles

- Internal rating exists to balance teams, not to rank or expose people.
- Public/future player-facing data should encourage participation, not conflict.
- Every sensitive rating change should be traceable.
- The algorithm should assist the admin, not replace human judgment at first.
- The admin can manually adjust teams until the algorithm proves reliable.

## Player data

Each player should support:

- Name.
- Age.
- Status: pending, approved, inactive.
- Role: goalkeeper, field_player, mixed.
- Preferred position: defender, midfielder, forward.
- Technical skill: 1 to 10.
- Physical condition: 1 to 10.
- Mentality / commitment / team play: 1 to 10.
- Internal calculated score.
- Rating confidence: low, medium, high.
- Private notes visible only to admin and veedor.
- Rating change history.

Age is a performance parameter, but it should not punish players automatically. It should be used as a soft factor together with physical condition and observed performance.

## Internal scoring

Start with a simple, explainable formula. Example:

```text
internal_score =
  technical_skill * 0.40 +
  physical_condition * 0.30 +
  mentality * 0.20 +
  age_adjustment * 0.10
```

The formula can change later, but it must remain explicit and testable.

## Team generation rules

The MVP generates 2 teams only.

Each team must support 5 to 12 players.

The generator should optimize for:

- Similar number of players per team.
- At least 1 goalkeeper per team when possible.
- If there are not enough goalkeepers, suggest a medium-high rated replacement.
- Similar total internal score.
- Similar distribution of defenders, midfielders, and forwards.
- Similar balance of technical, physical, and mental profiles.
- Reasonable age/performance balance.

The result must show a balance summary:

- Total score per team.
- Score difference.
- Position distribution.
- Goalkeeper status.
- Warnings if the match looks unbalanced.

The admin must be able to manually move players between teams before confirming.

## Match history

The MVP should save:

- Match date.
- Confirmed teams.
- Final score.
- Winners.
- Goals by player when available.
- Optional notes.

Design the structure so future stats can be added:

- Matches played.
- Wins.
- Goals.
- Assists.
- Figure of the match.
- Goalkeeper highlights.
- Attendance streak.
- Positive stars/badges.

## Privacy and tone

Never design a player-facing screen that exposes:

- Exact internal score.
- Low technical, physical, or mental ratings.
- Private notes.
- Negative labels.
- Direct comparisons against other players.

Future player-facing screens may show:

- Matches played.
- Wins.
- Goals.
- Assists.
- Positive badges/stars.
- Attendance.
- Position.
- Neutral profile information.

## Recommended stack

Use:

- Vercel for deploy.
- Supabase for auth and database.
- A responsive web frontend.

Avoid adding Convex in the MVP unless there is a strong reason. Supabase is already available and is enough for this product stage.

## Work process

Implement in small, reviewable tasks.

Before coding each task:

- State the intended change.
- Identify affected files or modules.
- Mention any assumptions.

After coding each task:

- Explain what changed.
- List tests or checks performed.
- Mention any known limitations.

## Audit loop

After each plan or implementation, the reviewer will classify findings as:

- Blockers: must be fixed before proceeding.
- Major issues: must be fixed before proceeding.
- Suggestions: useful improvements that can wait.

Any blocker or major issue means no-go.

Only proceed to the next phase when blockers and major issues are resolved.

## Definition of done for MVP

The MVP is ready when:

- Admin and veedor can sign in.
- Players can be created, edited, approved, and deactivated.
- Internal ratings are stored and calculated.
- Sensitive rating changes are recorded.
- A convocatoria can be created.
- Two teams can be generated from selected players.
- Team balance summary is shown.
- Admin can manually adjust teams.
- A match can be confirmed and saved.
- Result and basic stats can be recorded.
- The UI works well on mobile and desktop.
- Private/internal rating data is not exposed in inappropriate places.

