"use strict";
/**
 * football/team-family.ts
 *
 * A senior national team and its youth sides (U17, U20, U23…) are one thing
 * for a fan: whoever follows Mexico wants to hear about Mexico U17 at its
 * World Cup (owner's rule, 25-nov-2026). The data provider treats them as
 * unrelated teams, so the link is derived from the name ("Mexico U17" →
 * "Mexico") and confirmed against the provider's national teams — one call per
 * country, remembered in `fb_meta/nationalIds` (server-only).
 *
 * Every link found is also published in `fb_meta/teamFamilies` (youth team id →
 * senior team id), which the app reads to show Mexico U17's matches among the
 * matches of whoever follows Mexico. The fixture sync fills it days ahead; the
 * notifications resolve whatever is still missing at send time.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_LOOKUPS_PER_SYNC = exports.NATIONAL_TEAMS_COUNTRY = exports.youthOf = exports.seniorNameOf = void 0;
exports.seniorTeamIds = seniorTeamIds;
exports.resetTeamFamilyForTests = resetTeamFamilyForTests;
const logger = __importStar(require("firebase-functions/logger"));
const admin_init_1 = require("../admin-init");
const apisports_1 = require("./apisports");
const youth_1 = require("../shared/football/youth");
Object.defineProperty(exports, "seniorNameOf", { enumerable: true, get: function () { return youth_1.seniorNameOf; } });
Object.defineProperty(exports, "youthOf", { enumerable: true, get: function () { return youth_1.youthOf; } });
const store_1 = require("./store");
/** The provider's "country" for national-team and international competitions. */
exports.NATIONAL_TEAMS_COUNTRY = 'World';
const DOC = `${store_1.COL.meta}/nationalIds`;
/** Public: youth team id → senior team id (the app reads it). */
const FAMILIES_DOC = `${store_1.COL.meta}/teamFamilies`;
/** A name with no senior national team (a club in a youth cup) is asked again after this long. */
const RETRY_MISSING_MS = 30 * 24 * 3600_000;
/** New names looked up per batch of notifications; the rest wait for the next one. */
const MAX_LOOKUPS_PER_RUN = 6;
/** New names looked up per fixture sync (every 5 min): a 48-team cup is linked in under half an hour. */
exports.MAX_LOOKUPS_PER_SYNC = 10;
let memo = null;
let published = null;
const key = (name) => name.trim().toLowerCase();
async function load() {
    if (!memo) {
        const snap = await admin_init_1.db.doc(DOC).get();
        memo = (snap.exists ? snap.data() : {});
        memo.byName ??= {};
        memo.at ??= {};
    }
    return memo;
}
/** Adds the links the public doc doesn't have yet (one small merge write, or none). */
async function publish(links, nowMs) {
    if (!published) {
        const snap = await admin_init_1.db.doc(FAMILIES_DOC).get();
        published = { ...(snap.data()?.seniorOf ?? {}) };
    }
    const fresh = {};
    for (const [youth, senior] of Object.entries(links)) {
        if (published[youth] !== senior)
            fresh[youth] = senior;
    }
    if (!Object.keys(fresh).length)
        return;
    const doc = { seniorOf: fresh, updatedAt: nowMs };
    await admin_init_1.db.doc(FAMILIES_DOC).set(doc, { merge: true });
    Object.assign(published, fresh);
}
/** What is already known about `name`: its id, null (no such national team) or undefined (never asked). */
async function knownNationalId(name, nowMs) {
    const doc = await load();
    const k = key(name);
    const known = doc.byName[k];
    if (known)
        return known;
    if (known === '' && nowMs - (doc.at[k] ?? 0) < RETRY_MISSING_MS)
        return null;
    return undefined;
}
/** Asks the provider for the senior national team called `name` and remembers the answer. */
async function lookupNationalId(name, nowMs) {
    const doc = await load();
    const k = key(name);
    let id = '';
    try {
        const list = await (0, apisports_1.afGet)('/teams', { name });
        const hit = list.find(e => e.team.national && key(e.team.name) === k);
        if (hit)
            id = String(hit.team.id);
    }
    catch (err) {
        logger.warn('team family: lookup failed', { name, err: String(err) });
        return null; // not remembered: asked again next time
    }
    doc.byName[k] = id;
    doc.at[k] = nowMs;
    await admin_init_1.db.doc(DOC).set({ byName: { [k]: id }, at: { [k]: nowMs } }, { merge: true }).catch(() => { });
    return id || null;
}
/**
 * For the youth national teams among `teams`: youth team id → senior team id.
 * A club's youth side ("Real Madrid U19") resolves to nothing, because its
 * base name is not a national team. Never throws.
 */
async function seniorTeamIds(teams, nowMs = Date.now(), maxLookups = MAX_LOOKUPS_PER_RUN) {
    const out = {};
    let lookups = 0;
    for (const t of teams) {
        const y = (0, youth_1.youthOf)(t.name);
        if (!y || out[t.id])
            continue;
        try {
            const name = (0, youth_1.seniorNameOf)(y.base);
            let senior = await knownNationalId(name, nowMs);
            if (senior === undefined) {
                if (lookups >= maxLookups)
                    continue;
                lookups++;
                senior = await lookupNationalId(name, nowMs);
            }
            if (senior && senior !== t.id)
                out[t.id] = senior;
        }
        catch (err) {
            logger.warn('team family: could not resolve', { team: t.name, err: String(err) });
        }
    }
    await publish(out, nowMs).catch(err => logger.warn('team family: publish failed', { err: String(err) }));
    return out;
}
/** Test hook: forget what this instance has loaded. */
function resetTeamFamilyForTests() { memo = null; published = null; }
//# sourceMappingURL=team-family.js.map