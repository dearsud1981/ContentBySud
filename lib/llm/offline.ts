import {
  RULES,
  type Platform,
  type RawInstagramPost,
  type RawPost,
  type RawPosts,
  type Tone,
} from '../schemas';
import { createRng, hashString, normalizeSeedText, type Rng } from '../seed';
import { hashtagPool } from '../posts';
import { countWords, titleCase, truncateLine } from '../text';

/**
 * Offline template mode: deterministic, rule-based drafts that need no API key.
 * The same idea, tone and variation always produce the same drafts.
 */

interface ToneTemplates {
  headlines: readonly string[];
  linkedinHooks: readonly string[];
  linkedinParagraphs: readonly string[];
  linkedinQuestions: readonly string[];
  tweets: readonly string[];
  instagramOpeners: readonly string[];
  instagramLines: readonly string[];
  instagramCtas: readonly string[];
  visualStyles: readonly string[];
}

const TEMPLATES: Record<Tone, ToneTemplates> = {
  professional: {
    headlines: ['{Short}', '{Short}: What Matters Now', 'Why It Matters: {Short}'],
    linkedinHooks: [
      'Worth your attention: {Idea}',
      'Here is something I want to put on your radar. {Idea}',
      'A quick update with a bigger lesson behind it. {Idea}',
    ],
    linkedinParagraphs: [
      'The people getting this kind of work right share a common habit: they treat it as a discipline, not a side project. They set clear goals, measure progress and adjust quickly when the evidence changes.',
      'Start with the problem being solved. When the purpose is clear, every decision becomes easier to explain to customers, colleagues and stakeholders alike.',
      'Keep the first step small. A focused pilot builds evidence, surfaces risks early and earns the trust needed to scale with confidence.',
      'Measure what matters. Choose two or three indicators that reflect real outcomes, review them on a regular cadence and share the results openly.',
      'Invest in people as much as in process. Tools change quickly, but teams that understand the reasoning behind the work adapt with confidence.',
      'None of this requires a large budget. It requires consistency, honest feedback and the patience to improve a little every single week.',
      'The payoff is credibility. When you can show steady, measurable progress, support and momentum tend to follow naturally.',
    ],
    linkedinQuestions: [
      'How would you approach this in your own work?',
      'What would make this most valuable for you?',
      'What questions would you want answered first?',
    ],
    tweets: [
      '{Idea} The approach that works: clear goals, small pilots, honest metrics. Consistency beats intensity.',
      '{Idea} Define the outcome, test small, review the data, then scale what works.',
      '{Idea} Steady, measurable progress beats big promises every time.',
    ],
    instagramOpeners: ['{Idea} ✨', '💡 {Idea}', '📌 Worth saving: {Idea}'],
    instagramLines: [
      '✅ Start with a clear goal.',
      '📊 Measure what actually matters.',
      '🧪 Test small before you scale.',
      '🤝 Bring your team along early.',
      '📅 Show up consistently, week after week.',
    ],
    instagramCtas: [
      'Save this for later and share it with someone who needs it. 🔖',
      'Which tip will you try first? Tell us in the comments. 👇',
      'Follow for more practical ideas like this. 🚀',
    ],
    visualStyles: [
      'Clean editorial layout with a deep navy-to-teal gradient, subtle geometric grid and bold white headline text',
      'Minimal corporate design with soft blue gradients, crisp line patterns and a confident sans-serif headline',
    ],
  },
  witty: {
    headlines: ['{Short}? Yes, Really', 'Plot Twist: {Short}', '{Short} (No, Seriously)'],
    linkedinHooks: [
      'Hot take incoming, so hold on to your coffee. {Idea}',
      'Plot twist nobody saw coming: {Idea}',
      'Breaking news from the department of good ideas: {Idea}',
    ],
    linkedinParagraphs: [
      'Everyone has an opinion about this. Most of those opinions arrive with a forty-slide deck and zero snacks. Let us fix at least one of those problems today.',
      'Stop overcomplicating it. If your plan needs a glossary, a flowchart and a motivational playlist, it might be three plans wearing a trench coat.',
      'Start small. Tiny experiments are like espresso shots for progress: quick, strong and slightly addictive once you see them work.',
      'Measure the right things. Vanity metrics feel great at parties, but real results are the ones that quietly pay the bills.',
      'Bring people along. Nothing sinks a bright idea faster than a team that discovered it through a calendar invite titled "Quick sync".',
      'The secret ingredient is consistency. Not glamorous, not viral, just annoyingly effective when you keep showing up.',
      'And yes, there will be mistakes. Call them plot development and keep the story moving forward with a grin.',
    ],
    linkedinQuestions: [
      'Be honest: is this a hero move or a beautifully chaotic plan?',
      'What would you add to this survival guide?',
      'What is the funniest lesson something like this has taught you?',
    ],
    tweets: [
      '{Idea} No 40-slide deck required. Just one good idea and the nerve to try it.',
      '{Idea} Like a gym membership, except people actually show up for this one.',
      '{Idea} Me: keep it simple. Also me: 14 tabs open. Still worth it.',
    ],
    instagramOpeners: [
      'POV: {Idea} 😎',
      'Plot twist 🎬 {Idea}',
      'Not to be dramatic, but… {Idea} 👀',
    ],
    instagramLines: [
      '🧠 Overthinking is not a strategy.',
      '☕ Small wins count. So does coffee.',
      '📉 Vanity metrics are just vibes.',
      '🎯 Pick one goal, not seventeen.',
      '🔁 Consistency is the real glow-up.',
    ],
    instagramCtas: [
      'Tag the friend who needs this reality check. 😂',
      'Double tap if you felt personally called out. ❤️',
      'Drop a 🙌 if you are in.',
    ],
    visualStyles: [
      'Playful pop-art composition with a vivid purple-to-pink gradient, bouncy circles and a cheeky bold headline',
      'Bright, energetic collage of colorful geometric shapes on a sunset gradient with a quirky oversized headline',
    ],
  },
  urgent: {
    headlines: ['Act Now: {Short}', '{Short}: Do Not Wait', 'Last Call: {Short}'],
    linkedinHooks: [
      'Time-sensitive: {Idea}',
      'Stop scrolling for a moment. {Idea}',
      'Heads up, this one cannot wait. {Idea}',
    ],
    linkedinParagraphs: [
      'Every week you wait, someone else moves first. Early movers set the standard, win the attention and make it harder for everyone who follows.',
      'Here is the good news: you do not need a perfect plan. You need a first step, taken now, with a clear owner and a firm deadline.',
      'Today: name one goal and write it down. Tomorrow: share it with your team. This week: act on the smallest version that delivers real value.',
      'Track results daily, not quarterly. Fast feedback lets you fix problems before they grow and double down on what is already working.',
      'Remove anything that slows you down. Long approval chains, unclear ownership and endless planning cycles are the real competition.',
      'The cost of acting now is small. The cost of waiting keeps rising, and it rarely shows up until it is too late to catch up.',
      'Momentum is a choice. Make it today, protect it tomorrow and defend it every single day after that.',
    ],
    linkedinQuestions: [
      'What is the one step you will take before Friday?',
      'What is stopping you from acting on this today?',
      'If you started today, where would you begin?',
    ],
    tweets: [
      '{Idea} Do not wait. Pick one goal today and act on it this week.',
      '{Idea} The window is closing. Start now, refine later.',
      'Last call: {Idea} Decide today. Act this week.',
    ],
    instagramOpeners: ['⏰ {Idea}', '🚨 Do not miss this: {Idea}', '🔥 Time-sensitive: {Idea}'],
    instagramLines: [
      '⚡ Decide today.',
      '🚀 Take the first step this week.',
      '📈 Track results every single day.',
      '🧹 Cut anything that slows you down.',
      '🏁 Early movers set the standard.',
    ],
    instagramCtas: [
      'Do not wait. Save this and start today. ⏳',
      'Share this with your team before the week ends. 📣',
      'Comment "NOW" if you are taking action today. 👇',
    ],
    visualStyles: [
      'High-energy design with a fiery red-to-orange gradient, sharp diagonal shapes and a bold countdown-style headline',
      'Dramatic dark backdrop with glowing orange accents, angular geometric patterns and an urgent all-caps headline',
    ],
  },
};

