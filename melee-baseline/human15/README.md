# Human-style Moderate gym

Build composed-b9004: Impossible keeps former Hard policy; Hard keeps former
Moderate; Normal remains the legacy policy. Moderate now samples decisions at
seeded 6–12 tick intervals, delays noticing new projectiles 6–12 ticks and adds
±3 degrees of seeded aim error, held steady between decisions. Each discrete
attack/dash request executes once. Policy memory uses the existing policy-only
WeakMap approach; replays step captured inputs rather than consulting bots.

Flinch and parry timing now live in hashed match state, allowing deterministic
replay and seeking. Header settings pin flinch, parry release, Swipe cooldown,
gun knockback and difficulty. Fresh report: ../../melee-moderate/ (72 duels).
Production and previous reports are unchanged.
