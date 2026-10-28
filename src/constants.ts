import { BeltRank, AveryTemplate, Student } from "./types";

export const KARATE_RANKS: BeltRank[] = [
  {
    id: "white",
    name: "White Belt",
    program: "karate",
    color: "#f4f4f5",
    order: 1,
    price: 0,
  },
  {
    id: "kyu9",
    name: "9th Kyu - Red with White Stripe",
    program: "karate",
    color: "#ef4444",
    stripe: { color: "#ffffff", style: "horizontal" },
    kyuText: "9th Kyu",
    order: 2,
    price: 30,
  },
  {
    id: "int8",
    name: "Int. 8th Kyu - Red/White",
    program: "karate",
    color: "linear-gradient(135deg, #ef4444 50%, #fafafa 50%)",
    kyuText: "Int. 8th",
    order: 3,
    price: 35,
  },
  {
    id: "kyu8",
    name: "8th Kyu - Red Belt",
    program: "karate",
    color: "#ef4444",
    kyuText: "8th Kyu",
    order: 4,
    price: 40,
  },
  {
    id: "int7",
    name: "Int. 7th Kyu - Red/Orange",
    program: "karate",
    color: "linear-gradient(135deg, #ef4444 50%, #f97316 50%)",
    kyuText: "Int. 7th",
    order: 5,
    price: 45,
  },
  {
    id: "kyu7",
    name: "7th Kyu - Orange Belt",
    program: "karate",
    color: "#f97316",
    kyuText: "7th Kyu",
    order: 6,
    price: 50,
  },
  {
    id: "int6",
    name: "Int. 6th Kyu - Orange/Yellow",
    program: "karate",
    color: "linear-gradient(135deg, #f97316 50%, #eab308 50%)",
    kyuText: "Int. 6th",
    order: 7,
    price: 55,
  },
  {
    id: "kyu6",
    name: "6th Kyu - Yellow Belt",
    program: "karate",
    color: "#eab308",
    kyuText: "6th Kyu",
    order: 8,
    price: 60,
  },
  {
    id: "int5",
    name: "Int. 5th Kyu - Yellow/Purple",
    program: "karate",
    color: "linear-gradient(135deg, #eab308 50%, #a855f7 50%)",
    kyuText: "Int. 5th",
    order: 9,
    price: 65,
  },
  {
    id: "kyu5",
    name: "5th Kyu - Purple Belt",
    program: "karate",
    color: "#a855f7",
    kyuText: "5th Kyu",
    order: 10,
    price: 70,
  },
  {
    id: "int4",
    name: "Int. 4th Kyu - Purple/Blue",
    program: "karate",
    color: "linear-gradient(135deg, #a855f7 50%, #3b82f6 50%)",
    kyuText: "Int. 4th",
    order: 11,
    price: 75,
  },
  {
    id: "kyu4",
    name: "4th Kyu - Blue Belt",
    program: "karate",
    color: "#3b82f6",
    kyuText: "4th Kyu",
    order: 12,
    price: 80,
  },
  {
    id: "int3",
    name: "Int. 3rd Kyu - Blue/Green",
    program: "karate",
    color: "linear-gradient(135deg, #3b82f6 50%, #22c55e 50%)",
    kyuText: "Int. 3rd",
    order: 13,
    price: 85,
  },
  {
    id: "kyu3",
    name: "3rd Kyu - Green Belt",
    program: "karate",
    color: "#22c55e",
    kyuText: "3rd Kyu",
    order: 14,
    price: 90,
  },
  {
    id: "int2",
    name: "Int. 2nd Kyu - Green/Brown",
    program: "karate",
    color: "linear-gradient(135deg, #22c55e 50%, #78350f 50%)",
    kyuText: "Int. 2nd",
    order: 15,
    price: 95,
  },
  {
    id: "kyu2",
    name: "2nd Kyu - Brown Belt",
    program: "karate",
    color: "#78350f",
    kyuText: "2nd Kyu",
    order: 16,
    price: 100,
  },
  {
    id: "int1",
    name: "Int. 1st Kyu - Brown/Black",
    program: "karate",
    color: "linear-gradient(135deg, #78350f 50%, #18181b 50%)",
    kyuText: "Int. 1st",
    order: 17,
    price: 105,
  },
  {
    id: "kyu1",
    name: "1st Kyu - Brown Belt with Black Stripe",
    program: "karate",
    color: "#78350f",
    stripe: { color: "#18181b", style: "horizontal" },
    kyuText: "1st Kyu",
    order: 18,
    price: 110,
  },
  {
    id: "intshodan",
    name: "Int. Shodan - Black with White Stripe",
    program: "karate",
    color: "#18181b",
    stripe: { color: "#ffffff", style: "horizontal" },
    kyuText: "Int. Shodan",
    order: 19,
    price: 150,
  },
  {
    id: "shodan",
    name: "Shodan (Black Belt)",
    program: "karate",
    color: "#18181b",
    kyuText: "Shodan",
    order: 20,
    price: 225,
  },
];

