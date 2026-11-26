import type { Species } from "./catalog";

/**
 * Breeds for the pet form's searchable picker, from the old app's breed
 * table (so migrated pets match). "Mixed breed" first, "Other" last, the rest
 * A to Z. Choosing from the list is required; there is no free text.
 */
export const BREEDS: Record<Species, string[]> = {
  dog: [
    "Mixed breed", "Afador", "Affenhuahua", "Affenpinscher", "Afghan Hound", "Airedale Terrier", "Akita",
    "Alaskan Klee Kai", "Alaskan Malamute", "American Bulldog", "American Bully", "American English Coonhound",
    "American Eskimo Dog", "American Foxhound", "American Hairless Terrier", "American Leopard Hound",
    "American Pit Bull Terrier", "American Staffordshire Terrier", "American Water Spaniel", "Anatolian Shepherd Dog",
    "Appenzeller Sennenhund", "Auggie", "Aussiedoodle", "Aussiepom", "Australian Cattle Dog",
    "Australian Labradoodle", "Australian Retriever", "Australian Shepherd", "Australian Terrier", "Azawakh",
    "Barbet", "Basenji", "Bassador", "Basset Fauve de Bretagne", "Basset Hound", "Basset Retriever", "Beabull",
    "Beagle", "Beaglier", "Bearded Collie", "Beauceron", "Bedlington Terrier", "Belgian Laekenois",
    "Belgian Malinois", "Belgian Sheepdog", "Belgian Tervuren", "Bergamasco Sheepdog", "Berger Picard", "Bernedoodle",
    "Bernese Mountain Dog", "Bichon Frise", "Biewer Terrier", "Black and Tan Coonhound", "Black Russian Terrier",
    "Bloodhound", "Bluetick Coonhound", "Bocker", "Boerboel", "Bohemian Shepherd", "Borador", "Border Collie",
    "Border Doodle", "Border Terrier", "Borzoi", "Boston Terrier", "Bouvier des Flandres", "Boxador", "Boxer",
    "Boxerdoodle", "Boykin Spaniel", "Bracco Italiano", "Briard", "Brittany", "Brussels Griffon", "Bugg",
    "Bull Terrier", "Bullador", "Bulldog", "Bullmastiff", "Cairn Terrier", "Canaan Dog", "Cane Corso",
    "Cardigan Welsh Corgi", "Cavachon", "Cavador", "Cavalier King Charles Spaniel", "Cavapoo", "Cavapoochon",
    "Cesky Terrier", "Chesapeake Bay Retriever", "Chi-Poo", "Chihuahua", "Chinese Crested", "Chinese Shar-Pei",
    "Chinook", "Chiweenie", "Chorkie", "Chow Chow", "Chug", "Chusky", "Cirneco dell'Etna", "Clumber Spaniel",
    "Cockapoo", "Cocker Spaniel (American)", "Cocker Spaniel (English)", "Collie (Rough)", "Collie (Smooth)",
    "Corgidor", "Corman Shepherd", "Coton de Tulear", "Cowboy Corgi", "Curly-Coated Retriever", "Dachshund",
    "Dalmatian", "Dandie Dinmont Terrier", "Danish-Swedish Farmdog", "Doberdoodle", "Doberman Pinscher",
    "Dogo Argentino", "Dogue de Bordeaux", "Dorgi", "Dorkie", "Doxiepoo", "Doxle", "Dutch Shepherd",
    "English Foxhound", "English Setter", "English Springer Spaniel", "English Toy Spaniel",
    "Entlebucher Mountain Dog", "Field Spaniel", "Finnish Lapphund", "Finnish Spitz", "Flat-Coated Retriever",
    "Fox Terrier (Smooth)", "Fox Terrier (Wire)", "French Bulldog", "Frenchton", "Frengle", "German Pinscher",
    "German Shepherd Dog", "German Shorthaired Pointer", "German Wirehaired Pointer", "Giant Schnauzer",
    "Glen of Imaal Terrier", "Goberian", "Goldador", "Golden Cocker Retriever", "Golden Mountain Dog",
    "Golden Retriever", "Golden Shepherd", "Goldendoodle", "Gordon Setter", "Grand Basset Griffon Vendeen",
    "Great Dane", "Great Pyrenees", "Greater Swiss Mountain Dog", "Greyhound", "Hamiltonstovare", "Harrier",
    "Havanese", "Havapoo", "Horgi", "Huskydoodle", "Ibizan Hound", "Icelandic Sheepdog", "Irish Doodle",
    "Irish Red and White Setter", "Irish Setter", "Irish Terrier", "Irish Water Spaniel", "Irish Wolfhound",
    "Italian Greyhound", "Japanese Akitainu", "Japanese Chin", "Japanese Spitz", "Keeshond", "Kerry Blue Terrier",
    "Komondor", "Kooikerhondje", "Kuvasz", "Labradoodle", "Labrador Retriever", "Lagotto Romagnolo",
    "Lakeland Terrier", "Lancashire Heeler", "Leonberger", "Lhasa Apso", "Lhasapoo", "Lowchen", "Malshi",
    "Maltepoo (Maltipoo)", "Maltese", "Maltichon", "Manchester Terrier (Standard)", "Manchester Terrier (Toy)",
    "Mastiff", "Miniature American Shepherd", "Miniature Bull Terrier", "Miniature Pinscher", "Miniature Schnauzer",
    "Morkie", "Morkiepoo", "Mudi", "Neapolitan Mastiff", "Nederlandse Kooikerhondje", "Newfoundland",
    "Norfolk Terrier", "Norrbottenspets", "Norwegian Buhund", "Norwegian Elkhound", "Norwegian Lundehund",
    "Norwich Terrier", "Nova Scotia Duck Tolling Retriever", "Old English Sheepdog", "Otterhound", "Papillon",
    "Parson Russell Terrier", "Peekapoo", "Pekingese", "Pembroke Welsh Corgi", "Peruvian Inca Orchid",
    "Petit Basset Griffon Vendeen", "Pharaoh Hound", "Plott Hound", "Pointer", "Polish Lowland Sheepdog", "Pomchi",
    "Pomeranian", "Pomsky", "Poochon", "Poodle (Miniature)", "Poodle (Standard)", "Poodle (Toy)",
    "Poodle mix (generic)", "Portuguese Podengo", "Portuguese Podengo Pequeno", "Portuguese Water Dog", "Pug",
    "Puggle", "Puli", "Pumi", "Pyrenean Shepherd", "Rat Terrier", "Redbone Coonhound", "Rhodesian Ridgeback",
    "Rottweiler", "Russell Terrier", "Russian Toy", "Russian Tsvetnaya Bolonka", "Saint Berdoodle", "Saint Bernard",
    "Saluki", "Samoyed", "Schipperke", "Schnoodle", "Scottish Deerhound", "Scottish Terrier", "Sealyham Terrier",
    "Sheepadoodle", "Shetland Sheepdog", "Shiba Inu", "Shichon (Zuchon)", "Shih Tzu", "Shih-Poo", "Shorkie",
    "Siberian Husky", "Silky Terrier", "Skye Terrier", "Sloughi", "Small Munsterlander Pointer",
    "Soft Coated Wheaten Terrier", "Spanish Water Dog", "Spinone Italiano", "Springerdoodle",
    "Staffordshire Bull Terrier", "Standard Schnauzer", "Sussex Spaniel", "Swedish Vallhund",
    "Teddy Roosevelt Terrier", "Tibetan Mastiff", "Tibetan Spaniel", "Tibetan Terrier", "Toy Fox Terrier",
    "Toy Goldendoodle", "Treeing Tennessee Brindle", "Treeing Walker Coonhound", "Vizsla", "Weimaraner",
    "Weimardoodle", "Welsh Springer Spaniel", "Welsh Terrier", "West Highland White Terrier", "Westiepoo", "Whippet",
    "Whoodle", "Wirehaired Pointing Griffon", "Wirehaired Vizsla", "Working Kelpie", "Xoloitzcuintli", "Yorkiepoo",
    "Yorkshire Terrier", "Other",
  ],
  cat: [
    "Mixed breed", "Abyssinian", "American Bobtail", "American Curl", "American Shorthair", "American Wirehair",
    "Balinese", "Bengal", "Birman", "Bombay", "British Longhair", "British Shorthair", "Burmese", "Burmilla",
    "Chartreux", "Chausie", "Colorpoint Shorthair", "Cornish Rex", "Devon Rex", "Domestic Longhair",
    "Domestic Mediumhair", "Domestic Shorthair", "Egyptian Mau", "European Burmese", "Exotic Shorthair",
    "Havana Brown", "Himalayan", "Japanese Bobtail", "Javanese", "Khao Manee", "Korat", "Kurilian Bobtail", "LaPerm",
    "Lykoi", "Maine Coon", "Manx", "Minskin", "Munchkin", "Nebelung", "Norwegian Forest Cat", "Ocicat",
    "Oriental Longhair", "Oriental Shorthair", "Persian", "Peterbald", "Pixiebob", "Ragamuffin", "Ragdoll",
    "Russian Blue", "Savannah", "Scottish Fold", "Scottish Straight", "Selkirk Rex", "Siamese", "Siberian",
    "Singapura", "Somali", "Sphynx", "Thai", "Tonkinese", "Toyger", "Turkish Angora", "Turkish Van", "York Chocolate",
    "Other",
  ],
};

/** Earlier picker names, renamed to the old app's (see migration 0011). */
export const RENAMED_BREEDS: Record<string, string> = {
  "German Shepherd": "German Shepherd Dog",
  "Poodle": "Poodle (Standard)",
  "Cocker Spaniel": "Cocker Spaniel (American)",
  "Pit Bull Terrier": "American Pit Bull Terrier",
};

/** Lowercase and drop punctuation, so "cavapoo", "Cava poo" and "poodle (toy)" all match. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Breeds matching every word typed; names starting with the search come first. */
export function searchBreeds(breeds: string[], query: string): string[] {
  const q = norm(query);
  if (!q) return breeds;
  const words = q.split(" ");
  const squashed = q.replace(/ /g, "");
  const hits = breeds.filter((b) => {
    const n = norm(b);
    return words.every((w) => n.includes(w)) || n.replace(/ /g, "").includes(squashed);
  });
  return [...hits.filter((b) => norm(b).startsWith(q)), ...hits.filter((b) => !norm(b).startsWith(q))];
}
