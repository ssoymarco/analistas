"use strict";
/**
 * football/names.ts
 *
 * How the server writes team names in texts a person reads (push
 * notifications, the Live Activity line): Spanish for national teams, "Sub-17"
 * for their youth sides, and the app's own names for the big clubs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loc = void 0;
exports.teamLabel = teamLabel;
const clubNames_1 = require("../shared/football/clubNames");
const youth_1 = require("../shared/football/youth");
// ── Spanish names for national teams ─────────────────────────────────────────
const TEAMS_ES = {
    'Afghanistan': 'Afganistán', 'Algeria': 'Argelia', 'Armenia': 'Armenia',
    'Azerbaijan': 'Azerbaiyán', 'Bahrain': 'Baréin', 'Belgium': 'Bélgica',
    'Bosnia & Herzegovina': 'Bosnia y Herzegovina', 'Bosnia and Herzegovina': 'Bosnia y Herzegovina',
    'Brazil': 'Brasil', 'Cameroon': 'Camerún', 'Canada': 'Canadá', 'Cape Verde Islands': 'Cabo Verde',
    'China': 'China', 'Congo DR': 'Congo RD', 'Croatia': 'Croacia', 'Curacao': 'Curazao', 'Curaçao': 'Curazao',
    'Czech Republic': 'República Checa', 'Czechia': 'República Checa', 'Denmark': 'Dinamarca',
    'Egypt': 'Egipto', 'England': 'Inglaterra', 'Finland': 'Finlandia', 'France': 'Francia',
    'Germany': 'Alemania', 'Greece': 'Grecia', 'Hungary': 'Hungría', 'Iran': 'Irán', 'Iraq': 'Irak',
    'Ireland': 'Irlanda', 'Rep. Of Ireland': 'Irlanda', 'Italy': 'Italia', 'Ivory Coast': 'Costa de Marfil',
    'Japan': 'Japón', 'Jordan': 'Jordania', 'Kenya': 'Kenia', 'North Korea': 'Corea del Norte',
    'South Korea': 'Corea del Sur', 'Mali': 'Malí', 'Mexico': 'México', 'Morocco': 'Marruecos',
    'Netherlands': 'Países Bajos', 'New Zealand': 'Nueva Zelanda', 'Norway': 'Noruega', 'Oman': 'Omán',
    'Panama': 'Panamá', 'Peru': 'Perú', 'Poland': 'Polonia', 'Qatar': 'Catar', 'Romania': 'Rumanía',
    'Russia': 'Rusia', 'Saudi Arabia': 'Arabia Saudita', 'Scotland': 'Escocia', 'Slovakia': 'Eslovaquia',
    'Slovenia': 'Eslovenia', 'South Africa': 'Sudáfrica', 'Spain': 'España', 'Sweden': 'Suecia',
    'Switzerland': 'Suiza', 'Thailand': 'Tailandia', 'Tunisia': 'Túnez', 'Turkey': 'Turquía',
    'Türkiye': 'Turquía', 'Ukraine': 'Ucrania', 'United Arab Emirates': 'Emiratos Árabes',
    'USA': 'Estados Unidos', 'United States': 'Estados Unidos', 'Wales': 'Gales', 'Zimbabwe': 'Zimbabue',
    'Northern Ireland': 'Irlanda del Norte', 'Haiti': 'Haití', 'Uzbekistan': 'Uzbekistán',
};
const loc = (name) => {
    if (TEAMS_ES[name])
        return TEAMS_ES[name];
    // Youth national teams: "Mexico U17" → "México Sub-17".
    const youth = (0, youth_1.youthOf)(name);
    if (!youth)
        return name;
    const senior = (0, youth_1.seniorNameOf)(youth.base);
    return `${TEAMS_ES[youth.base] ?? TEAMS_ES[senior] ?? senior} Sub-${youth.age}`;
};
exports.loc = loc;
/** Display name of a team: the app's name for a curated club, Spanish for a national team. */
function teamLabel(team) {
    const curated = (0, clubNames_1.clubName)(team.id, '');
    return curated || (0, exports.loc)(team.name);
}
//# sourceMappingURL=names.js.map