export const TOTS_RANKS: BeltRank[] = [
  {
    id: "t_white",
    name: "White Belt",
    program: "tots",
    color: "#f4f4f5",
    order: 1,
    price: 0,
  },
  {
    id: "t_red",
    name: "Red Belt",
    program: "tots",
    color: "linear-gradient(to bottom, #ffffff 30%, #ef4444 30%, #ef4444 70%, #ffffff 70%)",
    order: 2,
    price: 25,
  },
  {
    id: "t_orange",
    name: "Orange Belt",
    program: "tots",
    color: "linear-gradient(to bottom, #ffffff 30%, #f97316 30%, #f97316 70%, #ffffff 70%)",
    order: 3,
    price: 25,
  },
  {
    id: "t_yellow",
    name: "Yellow Belt",
    program: "tots",
    color: "linear-gradient(to bottom, #ffffff 30%, #eab308 30%, #eab308 70%, #ffffff 70%)",
    order: 4,
    price: 25,
  },
  {
    id: "t_purple",
    name: "Purple Belt",
    program: "tots",
    color: "linear-gradient(to bottom, #ffffff 30%, #a855f7 30%, #a855f7 70%, #ffffff 70%)",
    order: 5,
    price: 25,
  },
  {
    id: "t_blue",
    name: "Blue Belt",
    program: "tots",
    color: "linear-gradient(to bottom, #ffffff 30%, #3b82f6 30%, #3b82f6 70%, #ffffff 70%)",
    order: 6,
    price: 25,
  },
  {
    id: "t_green",
    name: "Green Belt",
    program: "tots",
    color: "linear-gradient(to bottom, #ffffff 30%, #22c55e 30%, #22c55e 70%, #ffffff 70%)",
    order: 7,
    price: 25,
  },
  {
    id: "t_brown",
    name: "Brown Belt",
    program: "tots",
    color: "linear-gradient(to bottom, #ffffff 30%, #78350f 30%, #78350f 70%, #ffffff 70%)",
    order: 8,
    price: 25,
  },
  {
    id: "t_black",
    name: "Black Belt",
    program: "tots",
    color: "linear-gradient(to bottom, #ffffff 30%, #18181b 30%, #18181b 70%, #ffffff 70%)",
    order: 9,
    price: 25,
  },
];