const IDEA_SENTENCE_MAX_CHARS = 220;
const SHORT_MAX_WORDS = 7;
const TRAILING_FILLER = new Set([
  'a',
  'an',
  'and',
  'the',
  'of',
  'to',
  'for',
  'in',
  'on',
  'with',
  'that',
  'which',
  'who',
  'how',
  'our',
  'your',
  'their',
  'my',
]);

/** The first sentence of the idea, capitalized and punctuated, for use as a standalone sentence. */
export function ideaSentence(idea: string): string {
  const first = (idea.split(/(?<=[.!?])\s+/)[0] ?? idea).trim();
  let sentence = truncateLine(first, IDEA_SENTENCE_MAX_CHARS);
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return /[.!?…]["'”’)]*$/.test(sentence) ? sentence : `${sentence}.`;
}

/** A short title-cased phrase from the start of the idea, used in headlines. */
export function shortTitle(idea: string): string {
  const first = (idea.split(/(?<=[.!?])\s+|[,;:–—]\s/)[0] ?? idea).trim();
  const words = first
    .replace(/[.!?…]+$/, '')
    .split(/\s+/)
    .slice(0, SHORT_MAX_WORDS);
  while (words.length > 1 && TRAILING_FILLER.has((words[words.length - 1] ?? '').toLowerCase()))
    words.pop();
  return truncateLine(titleCase(words.join(' ')), 60);
}

function fill(template: string, idea: string): string {
  return template.replaceAll('{Idea}', ideaSentence(idea)).replaceAll('{Short}', shortTitle(idea));
}

function buildHeadline(t: ToneTemplates, idea: string, rng: Rng): string {
  return truncateLine(fill(rng.pick(t.headlines), idea), RULES.headlineMaxChars);
}

function buildLinkedIn(t: ToneTemplates, idea: string, rng: Rng, hashtags: string[]): RawPost {
  const hook = fill(rng.pick(t.linkedinHooks), idea);
  const question = rng.pick(t.linkedinQuestions);
  const order = rng.shuffle(t.linkedinParagraphs.map((_, index) => index));
  const chosen: number[] = [];
  const wordsOf = (indices: number[]): number =>
    countWords(hook) +
    countWords(question) +
    indices.reduce((sum, i) => sum + countWords(t.linkedinParagraphs[i] ?? ''), 0);

  for (const index of order) {
    if (wordsOf(chosen) >= RULES.linkedin.minWords + 15) break;
    chosen.push(index);
  }
  while (wordsOf(chosen) > RULES.linkedin.maxWords && chosen.length > 1) chosen.pop();
  chosen.sort((a, b) => a - b);

  const paragraphs = chosen.map((i) => t.linkedinParagraphs[i] ?? '');
  const body = [hook, ...paragraphs, question].join('\n\n');
  return { headline: buildHeadline(t, idea, rng), body, hashtags };
}

function buildTweet(t: ToneTemplates, idea: string, rng: Rng, hashtags: string[]): RawPost {
  return { headline: buildHeadline(t, idea, rng), body: fill(rng.pick(t.tweets), idea), hashtags };
}

function buildInstagram(
  t: ToneTemplates,
  idea: string,
  rng: Rng,
  hashtags: string[],
): RawInstagramPost {
  const opener = fill(rng.pick(t.instagramOpeners), idea);
  const lines = rng.shuffle(t.instagramLines).slice(0, 3);
  const cta = rng.pick(t.instagramCtas);
  const headline = buildHeadline(t, idea, rng);
  const style = rng.pick(t.visualStyles);
  return {
    headline,
    body: [opener, lines.join('\n'), cta].join('\n\n'),
    hashtags,
    visualConcept: `${style}, inspired by "${shortTitle(idea)}".`,
  };
}

/**
 * Each pick rotates by `variation`, so every regenerate changes the chosen
 * templates while the same idea, tone and variation stay reproducible.
 */
function variantRng(seed: number, variation: number): Rng {
  const slots = createRng(seed);
  const mixed = createRng(seed ^ Math.imul(variation + 1, 0x9e3779b1));
  return {
    ...mixed,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      const index = (Math.floor(slots.next() * items.length) + variation) % items.length;
      return items[index] as T;
    },
  };
}

/** Generates raw drafts for the requested platforms without any network access. */
export function generateOffline(
  idea: string,
  tone: Tone,
  platforms: readonly Platform[],
  variation = 0,
): Partial<RawPosts> {
  const templates = TEMPLATES[tone];
  const baseSeed = hashString(`${normalizeSeedText(idea)}|${tone}`);
  const result: Partial<RawPosts> = {};
  for (const platform of platforms) {
    // Each platform gets its own stream so regenerating one never shifts the others.
    const rng = variantRng(baseSeed ^ hashString(platform), variation);
    const hashtags = hashtagPool(idea, tone, platform);
    if (platform === 'linkedin') result.linkedin = buildLinkedIn(templates, idea, rng, hashtags);
    if (platform === 'x') result.x = buildTweet(templates, idea, rng, hashtags);
    if (platform === 'instagram') result.instagram = buildInstagram(templates, idea, rng, hashtags);
  }
  return result;
}
