/* ============================================================
   Marqad — constants, types, and helper functions
   Implements BUILD_SPEC Sections 3.2–3.8
   ============================================================ */

// ===== Config (Section 3.2) =====
// US region confirmed by user. Language `ar_en` verified live against
// current Speechmatics docs (2026-07-15): "Arabic & English bilingual —
// Ideal when transcribing Arabic and English in the same media file or
// stream." WebSocket URL format verified: language is a path segment,
// host is `us.rt` (not the legacy `eu2.rt` in the spec).
//
// TOKEN_ENDPOINT falls back to the hardcoded project URL so the app
// works even if the env var isn't set on Vercel. This URL is not a
// secret — it's a public Edge Function endpoint with no caller auth.
export const CONFIG = {
  TOKEN_ENDPOINT:
    process.env.NEXT_PUBLIC_SPEECHMATICS_TOKEN_ENDPOINT ||
    "https://vnrgimvfsdgcpgfwcnlw.supabase.co/functions/v1/get-speechmatics-token",
  BATCH_TOKEN_ENDPOINT:
    process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/batch-token`
      : "https://vnrgimvfsdgcpgfwcnlw.supabase.co/functions/v1/batch-token",
  WS_HOST: "wss://us.rt.speechmatics.com/v2",
  BATCH_API_HOST: "https://us1.asr.api.speechmatics.com/v2",
  LANGUAGE: "ar_en",
  SAMPLE_RATE: 16000,
  MAX_DELAY: 2.0, // balance accuracy and live responsiveness — 2s gives the model
                  // enough lookahead for smart formatting and punctuation without
                  // excessive delay when switching between Arabic and English
  AUDIO_CHUNK_SIZE: 2048, // smaller chunks = lower latency
  // Input gain boost — multiplies the microphone signal before sending to
  // Speechmatics. Helps capture whispered/softly-spoken/distant speakers.
  // 1.0 = no boost, 4.0 = ~12dB boost (good for quiet environments).
  // The browser's autoGainControl handles mild normalization; this provides
  // an additional fixed boost on top for very quiet sources.
  INPUT_GAIN: 4.0,
};

// ===== Vocabulary cache (Section 1.2 — localStorage caching) =====
// Caches the merged additional_vocab array so session start doesn't block
// on a network fetch. Background refresh keeps it fresh for the NEXT session.
const VOCAB_CACHE_KEY = "marqad_vocab_cache";

export interface VocabCacheEntry {
  vocab: Array<{ content: string; sounds_like: string[] }>;
  count: number;
  maxLastConfirmed: string; // ISO string of max(last_confirmed_at) at fetch time
  cachedAt: number; // Date.now() when cached
}

export function loadVocabCache(): VocabCacheEntry | null {
  try {
    const raw = localStorage.getItem(VOCAB_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveVocabCache(entry: VocabCacheEntry): void {
  try {
    localStorage.setItem(VOCAB_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage might be full or disabled — non-fatal
  }
}

export function clearVocabCache(): void {
  try {
    localStorage.removeItem(VOCAB_CACHE_KEY);
  } catch {}
}

// ===== Types =====
export interface WordToken {
  content: string;
  speaker: string;
  language: string;
  direction: "ltr" | "rtl";
  confidence: number;
  type: "word" | "punctuation" | "spacing" | "pause";
  pauseKind?: "ellipsis" | "comma" | "line" | "paragraph" | "divider";
}

export interface Segment {
  id: string;
  words: WordToken[];
  transcript: string;
  speaker: string;
  audioStart: number;
  audioEnd: number;
  wallTime: number;
  spacing: "none" | "ellipsis" | "comma" | "line" | "paragraph" | "divider";
}

export type ViewFormat = "prose" | "dialogue";

// ===== Speaker colors (Section 3.6 — ~7 stable accent colors) =====
export const SPEAKER_COLORS = [
  "#5EEAD4", // teal
  "#F5A623", // amber
  "#A78BFA", // purple
  "#60A5FA", // blue
  "#F472B6", // pink
  "#34D399", // green
  "#FB923C", // orange
];

export function speakerColor(speaker: string): string {
  if (!speaker || speaker === "UU") return "#6B7280";
  const match = speaker.match(/S(\d+)/);
  if (!match) return "#6B7280";
  const idx = parseInt(match[1], 10) - 1;
  return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
}

// ===== Common English words stoplist (Section 3.5) =====
// Used to identify uncommon/uncertain terms. Not a full dictionary —
// intentionally modest; the goal is to flag scholarly terminology that
// a general model won't recognize, not to be a spell-checker.
const COMMON_WORDS_SET = new Set([
  // articles, pronouns, prepositions, conjunctions
  "the","a","an","and","or","but","if","then","else","when","while","of","to","in","on","at","by","for","with","about","against","between","into","through","during","before","after","above","below","from","up","down","out","off","over","under","again","further","here","there","all","any","both","each","few","more","most","other","some","such","no","nor","not","only","own","same","so","than","too","very","can","will","just","should","now","is","am","are","was","were","be","been","being","have","has","had","do","does","did","will","would","shall","should","may","might","must","i","you","he","she","it","we","they","me","him","her","us","them","my","your","his","its","our","their","mine","yours","hers","ours","theirs","this","that","these","those","what","which","who","whom","whose","where","why","how","all","another","anybody","anyone","anything","each","everybody","everyone","everything",
  // common verbs
  "get","got","make","made","take","took","give","gave","go","went","come","came","see","saw","know","knew","think","thought","say","said","tell","told","ask","asked","find","found","put","let","mean","meant","keep","kept","seem","seemed","feel","felt","try","tried","leave","left","call","called","want","need","use","used","work","worked","look","looked","become","became","create","created","show","showed","start","started","stop","stopped","speak","spoke","read","write","wrote","hear","heard","run","walk","eat","drink","sleep","wake","sit","stand","move","turn","open","close","begin","began","end","finish","finished","continue","bring","brought","buy","bought","build","built","break","broke","fall","fell","rise","rose","send","sent","receive","set","meet","met","pay","paid","cut","hit","wear","wore","teach","taught","learn","learnt","study","studied","play","help","helped","live","living","die","died","born","grow","grew","understand","understood","remember","forget","forgot","believe","believed","happen","happened","allow","allowed","answer","answered","appear","appeared","arrive","arrived","decide","decided","develop","explain","explained","happen","happened","happen","produce","produced","provide","provided","remain","remained","require","required","seem","seemed","support","supported","happen","happen",
  // common adjectives/adverbs
  "good","bad","great","small","large","big","little","old","new","young","long","short","high","low","full","empty","hard","soft","heavy","light","warm","cold","hot","fast","slow","easy","difficult","simple","complex","clean","dirty","strong","weak","rich","poor","happy","sad","angry","afraid","safe","dangerous","true","false","real","right","wrong","left","early","late","near","far","close","open","closed","public","private","general","specific","important","possible","impossible","able","unable","free","busy","ready","sure","clear","dark","bright","quiet","loud","beautiful","ugly","special","normal","usual","unusual","common","rare","single","double","main","only","same","different","similar","particular","certain","current","past","future","present","final","initial","total","complete","incomplete","whole","partial","enough","much","many","more","most","less","least","few","little","enough","too","also","still","already","yet","ever","never","always","often","sometimes","usually","rarely","seldom","again","once","twice","first","second","third","last","next","previous","forward","backward","away","back","ahead","behind","beside","around","along","across","through","throughout","within","without","upon","onto","towards","against","among","amongst","per","via","etc","versus","vs",
  // common nouns
  "time","year","day","week","month","people","man","woman","child","boy","girl","family","friend","home","house","room","door","window","table","chair","bed","food","water","milk","bread","meat","rice","fruit","tea","coffee","salt","sugar","oil","book","pen","paper","word","letter","number","name","place","city","country","world","land","sea","river","mountain","tree","flower","sun","moon","star","sky","earth","fire","air","wind","rain","snow","road","street","car","ship","boat","train","plane","school","class","student","teacher","lesson","question","answer","problem","idea","fact","truth","way","method","part","side","line","point","end","beginning","middle","center","area","space","case","group","number","amount","quantity","quality","color","sound","voice","light","darkness","power","force","energy","life","death","love","hate","fear","hope","peace","war","law","rule","order","reason","mind","heart","soul","spirit","body","hand","foot","head","face","eye","ear","nose","mouth","tooth","hair","skin","bone","blood","water","fire","earth","air","animal","bird","fish","horse","cow","sheep","goat","cat","dog","morning","evening","night","noon","today","tomorrow","yesterday","moment","minute","hour","second","season","spring","summer","autumn","winter","north","south","east","west","thing","something","nothing","anything","everything","someone","anyone","everyone","nobody","anybody","everybody","way","kind","sort","type","form","manner","fashion","style","level","degree","stage","step","phase","period","era","age","generation","century","decade","society","community","nation","state","government","church","mosque","temple","god","faith","belief","prayer","worship","sin","virtue","good","evil","heaven","hell","angel","devil","prophet","saint","priest","scholar","student","teacher","master","servant","king","queen","prince","princess","leader","follower","enemy","ally","stranger","guest","host","neighbor","citizen","foreigner","visitor","patient","doctor","nurse","farmer","merchant","soldier","judge","lawyer","writer","artist","musician","singer","dancer","player","actor","builder","maker","creator","worker","laborer","manager","owner","buyer","seller","giver","receiver","speaker","listener","reader","viewer","observer","witness","participant","member","partner","colleague","assistant","helper","guide","guard","protector","ruler","judge","minister","ambassador","diplomat","scholar","philosopher","scientist","mathematician","historian","poet","author","novelist","journalist","reporter","editor","publisher","translator","interpreter","commentator","critic","reviewer","researcher","professor","lecturer","tutor","mentor","coach","trainer","instructor","educator","administrator","director","supervisor","controller","inspector","examiner","auditor","accountant","treasurer","secretary","clerk","assistant","deputy","vice","deputy","assistant","secretary","treasurer","accountant","auditor","examiner","inspector","controller","supervisor","director","administrator","educator","instructor","trainer","coach","mentor","tutor","lecturer","professor","researcher","reviewer","critic","commentator","interpreter","translator","publisher","editor","reporter","journalist","novelist","author","poet","historian","mathematician","scientist","philosopher","scholar",
  // days, months (common capitalized words)
  "monday","tuesday","wednesday","thursday","friday","saturday","sunday","january","february","march","april","may","june","july","august","september","october","november","december","jan","feb","mar","apr","jun","jul","aug","sep","sept","oct","nov","dec",
  // common contractions
  "don't","doesn't","didn't","won't","wouldn't","can't","couldn't","shouldn't","isn't","aren't","wasn't","weren't","hasn't","haven't","hadn't","i'm","you're","he's","she's","it's","we're","they're","i've","you've","we've","they've","i'll","you'll","he'll","she'll","we'll","they'll","i'd","you'd","he'd","she'd","we'd","they'd","that's","there's","here's","what's","who's","how's","let's",
  // common in Islamic/classroom context that ARE common and shouldn't be flagged
  "god","allah","book","books","chapter","chapters","verse","verses","section","sections","page","pages","word","words","sentence","sentences","topic","topics","subject","subjects","question","questions","answer","answers","example","examples","point","points","idea","ideas","thought","thoughts","concept","concepts","principle","principles","rule","rules","law","laws","theory","theories","method","methods","approach","approaches","practice","practices","study","studies","research","analysis","review","summary","conclusion","introduction","background","context","history","historical","ancient","modern","classical","traditional","contemporary","current","recent","previous","following","above","below","former","latter","first","second","third","last","final","initial","primary","secondary","main","major","minor","key","central","essential","important","crucial","vital","significant","notable","remarkable","famous","well-known","known","unknown","certain","uncertain","clear","unclear","obvious","evident","apparent","visible","invisible","explicit","implicit","direct","indirect","literal","metaphorical","figurative","symbolic","allegorical",
  // common question words and fillers
  "yes","no","okay","ok","alright","sure","maybe","perhaps","probably","possibly","definitely","certainly","absolutely","exactly","precisely","quite","rather","somewhat","slightly","barely","hardly","almost","nearly","about","around","approximately","roughly","essentially","basically","fundamentally","ultimately","finally","eventually","subsequently","previously","formerly","originally","initially","primarily","mainly","mostly","largely","broadly","generally","typically","usually","commonly","frequently","rarely","seldom","occasionally","sometimes","often","always","never","ever","still","already","yet","now","then","soon","later","earlier","afterwards","afterward","meanwhile","simultaneously","concurrently","together","apart","aside","away","back","forth","forward","backward","upward","downward","inward","outward","onward",
]);

export function isCommonWord(word: string): boolean {
  return COMMON_WORDS_SET.has(word.toLowerCase().replace(/[^\w']/g, ""));
}

// ===== Arabic detection (Section 3.1 + 3.3) =====
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function isArabicText(text: string): boolean {
  return ARABIC_REGEX.test(text);
}

export function isArabicWord(word: WordToken): boolean {
  // Use direction field from Speechmatics if present, then language, then
  // Unicode range as fallback (per spec Section 3.3).
  if (word.direction === "rtl") return true;
  if (word.language && word.language.startsWith("ar")) return true;
  return isArabicText(word.content);
}

// ===== Date detection (Section 3.5 — purple highlight) =====
const MONTH_NAMES = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i;
const YEAR_REGEX = /\b(19|20|21)\d{2}\b/; // Gregorian years
const HIJRI_YEAR = /\b(14[0-9]{2}|15[0-9]{2})\b/; // Hijri years 1400-1599
const ORDINAL = /\b\d+(st|nd|rd|th)\b/i;
const DATE_KEYWORDS = /\b(century|hijri|millennium|decade|era|epoch|year|date)\b/i;
const DATE_ERAS = /\b(ce|bce|ah|bh|ad|bc)\b/i;

export function isDateWord(word: string): boolean {
  const w = word.trim();
  if (!w) return false;
  if (MONTH_NAMES.test(w)) return true;
  if (YEAR_REGEX.test(w)) return true;
  if (HIJRI_YEAR.test(w)) return true;
  if (ORDINAL.test(w)) return true;
  if (DATE_KEYWORDS.test(w)) return true;
  if (DATE_ERAS.test(w) && w.length <= 3) return true;
  return false;
}

// ===== Proper noun detection (Section 3.5 — teal highlight) =====
export function isProperNoun(word: string, isSentenceInitial: boolean): boolean {
  if (!word) return false;
  // Must be capitalized and not sentence-initial
  if (!/^[A-Z]/.test(word)) return false;
  if (isSentenceInitial) return false;
  // Not a common word (includes month names, days, etc.)
  if (isCommonWord(word)) return false;
  // Not a date (dates get purple, not teal)
  if (isDateWord(word)) return false;
  // Not a single-letter abbreviation
  if (word.length <= 1) return false;
  return true;
}

// ===== Uncertain term detection (Section 3.5 — dotted amber) =====
const CONSONANTS = "bcdfghjklmnpqrstvwxyz";

export function hasAtypicalConsonantClusters(word: string): boolean {
  const lower = word.toLowerCase();
  let maxCluster = 0;
  let currentCluster = 0;
  for (const char of lower) {
    if (CONSONANTS.includes(char)) {
      currentCluster++;
      if (currentCluster > maxCluster) maxCluster = currentCluster;
    } else {
      currentCluster = 0;
    }
  }
  // 4+ consecutive consonant letters is atypical for common English
  // (common words with 4+ clusters like "strengths" are filtered by the
  // stoplist check in isUncertain)
  if (maxCluster >= 4) return true;
  // 'q' not followed by 'u' is unusual in English, common in Arabic transliteration
  if (/q(?!u)/i.test(lower)) return true;
  return false;
}

export function isUncertain(word: string): boolean {
  if (!word || word.length < 3) return false;
  if (isArabicText(word)) return false; // (b) not Arabic
  if (isCommonWord(word)) return false; // (a) not in stoplist
  if (isDateWord(word)) return false; // dates get their own highlight
  // (c) consonant clusters atypical of common English words
  return hasAtypicalConsonantClusters(word);
}

// ===== Word classification — determines CSS class(es) =====
export function classifyWord(
  word: WordToken,
  isSentenceInitial: boolean
): string[] {
  const classes: string[] = [];
  const content = word.content;

  // Arabic rendering (orthogonal to entity flags — always applied)
  if (isArabicWord(word)) {
    classes.push("arabic");
  }

  // Entity highlighting — priority: uncertain > date > proper-noun
  // (uncertain takes priority: "transcribed as heard, not verified")
  if (word.type !== "punctuation" && word.type !== "spacing") {
    if (isUncertain(content)) {
      classes.push("uncertain");
    } else if (isDateWord(content)) {
      classes.push("entity-date");
    } else if (isProperNoun(content, isSentenceInitial)) {
      classes.push("entity-name");
    }
  }

  return classes;
}

// ===== Pause-driven spacing (Section 3.4) =====
// Uses actual audio gaps (silence between speech segments) to determine
// pause type. Audio gaps are accurate — they measure real silence in the
// audio, not wall time which includes processing delays.
export function classifyPause(
  gapMs: number
): "none" | "ellipsis" | "comma" | "line" | "paragraph" | "divider" {
  if (gapMs < 800) return "none";         // normal speech flow (within-sentence)
  if (gapMs < 1800) return "ellipsis";    // thinking pause — "umm", gathering thoughts
  if (gapMs < 3500) return "comma";       // sentence-ending pause
  if (gapMs < 6000) return "line";        // noticeable break — new sentence
  if (gapMs < 12000) return "paragraph";  // topic change / turn change
  return "divider";                        // real break — new section
}

// ===== Filler word detection =====
// Detects hesitation sounds (umm, uh, hmm, err) in both English and Arabic
// These should be rendered with ellipsis to show thinking, not as words
const FILLER_WORDS = new Set([
  // English fillers
  "um", "umm", "ummm", "uh", "uhh", "uhhh", "hmm", "hmmm", "err", "errr",
  "ah", "ahh", "ahhh", "eh", "ehh", "like", "basically", "literally",
  "actually", "right", "okay", "ok", "so", "well", "look", "see",
  // Arabic fillers / hesitation
  "إم", "إمم", "إممم", "آم", "آمم", "اه", "آه", "اها", "يعني", "هذا",
  "يع", "إي", "طيب", "خلاص", "وانا",
]);

export function isFillerWord(word: string): boolean {
  const lower = word.toLowerCase().replace(/[^\w']/g, "");
  if (FILLER_WORDS.has(lower)) return true;
  // Detect repeated single-letter hesitation (m-m-m, u-u-u)
  if (lower.length >= 3 && /^(\w)\1*(-\1+)+$/.test(lower)) return true;
  // Detect elongated fillers (ummm, uhhhh)
  if (/^(um|uh|ah|eh|hmm|err)+[a-z]*$/.test(lower) && lower.length > 3) return true;
  return false;
}

// ===== Time formatting =====
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatMinutes(seconds: number): string {
  return (seconds / 60).toFixed(1);
}

// ===== Audio conversion: Float32 → Int16 PCM =====
export function float32ToInt16(float32: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16.buffer;
}

// ===== Batch transcription config =====
// The Batch API has a different config format than the Realtime API.
// Notably: no enable_partials, no max_delay, no conversation_config,
// no max_delay_mode. But it does support enable_entities, diarization,
// additional_vocab, punctuation_overrides, and transcript_filtering_config.
export function buildBatchConfig(extraVocab?: Array<{ content: string; sounds_like: string[] }>): string {
  // Reuse the same vocab merging logic as buildStartRecognition
  const baselineVocab = [
    { content: "Mishkat", sounds_like: ["mish-kaat", "mishkat", "mishkaat"] },
    { content: "Sharh al Wiqayah", sounds_like: ["sharh al wiqaya", "sharhul wiqaya", "wiqayah"] },
    { content: "Hidayah", sounds_like: ["hidaya", "hidayah", "hidaaya"] },
    { content: "Nur al Anwar", sounds_like: ["noor ul anwar", "nurul anwar"] },
    { content: "Qiraat", sounds_like: ["qira'at", "qiraat", "keeraat"] },
    { content: "Iqtisad", sounds_like: ["iqtisaad", "iqtisad"] },
    { content: "Jalalayn", sounds_like: ["jalalayn", "jalalain", "the jalalayn"] },
    { content: "Hadith", sounds_like: ["hadeeth", "hadith"] },
    { content: "Nahw", sounds_like: ["nahw", "nahu"] },
    { content: "Balagha", sounds_like: ["balagha", "balaghah"] },
    { content: "Tafsir", sounds_like: ["tafseer", "tafsir"] },
    { content: "Mantiq", sounds_like: ["mantiq", "mantik"] },
    { content: "Usul al-Fiqh", sounds_like: ["usul al fiqh", "usulul fiqh"] },
    { content: "Hanafi", sounds_like: ["hanafi", "hanafee"] },
    { content: "A'mari", sounds_like: ["ahmari", "amari", "amary", "ahmadi", "amadi"] },
    { content: "Amari", sounds_like: ["amari", "amary", "ahmari"] },
    { content: "Bukhari", sounds_like: ["bukhari", "bukhary", "bohari"] },
    { content: "Muslim", sounds_like: ["moslem", "muslem"] },
    { content: "Tirmidhi", sounds_like: ["tirmidhi", "termidhi", "tirmizi"] },
    { content: "Abu Dawud", sounds_like: ["abu dawood", "abu daud"] },
    { content: "An-Nawawi", sounds_like: ["nawawi", "nawawy", "an nawawi"] },
    { content: "Ibn Majah", sounds_like: ["ibn majah", "ibn maja"] },
    { content: "Ibn Kathir", sounds_like: ["ibn kathir", "ibn kaseer"] },
    { content: "Ibn Hajar", sounds_like: ["ibn hajar", "ibn hajr"] },
    { content: "As-Suyuti", sounds_like: ["suyuti", "suyuty", "as suyuti"] },
    { content: "Al-Ghazali", sounds_like: ["ghazali", "ghazaly", "al ghazali"] },
    { content: "An-Nasa'i", sounds_like: ["nasai", "nasay", "an nasai"] },
    { content: "Ibn Taymiyyah", sounds_like: ["ibn taymiyyah", "ibn taymiyah"] },
    { content: "Shafi'i", sounds_like: ["shafii", "shafei", "shafiy"] },
    { content: "Maliki", sounds_like: ["maliki", "maleki", "maliky"] },
    { content: "Hanbali", sounds_like: ["hanbali", "hanbaly"] },
    { content: "Insha'Allah", sounds_like: ["inshallah", "insha allah"] },
    { content: "Masha'Allah", sounds_like: ["mashallah", "masha allah"] },
    { content: "Subhan'Allah", sounds_like: ["subhanallah", "subhan allah"] },
    { content: "Astaghfirullah", sounds_like: ["astaghfirullah", "astaghferullah"] },
    { content: "Jazak'Allah", sounds_like: ["jazakallah", "jazak allah"] },
    { content: "Sallallahu alayhi wa sallam", sounds_like: ["sallallahu alayhi wa sallam"] },
    { content: "Rasulullah", sounds_like: ["rasulullah", "rasoolullah"] },
    { content: "Subhanahu wa Ta'ala", sounds_like: ["subhanahu wa taala"] },
    { content: "Ayah", sounds_like: ["aya", "ayah", "ayat"] },
    { content: "Surah", sounds_like: ["sura", "surah", "surat"] },
    { content: "Sunnah", sounds_like: ["sunnah", "sunna", "sunnat"] },
    { content: "Fiqh", sounds_like: ["fiqh", "feqh"] },
    { content: "Usul", sounds_like: ["usul", "usool"] },
    { content: "Ijtihad", sounds_like: ["ijtihad", "ijtehad"] },
    { content: "Qiyas", sounds_like: ["qiyas", "qiyass"] },
    { content: "Ijma", sounds_like: ["ijma", "ijmaa"] },
    { content: "Bismillah", sounds_like: ["bismillah", "bismi allah"] },
    { content: "Alhamdulillah", sounds_like: ["alhamdulillah", "alhamdo lillah"] },
    { content: "Taqwa", sounds_like: ["taqwa", "taqoua"] },
    { content: "Tawheed", sounds_like: ["tawheed", "tawhid"] },
    { content: "Shirk", sounds_like: ["shirk", "sherik"] },
    { content: "Bid'ah", sounds_like: ["bidah", "bida"] },
    { content: "Halal", sounds_like: ["halal", "halal"] },
    { content: "Haram", sounds_like: ["haram", "haraam"] },
  ];

  const mergedVocab = [...baselineVocab];
  if (extraVocab && extraVocab.length > 0) {
    for (const ev of extraVocab) {
      const existing = mergedVocab.find((v) => v.content.toLowerCase() === ev.content.toLowerCase());
      if (existing) {
        existing.sounds_like = [...new Set([...existing.sounds_like, ...ev.sounds_like])];
      } else {
        mergedVocab.push(ev);
      }
    }
  }

  return JSON.stringify({
    type: "transcription",
    transcription_config: {
      language: CONFIG.LANGUAGE,
      model: "enhanced",
      diarization: "speaker",
      speaker_diarization_config: {
        prefer_current_speaker: true,
      },
      enable_entities: true,
      // Batch API requires permitted_marks as an array, not the string "all".
      // Omitting it entirely defaults to all punctuation marks.
      punctuation_overrides: {
        sensitivity: 0.6,
      },
      transcript_filtering_config: {
        replacements: [
          { from: "ahmadi", to: "A'mari" },
          { from: "Ahmadi", to: "A'mari" },
          { from: "inshallah", to: "Insha'Allah" },
          { from: "Inshallah", to: "Insha'Allah" },
          { from: "mashallah", to: "Masha'Allah" },
          { from: "Mashallah", to: "Masha'Allah" },
          { from: "subhanallah", to: "Subhan'Allah" },
          { from: "Subhanallah", to: "Subhan'Allah" },
        ],
      },
      additional_vocab: mergedVocab,
    },
  });
}

// ===== StartRecognition message (Section 3.3) =====
export function buildStartRecognition(extraVocab?: Array<{ content: string; sounds_like: string[] }>): string {
  // Baseline vocabulary from ACCURACY_CONFIG_FIX.md (fixed starter list)
  const baselineVocab = [
    // Class/book names from the fixed daily schedule — said constantly,
    // exactly the kind of proper noun a general model won't have in training.
    { content: "Mishkat", sounds_like: ["mish-kaat", "mishkat", "mishkaat"] },
    { content: "Sharh al Wiqayah", sounds_like: ["sharh al wiqaya", "sharhul wiqaya", "wiqayah"] },
    { content: "Hidayah", sounds_like: ["hidaya", "hidayah", "hidaaya"] },
    { content: "Nur al Anwar", sounds_like: ["noor ul anwar", "nurul anwar"] },
    { content: "Qiraat", sounds_like: ["qira'at", "qiraat", "keeraat"] },
    { content: "Iqtisad", sounds_like: ["iqtisaad", "iqtisad"] },
    { content: "Jalalayn", sounds_like: ["jalalayn", "jalalain", "the jalalayn"] },
    { content: "Hadith", sounds_like: ["hadeeth", "hadith"] },
    // Common Islamic scholarly terms likely to recur across multiple classes
    { content: "Nahw", sounds_like: ["nahw", "nahu"] },
    { content: "Balagha", sounds_like: ["balagha", "balaghah"] },
    { content: "Tafsir", sounds_like: ["tafseer", "tafsir"] },
    { content: "Mantiq", sounds_like: ["mantiq", "mantik"] },
    { content: "Usul al-Fiqh", sounds_like: ["usul al fiqh", "usulul fiqh"] },
    { content: "Hanafi", sounds_like: ["hanafi", "hanafee"] },
    // Common Arabic names
    { content: "A'mari", sounds_like: ["ahmari", "amari", "amary", "ahmadi", "amadi"] },
    { content: "Amari", sounds_like: ["amari", "amary", "ahmari"] },
    { content: "Bukhari", sounds_like: ["bukhari", "bukhary", "bohari"] },
    { content: "Muslim", sounds_like: ["moslem", "muslem"] },
    { content: "Tirmidhi", sounds_like: ["tirmidhi", "termidhi", "tirmizi"] },
    { content: "Abu Dawud", sounds_like: ["abu dawood", "abu daud"] },
    { content: "An-Nawawi", sounds_like: ["nawawi", "nawawy", "an nawawi"] },
    { content: "Ibn Majah", sounds_like: ["ibn majah", "ibn maja"] },
    { content: "Ibn Kathir", sounds_like: ["ibn kathir", "ibn kaseer"] },
    { content: "Ibn Hajar", sounds_like: ["ibn hajar", "ibn hajr"] },
    { content: "As-Suyuti", sounds_like: ["suyuti", "suyuty", "as suyuti"] },
    { content: "Al-Ghazali", sounds_like: ["ghazali", "ghazaly", "al ghazali"] },
    { content: "An-Nasa'i", sounds_like: ["nasai", "nasay", "an nasai"] },
    { content: "Ibn Taymiyyah", sounds_like: ["ibn taymiyyah", "ibn taymiyah"] },
    { content: "Shafi'i", sounds_like: ["shafii", "shafei", "shafiy"] },
    { content: "Maliki", sounds_like: ["maliki", "maleki", "maliky"] },
    { content: "Hanbali", sounds_like: ["hanbali", "hanbaly"] },
    { content: "Hanafi", sounds_like: ["hanafi", "hanafy"] },
    // Common Islamic terms
    { content: "Insha'Allah", sounds_like: ["inshallah", "insha allah"] },
    { content: "Masha'Allah", sounds_like: ["mashallah", "masha allah"] },
    { content: "Subhan'Allah", sounds_like: ["subhanallah", "subhan allah"] },
    { content: "Astaghfirullah", sounds_like: ["astaghfirullah", "astaghferullah"] },
    { content: "Jazak'Allah", sounds_like: ["jazakallah", "jazak allah"] },
    { content: "Sallallahu alayhi wa sallam", sounds_like: ["sallallahu alayhi wa sallam"] },
    { content: "Rasulullah", sounds_like: ["rasulullah", "rasoolullah"] },
    { content: "Subhanahu wa Ta'ala", sounds_like: ["subhanahu wa taala"] },
    // Quranic terms
    { content: "Ayah", sounds_like: ["aya", "ayah", "ayat"] },
    { content: "Surah", sounds_like: ["sura", "surah", "surat"] },
    { content: "Hadith", sounds_like: ["hadith", "hadeeth", "hadeth"] },
    { content: "Sunnah", sounds_like: ["sunnah", "sunna", "sunnat"] },
    { content: "Tafsir", sounds_like: ["tafsir", "tafseer"] },
    { content: "Fiqh", sounds_like: ["fiqh", "feqh"] },
    { content: "Usul", sounds_like: ["usul", "usool"] },
    { content: "Ijtihad", sounds_like: ["ijtihad", "ijtehad"] },
    { content: "Qiyas", sounds_like: ["qiyas", "qiyass"] },
    { content: "Ijma", sounds_like: ["ijma", "ijmaa"] },
    // Common Arabic phrases in classroom context
    { content: "Bismillah", sounds_like: ["bismillah", "bismi allah"] },
    { content: "Alhamdulillah", sounds_like: ["alhamdulillah", "alhamdo lillah"] },
    { content: "Taqwa", sounds_like: ["taqwa", "taqoua"] },
    { content: "Tawheed", sounds_like: ["tawheed", "tawhid"] },
    { content: "Shirk", sounds_like: ["shirk", "sherik"] },
    { content: "Bid'ah", sounds_like: ["bidah", "bida"] },
    { content: "Halal", sounds_like: ["halal", "halal"] },
    { content: "Haram", sounds_like: ["haram", "haraam"] },
  ];

  // Merge baseline with user corrections (extraVocab from vocab_corrections table)
  // Deduplicate by content — if a correction matches a baseline entry, the
  // correction's sounds_like variants are merged into the baseline entry.
  const mergedVocab = [...baselineVocab];
  if (extraVocab && extraVocab.length > 0) {
    for (const ev of extraVocab) {
      const existing = mergedVocab.find((v) => v.content.toLowerCase() === ev.content.toLowerCase());
      if (existing) {
        // Merge sounds_like arrays, deduplicated
        existing.sounds_like = [...new Set([...existing.sounds_like, ...ev.sounds_like])];
      } else {
        mergedVocab.push(ev);
      }
    }
  }

  return JSON.stringify({
    message: "StartRecognition",
    transcription_config: {
      language: CONFIG.LANGUAGE,
      model: "enhanced",
      enable_partials: true,
      max_delay: CONFIG.MAX_DELAY,
      max_delay_mode: "flexible",
      diarization: "speaker",
      speaker_diarization_config: {
        prefer_current_speaker: true,
      },
      // End-of-utterance detection — valid raw API field (NOT the Voice SDK's
      // end_of_utterance_mode). 1.5s silence = natural turn boundary.
      conversation_config: {
        end_of_utterance_silence_trigger: 1.5,
      },
      // Enable smart formatting — dates, numbers, currencies, etc.
      // Essential for a note-taking machine: "two thousand and four" → "2004"
      enable_entities: true,
      // permitted_marks must be an array, NOT the string "all" —
      // both Realtime and Batch APIs reject the string form.
      // Omitting it defaults to all punctuation marks.
      punctuation_overrides: {
        sensitivity: 0.6,
      },
      transcript_filtering_config: {
        replacements: [
          { from: "ahmadi", to: "A'mari" },
          { from: "Ahmadi", to: "A'mari" },
          { from: "inshallah", to: "Insha'Allah" },
          { from: "Inshallah", to: "Insha'Allah" },
          { from: "mashallah", to: "Masha'Allah" },
          { from: "Mashallah", to: "Masha'Allah" },
          { from: "subhanallah", to: "Subhan'Allah" },
          { from: "Subhanallah", to: "Subhan'Allah" },
        ],
      },
      additional_vocab: mergedVocab,
    },
    audio_format: {
      type: "raw",
      encoding: "pcm_s16le",
      sample_rate: CONFIG.SAMPLE_RATE,
    },
  });
}

// ===== Export format (Section 3.8) =====
export function buildExportText(segments: Segment[]): string {
  const lines: string[] = [];
  for (const seg of segments) {
    const time = formatTimestamp(seg.audioStart);
    const speaker = seg.speaker || "UU";
    // Add spacing indicators for pauses
    let prefix = "";
    if (seg.spacing === "ellipsis") prefix = "… ";
    else if (seg.spacing === "comma") prefix = ", ";
    else if (seg.spacing === "line") prefix = "\n";
    else if (seg.spacing === "paragraph") prefix = "\n\n";
    else if (seg.spacing === "divider") prefix = "\n---\n";
    lines.push(`[${time}] Speaker ${speaker}: ${prefix}${seg.transcript}`);
  }
  return lines.join("\n");
}

// ============================================================
// Session History (localStorage-based)
// ============================================================

export interface SessionRecord {
  id: string;
  date: string;          // ISO string
  durationSec: number;   // actual streaming seconds (excludes pause time)
  segmentCount: number;
  preview: string;       // first ~120 chars of transcript
  exportText: string;    // full export text for re-copy/view
  audioPath?: string | null;    // Supabase Storage path (if audio was saved)
  audioSize?: number | null;    // audio file size in bytes
}

const HISTORY_KEY = "marqad-history";
const MAX_HISTORY_ENTRIES = 50;
const SESSIONS_ENDPOINT =
  process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/marqad-sessions`
    : "https://vnrgimvfsdgcpgfwcnlw.supabase.co/functions/v1/marqad-sessions";

export function loadHistory(): SessionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveSession(record: SessionRecord): SessionRecord[] {
  const history = loadHistory();
  history.unshift(record); // newest first
  // Trim to max entries
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.length = MAX_HISTORY_ENTRIES;
  }
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    // localStorage quota exceeded — trim older entries and retry
    while (history.length > 5) {
      history.pop();
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        break;
      } catch {}
    }
  }
  return history;
}

