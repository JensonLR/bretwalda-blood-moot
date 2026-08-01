/**
 * The words a recovery code is made of.
 *
 * This list is read aloud. The game lives in group chats, so the realistic
 * recovery is a player saying four words to a friend or typing them from a
 * screenshot on a cracked phone — not copying a hex string. Everything here is
 * chosen for that:
 *
 *   - common English, spelled one way, three to eight letters;
 *   - no homophones (no bear/bare, no knight/night, no sea/see, no yew/you);
 *   - no plurals of another entry, so a stray "s" is a typo and not a swap;
 *   - nothing that reads as an insult when two of them land side by side.
 *
 * The vocabulary leans Anglo-Saxon because it costs nothing and the code is
 * something the player shows people.
 *
 * Membership is load bearing; order is not — a code stores the words themselves,
 * so the list can be re-sorted freely, but removing or respelling an entry
 * invalidates every recovery code in the wild that contains it. Only ever add.
 */
export const RECOVERY_WORDS: readonly string[] = [
  "acorn", "amber", "anvil", "apple", "arrow", "ashen", "aspen", "autumn", "badger",
  "banner", "barley", "barrel", "basket", "beacon", "beam", "bell", "bench", "birch",
  "bison", "blade", "boat", "bonfire", "book", "boot", "bramble", "branch", "brave",
  "bread", "bridge", "bronze", "brook", "broom", "bucket", "cabbage", "camp", "candle",
  "cart", "castle", "cattle", "cave", "cedar", "chain", "chalk", "cheese", "chest",
  "cider", "cliff", "cloak", "cloud", "clover", "coal", "coast", "comb",
  "copper", "cottage", "crane", "crow", "crown", "dagger", "dawn", "ditch",
  "dragon", "drum", "duck", "dusk", "eagle", "east", "elder", "ember",
  "falcon", "farm", "feast", "fern", "field", "finch", "fire", "flag",
  "flame", "flint", "flock", "forge", "fortress", "fox", "frost", "garden",
  "gate", "giant", "glass", "glove", "goat", "gold", "goose", "grain",
  "grass", "gravel", "green", "grove", "hammer", "harp", "harvest", "hawk",
  "hazel", "hearth", "heather", "hedge", "helmet", "herd", "hill", "hive",
  "holly", "honey", "hook", "horn", "hunter", "iron", "island", "ivory",
  "kestrel", "kettle", "kiln", "kite", "ladder", "lake", "lamb", "lamp", "lantern",
  "lark", "leaf", "leather", "ledge", "lily", "linen", "lion", "loaf",
  "lock", "longship", "mallet", "maple", "marble", "marsh", "mast", "meadow", "mill",
  "mist", "moon", "moss", "mountain", "mouse", "nest", "north", "oak",
  "ocean", "onion", "orchard", "otter", "oven", "owl", "oxen", "paddle", "path",
  "pearl", "pebble", "pepper", "pigeon", "pillar", "pine", "pitcher", "plum",
  "pond", "pony", "quarry", "quill", "quilt", "rabbit", "raft", "raven",
  "reed", "ribbon", "ridge", "river", "robin", "rock", "rope", "rose",
  "rowan", "rudder", "rune", "saddle", "salt", "sand", "sapling", "scythe",
  "seed", "shed", "sheep", "shell", "shield", "ship", "shore", "shovel",
  "silver", "sky", "slate", "sled", "smoke", "snow", "soil", "south",
  "spade", "spark", "sparrow", "spear", "spring", "spruce", "squirrel", "stable",
  "stag", "star", "stone", "stork", "storm", "stream", "summer", "swan",
  "sword", "table", "thistle", "thorn", "thread", "throne", "thunder", "timber",
  "torch", "tower", "trail", "tree", "trout", "trumpet", "tunnel", "turnip",
  "valley", "vine", "wagon", "wall", "walnut", "water", "west", "wheat",
  "wheel", "willow", "window", "winter", "wolf", "wool", "wren", "yarn",
];