export const KOBUDO_RANKS: BeltRank[] = [
  {
    id: "k_white",
    name: "White Belt",
    program: "kobudo",
    color: "#f4f4f5",
    order: 1,
    price: 0,
  },
  {
    id: "k_kyu9",
    name: "9th Kyu - Red with White Stripe",
    program: "kobudo",
    color: "#ef4444",
    stripe: { color: "#ffffff", style: "horizontal" },
    kyuText: "9th Kyu",
    order: 2,
    price: 30,
  },
  {
    id: "k_kyu7",
    name: "7th Kyu - Orange with White Stripe",
    program: "kobudo",
    color: "#f97316",
    stripe: { color: "#ffffff", style: "horizontal" },
    kyuText: "7th Kyu",
    order: 3,
    price: 50,
  },
  {
    id: "k_kyu5",
    name: "5th Kyu - Purple with White Stripe",
    program: "kobudo",
    color: "#a855f7",
    stripe: { color: "#ffffff", style: "horizontal" },
    kyuText: "5th Kyu",
    order: 4,
    price: 70,
  },
  {
    id: "k_kyu3",
    name: "3rd Kyu - Green with White Stripe",
    program: "kobudo",
    color: "#22c55e",
    stripe: { color: "#ffffff", style: "horizontal" },
    kyuText: "3rd Kyu",
    order: 5,
    price: 90,
  },
  {
    id: "k_kyu1",
    name: "1st Kyu - Brown with White Stripe",
    program: "kobudo",
    color: "#78350f",
    stripe: { color: "#ffffff", style: "horizontal" },
    kyuText: "1st Kyu",
    order: 6,
    price: 110,
  },
  {
    id: "k_intshodan",
    name: "Int. Shodan - Black with White Stripe",
    program: "kobudo",
    color: "#18181b",
    stripe: { color: "#ffffff", style: "horizontal" },
    kyuText: "Int. Shodan",
    order: 7,
    price: 150,
  },
  {
    id: "k_shodan",
    name: "Shodan (Black Belt)",
    program: "kobudo",
    color: "#18181b",
    kyuText: "Shodan",
    order: 8,
    price: 225,
  },
];

export const AVERY_TEMPLATES: AveryTemplate[] = [
  {
    id: "avery-5160",
    name: "Avery 5160 / 8160 (30 per sheet)",
    columns: 3,
    rows: 10,
    width: 2.625,
    height: 1.0,
    marginTop: 0.5,
    marginBottom: 0.5,
    marginLeft: 0.219, // centered left/right margin approx
    marginRight: 0.218,
    columnGap: 0.125,
    rowGap: 0,
    paperSize: "letter",
  },
  {
    id: "avery-5163",
    name: "Avery 5163 / 8163 (10 per sheet)",
    columns: 2,
    rows: 5,
    width: 4.0,
    height: 2.0,
    marginTop: 0.5,
    marginBottom: 0.5,
    marginLeft: 0.156,
    marginRight: 0.156,
    columnGap: 0.18,
    rowGap: 0,
    paperSize: "letter",
  },
  {
    id: "avery-5164",
    name: "Avery 5164 / 8164 (6 per sheet)",
    columns: 2,
    rows: 3,
    width: 4.0,
    height: 3.33,
    marginTop: 0.5,
    marginBottom: 0.5,
    marginLeft: 0.156,
    marginRight: 0.156,
    columnGap: 0.18,
    rowGap: 0,
    paperSize: "letter",
  },
];

// Helper to normalize any Kobudo rank string, alias, or ID to a standard KOBUDO_RANKS id
export function normalizeKobudoRankId(rawId?: string): string {
  if (!rawId) return "k_white";
  const trimmed = String(rawId).trim().toLowerCase();
  if (
    !trimmed ||
    trimmed === "white" ||
    trimmed === "k_white" ||
    trimmed === "kobudo_white" ||
    trimmed === "white belt"
  ) {
    return "k_white";
  }

  // Exact KOBUDO_RANKS id match
  const exact = KOBUDO_RANKS.find((r) => r.id.toLowerCase() === trimmed);
  if (exact) return exact.id;

  // With k_ prefix
  const withK = KOBUDO_RANKS.find((r) => r.id.toLowerCase() === `k_${trimmed}`);
  if (withK) return withK.id;

  // Strip k_ or kobudo_ if present
  const stripped = trimmed.replace(/^k_|^kobudo_/, "");
  const strippedMatch = KOBUDO_RANKS.find(
    (r) =>
      r.id.toLowerCase() === `k_${stripped}` || r.id.toLowerCase() === stripped,
  );
  if (strippedMatch) return strippedMatch.id;

  // Match by full name or kyuText
  const byNameOrKyu = KOBUDO_RANKS.find(
    (r) =>
      r.name.toLowerCase() === trimmed ||
      (r.kyuText && r.kyuText.toLowerCase() === trimmed),
  );
  if (byNameOrKyu) return byNameOrKyu.id;

  // Check aliases & keywords in order from highest to lowest rank
  if (
    trimmed.includes("int") &&
    (trimmed.includes("shodan") || trimmed.includes("black"))
  )
    return "k_intshodan";
  if (
    trimmed.includes("shodan") ||
    trimmed.includes("black belt") ||
    trimmed === "black"
  )
    return "k_shodan";
  if (
    trimmed.includes("1st") ||
    trimmed.includes("brown") ||
    trimmed === "kyu1" ||
    trimmed === "kyu2" ||
    trimmed.includes("2nd")
  )
    return "k_kyu1";
  if (
    trimmed.includes("3rd") ||
    trimmed.includes("green") ||
    trimmed === "kyu3" ||
    trimmed === "kyu4" ||
    trimmed.includes("4th")
  )
    return "k_kyu3";
  if (
    trimmed.includes("5th") ||
    trimmed.includes("purple") ||
    trimmed === "kyu5" ||
    trimmed === "kyu6" ||
    trimmed.includes("6th")
  )
    return "k_kyu5";
  if (
    trimmed.includes("7th") ||
    trimmed.includes("orange") ||
    trimmed === "kyu7" ||
    trimmed.includes("8th") ||
    trimmed === "kyu8"
  )
    return "k_kyu7";
  if (
    trimmed.includes("9th") ||
    trimmed.includes("red") ||
    trimmed === "kyu9"
  )
    return "k_kyu9";

  return "k_white";
}

