# The next gauntlet: combat evolution and experience expansion

**Status: QUEUED. Not started.** The owner's instruction is explicit — finish the
armoury wave in flight, confirm it is stable and merged, summarise what changed
and what is still at risk, and only then begin this.

This file exists because four container rebuilds have destroyed unpushed work in
this project. The brief below was written by the owner with his friend Harry and
handed over out-of-band; if it lived only in a chat log it would die with the
next container. It is recorded here verbatim in substance so that any future
owner — human or agent — can pick it up cold.

---

## What must be true before this starts

1. The face/head wave is gated and merged, or explicitly held with a reason.
2. `origin/main` has advanced past `cfb49fc`.
3. A summary exists of what changed and what remains risky.

The owner's framing: *"Treat this like a real AAA studio environment: finish your
current sprint commitment first, then begin the next development review cycle."*

---

## The standing rules this brief restates

This is **not** a greenfield project and **not** a rebuild. The game, the
systems, the architecture and the vision all exist. The job is to understand
what is built, find the highest-value improvements, and refuse feature bloat.

Optimise for: player enjoyment, skill expression, replayability, competitive
depth, social experience, memorable moments, polish, and "one more match".

The identity is **Anglo-Saxon warrior arena** — not generic medieval fantasy,
not another sword game. *Bretwalda* means "Britain-ruler". The world should
carry warrior prestige, tribal identity, honour, brutal arena combat, kings and
spectators, legendary battles. The core fantasy the owner states:

> "You and your friends enter an Anglo-Saxon arena and create stories."

Both platforms are first-class. Not PC controls adapted to mobile — two
excellent experiences sharing one combat identity.

---

## Method: fan out, then attack

Specialists review first, and each one must: review what exists, name its
strengths, name its weaknesses, propose improvements, state the implementation
risk, and rank by impact.

Then a dedicated **critic subagent** attacks every recommendation, asking:

- Would players actually notice this?
- Does it make Bretwalda more fun?
- Does it improve skill expression?
- Does it create memorable moments?
- Does it work on both PC and mobile?
- Is this AAA quality, or unnecessary complexity?
- Does it improve retention?

**The critic can reject.** Only what survives moves forward.

This matches the pass system already in `docs/CAMPAIGN.md`, which every new
feature must clear, and the bar in `docs/VISUAL-BAR.md` — 8+ on every axis,
*better than before is not a pass*.

---

## Player feedback to carry in

The mobile camera work and soft lock-on **massively improved the game** and made
mobile combat feel significantly better. Keep pushing camera quality, targeting,
combat readability, responsiveness, player confidence.

**Open issue:** the large flashing target indicator feels *too game-like and
basic*. Find a premium solution. The player should naturally understand three
things without being told: who am I fighting, where am I aiming, when should I
attack.

*(A pass to quieten this mark is already on the branch — it is not yet judged
sufficient, and this brief raises the bar from "quieter" to "premium".)*

---

## The specialists

### 1. Combat Director
Reference points: Chivalry 2, Half Sword, competitive fighting games, Mortal
Kombat finishing moments. Combat must be **easy to understand, hard to master**.

Review attacks, blocks, dodges, weaving, parries, counters, ripostes, shove,
weapon weight, hit detection, stamina, recovery, armour interaction.

**Named problem: the parry exists but is not satisfying.** Improve activation
reliability, timing windows, visual feedback, audio impact, reward feeling. A
successful parry should produce *"that was sick."*

### 2. Anti-button-mash Designer
Does combat reward skill? Actions must have consequences and blind attacking
must be punishable. Explore attack commitment, stamina decisions, weapon
differences, punish windows, positioning, timing battles, mind games. Winning
should feel earned.

### 3. Mobile + PC Control Specialist
Full input review. PC: keyboard/mouse precision, attack inputs, camera,
responsiveness. Mobile: touch controls, thumb reach, screen usage, camera
assistance, button placement, fatigue.

### 4. Damage / Dismemberment Designer
Today: final-hit dismemberment, hit location matters, bleeding exists.

Direction — **combat consequences**: limb damage during a fight, arm injuries,
weapon dropping, heavy-weapon penalties, movement consequences, armour
destruction, visual damage states.

**Gore must have gameplay purpose, not be spectacle.** The player should think
*"my opponent is damaged, I need to adapt."*

### 5. Cinematic Experience Director
Victory circles, defeated bodies, final kills, spectating. Explore slow-motion
final kills, cinematic cameras, kill replays, better spectator views, victory
celebrations, between-round moments. **Do not dump players straight back to a
menu — the final moment matters.**

### 6. Finisher / Colosseum Designer
An arena watched by others. After winning, the victor chooses **Mercy** or
**Finish**. Watching friends can influence the moment: spectator voting, crowd
reactions, king approval, an honour system. The feeling: an Anglo-Saxon
colosseum, a legendary battle.

### 7. Multiplayer & Social Architect
1v1, 2v2, 3v3, up to 8-player FFA, private matches, tournaments. Improve
invites, joining friends, lobbies, spectators, tournament flow. Players should
create stories together.

### 8. Competitive System Designer
Ranked matchmaking, skill rating, global leaderboard, ranks, seasons, rewards,
cosmetics, progression, mastery. Skill must matter.

### 9. World & Brand Designer
Protect the identity; avoid generic medieval tropes. Kings watching battles,
warrior status, clans, banners, prestige, arena culture, Anglo-Saxon identity.
Everything should feel like Bretwalda.

*(Clans are already named in `docs/FEATURES.md`: a **Hearth**, from heorðwerod,
the hearth-troop — the men who share a lord's fire.)*

### Technical review
Performance, rendering, browser compatibility, networking, animation, physics,
loading, memory, mobile performance — without sacrificing gameplay quality.

---

## Required output

**# BRETWALDA AAA EVOLUTION PLAN**, covering: current state assessment; what is
already excellent; biggest weaknesses; highest-impact improvements; combat,
mobile, PC, multiplayer, competitive and cinematic roadmaps; technical
priorities; and a recommended implementation order.

## The implementation loop

BUILD → TEST → CRITIC REVIEW → IMPROVE → FINALISE

Never stop at *"it works."* The standard is:

> Would players talk about this? Would friends send this to each other? Would
> someone stream this? Would someone say: *bro, you need to try Bretwalda*?

Do not build a functional game. Build a memorable one.
