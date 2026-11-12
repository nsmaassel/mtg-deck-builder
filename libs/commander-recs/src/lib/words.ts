/** Creature types whose plural is the word itself. */
const UNINFLECTED = new Set([
  'Merfolk', 'Treefolk', 'Kithkin', 'Eldrazi', 'Vedalken', 'Myr', 'Kavu', 'Zubera', 'Djinn', 'Fish', 'Sheep', 'Elk',
  'Moonfolk', 'Phyrexian Praetor', 'Naga', 'Leonin', 'Viashino', 'Aetherborn', 'Noggle', 'Homarid', 'Cephalid', 'Kor',
]);

const IRREGULAR: Readonly<Record<string, string>> = {
  Elf: 'Elves',
  Dwarf: 'Dwarves',
  Wolf: 'Wolves',
  Werewolf: 'Werewolves',
  Fungus: 'Fungi',
  Mouse: 'Mice',
  Octopus: 'Octopuses',
  Cyclops: 'Cyclopes',
  Pegasus: 'Pegasi',
};

/** `Goblin` → `Goblins`, `Elf` → `Elves`. Only as good as it needs to be for creature types. */
export function pluralType(type: string): string {
  if (UNINFLECTED.has(type)) return type;
  const irregular = IRREGULAR[type];
  if (irregular) return irregular;
  if (/[^aeiou]y$/.test(type)) return `${type.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/.test(type)) return `${type}es`;
  return `${type}s`;
}

/** `time-lord` → `Time Lord`. */
export function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** `Goblins`, `Goblins and Orcs`, `Angels, Demons and Dragons`. */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
