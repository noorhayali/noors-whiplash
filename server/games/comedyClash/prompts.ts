// Comedy Clash prompt database. All prompts are original.
//
// Two decks:
//   spicy  — 18+ party deck (crude, raunchy, dark). Never punches at groups of people.
//   family — clean but still weird; safe with parents/kids in the room.
// Spicy rooms draw from BOTH decks (mostly spicy); family rooms draw only from family.
//
// To add prompts: append to any array (or add a category). IDs come from the
// category key + index, so append rather than reorder to keep IDs stable.

export type Deck = 'spicy' | 'family';

export interface Prompt {
  id: string;
  category: string;
  deck: Deck;
  text: string;
}

const SPICY: Record<string, string[]> = {
  bedroom: [
    'The worst thing to yell during sex',
    'A terrible safe word',
    'The least sexy thing to whisper in someone’s ear',
    'A rejected flavour of lube',
    'The worst-selling sex toy of all time',
    'A sex position named after an IKEA product',
    'What your neighbours think is happening when they hear you through the wall',
    'The worst thing to find under a hotel bed',
    'Your OnlyFans would be 100% about ___',
    'An unsexy noise you make during sex',
    'The worst thing to accidentally sext your mom',
    'What happens at the world’s saddest orgy',
    'A bad name for a strip club',
    'The least effective aphrodisiac',
    'Something you should never say the first time you see someone naked',
    'What your bed would say if it testified against you in court',
    'The porn parody title of a boring documentary',
    'The real reason it’s called a “booty call”',
    'A terrible thing to have tattooed on your lower back',
    'The fine print on the condom box nobody reads',
    'The most disappointing thing to unwrap on a honeymoon',
    'A sex tip from your grandpa',
    'What your vibrator would put in its two weeks’ notice',
    'The worst thing to say after “I’ve never done this before”',
  ],
  drunk: [
    'The worst thing to drunk-text your boss at 3 a.m.',
    'What you lost at the last party besides your dignity',
    'A terrible name for a cocktail',
    'Something you should never say to a bouncer',
    'The real reason you woke up in a bathtub',
    'What your drunk self promised the Uber driver',
    'The worst rule in a drinking game',
    'The worst thing to find in your pocket the morning after',
    'A hangover cure that definitely does not work',
    'What the bartender wrote about you in their diary',
    'The last thing you remember before the blackout',
    'What you scream at a karaoke bar at 2 a.m.',
    'The most embarrassing thing to throw up on',
    'A terrible name for a frat',
    'The worst thing to say while being carried out of a wedding',
    'What your 4th tequila shot thinks it can do',
    'A tattoo you’d get after nine shots',
    'The worst drunk purchase to discover on your credit card',
  ],
  bodily: [
    'The worst place to discover you have diarrhea',
    'Your fart’s official job title',
    'The least comforting thing to hear during a prostate exam',
    'The worst thing to say as you wake up from a colonoscopy',
    'What your toilet has seen that it can never unsee',
    'The worst thing to clog the office toilet with',
    'A terrible name for a hemorrhoid cream',
    'What your butt would say if it could talk',
    'The worst thing to hear from the next bathroom stall',
    'The gym locker room smell, described by a wine expert',
    'A medical condition that sounds made up but should exist',
    'The worst thing to say to your proctologist',
    'What your doctor writes in your file when you leave the room',
    'The most humiliating way to break a bone',
    'Your body’s most passive-aggressive message after age 30',
  ],
  dating: [
    'The worst thing to bring on a first date',
    'A Tinder bio that guarantees zero matches',
    'The real reason your ex left',
    'A red flag you’d ignore if they were hot enough',
    'The worst thing to say after a first kiss',
    'Your dating history, as a true-crime podcast title',
    'What you text instead of “I love you” when you panic',
    'An unforgivable thing to do at your ex’s wedding',
    'The worst thing to find in your partner’s Notes app',
    'What your situationship actually is, legally',
    'A dating-app prompt nobody should answer honestly',
    'The worst thing to moan by accident',
    'Your love language, if it was honest',
    'The worst opening line to slide into someone’s DMs',
    'A terrible thing to say while meeting the parents',
    'What your ex is telling their new partner about you',
    'The real reason you’re still single',
    'The worst gift for a one-night stand',
  ],
  work: [
    'The real reason HR wants to “have a quick chat”',
    'The worst thing to say in your exit interview',
    'A team-building exercise that ended in a lawsuit',
    'The worst thing to accidentally screen-share',
    'A Slack status that gets you fired',
    'What your LinkedIn says vs. what you actually do',
    'The most satisfying way to quit your job',
    'What’s really growing in the back of the office fridge',
    'The worst thing to say on a call when you think you’re muted',
    'A suspicious thing to expense',
    'The office Secret Santa gift that ended careers',
    'Your honest answer to “Where do you see yourself in five years?”',
  ],
  dark: [
    'The worst last words',
    'The worst thing to put in a eulogy',
    'Your honest cause of death on an autopsy report',
    'How you’d die in a horror movie, honestly',
    'The worst thing to say at your own intervention',
    'What the priest heard in your confession that made him quit',
    'A terrible thing to write in a funeral guestbook',
    'What you’d come back to haunt your friends for',
    'The worst thing to say to a cop with your hands up',
    'A crime you would 100% get caught committing',
    'What your therapist tells her therapist about you',
    'The worst thing to hear from your getaway driver',
  ],
  family: [
    'What grandma found in your nightstand',
    'The worst thing to say during grace at Thanksgiving',
    'The real reason you’re not invited to Christmas anymore',
    'What your parents’ bedside drawer is hiding',
    'The worst gift to give your mother-in-law',
    'Your family group chat’s darkest secret',
    'What’s in your dad’s desktop folder called “Taxes 2009”',
    'The worst word your toddler could repeat at daycare',
    'What your parents actually did on “date night”',
    'The real reason your aunt has three ex-husbands',
  ],
  shameful: [
    'The most illegal thing you’ve done in an IKEA',
    'Something you should never Google on the work laptop',
    'What a Ring camera caught you doing at 2 a.m.',
    'What your Spotify Wrapped accidentally exposed',
    'Your most cursed search-history entry',
    'The worst thing to whisper to your sleeping roommate',
    'What’s actually in grandma’s “secret recipe”',
    'A cult you would absolutely join for the snacks',
    'What you did in the airplane bathroom',
    'The weirdest thing you’ve done for $50',
    'The most embarrassing thing to get caught doing by your Alexa',
  ],
};