// Helper to normalize any Tots rank string, alias, or ID to a standard TOTS_RANKS id
export function normalizeTotsRankId(rawId?: string): string {
  if (!rawId) return "t_white";
  const trimmed = String(rawId).trim().toLowerCase();
  if (
    !trimmed ||
    trimmed === "white" ||
    trimmed === "t_white" ||
    trimmed === "tot_white" ||
    trimmed === "tots_white" ||
    trimmed === "white belt"
  ) {
    return "t_white";
  }

  // Exact match in TOTS_RANKS
  const exact = TOTS_RANKS.find((r) => r.id.toLowerCase() === trimmed);
  if (exact) return exact.id;

  // With t_ prefix (e.g., "red" -> "t_red")
  const withT = TOTS_RANKS.find((r) => r.id.toLowerCase() === `t_${trimmed}`);
  if (withT) return withT.id;

  // Strip prefixes (t_, tot_, tots_)
  const stripped = trimmed.replace(/^t_|^tot_|^tots_/, "");
  const strippedMatch = TOTS_RANKS.find(
    (r) =>
      r.id.toLowerCase() === `t_${stripped}` || r.id.toLowerCase() === stripped
  );
  if (strippedMatch) return strippedMatch.id;

  // Match by name (e.g. "Red Belt", "red")
  const byName = TOTS_RANKS.find(
    (r) =>
      r.name.toLowerCase() === trimmed ||
      r.name.toLowerCase().replace(" belt", "").trim() === stripped
  );
  if (byName) return byName.id;

  // Check color keywords
  if (trimmed.includes("black")) return "t_black";
  if (trimmed.includes("brown")) return "t_brown";
  if (trimmed.includes("green")) return "t_green";
  if (trimmed.includes("blue")) return "t_blue";
  if (trimmed.includes("purple")) return "t_purple";
  if (trimmed.includes("yellow")) return "t_yellow";
  if (trimmed.includes("orange")) return "t_orange";
  if (trimmed.includes("red")) return "t_red";

  return "t_white";
}

