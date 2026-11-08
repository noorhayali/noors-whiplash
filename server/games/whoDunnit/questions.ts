// Who Dunnit? question pairs. The crew answers `crew`; the secret impostor answers `imp`.
// Good pairs have answers that *could* pass for each other at a glance. Append only.
export interface Pair {
  id: string;
  crew: string;
  imp: string;
  spicy?: boolean;
}

const RAW: Omit<Pair, 'id'>[] = [
  { crew: 'How many people have you kissed?', imp: 'How many countries have you been to?', spicy: true },
  { crew: 'How many times a day do you think about sex?', imp: 'How many cups of coffee do you drink a week?', spicy: true },
  { crew: 'At what age did you have your first kiss?', imp: 'At what age did you get your first phone?', spicy: true },
  { crew: 'How many drinks until you text your ex?', imp: 'How many slices of pizza can you eat in one sitting?', spicy: true },
  { crew: 'Rate your skills in bed out of 10.', imp: 'Rate your cooking out of 10.', spicy: true },
  { crew: 'How many dating apps have you been on?', imp: 'How many streaming services do you pay for?', spicy: true },
  { crew: 'The weirdest place you’ve hooked up', imp: 'The weirdest place you’ve fallen asleep', spicy: true },
  { crew: 'A celebrity you’d sleep with', imp: 'A celebrity you’d want as your best friend', spicy: true },
  { crew: 'Your go-to drunk food', imp: 'Your go-to breakfast', spicy: true },
  { crew: 'How many exes are you still friends with?', imp: 'How many houseplants have you killed?', spicy: true },
  { crew: 'What you’d wear on a first date', imp: 'What you’d wear to a funeral', spicy: true },
  { crew: 'How many shots before you start dancing?', imp: 'How many hours of sleep do you need?', spicy: true },
  { crew: 'The most embarrassing place you’ve thrown up', imp: 'The most embarrassing place you’ve tripped and fallen', spicy: true },
  { crew: 'What’s in your nightstand drawer?', imp: 'What’s in your junk drawer?', spicy: true },
  { crew: 'Your type, in one word', imp: 'Your favourite weather, in one word', spicy: true },
  { crew: 'The longest you’ve gone without showering (days)', imp: 'The longest you’ve gone without calling your mom (days)', spicy: true },
  { crew: 'A body part you’d show off', imp: 'A body part you’d get insured', spicy: true },
  { crew: 'How many people in this room would you date?', imp: 'How many people in this room would survive a zombie apocalypse?', spicy: true },
  { crew: 'The worst pickup line that would work on you', imp: 'The worst excuse that would work on your boss', spicy: true },
  { crew: 'How many hours could you go without sex?', imp: 'How many hours could you go without food?', spicy: true },
  { crew: 'How many hours of sleep do you need?', imp: 'How many hours of TV do you watch a day?' },
  { crew: 'How many cups of coffee do you drink a day?', imp: 'How many glasses of water do you drink a day?' },
  { crew: 'Your dream vacation spot', imp: 'Where you’d hide in a zombie apocalypse' },
  { crew: 'Your favourite pizza topping', imp: 'Your favourite ice cream flavour' },
  { crew: 'How many unread emails do you have?', imp: 'How many photos are on your phone?' },
  { crew: 'Your spirit animal', imp: 'An animal you could beat in a fight' },
  { crew: 'The best age to be', imp: 'The age you want to retire' },
  { crew: 'How many hours could you go without your phone?', imp: 'How many days could you survive in the wild?' },
  { crew: 'Your ideal number of kids', imp: 'Your ideal number of pets' },
  { crew: 'The last thing you bought online', imp: 'The last thing you ate' },
  { crew: 'Your go-to karaoke song', imp: 'A song you want played at your funeral' },
  { crew: 'How many times do you hit snooze?', imp: 'How many times a day do you check the weather?' },
  { crew: 'Rate your driving out of 10.', imp: 'Rate your singing out of 10.' },
  { crew: 'One thing you’d bring to a desert island', imp: 'One thing you’d bring to a sleepover' },
  { crew: 'How much do you spend on takeout a month ($)?', imp: 'How much do you spend on clothes a month ($)?' },
  { crew: 'A movie you could watch on repeat', imp: 'A movie that made you cry' },
  { crew: 'How many tabs are open on your phone right now?', imp: 'How many apps are on your home screen?' },
  { crew: 'The worst chore', imp: 'The worst school subject' },
];

export const PAIRS: Pair[] = RAW.map((p, i) => ({ ...p, id: `who-${i}` }));
