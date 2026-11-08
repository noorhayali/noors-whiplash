// Fib Factory facts. Every one of these is TRUE — the game only works if the real
// answer is real. Keep answers short. `alt` = other spellings that also count as the
// truth (players can't submit those as lies). `spicy` = 18+ only.
//
// Append new facts at the end (IDs are positional).

export interface Fact {
  id: string;
  q: string; // use ___ for the blank
  a: string;
  alt?: string[];
  spicy?: boolean;
}

const RAW: Omit<Fact, 'id'>[] = [
  { q: 'A group of flamingos is called a ___.', a: 'flamboyance' },
  { q: 'A group of crows is called a ___.', a: 'murder' },
  { q: 'Wombats are famous for pooping ___.', a: 'cubes', alt: ['cube', 'cube shaped', 'squares'] },
  { q: 'The national animal of Scotland is the ___.', a: 'unicorn' },
  { q: 'In 1932, Australia’s army fought a “war” against ___ — and lost.', a: 'emus', alt: ['emu'] },
  { q: 'In the 1830s, ketchup was sold in the US as a ___.', a: 'medicine', alt: ['cure', 'remedy'] },
  { q: 'An octopus has ___ hearts.', a: 'three', alt: ['3'] },
  { q: 'Cleopatra lived closer in time to the ___ than to the building of the Great Pyramid.', a: 'moon landing', alt: ['first moon landing', 'iphone'] },
  { q: 'A “jiffy” is a real unit of ___.', a: 'time' },
  { q: 'Archaeologists have found 3,000-year-old ___ in Egyptian tombs that was still edible.', a: 'honey' },
  { q: 'The inventor of the Pringles can had some of his ashes buried in a ___.', a: 'pringles can', alt: ['pringle can', 'pringles tube'] },
  { q: 'Sea otters hold hands while they ___ so they don’t drift apart.', a: 'sleep', alt: ['are sleeping', 'nap'] },
  { q: 'The first product ever scanned with a barcode was a pack of ___.', a: 'gum', alt: ['wrigleys gum', 'chewing gum', 'wrigleys'] },
  { q: 'The dot over a lowercase “i” is called a ___.', a: 'tittle' },
  { q: 'Napoleon was once attacked by a horde of ___.', a: 'rabbits', alt: ['bunnies', 'rabbit'] },
  { q: 'In Switzerland, it’s illegal to own just one ___ because they get lonely.', a: 'guinea pig', alt: ['guinea pigs'] },
  { q: 'The shortest war in recorded history lasted about ___.', a: '38 minutes', alt: ['40 minutes', '45 minutes', 'thirty eight minutes'] },
  { q: 'The longest recorded flight of a chicken is ___ seconds.', a: '13', alt: ['thirteen'] },
  { q: 'Bubble wrap was originally invented to be ___.', a: 'wallpaper' },
  { q: 'Play-Doh was originally sold as ___ cleaner.', a: 'wallpaper' },
  { q: 'The tallest person ever recorded was ___ tall.', a: '8 feet 11 inches', alt: ['8 11', '8ft 11', '272 cm', '2 72 m'] },
  { q: 'Queen Elizabeth II trained as a ___ during World War II.', a: 'mechanic', alt: ['truck mechanic', 'driver'] },
  { q: 'The cigarette lighter was invented before the ___.', a: 'match', alt: ['matches', 'matchstick'] },
  { q: 'Oxford University is older than the ___ Empire.', a: 'aztec' },
  { q: 'An Australian man once listed ___ for sale on eBay.', a: 'new zealand' },
  { q: 'The medical term for a hangover is ___.', a: 'veisalgia' },
  { q: 'The world’s most expensive coffee is made from beans that have been eaten and pooped out by a ___.', a: 'civet', alt: ['civet cat'], spicy: false },
  { q: 'A day on Venus is longer than a ___ on Venus.', a: 'year' },
  { q: 'A shrimp’s heart is in its ___.', a: 'head' },
  { q: 'Kangaroos can’t walk ___.', a: 'backwards', alt: ['backward'] },
  { q: 'The German word “Kummerspeck” — weight gained from emotional eating — literally means “___.”', a: 'grief bacon', alt: ['sorrow bacon', 'sadness bacon'] },
  { q: 'Scotland has over 400 words for ___.', a: 'snow' },
  { q: 'The fear of long words is called “hippopotomonstrosesquippedalio___.”', a: 'phobia' },
  { q: 'In seahorses, the ___ give birth.', a: 'males', alt: ['male', 'dads', 'fathers', 'men'] },
  { q: 'Coca-Cola’s original recipe contained ___.', a: 'cocaine', alt: ['coca leaves', 'coca'] },
  { q: 'Some Victorian women ate ___ to make their skin look pale.', a: 'arsenic' },
  { q: 'Viagra was originally developed to treat ___.', a: 'chest pain', alt: ['angina', 'heart disease', 'high blood pressure', 'blood pressure'], spicy: true },
  { q: 'Graham crackers were invented by a preacher who hoped a bland diet would stop people from ___.', a: 'masturbating', alt: ['masturbation', 'having sex', 'sex', 'lust'], spicy: true },
  { q: 'A duck’s penis is shaped like a ___.', a: 'corkscrew', alt: ['spiral', 'screw', 'coil'], spicy: true },
  { q: 'Relative to body size, the animal with the longest penis is the ___.', a: 'barnacle', alt: ['barnacles'], spicy: true },
  { q: 'Iceland has a museum dedicated entirely to ___.', a: 'penises', alt: ['penis', 'dicks', 'phallology'], spicy: true },
  { q: 'Ancient Egyptians used ___ dung as a form of birth control.', a: 'crocodile', alt: ['croc'], spicy: true },
  { q: 'The world record for the longest kiss is over ___ hours.', a: '58', alt: ['fifty eight'], spicy: true },
  { q: 'Before modern toothpaste, ancient Romans whitened their teeth with ___.', a: 'urine', alt: ['pee', 'piss'], spicy: true },
  { q: 'A sloth can hold its breath longer than a ___.', a: 'dolphin', alt: ['dolphins'] },
  { q: 'The lining of your stomach replaces itself every few ___.', a: 'days', alt: ['day'] },
];

export const FACTS: Fact[] = RAW.map((f, i) => ({ ...f, id: `fib-${i}` }));