// Helper functions for student rank resolution & eligibility calculations
export function getStudentRankId(
  student: Student,
  program: "karate" | "tots" | "kobudo",
  weapon?: "Bo" | "Sai",
): string {
  if (!student) return program === "kobudo" ? "k_white" : program === "tots" ? "t_white" : "white";

  if (program === "kobudo") {
    const raw = student.rankings?.kobudo;
    const normalizedRaw = raw ? normalizeKobudoRankId(raw) : undefined;

    // If a specific testing weapon is specified or set on the student, use that weapon's rank
    const activeTestingWeapon = weapon || student.kobudoTestingWeapon;
    if (activeTestingWeapon === "Bo" && student.kobudoRankings?.bo) {
      return normalizeKobudoRankId(student.kobudoRankings.bo);
    }
    if (activeTestingWeapon === "Sai" && student.kobudoRankings?.sai) {
      return normalizeKobudoRankId(student.kobudoRankings.sai);
    }

    if (student.kobudoRankings) {
      const activeWeapons = student.kobudoWeapons || [];
      const hasBo = activeWeapons.length === 0 || activeWeapons.includes("Bo");
      const hasSai = activeWeapons.length === 0 || activeWeapons.includes("Sai");

      const boId = (hasBo && student.kobudoRankings.bo) ? normalizeKobudoRankId(student.kobudoRankings.bo) : undefined;
      const saiId = (hasSai && student.kobudoRankings.sai) ? normalizeKobudoRankId(student.kobudoRankings.sai) : undefined;
      const ranks = KOBUDO_RANKS;

      const getIdx = (id?: string) => (id ? ranks.findIndex((r) => r.id === id) : -1);
      const rawIdx = normalizedRaw ? getIdx(normalizedRaw) : -1;
      const boIdx = getIdx(boId);
      const saiIdx = getIdx(saiId);

      const maxIdx = Math.max(
        rawIdx >= 0 ? rawIdx : 0,
        boIdx >= 0 ? boIdx : 0,
        saiIdx >= 0 ? saiIdx : 0,
      );
      return ranks[maxIdx]?.id || "k_white";
    }
    return normalizedRaw || "k_white";
  } else if (program === "tots") {
    const raw = student.rankings?.tots;
    return normalizeTotsRankId(raw);
  } else {
    return student.rankings?.karate || "white";
  }
}

export function getProgramOverride(
  student: Student,
  program: "karate" | "tots" | "kobudo",
): "eligible" | "ineligible" | null {
  if (student.manualOverrides && student.manualOverrides[program] !== undefined && student.manualOverrides[program] !== null) {
    return student.manualOverrides[program];
  }
  if (student.programs && student.programs.length === 1 && student.programs[0] === program) {
    return student.manualOverride || null;
  }
  return null;
}

export function getNextRank(
  program: "karate" | "tots" | "kobudo",
  currentRankId: string,
): BeltRank | null {
  if (!currentRankId) return null;
  const ranks =
    program === "karate"
      ? KARATE_RANKS
      : program === "tots"
        ? TOTS_RANKS
        : KOBUDO_RANKS;

  let searchId = currentRankId;
  if (program === "kobudo") {
    searchId = normalizeKobudoRankId(currentRankId);
  } else if (program === "tots") {
    searchId = normalizeTotsRankId(currentRankId);
  }

  let currentIndex = ranks.findIndex((r) => r.id === searchId);
  if (currentIndex === -1) {
    currentIndex = ranks.findIndex(
      (r) =>
        r.name.toLowerCase() === searchId.toLowerCase() ||
        (r.kyuText && r.kyuText.toLowerCase() === searchId.toLowerCase())
    );
  }
  if (currentIndex === -1) {
    currentIndex = 0; // Default to first rank if completely unknown
  }
  if (currentIndex === ranks.length - 1) {
    return ranks[currentIndex]; // No max level: just return the current rank as the "next" target
  }
  return ranks[currentIndex + 1];
}

export interface EligibilityResult {
  eligible: boolean;
  isProvisional?: boolean;
  classesRequired: number;
  classesActual: number;
  reasons: string[];
}

