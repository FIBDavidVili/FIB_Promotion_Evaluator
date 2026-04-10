export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      message: "❌ Method not allowed",
    });
  }

  const MAIN_SHEET_ID = "1R7SpirGzmgUzZK6_MwcH0LGAubwShjsaxxJG2fFDi5g";
  const MAIN_GID = "1598342668";
  const FTD_SHEET_ID = "1YaUUYYXVPOffZQr7L51SPaDscz7XA6foQImhFqbu5yk";
  const FTD_GID = "476091669";
  const HOURS_MANAGER_GID = "264837711";

  const REQUIREMENTS: Record<
    string,
    {
      nextRank: string | null;
      minHours: number;
      minTir: number;
      mustBeInFtd: boolean;
      minFtdJobs: number;
      minMonthlyHours?: number;
    }
  > = {
    "Probationary Agent": {
      nextRank: "Agent",
      minHours: 0,
      minTir: 0,
      mustBeInFtd: false,
      minFtdJobs: 0,
    },
    Agent: {
      nextRank: "Senior Agent",
      minHours: 5,
      minTir: 7,
      mustBeInFtd: false,
      minFtdJobs: 0,
    },
    "Senior Agent": {
      nextRank: "Special Agent",
      minHours: 5,
      minTir: 7,
      mustBeInFtd: false,
      minFtdJobs: 0,
    },
    "Special Agent": {
      nextRank: "Senior Special Agent",
      minHours: 5,
      minTir: 7,
      mustBeInFtd: false,
      minFtdJobs: 0,
    },
    "Senior Special Agent": {
      nextRank: "Supervisory Special Agent",
      minHours: 5,
      minTir: 14,
      mustBeInFtd: true,
      minFtdJobs: 3,
    },
    "Supervisory Special Agent": {
      nextRank: "Assistant Special Agent in Charge",
      minHours: 5,
      minTir: 14,
      mustBeInFtd: true,
      minFtdJobs: 3,
    },
    "Assistant Special Agent in Charge": {
      nextRank: "Special Agent in Charge",
      minHours: 5,
      minTir: 14,
      mustBeInFtd: true,
      minFtdJobs: 5,
    },
    "Special Agent in Charge": {
      nextRank: "Senior Special Agent In Charge",
      minHours: 5,
      minTir: 14,
      mustBeInFtd: true,
      minFtdJobs: 6,
    },
    "Senior Special Agent In Charge": {
      nextRank: "Agent Commander",
      minHours: 5,
      minTir: 21,
      mustBeInFtd: true,
      minFtdJobs: 6,
      minMonthlyHours: 25,
    },
    "Agent Commander": {
      nextRank: "Section Commander",
      minHours: 5,
      minTir: 21,
      mustBeInFtd: true,
      minFtdJobs: 3,
      minMonthlyHours: 25,
    },
    "Section Commander": {
      nextRank: "Commander in Charge",
      minHours: 5,
      minTir: 21,
      mustBeInFtd: true,
      minFtdJobs: 3,
      minMonthlyHours: 25,
    },
    "Commander in Charge": {
      nextRank: "Command Specialist",
      minHours: 5,
      minTir: 21,
      mustBeInFtd: true,
      minFtdJobs: 3,
      minMonthlyHours: 25,
    },
    "Command Specialist": {
      nextRank: null,
      minHours: 5,
      minTir: 28,
      mustBeInFtd: true,
      minFtdJobs: 3,
      minMonthlyHours: 30,
    },
  };

  function normalize(value: unknown): string {
    return String(value ?? "").replace(/\uFEFF/g, "").trim().toLowerCase();
  }

  function cleanId(value: unknown): string {
    return String(value ?? "").replace(/\D/g, "").trim();
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
        continue;
      }

      current += char;
    }

    result.push(current);
    return result.map((cell) => cell.trim());
  }

  function parseCSV(text: string): string[][] {
    return text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)
      .map(parseCSVLine);
  }

  async function fetchSheet(sheetId: string, gid: string): Promise<string[][]> {
    const urls = [
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`,
      `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
    ];

    let lastError: unknown = null;

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch sheet ${gid}: ${response.status}`);
        }

        const text = await response.text();
        if (!text.trim()) {
          throw new Error(`Empty sheet response for ${gid}`);
        }

        return parseCSV(text);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Failed to fetch sheet");
  }

  function getHeaderMap(row: string[]) {
    const map: Record<string, number> = {};
    row.forEach((cell, index) => {
      const key = normalize(cell);
      if (key) {
        map[key] = index;
      }
    });
    return map;
  }

  function findMainRosterEmployee(rows: string[][], discordId: string) {
    let headerMap: Record<string, number> | null = null;

    for (const row of rows) {
      const normalizedRow = row.map(normalize);

      if (normalizedRow.includes("rank") && normalizedRow.includes("discord id")) {
        headerMap = getHeaderMap(row);
        continue;
      }

      if (!headerMap) continue;

      const discordIdx = headerMap["discord id"];
      const rankIdx = headerMap["rank"];
      const hoursIdx = headerMap["hours"];
      const tirIdx = headerMap["time in rank"];
      const nameIdx = headerMap["name"];

      if ([discordIdx, rankIdx, hoursIdx, tirIdx, nameIdx].some((idx) => idx === undefined)) {
        continue;
      }

      const rowDiscordId = cleanId(row[discordIdx]);
      if (!rowDiscordId || rowDiscordId !== discordId) continue;

      return {
        name: row[nameIdx] || "",
        rank: row[rankIdx] || "",
        hours: Number(row[hoursIdx] || 0),
        tir: Number(row[tirIdx] || 0),
      };
    }

    return null;
  }

  function findFtdEmployee(rows: string[][], discordId: string) {
    let headerMap: Record<string, number> | null = null;

    for (const row of rows) {
      const normalizedRow = row.map(normalize);

      if (
        normalizedRow.includes("discord id") &&
        (normalizedRow.includes("activities") || normalizedRow.includes("total logs"))
      ) {
        headerMap = getHeaderMap(row);
        continue;
      }

      if (!headerMap) continue;

      const discordIdx = headerMap["discord id"];
      const activitiesIdx = headerMap["activities"] ?? headerMap["total logs"];

      if (discordIdx === undefined || activitiesIdx === undefined) {
        continue;
      }

      const rowDiscordId = cleanId(row[discordIdx]);
      if (!rowDiscordId || rowDiscordId !== discordId) continue;

      return {
        inFtd: true,
        ftdActivities: Number(row[activitiesIdx] || 0),
      };
    }

    return {
      inFtd: false,
      ftdActivities: 0,
    };
  }

  function findMonthlyHoursEmployee(rows: string[][], discordId: string) {
    for (const row of rows) {
      const rowDiscordId = cleanId(row[5]); // F
      if (!rowDiscordId || rowDiscordId !== discordId) continue;

      return {
        monthlyHours: Number(row[6] || 0), // G
      };
    }

    return {
      monthlyHours: 0,
    };
  }

  const discordId = cleanId(req.query.discordId);

  if (!discordId) {
    return res.status(400).json({
      ok: false,
      message: "❌ No Discord ID provided",
    });
  }

  try {
    const [main, ftd, hours] = await Promise.all([
      fetchSheet(MAIN_SHEET_ID, MAIN_GID),
      fetchSheet(FTD_SHEET_ID, FTD_GID),
      fetchSheet(MAIN_SHEET_ID, HOURS_MANAGER_GID),
    ]);

    const employee = findMainRosterEmployee(main, discordId);

    if (!employee) {
      return res.status(404).json({
        ok: false,
        message: "❌ User not found",
      });
    }

    const reqData = REQUIREMENTS[employee.rank];

    if (!reqData) {
      return res.status(400).json({
        ok: false,
        message: `❌ Unsupported rank: ${employee.rank}`,
      });
    }

    const ftdData = findFtdEmployee(ftd, discordId);
    const monthlyData = findMonthlyHoursEmployee(hours, discordId);

    const inFtd = ftdData.inFtd;
    const ftdActivities = ftdData.ftdActivities;
    const monthlyHours = monthlyData.monthlyHours;

    const missing: string[] = [];

    if (employee.hours < reqData.minHours) {
      missing.push(`${reqData.minHours - employee.hours} more hour(s)`);
    }

    if (employee.tir < reqData.minTir) {
      missing.push(`${reqData.minTir - employee.tir} more TIR day(s)`);
    }

    if (reqData.mustBeInFtd && !inFtd) {
      missing.push("Must be in FTD");
    }

    if (ftdActivities < reqData.minFtdJobs) {
      missing.push(`${reqData.minFtdJobs - ftdActivities} more FTD activities`);
    }

    if ((reqData.minMonthlyHours || 0) > 0 && monthlyHours < (reqData.minMonthlyHours || 0)) {
      missing.push(`${(reqData.minMonthlyHours || 0) - monthlyHours} more monthly hour(s)`);
    }

    const eligible = missing.length === 0;
    const status = eligible ? "✅ Eligible" : "❌ Not Eligible";
    const nextRank = reqData.nextRank || "High Command";
    const missingText = eligible ? "None" : missing.join(", ");

    const monthlyLine =
      (reqData.minMonthlyHours || 0) > 0 ? `**Monthly Hours:** ${monthlyHours}\n` : "";

    const message =
`**Name:** ${employee.name}
**Rank:** ${employee.rank}
**Next Rank:** ${nextRank}

**Status:** ${status}

**Hours:** ${employee.hours}
**TIR:** ${employee.tir}
**FTD:** ${inFtd ? "Yes" : "No"}
**FTD Activities:** ${ftdActivities}
${monthlyLine}**Missing:** ${missingText}`;

    return res.status(200).json({
      ok: true,
      message,
      name: employee.name,
      rank: employee.rank,
      nextRank,
      eligible,
      missing: missingText,
      hours: employee.hours,
      tir: employee.tir,
      ftd: inFtd ? "Yes" : "No",
      ftdActivities,
      monthlyHours,
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      message: `❌ ${e?.message || "Failed to fetch data"}`,
    });
  }
}
