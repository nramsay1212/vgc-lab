/* Hand-written training content. Pokémon data comes from data/dex.json;
 * this file holds the parts that need a person to write them. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});

  VL.TAGS = [
    ['preview', 'Wrong bring or lead'],
    ['speed', 'Misjudged speed, Trick Room or Tailwind turns'],
    ['calc', 'Misjudged damage'],
    ['overpredict', 'Over-predicted (Protect, switch)'],
    ['predictable', 'Played too predictable'],
    ['mega', 'Gimmick timing (Mega, Tera, etc.)'],
    ['wincon', 'Traded away my win condition'],
    ['endgame', 'Endgame miscount'],
    ['info', 'Missed an item/ability reveal'],
    ['knowledge', 'Didn\'t know a mechanic or interaction'],
    ['tilt', 'Autopilot or tilt'],
    ['bo3', 'Didn\'t adapt from the last game (best of 3)'],
    ['luck', 'Bad luck (critical hit, miss, speed tie)'],
    ['matchup', 'Bad team matchup'],
  ];

  VL.SESSION = [
    { id: 'drill', t: 'Study drill or game', m: '5 min', d: 'One round in Study or one game in Games.' },
    { id: 'warm', t: 'Warm-up: calc 3 threats', m: '10 min', d: null },
    { id: 'ladder', t: 'Ladder block with your focus', m: '6–10 games', d: 'At <span class="term" data-term="preview">team preview</span>, say your <span class="term" data-term="bring4">bring-4</span>, your <span class="term" data-term="lead">lead</span>, and your <span class="term" data-term="wincon">win condition</span> before you lock in.' },
    { id: 'log', t: 'Log every game', m: '1 min each', d: 'Right after the game, while you still remember the turn it swung.' },
    { id: 'loss', t: 'Review one loss turn by turn', m: '20 min', d: 'Find the turn the game was lost. Write the play you\'d make now in that game\'s note.' },
    { id: 'study', t: 'Study top play', m: '15 min', d: 'Watch one top-cut set from a recent major event. Pause at team preview and call both players\' bring-4 and leads before they\'re shown.' },
    { id: 'bo3', t: 'Best-of-3 practice set', m: 'weekly', d: '<span class="term" data-term="bo3">Best of 3</span> against a friend or Discord partner. Adjust games 2 and 3 to what you saw in game 1.' },
    { id: 'weekly', t: 'Weekly review', m: 'Sunday', d: 'Copy the review prompt in the Review tab into Claude, add any new problem Pokémon to the notebook, and set next week\'s focus.' },
  ];

  VL.SKILLS = [
    { id: 'preview', name: 'Team preview and game plans', what: 'Choosing the right 4 and <span class="term" data-term="lead">lead</span> at <span class="term" data-term="preview">team preview</span>, and knowing your <span class="term" data-term="wincon">win condition</span> before turn 1.', drill: 'Before every game, say your bring-4, lead and win condition. Afterward, check whether the plan or the play lost it.', tags: ['preview', 'matchup'] },
    { id: 'speed', name: 'Speed control and turn order', what: 'Knowing who moves first under <span class="term" data-term="tailwind">Tailwind</span>, <span class="term" data-term="trickroom">Trick Room</span>, paralysis, Scarf and speed drops, and counting the turns left. Also called <span class="term" data-term="speedcontrol">speed control</span>.', drill: 'Study: Base Speed and Who moves first. Say the Tailwind or Trick Room turns left out loud each turn.', tags: ['speed'], study: ['basespeed', 'whofirst'] },
    { id: 'damage', name: 'Damage intuition', what: 'Knowing roughly what a hit does without a <span class="term" data-term="calc">damage calculator</span>: when something survives, when a <span class="term" data-term="spread">spread move</span> knocks something out, and when it comes down to the <span class="term" data-term="roll">damage roll</span>.', drill: 'Warm-up calcs on the Pokémon you lose to. Guess the % before checking.', tags: ['calc'], study: ['mechanics'] },
    { id: 'types', name: 'Type matchups', what: 'Instant recall of every attacking type into every typing, including dual types and immunities.', drill: 'Study: Type vs Pokémon and Find the weakness until you score 95%+.', tags: ['knowledge'], study: ['typemon', 'typebasic', 'weakness'] },
    { id: 'reads', name: 'Reads and risk', what: 'Deciding when to play safe and when to predict, based on what your opponent has to fear.', drill: 'In reviews, for each risky play ask: what did I lose if the read was wrong?', tags: ['overpredict', 'predictable'] },
    { id: 'resources', name: 'Resources and gimmick timing', what: 'When to use the <span class="term" data-term="gimmick">battle gimmick</span> (Mega, Tera, Dynamax), and protecting the Pokémon your <span class="term" data-term="wincon">win condition</span> needs.', drill: 'Before turn 1, decide which Pokémon is your win condition and what has to happen for it to win.', tags: ['mega', 'wincon'] },
    { id: 'endgame', name: 'Endgame counting', what: 'Counting HP, turns and speed to see a won or lost endgame two turns early.', drill: 'In close games, write down the endgame you expected and compare it to what happened.', tags: ['endgame'] },
    { id: 'info', name: 'Tracking information', what: 'Noticing revealed items, abilities, moves and speed orders, and using them.', drill: 'Keep a running note in best-of-3 sets: every item, ability and move each opponent revealed.', tags: ['info'] },
    { id: 'knowledge', name: 'Game knowledge', what: 'Items, abilities, priority and mechanics, so nothing surprises you.', drill: 'Study: Items, Abilities, Priority and Mechanics drills.', tags: ['knowledge'], study: ['items', 'abilities', 'priority', 'mechanics'] },
    { id: 'mental', name: 'Mental game', what: 'Playing your best game after a loss, a critical hit, or a long session.', drill: 'Stop a ladder block after 2 losses in a row tagged "autopilot or tilt".', tags: ['tilt'] },
    { id: 'adapt', name: 'Best-of-3 adaptation', what: 'Changing leads, targets and plans between games of a <span class="term" data-term="bo3">best of 3</span> based on what you learned.', drill: 'Weekly best-of-3 set. Between games, write one change and why.', tags: ['bo3'] },
    { id: 'formats', name: 'Learning new formats fast', what: 'Getting strong in a new regulation or game before everyone else does.', drill: 'Run the New format playbook in the Formats tab every time the format changes.', tags: [] },
  ];

  VL.MILESTONES = [
    ['m100', 'Log 100 games with tags'],
    ['mtypes', 'Score 95% or better on Type vs Pokémon'],
    ['mfmt3', 'Log games in 3 different formats'],
    ['mpeak', 'Match your best ever ladder finish in a new game'],
    ['mtop', 'Finish a ranked season in the top 500'],
    ['mcup', 'Top cut a League Cup'],
    ['mwin', 'Win a League Cup'],
    ['mday2', 'Make Day 2 at a Regional'],
    ['mrcut', 'Top cut a Regional'],
    ['minv', 'Earn a Worlds invite'],
    ['mwday2', 'Make Day 2 at Worlds'],
    ['mworlds', 'Top cut at Worlds'],
    ['mchamp', 'World Champion'],
  ];

  VL.STAGES = [
    { n: 'Foundations', ms: ['m100', 'mtypes'], d: 'Knowledge becomes automatic, and logging and reviewing become habits. Type matchups, speed tiers and common items should be instant.' },
    { n: 'Ladder consistency', ms: ['mfmt3', 'mpeak', 'mtop'], d: 'Finish high on ladder in several formats, not just one. Each new format, you should get strong faster than the last.' },
    { n: 'Local results', ms: ['mcup', 'mwin'], d: 'Best-of-3 experience at League Challenges and Cups. Learn to adapt between games and play well under pressure.' },
    { n: 'Major events', ms: ['mday2', 'mrcut'], d: 'Regionals and Internationals. Make Day 2, then top cut. This is where Championship Points add up.' },
    { n: 'Worlds qualification', ms: ['minv'], d: 'Earn an invite through a season of consistent results, or by winning a Regional.' },
    { n: 'Worlds contention', ms: ['mwday2', 'mworlds', 'mchamp'], d: 'Day 2 at Worlds, then top cut, then the title. Most champions got there after several Worlds runs.' },
  ];

  VL.EVENTS = [
    ['2026-12-02', 'Regulation M-C ends', 'Ranked and events move to the next ruleset. It hadn\'t been announced as of Nov 12.'],
    ['2026-12-05', 'Las Vegas Regional', 'Masters listed as sold out.'],
    ['2027-01-16', 'Atlanta Regional', 'Masters listed as sold out, so check for a waitlist.'],
    ['2027-02-06', 'Seattle Regional', ''],
    ['2027-02-19', 'Europe International (London)', ''],
    ['2027-02-27', 'San Antonio Regional', ''],
    ['2027-04-03', 'Toronto Regional', ''],
    ['2027-04-17', 'Milwaukee Regional', ''],
    ['2027-05-29', 'San Diego Regional', ''],
    ['2027-06-18', 'North America International (Chicago)', 'Biggest Championship Points event in North America.'],
    ['2027-08-13', 'World Championships (Singapore)', 'Aug 13–15.'],
  ];

  VL.PLAYBOOK = [
    ['rules', 'Read the full rules', 'Legal Pokémon and items, banned or restricted Pokémon, the battle gimmick, level, team size and timer.'],
    ['diff', 'List what changed', 'New Pokémon, items and moves, and what left. The Study tab updates to the new format automatically.'],
    ['recaps', 'Read your old recaps', 'What did you misjudge early last time? Avoid it now.'],
    ['speed', 'Learn the new speed tiers', 'Run Base Speed and Who moves first drills with this format selected, until you score 90%.'],
    ['arch', 'Map the archetypes', 'Which speed control and weather or terrain modes exist, and which top threats beat each one.'],
    ['try3', 'Play three archetypes', 'Use rentals or copied teams, about 10 games each, before you commit to one.'],
    ['watch', 'Study the first big event', 'Note the top-cut teams and leads, and write notebook cards for the 5 most common threats.'],
    ['commit', 'Pick a team and log 50 games', 'Don\'t switch until you have 50 logged games with it, so the review data means something.'],
  ];

  /* Mechanics flashcards.
   * min: first generation the fact applies to. champ: 'only' = Champions only,
   * 'not' = mainline games but not Champions. Numbers follow Pokémon Showdown's
   * battle code. */
  VL.MECHANICS = [
    { q: 'A spread move hits two targets in doubles. How much damage does it do to each?', a: '0.75×', w: ['0.5×', '1×', '0.67×'], ex: 'Moves that hit more than one target (Heat Wave, Rock Slide, Earthquake) do 0.75× to each. If only one target is left, it does full damage.', min: 4 },
    { q: 'What is the same-type attack bonus?', a: '1.5×', w: ['1.2×', '1.3×', '2×'], ex: 'Using a move that matches one of your types gives 1.5×. Adaptability raises it to 2×.', min: 1 },
    { q: 'How much does a critical hit multiply damage in modern games?', a: '1.5×', w: ['2×', '1.25×', '3×'], ex: 'Since Generation 6, critical hits do 1.5×. Before that they did 2×.', min: 6 },
    { q: 'What does a critical hit ignore?', a: 'Reflect/Light Screen, the attacker\'s stat drops and the target\'s defense boosts', w: ['Type immunities', 'Protect and Wide Guard', 'Weather and terrain'], ex: 'A crit skips screens, any negative offensive stages on the attacker, and any positive defensive stages on the target.', min: 6 },
    { q: 'How many turns does Tailwind last?', a: '4 turns, counting the turn it\'s used', w: ['5 turns', '3 turns', '8 turns'], ex: 'Tailwind doubles your side\'s Speed for 4 turns, including the turn you set it. In practice that\'s 3 turns where you move first.', min: 5 },
    { q: 'How many turns does Trick Room last?', a: '5 turns, counting the turn it\'s used', w: ['4 turns', '3 turns', '8 turns'], ex: 'Trick Room lasts 5 turns including the turn it\'s set, so you get 4 turns of slow-first. Using it again while it\'s up ends it.', min: 4 },
    { q: 'What is Trick Room\'s priority?', a: '−7', w: ['0', '−6', '+1'], ex: 'Trick Room always goes last. A Prankster user does not speed it up, because Prankster only adds +1 and it stays in the −6 bracket.', min: 4 },
    { q: 'What priority is Fake Out?', a: '+3', w: ['+1', '+2', '+4'], ex: 'Fake Out is +3 and flinches, but only on the user\'s first turn after switching in. It was +1 before Generation 5.', min: 5 },
    { q: 'What priority are Protect and Detect?', a: '+4', w: ['+3', '+5', '+2'], ex: 'Protect is +4, so it goes before Fake Out. Helping Hand (+5) is the main move above it. It was +3 before Generation 5.', min: 5 },
    { q: 'What priority are Follow Me and Rage Powder?', a: '+2', w: ['+1', '+3', '+4'], ex: 'Both redirect single-target moves to the user for the turn. They don\'t redirect spread moves.', min: 5 },
    { q: 'Which of these is NOT affected by Rage Powder?', a: 'A Grass-type attacker', w: ['A Fire-type attacker', 'A Dragon-type attacker', 'A Fairy-type attacker'], ex: 'Rage Powder is a powder move. Grass types, Overcoat and Safety Goggles ignore it. Follow Me has no such exceptions.', min: 6 },
    { q: 'What does Prankster do?', a: '+1 priority to status moves, but they fail against Dark-type opponents', w: ['+1 priority to all moves', 'Status moves can\'t miss', '+2 priority to status moves'], ex: 'Since Generation 7, a status move boosted by Prankster fails on a Dark-type target. It still works on allies and on your own side.', min: 7 },
    { q: 'What does Psychic Terrain do?', a: 'Blocks opponents\' priority moves on grounded Pokémon and boosts Psychic moves', w: ['Doubles Psychic damage', 'Prevents sleep', 'Halves Dragon damage'], ex: 'Grounded Pokémon in Psychic Terrain can\'t be hit by priority moves like Fake Out or Sucker Punch. Psychic moves from grounded users get 1.3× (1.5× in Generation 7).', min: 7 },
    { q: 'How much does terrain boost matching moves from grounded Pokémon?', a: '1.3×', w: ['1.5×', '1.2×', '2×'], ex: 'Electric, Grassy and Psychic Terrain boost matching moves by 1.3× since Generation 8. It was 1.5× in Generation 7.', min: 8 },
    { q: 'In sun, what happens to Fire and Water moves?', a: 'Fire 1.5×, Water 0.5×', w: ['Fire 2×, Water 0×', 'Fire 1.3×, Water 0.75×', 'Only Fire changes'], ex: 'Rain is the reverse: Water 1.5×, Fire 0.5×.', min: 3 },
    { q: 'How long does weather from a move or ability last?', a: '5 turns, 8 with the matching rock', w: ['Until switched out', '3 turns', '8 turns always'], ex: 'Heat Rock, Damp Rock, Smooth Rock and Icy Rock extend weather to 8 turns.', min: 6 },
    { q: 'What does sand do for Rock types?', a: '1.5× Special Defense', w: ['1.5× Defense', '1.2× Speed', 'Immunity to Water'], ex: 'Rock types get 1.5× Special Defense in sand. Non-Rock, Ground and Steel Pokémon take 1/16 chip at the end of each turn.', min: 4 },
    { q: 'What does snow do?', a: 'Ice types get 1.5× Defense, and there\'s no chip damage', w: ['Ice types get 1.5× Special Defense', 'Everyone takes 1/16 chip', 'Ice moves do 1.5×'], ex: 'Snow replaced hail in Generation 9. Blizzard can\'t miss in it.', min: 9 },
    { q: 'In doubles, how much do Reflect and Light Screen reduce damage?', a: 'About a third (0.67×)', w: ['Half (0.5×)', 'A quarter (0.75×)', 'They don\'t work in doubles'], ex: 'In singles screens halve damage. In doubles they multiply it by 2732/4096 (about 0.67×). They last 5 turns, 8 with Light Clay.', min: 5 },
    { q: 'What do Helping Hand\'s priority and boost add up to?', a: '+5 priority, 1.5× the ally\'s move', w: ['+4 priority, 2×', '+3 priority, 1.5×', '0 priority, 1.3×'], ex: 'Helping Hand has the highest priority of common doubles moves, so it boosts your ally even if the ally moves first.', min: 3 },
    { q: 'What does +1 in a stat multiply it by?', a: '1.5×', w: ['1.25×', '2×', '1.33×'], ex: 'Stages: +1 is 1.5×, +2 is 2×, +6 is 4×. −1 is 2/3×, −2 is 0.5×.', min: 3 },
    { q: 'What does −1 Speed (from Icy Wind) do to a Pokémon\'s Speed?', a: '2/3×', w: ['0.5×', '0.75×', '0.9×'], ex: 'One stage down is 2/3. Icy Wind and Electroweb drop both opponents by 1 stage.', min: 3 },
    { q: 'What does burn do?', a: 'Halves physical damage and does 1/16 max HP each turn', w: ['Halves special damage', '1/8 max HP each turn and no other effect', 'Lowers Speed by half'], ex: 'Burn halves the damage of physical moves unless the user has Guts. Since Generation 7 the chip is 1/16. Fire types can\'t be burned.', min: 7 },
    { q: 'How much does paralysis cut Speed in modern games?', a: 'Half', w: ['To a quarter', 'By a third', 'It doesn\'t affect Speed'], ex: 'Since Generation 7 paralysis halves Speed. It was a quarter before. Electric types can\'t be paralyzed.', min: 7 },
    { q: 'In Scarlet/Violet and earlier, what\'s the chance a paralyzed Pokémon can\'t move?', a: '25%', w: ['12.5%', '33%', '50%'], ex: 'Mainline games use 25% full paralysis. Pokémon Champions lowered it to 12.5%.', min: 3, champ: 'not' },
    { q: 'In Pokémon Champions, what\'s the chance a paralyzed Pokémon can\'t move?', a: '12.5% (1 in 8)', w: ['25%', '33%', '0%'], ex: 'Champions lowered full paralysis from 25% to 12.5%. Paralysis still halves Speed.', min: 9, champ: 'only' },
    { q: 'In Pokémon Champions, how long can sleep last?', a: 'At most 2 turns, with a 1 in 3 chance to wake on the second', w: ['1–3 turns, evenly', 'Exactly 2 turns', 'Up to 7 turns'], ex: 'Mainline sleep lasts 1–3 turns. Champions caps it at 2: a sleeping Pokémon usually misses 2 turns, and sometimes just 1.', min: 9, champ: 'only' },
    { q: 'In Pokémon Champions, how long can freeze last?', a: 'At most 2 turns, with a 25% thaw chance each turn', w: ['20% thaw chance with no cap', 'Exactly 3 turns', 'Until hit by a Fire move'], ex: 'Mainline freeze has a 20% thaw chance each turn and no cap. Champions thaws at 25% per turn and guarantees a thaw by the third turn.', min: 9, champ: 'only' },
    { q: 'How do Stat Points work in Pokémon Champions?', a: '66 total, up to 32 in one stat, each adds 1 at Level 50', w: ['510 effort values, 252 max per stat', '50 total, 25 max per stat', '66 total, no cap per stat'], ex: 'Champions replaces effort values with Stat Points and has no individual values, so every Pokémon has perfect stats. 32 Stat Points match 252 effort values.', min: 9, champ: 'only' },
    { q: 'What\'s the most power points (uses) any move can have in Pokémon Champions?', a: '20', w: ['32', '40', '64'], ex: 'Champions caps every move at 20 uses, which matters for long Protect-heavy games.', min: 9, champ: 'only' },
    { q: 'Using Protect twice in a row, what\'s the chance the second one works?', a: '1 in 3', w: ['1 in 2', 'Always', 'Never'], ex: 'Each consecutive successful Protect cuts the chance by 3×: 1/3, then 1/9. Using a different move resets it.', min: 6 },
    { q: 'What does Choice Scarf do?', a: '1.5× Speed, locked into the first move used', w: ['2× Speed, locked into one move', '1.5× Speed, no downside', '1.2× Speed and Attack'], ex: 'Choice Band and Choice Specs give 1.5× Attack or Sp. Atk with the same lock.', min: 4 },
    { q: 'What does Life Orb do?', a: '1.3× damage, user loses 1/10 max HP per attack', w: ['1.5× damage, 1/8 recoil', '1.2× damage, no recoil', '1.3× damage, 1/16 recoil'], ex: 'Sheer Force removes the recoil for moves with secondary effects.', min: 4 },
    { q: 'What does Assault Vest do?', a: '1.5× Special Defense, but no status moves', w: ['1.5× Defense', '1.5× Special Defense and immune to status', 'Blocks Intimidate'], ex: 'The holder can\'t select status moves like Protect, so it\'s for bulky attackers.', min: 6 },
    { q: 'When does a Sitrus Berry activate, and what does it heal?', a: 'At half HP or less; heals 1/4 max HP', w: ['At 1/4 HP; heals 1/2', 'At half HP; heals 1/3', 'End of turn; heals 1/16'], ex: 'Sitrus has healed 1/4 since Generation 4. Since Generation 8, pinch berries like Figy heal 1/3 at 1/4 HP or less.', min: 4 },
    { q: 'What breaks Focus Sash?', a: 'Multi-hit moves, or chip damage before the hit', w: ['Only critical hits', 'Being hit by a super effective move', 'Switching out'], ex: 'Sash only saves a Pokémon at full HP. Sand, a previous hit or the first hit of a multi-hit move takes it below full.', min: 4 },
    { q: 'What does Eviolite do?', a: '1.5× Defense and Special Defense for a Pokémon that can still evolve', w: ['1.5× all stats for a fully evolved Pokémon', '1.2× Defense only', 'Doubles HP'], ex: 'That\'s why Pokémon like Porygon2, Dusclops and Chansey see play.', min: 5 },
    { q: 'Two Pokémon have the exact same Speed. Who moves first?', a: 'Random, 50/50 each turn', w: ['The one that switched in first', 'The one with higher base Speed', 'The player who picked first'], ex: 'Speed ties are re-rolled each turn. This is why speed benchmarks often aim one point above a common number.', min: 1 },
    { q: 'When does a Pokémon use its Mega Evolved Speed?', a: 'On the same turn it Mega Evolves', w: ['From the next turn', 'Only after it moves', 'Never; Mega keeps the old Speed'], ex: 'Since Generation 7 (and in Champions), turn order uses the Mega form\'s Speed on the turn it evolves. In Generation 6 it used the old Speed for that turn.', min: 7 },
    { q: 'How many times can you Mega Evolve per battle?', a: 'Once', w: ['Once per Pokémon', 'Twice', 'Once every 3 turns'], ex: 'One Mega Evolution per battle, and it lasts until the Pokémon faints.', min: 6 },
    { q: 'What does Intimidate do?', a: 'Lowers both opponents\' Attack by 1 on switch-in', w: ['Lowers one opponent\'s Attack by 1', 'Lowers both opponents\' Attack by 2', 'Makes opponents flinch'], ex: 'Defiant and Competitive punish it (+2 Attack or Sp. Atk). Since Generation 8, Inner Focus, Oblivious, Own Tempo and Scrappy block it.', min: 5 },
    { q: 'Which ability blocks Intimidate in Generation 8 and later?', a: 'Inner Focus', w: ['Sturdy', 'Levitate', 'Swift Swim'], ex: 'Inner Focus, Oblivious, Own Tempo and Scrappy block Intimidate since Generation 8. Clear Body and similar abilities also block it.', min: 8 },
    { q: 'Which of these moves also hits your ally?', a: 'Earthquake', w: ['Rock Slide', 'Heat Wave', 'Dazzling Gleam'], ex: 'Earthquake, Surf, Discharge, Bulldoze and Explosion hit everything adjacent, including your ally. Rock Slide, Heat Wave and Dazzling Gleam hit only opponents.', min: 4 },
    { q: 'What does Wide Guard block?', a: 'Moves that hit more than one Pokémon, for your whole side', w: ['All moves on your side for one turn', 'Priority moves', 'Status moves'], ex: 'Wide Guard (+3) blocks spread moves like Heat Wave and Earthquake for both your Pokémon. Quick Guard (+3) blocks priority moves.', min: 5 },
    { q: 'What does Grassy Terrain do?', a: 'Heals grounded Pokémon 1/16 each turn and halves Earthquake', w: ['Boosts Grass moves 1.5× and blocks priority', 'Prevents sleep', 'Halves Dragon damage'], ex: 'It also boosts Grass moves from grounded users 1.3×, and gives Grassy Glide +1 priority.', min: 8 },
    { q: 'What does Misty Terrain do?', a: 'Grounded Pokémon can\'t get statused, and Dragon damage to them is halved', w: ['Blocks priority', 'Heals 1/16 each turn', 'Boosts Fairy moves 1.5×'], ex: 'Electric Terrain stops sleep for grounded Pokémon; Misty stops all non-volatile status.', min: 6 },
    { q: 'Which of these makes a Pokémon immune to Ground moves?', a: 'Air Balloon', w: ['Leftovers', 'Sitrus Berry', 'Safety Goggles'], ex: 'Flying types, Levitate and Air Balloon avoid Ground moves. The balloon pops when the holder is hit.', min: 5 },
    { q: 'When does Sucker Punch fail?', a: 'When the target isn\'t using an attacking move, or already moved', w: ['When the target is faster', 'When the target is Dark type', 'When used twice in a row'], ex: 'Sucker Punch (+1) needs the target to have chosen a damaging move it hasn\'t used yet.', min: 4 },
    { q: 'What priority is Extreme Speed?', a: '+2', w: ['+1', '+3', '+4'], ex: 'Extreme Speed is +2. Most other priority attacks (Aqua Jet, Sucker Punch, Bullet Punch) are +1.', min: 5 },
    { q: 'In Scarlet/Violet, what is the same-type attack bonus when you Terastallize into one of your original types?', a: '2×', w: ['1.5×', '2.5×', '1.2×'], ex: 'Tera into an original type raises that bonus to 2× (Adaptability makes it 2.25×). Tera into a new type gives 1.5× on it and keeps your original same-type bonus.', min: 9, champ: 'not' },
    { q: 'How does Dynamax work in Sword/Shield?', a: '3 turns, doubled HP, moves become Max Moves', w: ['5 turns, 1.5× HP', 'Until the Pokémon faints', '3 turns, doubled Attack'], ex: 'Once per battle. Max Moves set weather, terrain or stat changes, and Max Guard replaces Protect.', min: 8, max: 8 },
    // ---- harder cards (used by Hard and Expert tests) ----
    { hard: true, q: 'What does Unburden do?', a: 'Doubles the user\'s Speed once its held item is used up or lost', w: ['Doubles Speed as long as it holds an item', 'Raises Speed by 1 stage when it eats a berry', 'Doubles Speed after it knocks out a Pokémon'], ex: 'Unburden only activates when the item goes away (eaten, knocked off, used). Starting the battle with no item does nothing.', min: 4 },
    { hard: true, q: 'What does Weakness Policy do?', a: '+2 Attack and +2 Special Attack after being hit super effectively', w: ['+1 Attack and +1 Special Attack after any hit', '+2 Defense and +2 Special Defense after a super effective hit', 'Halves the first super effective hit'], ex: 'It is consumed when triggered. Opponents often avoid hitting the holder super effectively, or use a spread move to break it on purpose.', min: 6 },
    { hard: true, q: 'What does Clear Amulet do?', a: 'Stops other Pokémon from lowering the holder\'s stats, including Intimidate', w: ['Cures status conditions', 'Removes all stat drops at the end of the turn', 'Reflects stat drops back to the user'], ex: 'Clear Amulet works like the ability Clear Body, but as an item.', min: 9 },
    { hard: true, q: 'What does Covert Cloak do?', a: 'Blocks the added effects of opponents\' moves, like Fake Out\'s flinch', w: ['Blocks priority moves', 'Blocks spread damage', 'Hides the holder\'s item from the opponent'], ex: 'Added effects include flinches, stat drops from moves like Icy Wind, and burn or paralysis chances.', min: 9 },
    { hard: true, q: 'What does Safety Goggles do?', a: 'Immunity to powder moves like Spore and Rage Powder, and to weather damage', w: ['Immunity to being put to sleep from any source', 'Blocks Intimidate', 'Raises the accuracy of the holder\'s moves'], ex: 'Safety Goggles lets the holder ignore Rage Powder redirection and Spore. Grass types already have the same powder immunity.', min: 6 },
    { hard: true, q: 'Last Respects is used with 2 fainted teammates. What is its base power?', a: '150', w: ['100', '200', '75'], ex: 'Last Respects starts at 50 and gains 50 for every fainted Pokémon on the user\'s team.', min: 9 },
    { hard: true, q: 'What happens to Weather Ball in sun?', a: 'It becomes a 100 base power Fire-type move', w: ['It becomes a 50 base power Fire-type move', 'It doubles to 150 base power', 'It gets +1 priority'], ex: 'In any weather, Weather Ball doubles to 100 base power and takes the weather\'s type. With sun it\'s also boosted 1.5× as a Fire move.', min: 3 },
    { hard: true, q: 'What is Rock Slide\'s chance to make a target flinch?', a: '30%', w: ['10%', '20%', '50%'], ex: 'It rolls separately for each target, and only matters if the user moves before them.', min: 3 },
    { hard: true, q: 'Tailwind is up on your side and Trick Room is also up. What does Tailwind do for you?', a: 'It doubles your Speed, so you usually move later', w: ['Nothing, because Trick Room cancels Tailwind', 'It lets your side move first anyway', 'It halves your Speed'], ex: 'Trick Room reverses the order using the final Speed numbers, Tailwind included. Faster still means later.', min: 5 },
    { hard: true, q: 'Under Trick Room, what does Choice Scarf do for the holder?', a: 'It makes the holder move later', w: ['It makes the holder move first', 'Nothing, Scarf is ignored under Trick Room', 'It ends Trick Room early'], ex: 'Scarf raises Speed by 1.5×, and under Trick Room a higher Speed moves later.', min: 4 },
    { hard: true, q: 'A paralyzed Pokémon is under Trick Room. What does paralysis do to its turn order?', a: 'It now moves earlier, because it\'s slower', w: ['It now moves later', 'Nothing changes', 'It can never move first'], ex: 'Paralysis halves Speed, and Trick Room lets slower Pokémon go first.', min: 7 },
    { hard: true, q: 'What does Feint do to a Pokémon that is protecting?', a: 'Hits through and removes the Protect', w: ['It fails', 'It hits for half damage', 'It only breaks Wide Guard'], ex: 'Feint has +2 priority and lifts Protect, Detect, Wide Guard and Quick Guard for the turn.', min: 4 },
    { hard: true, q: 'Fake Out targets a grounded Pokémon in Psychic Terrain. What happens?', a: 'It fails', w: ['It hits but can\'t flinch', 'It works normally', 'It hits for half damage'], ex: 'Psychic Terrain blocks opponents\' priority moves against grounded Pokémon. Flying types and Levitate users aren\'t grounded.', min: 7 },
    { hard: true, q: 'One opponent protects from your Heat Wave. How much damage does the other opponent take?', a: '0.75×: the spread reduction still applies', w: ['Full damage', '0.5×', '1.5×'], ex: 'The spread reduction depends on how many targets the move aimed at, not how many it hit.', min: 5 },
    { hard: true, q: 'You Encore a Pokémon that just used Protect. What happens on its next turn?', a: 'It has to use Protect again, which will probably fail', w: ['It can choose any move', 'Encore fails against Protect', 'It loses its turn completely'], ex: 'Encore locks the target into its last move. A second Protect in a row only works 1 time in 3.', min: 6 },
    { hard: true, q: 'Intimidate hits a Pokémon with Mirror Armor. What happens?', a: 'The Attack drop bounces back to the Intimidate user', w: ['It\'s blocked with no other effect', 'Mirror Armor raises its own Attack', 'Nothing, Mirror Armor only stops moves'], ex: 'Mirror Armor reflects stat drops from other Pokémon, including Intimidate.', min: 8 },
    { hard: true, q: 'In rain, what is special about Thunder and Hurricane?', a: 'They never miss', w: ['They do 1.5× damage', 'They get +1 priority', 'They hit both opponents'], ex: 'In sun, Thunder and Hurricane drop to 50% accuracy instead.', min: 5 },
    { hard: true, q: 'What does Chlorophyll do in sun?', a: 'Doubles Speed', w: ['1.5× Speed', 'Raises Speed by 1 stage each turn', 'Heals 1/8 HP each turn'], ex: 'Swift Swim (rain), Sand Rush (sand) and Slush Rush (snow) work the same way.', min: 4 },
    { hard: true, q: 'Which of these moves can still hit a Pokémon behind Wide Guard?', a: 'A single-target move like Close Combat', w: ['Earthquake', 'Heat Wave', 'Rock Slide'], ex: 'Wide Guard only blocks moves that hit more than one Pokémon. Single-target moves go through.', min: 5 },
    { hard: true, q: 'Both opponents are at full HP. Your Focus Sash Pokémon is hit by a two-hit move like Dual Wingbeat. What happens?', a: 'The Sash can be broken by the first hit, and the second can knock it out', w: ['The Sash saves it from both hits', 'Multi-hit moves can\'t break a Sash', 'The Sash activates on the second hit only'], ex: 'Focus Sash only works when the Pokémon is at full HP as the hit lands, so the second hit isn\'t covered.', min: 5 },
    { q: 'What happens to Speed in Trick Room when two Pokémon tie?', a: 'Still a random 50/50', w: ['The faster one goes first', 'The slower one goes first', 'The one that set Trick Room goes first'], ex: 'Trick Room reverses the order but ties stay random.', min: 4 },
  ];
  // existing cards that belong in Hard and Expert tests too
  const HARD_Q = ['What does a critical hit ignore?', 'Which of these is NOT affected by Rage Powder?', 'What does Prankster do?', 'What does Psychic Terrain do?', 'How much does terrain boost', 'In doubles, how much do Reflect', 'Using Protect twice in a row', 'When does a Pokémon use its Mega Evolved Speed?', 'Which ability blocks Intimidate', 'What breaks Focus Sash?', 'When does Sucker Punch fail?', 'In Scarlet/Violet, what is the same-type attack bonus when you Terastallize', 'In Pokémon Champions, how long can sleep last?', 'In Pokémon Champions, how long can freeze last?', 'In Pokémon Champions, what\'s the chance a paralyzed Pokémon can\'t move?', 'What does Grassy Terrain do?', 'What does Misty Terrain do?'];
  VL.MECHANICS.forEach(c => { if (HARD_Q.some(h => c.q.startsWith(h))) c.hard = true; });
})();
