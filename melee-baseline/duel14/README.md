# Interactive first-death duel experiment

Build `composed-b9003` extends the isolated `flight13` precision build. Original
recordings and older play variants remain in their own directories.

- First-death tick fixes the winner; equal-tick deaths tie.
- Resolve existing independent effects for 60 more ticks, without respawning.
  Shots, lobs, blasts and completed independent effects persist; attached bodies,
  orbiting effects, companions and uncompleted windups are cancelled on death.
- A death near the 25-second deadline still receives the full settling period.
- Score from the first player's perspective: winner's final HP, negative for
  the second player's win. A later death reduces the fixed winner's score to 0.
- If nobody dies by 750 ticks, score is first HP minus second HP. Average signed
  game scores to estimate matchup strength; empty samples have no estimate.
- Normal speed is 0.75×; Fast is 1×. URL aliases `normal` and `fast` also work.
- Swipe cooldown is adjustable from 0–180 frames, default 14. Shortening clamps
  an already-running cooldown; windup and recovery remain separate timers.

`shared/sim/composed/duel-outcome.js` owns the score/settling rules and mean helper.
The canonical shared engine entry exports the interactive gym engine. This is
not registered as a frozen recording build. Production integration will need
persisted tuning/defense state and a proper replay/source pin.
