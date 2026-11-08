// Doodle Duel words. Keep them drawable in ~60 seconds. Append only (IDs are positional).
export const SPICY_WORDS = [
  'walk of shame', 'hangover', 'skinny dipping', 'beer pong', 'booty call', 'hickey', 'lap dance', 'strip poker',
  'hot tub', 'handcuffs', 'whipped cream', 'thong', 'nudist beach', 'bachelorette party', 'drunk text', 'tequila shot',
  'one night stand', 'pole dancing', 'sugar daddy', 'beer belly', 'condom', 'pregnancy test', 'dad bod', 'speedo',
  'plunger', 'butt dial', 'lingerie', 'mile high club', 'spanking', 'keg stand', 'eggplant', 'peach', 'blackout',
  'toilet', 'fart', 'sexting', 'boob job', 'cougar', 'stripper', 'bra', 'vomit', 'friends with benefits', 'naked',
  'kiss', 'wet t-shirt', 'hot dog', 'melons', 'bikini', 'nipple', 'cheating',
];

export const FAMILY_WORDS = [
  'pizza', 'volcano', 'snowman', 'haunted house', 'dinosaur', 'rollercoaster', 'selfie', 'sunburn', 'mermaid', 'zombie',
  'toaster', 'octopus', 'camping', 'traffic jam', 'wedding cake', 'astronaut', 'bigfoot', 'unicorn', 'alarm clock',
  'lighthouse', 'pirate', 'tornado', 'giraffe', 'skateboard', 'hamburger', 'spider web', 'ghost', 'dentist', 'robot',
  'cactus', 'ice cream', 'fireworks', 'submarine', 'scarecrow', 'vampire', 'rainbow', 'ninja', 'bowling', 'jellyfish',
  'sloth', 'mustache', 'treehouse', 'snail', 'penguin', 'waterfall',
];

/** Extra spellings accepted as correct. */
export const ALIASES: Record<string, string[]> = {
  'walk of shame': ['walk of shame'],
  'beer pong': ['beerpong'],
  'hot tub': ['hottub', 'jacuzzi'],
  'tequila shot': ['tequila', 'shot of tequila'],
  'one night stand': ['one nighter', '1 night stand'],
  'dad bod': ['dadbod'],
  'mile high club': ['mile high'],
  'keg stand': ['kegstand'],
  'friends with benefits': ['fwb'],
  'wet t-shirt': ['wet tshirt', 'wet t shirt', 'wet shirt'],
  'hot dog': ['hotdog'],
  'boob job': ['boobjob', 'breast implants'],
  'butt dial': ['buttdial', 'pocket dial'],
  'ice cream': ['icecream'],
  'spider web': ['spiderweb', 'cobweb'],
  'treehouse': ['tree house'],
  'mustache': ['moustache'],
  'selfie': ['self pic'],
};
