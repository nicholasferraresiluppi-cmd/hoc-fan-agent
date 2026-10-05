/**
 * Paesi in italiano (spostati qui da components/hr-inputs.js il 03/10/2026 per
 * poterli usare anche lato server: la lettura dei campi specchio da ClickUp
 * riconosce il paese di nascita/residenza all'estero). Puro.
 */
// i più frequenti in cima alle tendine
export const TOP_COUNTRIES = ["Italia", "Albania", "Romania", "Filippine", "Spagna", "Francia", "Germania", "Regno Unito", "Svizzera", "Brasile", "Argentina", "Marocco", "Ucraina", "Moldavia"];
export const COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Arabia Saudita","Argentina","Armenia","Australia","Austria","Azerbaigian","Bahamas","Bahrein","Bangladesh","Belgio","Bielorussia","Bolivia","Bosnia ed Erzegovina","Brasile","Bulgaria","Camerun","Canada","Capo Verde","Cile","Cina","Cipro","Colombia","Corea del Sud","Costa d'Avorio","Costa Rica","Croazia","Cuba","Danimarca","Ecuador","Egitto","El Salvador","Emirati Arabi Uniti","Eritrea","Estonia","Etiopia","Filippine","Finlandia","Francia","Georgia","Germania","Ghana","Giamaica","Giappone","Giordania","Grecia","Guatemala","Honduras","India","Indonesia","Iran","Iraq","Irlanda","Islanda","Israele","Kazakistan","Kenya","Kosovo","Kuwait","Lettonia","Libano","Libia","Liechtenstein","Lituania","Lussemburgo","Macedonia del Nord","Malta","Marocco","Messico","Moldavia","Monaco","Montenegro","Nepal","Nicaragua","Nigeria","Norvegia","Nuova Zelanda","Paesi Bassi","Pakistan","Panama","Paraguay","Perù","Polonia","Portogallo","Qatar","Regno Unito","Repubblica Ceca","Repubblica Dominicana","Romania","Russia","San Marino","Senegal","Serbia","Singapore","Siria","Slovacchia","Slovenia","Spagna","Sri Lanka","Stati Uniti","Sudafrica","Svezia","Svizzera","Thailandia","Tunisia","Turchia","Ucraina","Ungheria","Uruguay","Venezuela","Vietnam"];

// Prefissi telefonici per paese (05/10/2026: mancavano le Filippine nella tendina del telefono,
// che aveva solo 21 paesi). Stessi paesi di COUNTRIES; +1 e +7 condivisi tra più paesi.
export const CALLING_CODES = {
  Afghanistan: "+93", Albania: "+355", Algeria: "+213", Andorra: "+376", Angola: "+244", "Arabia Saudita": "+966",
  Argentina: "+54", Armenia: "+374", Australia: "+61", Austria: "+43", Azerbaigian: "+994", Bahamas: "+1",
  Bahrein: "+973", Bangladesh: "+880", Belgio: "+32", Bielorussia: "+375", Bolivia: "+591", "Bosnia ed Erzegovina": "+387",
  Brasile: "+55", Bulgaria: "+359", Camerun: "+237", Canada: "+1", "Capo Verde": "+238", Cile: "+56", Cina: "+86",
  Cipro: "+357", Colombia: "+57", "Corea del Sud": "+82", "Costa d'Avorio": "+225", "Costa Rica": "+506", Croazia: "+385",
  Cuba: "+53", Danimarca: "+45", Ecuador: "+593", Egitto: "+20", "El Salvador": "+503", "Emirati Arabi Uniti": "+971",
  Eritrea: "+291", Estonia: "+372", Etiopia: "+251", Filippine: "+63", Finlandia: "+358", Francia: "+33", Georgia: "+995",
  Germania: "+49", Ghana: "+233", Giamaica: "+1", Giappone: "+81", Giordania: "+962", Grecia: "+30", Guatemala: "+502",
  Honduras: "+504", India: "+91", Indonesia: "+62", Iran: "+98", Iraq: "+964", Irlanda: "+353", Islanda: "+354",
  Israele: "+972", Kazakistan: "+7", Kenya: "+254", Kosovo: "+383", Kuwait: "+965", Lettonia: "+371", Libano: "+961",
  Libia: "+218", Liechtenstein: "+423", Lituania: "+370", Lussemburgo: "+352", "Macedonia del Nord": "+389", Malta: "+356",
  Marocco: "+212", Messico: "+52", Moldavia: "+373", Monaco: "+377", Montenegro: "+382", Nepal: "+977", Nicaragua: "+505",
  Nigeria: "+234", Norvegia: "+47", "Nuova Zelanda": "+64", "Paesi Bassi": "+31", Pakistan: "+92", Panama: "+507",
  Paraguay: "+595", "Perù": "+51", Polonia: "+48", Portogallo: "+351", Qatar: "+974", "Regno Unito": "+44",
  "Repubblica Ceca": "+420", "Repubblica Dominicana": "+1", Romania: "+40", Russia: "+7", "San Marino": "+378",
  Senegal: "+221", Serbia: "+381", Singapore: "+65", Siria: "+963", Slovacchia: "+421", Slovenia: "+386", Spagna: "+34",
  "Sri Lanka": "+94", "Stati Uniti": "+1", Sudafrica: "+27", Svezia: "+46", Svizzera: "+41", Thailandia: "+66",
  Tunisia: "+216", Turchia: "+90", Ucraina: "+380", Ungheria: "+36", Uruguay: "+598", Venezuela: "+58", Vietnam: "+84",
  Italia: "+39",
};
