import { PrismaClient } from "@prisma/client";

export type OriginMapPoint = {
    country: string;
    countryCode: string;
    region: string | null;
    lat: number;
    lng: number;
    matchLevel: "REGION" | "COUNTRY";
};

type GeocodeMatchLevel = "REGION" | "COUNTRY";

type GeocodeResult = {
    country: string;
    countryCode: string;
    region: string | null;
    lat: number;
    lng: number;
    matchLevel: GeocodeMatchLevel;
};

type NominatimSearchResult = {
    lat?: string;
    lon?: string;
    display_name?: string;
    address?: {
        country?: string;
        country_code?: string;
        state?: string;
        region?: string;
        county?: string;
        city?: string;
        town?: string;
        village?: string;
    };
};

const cacheVersion = 1;
const geocodeThrottleMs = 1100;
let lastGeocodeAt = 0;

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[()\[\]{}]/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function splitCountryValues(country: string | null | undefined): string[] {
    if (!country) {
        return [];
    }

    return country
        .split(/[;,]/)
        .map(function (item) {
            return item.trim();
        })
        .filter(function (item) {
            return item.length > 0;
        });
}

function buildCacheKey(matchLevel: GeocodeMatchLevel, country: string, region: string | null): string {
    const normalizedCountry = normalizeText(country);
    const normalizedRegion = normalizeText(region || "");

    return `${cacheVersion}|${matchLevel}|${normalizedCountry}|${normalizedRegion}`;
}

function getPreferredRegionLabel(region: string | null | undefined): string | null {
    if (!region) {
        return null;
    }

    const firstRegion = region
        .split(/[;,]/)[0]
        .trim();

    return firstRegion.length > 0 ? firstRegion : null;
}

function getDisplayRegion(result: NominatimSearchResult, fallbackRegion: string | null | undefined): string | null {
    const address = result.address || {};
    const regionValue = address.state || address.region || address.county || address.city || address.town || address.village;

    if (regionValue) {
        return regionValue;
    }

    return getPreferredRegionLabel(fallbackRegion);
}

function toGeocodeResult(result: NominatimSearchResult, matchLevel: GeocodeMatchLevel, fallbackCountry: string, fallbackRegion: string | null | undefined): GeocodeResult | null {
    const lat = Number(result.lat);
    const lng = Number(result.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    const address = result.address || {};
    const country = address.country || fallbackCountry;
    const countryCode = (address.country_code || "").toLowerCase();

    return {
        country: country,
        countryCode: countryCode,
        region: matchLevel === "REGION" ? getDisplayRegion(result, fallbackRegion) : null,
        lat: lat,
        lng: lng,
        matchLevel: matchLevel
    };
}

async function waitForGeocodeSlot(): Promise<void> {
    const elapsed = Date.now() - lastGeocodeAt;
    const waitMs = Math.max(0, geocodeThrottleMs - elapsed);

    if (waitMs > 0) {
        await new Promise(function (resolve) {
            setTimeout(resolve, waitMs);
        });
    }

    lastGeocodeAt = Date.now();
}

async function callNominatim(query: string, countryCode: string | null): Promise<NominatimSearchResult | null> {
    const params = new URLSearchParams({
        format: "jsonv2",
        limit: "1",
        addressdetails: "1",
        q: query
    });

    if (countryCode) {
        params.set("countrycodes", countryCode);
    }

    await waitForGeocodeSlot();

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
            "User-Agent": "CoffeeBrewTracker/1.0 origin-map geocoding"
        }
    });

    if (!response.ok) {
        return null;
    }

    const results = await response.json() as NominatimSearchResult[];

    return Array.isArray(results) && results.length > 0 ? results[0] : null;
}

async function getCachedGeocode(prisma: PrismaClient, cacheKey: string): Promise<GeocodeResult | null | undefined> {
    const cached = await prisma.originMapGeocodeCache.findUnique({
        where: {
            cacheKey: cacheKey
        }
    });

    if (!cached) {
        return undefined;
    }

    if (!cached.lat || !cached.lng || cached.status !== "FOUND") {
        return null;
    }

    return {
        country: cached.country || "",
        countryCode: cached.countryCode || "",
        region: cached.region || null,
        lat: cached.lat,
        lng: cached.lng,
        matchLevel: cached.matchLevel as GeocodeMatchLevel
    };
}

async function saveGeocodeCache(prisma: PrismaClient, cacheKey: string, query: string, matchLevel: GeocodeMatchLevel, result: GeocodeResult | null): Promise<void> {
    await prisma.originMapGeocodeCache.upsert({
        where: {
            cacheKey: cacheKey
        },
        create: {
            cacheKey: cacheKey,
            query: query,
            matchLevel: matchLevel,
            status: result ? "FOUND" : "NOT_FOUND",
            country: result ? result.country : null,
            countryCode: result ? result.countryCode : null,
            region: result ? result.region : null,
            lat: result ? result.lat : null,
            lng: result ? result.lng : null
        },
        update: {
            query: query,
            matchLevel: matchLevel,
            status: result ? "FOUND" : "NOT_FOUND",
            country: result ? result.country : null,
            countryCode: result ? result.countryCode : null,
            region: result ? result.region : null,
            lat: result ? result.lat : null,
            lng: result ? result.lng : null
        }
    });
}

async function geocodeWithCache(prisma: PrismaClient, query: string, cacheCountry: string, cacheRegion: string | null, matchLevel: GeocodeMatchLevel, countryCodeRestriction: string | null): Promise<GeocodeResult | null> {
    const cacheKey = buildCacheKey(matchLevel, cacheCountry, cacheRegion);
    const cachedResult = await getCachedGeocode(prisma, cacheKey);

    if (cachedResult !== undefined) {
        return cachedResult;
    }

    const searchResult = await callNominatim(query, countryCodeRestriction);
    const result = searchResult ? toGeocodeResult(searchResult, matchLevel, cacheCountry, cacheRegion) : null;

    await saveGeocodeCache(prisma, cacheKey, query, matchLevel, result);

    return result;
}

export async function resolveOriginMapPoints(prisma: PrismaClient, country: string | null | undefined, region: string | null | undefined): Promise<OriginMapPoint[]> {
    const countryParts = splitCountryValues(country);
    const points: OriginMapPoint[] = [];
    const seenKeys = new Set<string>();
    const preferredRegion = getPreferredRegionLabel(region);

    for (const countryPart of countryParts) {
        const countryMatch = await geocodeWithCache(prisma, countryPart, countryPart, null, "COUNTRY", null);

        if (!countryMatch) {
            continue;
        }

        let point: OriginMapPoint = countryMatch;

        if (preferredRegion) {
            const regionQuery = `${preferredRegion}, ${countryPart}`;
            const regionMatch = await geocodeWithCache(prisma, regionQuery, countryPart, preferredRegion, "REGION", countryMatch.countryCode || null);

            if (regionMatch) {
                point = regionMatch;
            }
        }

        const key = `${point.countryCode || normalizeText(point.country)}|${point.region ? normalizeText(point.region) : "country"}`;

        if (!seenKeys.has(key)) {
            points.push(point);
            seenKeys.add(key);
        }
    }

    return points;
}