export function checkEligibility(
  student: Student,
  program: "karate" | "tots" | "kobudo",
  classesBuffer: number = 0,
): EligibilityResult {
  const currentRankId = getStudentRankId(student, program);

  let classesRequired = 16;

  const isBlackBeltRank =
    currentRankId === "shodan" || currentRankId === "k_shodan" || currentRankId === "t_black";

  if (isBlackBeltRank) {
    classesRequired = 9999; // Requires manual override
  } else if (program === "karate") {
    if (currentRankId === "white") {
      classesRequired = 8;
    } else {
      const nextRank = getNextRank("karate", currentRankId);
      const targetRankId = nextRank?.id || "";
      const targetKyu = (nextRank?.kyuText || "").toLowerCase();
      const targetName = (nextRank?.name || "").toLowerCase();

      // For KARATE students that are testing for 1st Kyu, Int Shodan, or Shodan,
      // the minimum class requirement is 24 classes instead of 16.
      const isTestingForHighKarateRank =
        targetRankId === "kyu1" ||
        targetRankId === "intshodan" ||
        targetRankId === "shodan" ||
        targetKyu === "1st kyu" ||
        targetKyu === "int. shodan" ||
        targetKyu === "shodan" ||
        targetName.includes("1st kyu") ||
        targetName.includes("int. shodan") ||
        targetName.includes("shodan");

      if (isTestingForHighKarateRank) {
        classesRequired = 24;
      } else {
        classesRequired = 16;
      }
    }
  } else if (program === "tots") {
    classesRequired = 16;
  } else if (program === "kobudo") {
    classesRequired = 16;
  }

  const classesActual =
    (student.attendance && student.attendance[program]) || 0;

  const reasons: string[] = [];

  const classesOk = classesActual >= classesRequired;
  const classesProvisional =
    !classesOk &&
    classesActual + classesBuffer >= classesRequired &&
    classesRequired !== 9999 &&
    program !== "kobudo";

  if (!classesOk && !classesProvisional && classesRequired !== 9999) {
    reasons.push(
      `Requires at least ${classesRequired} classes attended (has ${classesActual})`,
    );
  } else if (classesProvisional) {
    reasons.push(
      `Provisionally eligible: currently at ${classesActual}/${classesRequired} (Projected classes will meet goal)`,
    );
  } else if (classesRequired === 9999) {
    reasons.push(`Shodan rank requires instructor manual approval`);
  }

  // Base eligibility combined
  let eligible = classesOk || classesProvisional;
  let isProvisional = classesProvisional;

  // Manual Overrides (Program-scoped, prevents cross-program bleeding)
  const override = getProgramOverride(student, program);

  if (override === "eligible") {
    eligible = true;
    isProvisional = false;
  } else if (override === "ineligible") {
    eligible = false;
    isProvisional = false;
  }

  return {
    eligible,
    isProvisional,
    classesRequired,
    classesActual,
    reasons,
  };
}

export function getRankCategory(
  program: string,
  rankId: string,
): "tots" | "beginner" | "intermediate" | "advanced" {
  if (program === "tots") return "tots";
  if (program === "kobudo") return "beginner"; // Typically grouped with beginners or as own group

  const beginnerIds = [
    "kyu9",
    "int8",
    "kyu8",
    "int7",
    "kyu7",
    "int6",
    "k_kyu9",
    "k_int8",
    "k_white",
    "white",
  ];
  const intermediateIds = [
    "kyu6",
    "int5",
    "kyu5",
    "int4",
    "kyu4",
    "int3",
    "kyu3",
    "int2",
    "kyu2",
    "k_kyu8",
    "k_int7",
    "k_kyu7",
    "k_int6",
    "k_kyu6",
    "k_int5",
    "k_kyu5",
  ];

  if (beginnerIds.includes(rankId)) return "beginner";
  if (intermediateIds.includes(rankId)) return "intermediate";
  return "advanced";
}

export function getGroupLabel(program: string, rankId: string): string {
  const category = getRankCategory(program, rankId);
  const progLabel = program.charAt(0).toUpperCase() + program.slice(1);

  if (program === "tots") return "Tots";
  if (program === "kobudo") return "Kobudo";

  return `${progLabel} ${category.charAt(0).toUpperCase() + category.slice(1)}`;
}

export function getTestTime(program: string, rankId: string): string {
  if (program === "tots") return "1:00 PM";
  if (program === "kobudo") return "3:30 PM";

  const category = getRankCategory(program, rankId);
  if (category === "beginner") return "1:30 PM";
  if (category === "intermediate") return "2:30 PM";
  if (category === "advanced") return "3:30 PM";

  return "2:30 PM"; // Default
}
