"use strict";
/**
 * shared/football/clubNames.ts
 *
 * The data provider writes the big clubs its own way ("Club America",
 * "Guadalajara Chivas", "U.N.A.M. - Pumas"). These are the names and codes the
 * app has always shown for the clubs of its curated list and for Liga MX, by
 * API-Sports team id — shared so push notifications and Live Activities say
 * "América" too. The app's own table (services/football/popular.ts + base.ts)
 * must agree with this one; scripts/fb-tests/logic.test.ts checks it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLUB_NAMES = void 0;
exports.clubName = clubName;
/** Team id → [display name, short code]. */
exports.CLUB_NAMES = {
    '2287': ['América', 'AME'],
    '2278': ['Guadalajara', 'GUA'],
    '2295': ['Cruz Azul', 'CAZ'],
    '2279': ['Tigres UANL', 'TUA'],
    '2282': ['Monterrey', 'MNT'],
    '2286': ['Pumas UNAM', 'PUM'],
    '2285': ['Santos Laguna', 'SLA'],
    '2281': ['Toluca', 'TOL'],
    '2292': ['Pachuca', 'PCH'],
    '2283': ['Atlas', 'ATS'],
    '541': ['Real Madrid', 'RMA'],
    '529': ['FC Barcelona', 'BAR'],
    '50': ['Manchester City', 'MCI'],
    '33': ['Manchester United', 'MUN'],
    '40': ['Liverpool', 'LIV'],
    '42': ['Arsenal', 'ARS'],
    '49': ['Chelsea', 'CHE'],
    '157': ['Bayern München', 'BAY'],
    '496': ['Juventus', 'JUV'],
    '489': ['AC Milan', 'MIL'],
    '505': ['Inter', 'INT'],
    '85': ['Paris Saint-Germain', 'PSG'],
    '9568': ['Inter Miami', 'MIA'],
    '451': ['Boca Juniors', 'BOC'],
    '435': ['River Plate', 'RIV'],
    '127': ['Flamengo', 'FLA'],
    '2939': ['Al Nassr', 'ANA'],
    '2932': ['Al Hilal', 'ALH'],
    '530': ['Atlético Madrid', 'ATM'],
    '536': ['Sevilla', 'SEV'],
    '531': ['Athletic Club', 'ATH'],
    '548': ['Real Sociedad', 'RSO'],
    '532': ['Valencia', 'VAL'],
    '543': ['Real Betis', 'BET'],
    '533': ['Villarreal', 'VIL'],
    '436': ['Racing Club', 'RAC'],
    '453': ['Independiente', 'IND'],
    '460': ['San Lorenzo', 'SLO'],
    '450': ['Estudiantes LP', 'EST'],
    '438': ['Vélez Sarsfield', 'VEL'],
    '121': ['Palmeiras', 'PAL'],
    '131': ['Corinthians', 'CTH'],
    '126': ['São Paulo', 'SAO'],
    '124': ['Fluminense', 'FLU'],
    '1062': ['Atlético Mineiro', 'AMN'],
    '130': ['Grêmio', 'GRE'],
    '128': ['Santos', 'STS'],
    '1616': ['Los Angeles FC', 'LAF'],
    '1608': ['Atlanta United', 'ATL'],
    '1595': ['Seattle Sounders', 'SEA'],
    '1605': ['LA Galaxy', 'LAG'],
    '2289': ['León', 'LEO'],
    '2280': ['Tijuana', 'TIJ'],
    '2290': ['Querétaro', 'QRO'],
    '2314': ['Atlético San Luis', 'ASL'],
    '2298': ['FC Juárez', 'JUA'],
    '2312': ['Atlante', 'ATE'],
    '2288': ['Necaxa', 'NEC'],
    '2291': ['Puebla', 'PUE'],
};
/** Display name for a club (curated when known, else the provider's). */
function clubName(id, name) {
    return (id != null ? exports.CLUB_NAMES[String(id)]?.[0] : undefined) ?? name;
}
//# sourceMappingURL=clubNames.js.map