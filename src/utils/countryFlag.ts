const countryFlagByName: Record<string, { code: string; label: string }> = {
    bolivia: { code: "bo", label: "Bolivia" },
    brazil: { code: "br", label: "Brazil" },
    burundi: { code: "bi", label: "Burundi" },
    cameroon: { code: "cm", label: "Cameroon" },
    china: { code: "cn", label: "China" },
    colombia: { code: "co", label: "Colombia" },
    'costa rica': { code: "cr", label: "Costa Rica" },
    'democratic republic of the congo': { code: "cd", label: "Democratic Republic of the Congo" },
    'dr congo': { code: "cd", label: "Democratic Republic of the Congo" },
    drc: { code: "cd", label: "Democratic Republic of the Congo" },
    ecuador: { code: "ec", label: "Ecuador" },
    'el salvador': { code: "sv", label: "El Salvador" },
    ethiopia: { code: "et", label: "Ethiopia" },
    guatemala: { code: "gt", label: "Guatemala" },
    honduras: { code: "hn", label: "Honduras" },
    india: { code: "in", label: "India" },
    indonesia: { code: "id", label: "Indonesia" },
    jamaica: { code: "jm", label: "Jamaica" },
    kenya: { code: "ke", label: "Kenya" },
    malawi: { code: "mw", label: "Malawi" },
    mexico: { code: "mx", label: "Mexico" },
    myanmar: { code: "mm", label: "Myanmar" },
    nicaragua: { code: "ni", label: "Nicaragua" },
    panama: { code: "pa", label: "Panama" },
    papua: { code: "pg", label: "Papua New Guinea" },
    'papua new guinea': { code: "pg", label: "Papua New Guinea" },
    peru: { code: "pe", label: "Peru" },
    rwanda: { code: "rw", label: "Rwanda" },
    tanzania: { code: "tz", label: "Tanzania" },
    thailand: { code: "th", label: "Thailand" },
    uganda: { code: "ug", label: "Uganda" },
    vietnam: { code: "vn", label: "Vietnam" },
    yemen: { code: "ye", label: "Yemen" },
    zambia: { code: "zm", label: "Zambia" }
};

const regionCountryAliases: Record<string, string> = {
    aceh: "indonesia",
    antioquia: "colombia",
    apante: "nicaragua",
    aricha: "ethiopia",
    atitlan: "guatemala",
    boquete: "panama",
    cajamarca: "peru",
    cauca: "colombia",
    cerrado: "brazil",
    chiapas: "mexico",
    coban: "guatemala",
    comayagua: "honduras",
    huila: "colombia",
    huehuetenango: "guatemala",
    irgachefe: "ethiopia",
    jimma: "ethiopia",
    kaffa: "ethiopia",
    kirinyaga: "kenya",
    kona: "united states",
    limu: "ethiopia",
    lington: "colombia",
    mantiqueira: "brazil",
    marcala: "honduras",
    matagalpa: "nicaragua",
    minas: "brazil",
    narino: "colombia",
    nariño: "colombia",
    nyeri: "kenya",
    oaxaca: "mexico",
    sidama: "ethiopia",
    sidamo: "ethiopia",
    sumatra: "indonesia",
    tarrazu: "costa rica",
    tarrazú: "costa rica",
    tolima: "colombia",
    yirgacheffe: "ethiopia",
    yirgachefe: "ethiopia",
    yunnan: "china"
};

countryFlagByName["united states"] = { code: "us", label: "United States" };
countryFlagByName.usa = { code: "us", label: "United States" };
countryFlagByName.us = { code: "us", label: "United States" };

function normalizeOriginText(origin: string): string {
    return origin
        .toLowerCase()
        .replace(/[()\[\]{}]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasMultipleOrigins(origin: string): boolean {
    const normalized = normalizeOriginText(origin);

    if (!normalized) {
        return false;
    }

    if (/\b(blend|mixed|multi|various|multiple|several|seasonal)\b/.test(normalized)) {
        return true;
    }

    return /\s(?:and|&)\s|\s\/\s|\s\+\s|,|;/.test(normalized);
}

function findCountryFlag(value: string | null | undefined): { code: string; label: string } | null {
    if (!value) {
        return null;
    }

    const normalized = normalizeOriginText(value);

    for (const countryName of Object.keys(countryFlagByName)) {
        const countryPattern = new RegExp(`(^|\b)${escapeRegExp(countryName)}(\b|$)`, "i");

        if (countryPattern.test(normalized)) {
            return countryFlagByName[countryName];
        }
    }

    return null;
}

function splitCountryValues(country: string): string[] {
    return country
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

export function getCountryFlags(country: string | null | undefined): { code: string; label: string }[] {
    if (!country) {
        return [];
    }

    const parts = splitCountryValues(country);
    const valuesToMatch = parts.length > 0 ? parts : [country];
    const flags: { code: string; label: string }[] = [];
    const seenCodes = new Set<string>();

    for (const value of valuesToMatch) {
        const flagInfo = findCountryFlag(value);

        if (flagInfo && !seenCodes.has(flagInfo.code)) {
            flags.push(flagInfo);
            seenCodes.add(flagInfo.code);
        }
    }

    return flags;
}

export function getCountryFlag(country: string | null | undefined): { code: string; label: string } | null {
    const flags = getCountryFlags(country);

    return flags.length > 0 ? flags[0] : null;
}

export function getOriginCountryFlag(origin: string | null | undefined): { code: string; label: string } | null {
    if (!origin || hasMultipleOrigins(origin)) {
        return null;
    }

    const normalized = normalizeOriginText(origin);

    const countryFlag = findCountryFlag(normalized);

    if (countryFlag) {
        return countryFlag;
    }

    for (const alias of Object.keys(regionCountryAliases)) {
        const aliasPattern = new RegExp(`(^|\\b)${escapeRegExp(alias)}(\\b|$)`, "i");

        if (aliasPattern.test(normalized)) {
            return countryFlagByName[regionCountryAliases[alias]] || null;
        }
    }

    return null;
}

function buildCountryFlagHtml(flagInfo: { code: string; label: string } | null): string {
    if (!flagInfo) {
        return "";
    }

    return `<img class="origin-country-flag" src="https://flagcdn.com/24x18/${flagInfo.code}.png" srcset="https://flagcdn.com/48x36/${flagInfo.code}.png 2x" width="24" height="18" alt="${flagInfo.label} flag" title="${flagInfo.label}" loading="lazy">`;
}

function buildCountryFlagsHtml(flagInfos: { code: string; label: string }[]): string {
    return flagInfos.map((flagInfo) => buildCountryFlagHtml(flagInfo)).join("");
}

export function getCountryFlagHtml(country: string | null | undefined): string {
    return buildCountryFlagsHtml(getCountryFlags(country));
}

export function getOriginCountryFlagHtml(origin: string | null | undefined): string {
    const flagInfo = getOriginCountryFlag(origin);

    return buildCountryFlagHtml(flagInfo);
}