const FAMILY: Record<string, string[]> = {
  everyday: [
    'A suspiciously specific thing to put on your resume',
    'What your dog tells other dogs about you',
    'The worst thing to name a hamster',
    'A self-help book that ruins lives',
    'What your Roomba has seen',
    'A rejected IKEA product and what it does',
    'The worst thing to say right after a plane lands',
    'Signs your Airbnb host is a ghost',
    'The worst thing to find in a bag of chips',
    'A useless life hack your uncle swears by',
    'What your cat does with your credit card',
    'What the self-checkout machine really thinks of you',
    'The worst flavour of sparkling water',
    'A terrible name for a WiFi network',
    'The least relaxing spa treatment',
    'What your houseplants gossip about',
    'Your neighbour’s weirdest hobby',
    'The worst item to bring through airport security',
    'An unhinged rule for a group chat',
    'The most passive-aggressive email sign-off',
    'What your car says about you behind your back',
    'The worst thing to hear from your hairdresser',
    'The worst ingredient to put in a smoothie',
    'What the smoke detector is really complaining about at 4 a.m.',
  ],
  absurd: [
    'The worst superpower to get at age 40',
    'Why the dinosaurs actually went extinct',
    'What pigeons are plotting',
    'An Olympic sport for lazy people',
    'What aliens wrote in their one-star review of Earth',
    'A ghost’s most petty haunting',
    'What the Moon complains about',
    'The worst way to find out you’re a robot',
    'A sport made worse by adding geese',
    'A terrible villain origin story',
    'What really happens in the Bermuda Triangle',
    'What raccoons do at their annual conference',
    'A shocking twist at the end of a cooking show',
    'A new emoji nobody asked for',
  ],
  awkward: [
    'The worst thing to say during a job interview',
    'A bad excuse for being three hours late',
    'The worst thing to bring to a potluck',
    'The worst way to propose',
    'A suspicious thing for your boss to say on a Friday',
    'The worst thing to discover halfway through a road trip',
    'What your mom actually means by “we’ll see”',
    'The worst thing to say when your friend shows you their newborn',
    'The worst thing to yell at a magician',
    'The worst thing to say to a mime',
    'A terrible motto for a hospital',
    'A bad name for a funeral home',
    'A bad name for a retirement home',
    'A bad name for a yacht',
    'The worst thing to hear from a pilot',
    'A terrible slogan for a dentist',
    'What the GPS says when it finally gives up on you',
    'A terrible new Hallmark holiday',
    'A rejected Girl Scout cookie flavour',
    'The real reason Mondays exist',
  ],
};

const FINAL_SPICY = [
  'Write the worst possible wedding vow',
  'The title of your autobiography, written by your ex',
  'Describe your sex life as a one-star Yelp review',
  'Write the text you’d send from jail to get bailed out',
  'What the group chat would say if you died tonight',
  'Pitch the worst reality show of all time',
  'Write a fortune cookie for a strip club',
  'Describe your last breakup in a movie-trailer voice',
  'Write your tombstone, as chosen by the people in this room',
  'The one thing you’d never admit to this room',
  'Write a terrible toast for your best friend’s divorce party',
  'The new deadly sin, inspired by someone in this room',
];

const FINAL_FAMILY = [
  'Write a one-star review of planet Earth',
  'The headline of tomorrow’s newspaper if everything went wrong',
  'Write the worst opening line for a wedding speech',
  'What will archaeologists get completely wrong about us?',
  'The last text message sent before the robots took over',
  'Write the official motto of this exact group of players',
  'The one sentence that would instantly end any party',
  'The worst thing to engrave on a trophy',
  'Write a fortune cookie that ruins someone’s whole day',
  'Invent a brand-new holiday and how we celebrate it',
];

function build() {
  const regular: Prompt[] = [];
  const add = (deck: Deck, cats: Record<string, string[]>) => {
    for (const [category, list] of Object.entries(cats)) {
      list.forEach((text, i) => regular.push({ id: `${deck}-${category}-${i}`, category, deck, text }));
    }
  };
  add('spicy', SPICY);
  add('family', FAMILY);
  const final: Prompt[] = [
    ...FINAL_SPICY.map((text, i) => ({ id: `final-spicy-${i}`, category: 'final', deck: 'spicy' as Deck, text })),
    ...FINAL_FAMILY.map((text, i) => ({ id: `final-family-${i}`, category: 'final', deck: 'family' as Deck, text })),
  ];
  return { regular, final };
}

export const PROMPTS = build();
export const CATEGORY_NAMES = [...Object.keys(SPICY), ...Object.keys(FAMILY)];

/** Spicy rooms: spicy deck + family deck. Family rooms: family deck only. */
export function deckFor(pool: Prompt[], spicy: boolean): Prompt[] {
  return spicy ? pool : pool.filter((p) => p.deck === 'family');
}
