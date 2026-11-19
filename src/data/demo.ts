/**
 * A fictional demo squad and three past sessions, so a first-time visitor can
 * see flags, player history and the cloud reports straight away. Every name is
 * invented; the sessions are marked `demo` and are never synced.
 */
import { addDays, londonDate } from '../lib/dates';
import type { Player, PlayerObservation, Session } from '../lib/types';

export const DEMO_GROUP = 'Under 9s';

const ROSTER: Array<[string, string[]]> = [
  ['Ollie', ['Oliver']],
  ['Amara', []],
  ['Jayden', ['Jay']],
  ['Freya', []],
  ['Kai', []],
  ['Isla', []],
  ['Rhys', []],
  ['Maisie', ['Mais']],
  ['Theo', ['Theodore']],
  ['Nia', []],
  ['Alfie', ['Alfred']],
  ['Seren', []],
];

export function demoPlayers(now = Date.now()): Player[] {
  return ROSTER.map(([name, aliases], i) => ({
    id: `demo-p${i + 1}`,
    token: `P${String(i + 1).padStart(2, '0')}`,
    name,
    aliases,
    group: DEMO_GROUP,
    createdAt: now,
  }));
}

type Obs = [number, string, string, string, string[]];

// [player index, strength, next step, praise, chips]
const PAST: Array<{ daysAgo: number; focus: string; summary: string; obs: Obs[] }> = [
  {
    daysAgo: 16,
    focus: 'Passing and receiving',
    summary: 'Good energy in the passing squares. Most of the group can now pass with the inside of the foot; receiving on the back foot is the next step for the whole group.',
    obs: [
      [1, 'Opened her body to receive and passed first time twice in the rondo.', 'Receive on the back foot so she can play forward quicker.', 'Amara, your first-time passes in the rondo were brilliant!', ['passing']],
      [2, 'Called for the ball loudly and moved into space after passing.', 'Use the outside of the foot to pass on the move.', 'Jayden, you kept moving after every pass. Great stuff!', ['talk']],
      [3, 'Tidy passing with her right foot all session.', 'Practise passing with her left foot in warm-ups.', 'Freya, your passes were so accurate today!', ['passing', 'weak-foot']],
      [4, 'Stayed calm under pressure in the end game.', 'Look up before receiving to spot the free player.', 'Kai, you stayed really calm with the ball today!', ['first-touch']],
      [6, 'Brave in the 3v1, kept trying to win it back.', 'Pass early rather than dribbling into traffic.', 'Rhys, you never gave up trying to win the ball back!', ['brave', 'effort']],
      [8, 'Helped a younger player find the right square in the drill.', 'Work on receiving across his body.', 'Theo, you were a fantastic teammate today!', ['teammate']],
      [11, 'Lovely soft first touch, killed the ball dead every time.', 'Take the first touch forward into space.', 'Seren, your first touch was magic today!', ['first-touch']],
    ],
  },
  {
    daysAgo: 9,
    focus: '1v1 attacking',
    summary: 'The group loved the 1v1 gates. Plenty of brave dribbling; the next step is changing speed after a move, not just doing the move.',
    obs: [
      [1, 'Beat her defender with a step-over and drove into the gate.', 'Change speed straight after the skill.', 'Amara, that step-over was class!', ['brave', 'confidence']],
      [3, 'Kept the ball close with lots of small touches.', 'Try going past the defender on her left side.', 'Freya, your close control was ace today!', ['weak-foot']],
      [5, 'Scored in the end game after beating two players.', 'Pass when a teammate is free instead of always dribbling.', 'Isla, what a goal at the end!', ['brave']],
      [7, 'Tried new moves every turn and wasn\'t afraid to lose it.', 'Keep her head up as she dribbles.', 'Maisie, you were so brave trying new moves!', ['brave', 'scanning']],
      [9, 'Defended her gate well even though it was an attacking session.', 'Be braver taking defenders on.', 'Nia, you were really determined today!', ['tackle', 'confidence']],
      [10, 'Quick feet and a great drop of the shoulder.', 'Finish the move with a shot or pass, not another skill.', 'Alfie, that shoulder drop fooled everyone!', ['first-touch']],
      [11, 'Used her body to protect the ball well.', 'Accelerate away after shielding.', 'Seren, you were so strong on the ball today!', ['brave']],
    ],
  },
  {
    daysAgo: 2,
    focus: 'Defending as a team',
    summary: 'Hard session on staying compact. The group is learning to shout "press" together. Several players dive in too early; staying on their feet is next week\'s theme.',
    obs: [
      [2, 'Organised the others and shouted "press" at the right time.', 'Stay on his feet when the attacker slows down.', 'Jayden, you were like a captain out there!', ['talk', 'defending']],
      [3, 'Read the pass and intercepted three times.', 'Keep using her left foot when clearing the ball.', 'Freya, those interceptions were superb!', ['tackle', 'weak-foot']],
      [4, 'Tracked back every time the ball was lost.', 'Get side-on when defending 1v1.', 'Kai, your effort tracking back was amazing!', ['effort']],
      [6, 'Strong, clean tackles and won the ball back lots.', 'Pass forward quickly after winning it.', 'Rhys, your tackling was top class today!', ['tackle']],
      [8, 'Covered for a teammate who was beaten.', 'Communicate earlier so the team knows he is covering.', 'Theo, you saved us with that cover tackle!', ['teammate', 'talk']],
      [9, 'Much braver in the duels than last week.', 'Keep that confidence when she has the ball too.', 'Nia, you were so much braver today. Well done!', ['brave']],
      [10, 'Listened to every instruction and put it into practice.', 'Watch the ball, not the attacker\'s feet.', 'Alfie, you listened brilliantly today!', ['listened']],
    ],
  },
];

export function demoSessions(players: Player[], today = londonDate(), now = Date.now()): Session[] {
  return PAST.map((s, si) => {
    const date = addDays(today, -s.daysAgo);
    const observations: PlayerObservation[] = s.obs.map(([i, strength, nextStep, praise]) => ({
      playerId: players[i].id,
      strength,
      nextStep,
      praise,
    }));
    const createdAt = now - s.daysAgo * 86_400_000;
    return {
      id: `demo-s${si + 1}`,
      date,
      group: DEMO_GROUP,
      focus: s.focus,
      // Everyone attended; Ollie (index 0) was there but never mentioned, which raises a "quiet" flag.
      attendees: players.map((p) => p.id),
      notes: s.obs.map(([i, , , , chips]) => ({ playerId: players[i].id, chips, text: '' })),
      generalNotes: '',
      structured: { observations, summary: s.summary, flags: [], source: 'demo', sentText: '', model: 'demo', createdAt },
      createdAt,
      updatedAt: createdAt,
      demo: true,
    };
  });
}