export function deleteSession(id: string): SessionRecord[] {
  const history = loadHistory().filter((s) => s.id !== id);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
  return history;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}

// ============================================================
// Session History — Database-backed (Supabase)
// Sessions are saved to the marqad_sessions table so they persist
// across devices and browsers. localStorage is used as a cache/fallback.
// Audio files are stored in Supabase Storage bucket 'marqad-audio'.
// ============================================================

// Save a session to the database (upsert)
export async function saveSessionToDB(record: SessionRecord): Promise<void> {
  try {
    const resp = await fetch(SESSIONS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: record.id,
        date: record.date,
        duration_sec: record.durationSec,
        segment_count: record.segmentCount,
        preview: record.preview,
        export_text: record.exportText,
        audio_path: record.audioPath || null,
        audio_size: record.audioSize || null,
        audio_format: "webm",
      }),
    });
    if (!resp.ok) {
      console.warn("[Marqad] saveSessionToDB failed:", resp.status);
    }
  } catch (err) {
    console.warn("[Marqad] saveSessionToDB error:", err);
  }
}

// Load all sessions from the database
export async function loadHistoryFromDB(): Promise<SessionRecord[]> {
  try {
    const resp = await fetch(SESSIONS_ENDPOINT, { method: "GET" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const sessions = data.sessions || [];
    // Map DB rows to SessionRecord
    return sessions.map((s: any) => ({
      id: s.id,
      date: s.date,
      durationSec: s.duration_sec || 0,
      segmentCount: s.segment_count || 0,
      preview: s.preview || "",
      exportText: s.export_text || "",
      audioPath: s.audio_path || null,
      audioSize: s.audio_size || null,
    }));
  } catch (err) {
    console.warn("[Marqad] loadHistoryFromDB error:", err);
    return [];
  }
}

// Delete a session from the database (also deletes audio from storage)
export async function deleteSessionFromDB(id: string): Promise<void> {
  try {
    const resp = await fetch(`${SESSIONS_ENDPOINT}/${id}`, { method: "DELETE" });
    if (!resp.ok) {
      console.warn("[Marqad] deleteSessionFromDB failed:", resp.status);
    }
  } catch (err) {
    console.warn("[Marqad] deleteSessionFromDB error:", err);
  }
}

// ============================================================
// Monthly Usage Tracking (Section 3.7 — free tier calculator)
// Free tier: 3,000 minutes/month, 2 concurrent real-time sessions
// Tracks ACTUAL streaming seconds (excludes paused time).
// Stored in Supabase database via edge function (not localStorage).
// ============================================================

export const FREE_TIER_MINUTES = 3000;

const USAGE_ENDPOINT =
  process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/usage`
    : "https://vnrgimvfsdgcpgfwcnlw.supabase.co/functions/v1/usage";

// In-memory cache — synced with database
let cachedSeconds: number | null = null;

function getMonthlyKey(): string {
  const now = new Date();
  return `marqad-usage-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Load from database (async) — also caches locally as fallback
export async function loadMonthlySecondsFromDB(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const resp = await fetch(USAGE_ENDPOINT, { method: "GET" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const seconds = data.seconds || 0;
    cachedSeconds = seconds;
    // Also save to localStorage as fallback
    try { localStorage.setItem(getMonthlyKey(), String(seconds)); } catch {}
    return seconds;
  } catch {
    // Fallback to localStorage if database is unreachable
    const val = localStorage.getItem(getMonthlyKey());
    const seconds = val ? parseFloat(val) : 0;
    cachedSeconds = seconds;
    return seconds;
  }
}

// Sync version — uses cached value or localStorage fallback
export function loadMonthlySeconds(): number {
  if (typeof window === "undefined") return 0;
  if (cachedSeconds !== null) return cachedSeconds;
  const val = localStorage.getItem(getMonthlyKey());
  if (!val) return 0;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

// Add seconds to database (async, fire-and-forget)
export async function addToMonthlySecondsDB(seconds: number): Promise<number> {
  if (typeof window === "undefined" || seconds <= 0) return loadMonthlySeconds();
  try {
    const resp = await fetch(USAGE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const newSeconds = data.seconds || 0;
    cachedSeconds = newSeconds;
    // Also save to localStorage as fallback
    try { localStorage.setItem(getMonthlyKey(), String(newSeconds)); } catch {}
    return newSeconds;
  } catch {
    // Fallback to localStorage if database is unreachable
    return addToMonthlySeconds(seconds);
  }
}

// Local fallback (localStorage only)
export function addToMonthlySeconds(seconds: number): number {
  const current = loadMonthlySeconds();
  const updated = current + seconds;
  try { localStorage.setItem(getMonthlyKey(), String(updated)); } catch {}
  cachedSeconds = updated;
  return updated;
}

export interface UsageStats {
  monthlySeconds: number;
  monthlyMinutes: number;
  freeTierMinutes: number;
  remainingMinutes: number;
  percentUsed: number;
  remainingPercent: number;
  daysInMonth: number;
  dayOfMonth: number;
  // Projected usage at current rate
  projectedMonthlyMinutes: number;
  isOverLimit: boolean;
  // Warning tiers for graceful UX (gap 3 fix)
  isApproachingLimit: boolean;  // >= 80% used
  isCriticalLimit: boolean;     // >= 95% used
  // Estimated minutes the current session can still run before hitting limit
  sessionRemainingMinutes: number;
}

export function getUsageStats(currentSessionSec: number): UsageStats {
  const monthlySeconds = loadMonthlySeconds();
  // Include current session seconds in the monthly total for accurate display
  const totalSeconds = monthlySeconds + currentSessionSec;
  const monthlyMinutes = totalSeconds / 60;
  const sessionMinutes = currentSessionSec / 60;
  const remainingMinutes = Math.max(0, FREE_TIER_MINUTES - monthlyMinutes);
  const percentUsed = Math.min(100, (monthlyMinutes / FREE_TIER_MINUTES) * 100);

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Project: if user uses `monthlyMinutes` so far in `dayOfMonth` days,
  // project to full month
  const projectedMonthlyMinutes =
    dayOfMonth > 0 ? (monthlyMinutes / dayOfMonth) * daysInMonth : monthlyMinutes;

  // How much of the remaining monthly budget is left for THIS session
  const sessionRemainingMinutes = Math.max(0, remainingMinutes - sessionMinutes);

  return {
    monthlySeconds,
    monthlyMinutes,
    freeTierMinutes: FREE_TIER_MINUTES,
    remainingMinutes,
    percentUsed,
    remainingPercent: 100 - percentUsed,
    daysInMonth,
    dayOfMonth,
    projectedMonthlyMinutes,
    isOverLimit: monthlyMinutes >= FREE_TIER_MINUTES,
    isApproachingLimit: percentUsed >= 80 && percentUsed < 95,
    isCriticalLimit: percentUsed >= 95,
    sessionRemainingMinutes,
  };
}

// ===== History backup/export (gap 6 fix) =====

export function exportHistoryJSON(): string {
  const history = loadHistory();
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: 1,
    sessions: history,
  }, null, 2);
}

export function importHistoryJSON(json: string): SessionRecord[] {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.sessions || !Array.isArray(parsed.sessions)) {
      throw new Error("Invalid backup format");
    }
    const existing = loadHistory();
    const existingIds = new Set(existing.map((s) => s.id));
    // Merge: add imported sessions that don't already exist
    const merged = [...existing];
    for (const session of parsed.sessions) {
      if (!existingIds.has(session.id)) {
        merged.push(session);
      }
    }
    // Sort by date descending
    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    // Trim to max
    if (merged.length > MAX_HISTORY_ENTRIES) {
      merged.length = MAX_HISTORY_ENTRIES;
    }
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
    } catch {}
    return merged;
  } catch {
    throw new Error("Invalid backup file");
  }
}
