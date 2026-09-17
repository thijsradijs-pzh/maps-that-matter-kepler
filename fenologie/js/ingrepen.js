// ingrepen.js — beheeringrepen op de tijdas van de reeksgrafieken.
//
// Hoofdstuk 5.3.2 van het rapport noemt bekende beheeringrepen -- maaibeheer,
// rietoogst, het opschonen van petgaten, perioden met afwijkend hoog water --
// als een beter eerste aangrijpingspunt dan droogte, juist omdat ze
// locatiegebonden zijn en in de tijd te plaatsen. Zonder die context is een
// dip in de reeks een raadsel; met een streepje erbij is het een maaibeurt.
//
// Het rapport heeft die gegevens zelf nog niet ("met PZH overleggen of we een
// kaart met ingrepen, inclusief wanneer deze hebben plaatsgevonden, kunnen
// krijgen"). Dit bestand is dus de aansluiting, klaar voor het moment dat ze
// er zijn. Schema van data/fenologie/ingrepen.json:
//
//   {
//     "voorbeeld": false,            // true = verzonnen, viewer labelt het
//     "bron": "waar komt dit vandaan",
//     "ingrepen": [
//       {
//         "datum": "2021-07-15",     // of "start" + "eind" voor een periode
//         "type": "maaibeheer",      // vrije tekst, stuurt de kleur
//         "omschrijving": "eerste maaironde noordelijke percelen",
//         "bbox": [minLon, minLat, maxLon, maxLat]   // weglaten = hele gebied
//       }
//     ]
//   }

(function (global) {
  'use strict';

  // Kleur per type. Onbekende types krijgen de neutrale kleur; de lijst mag
  // dus groeien zonder dat hier iets stukgaat.
  var KLEUR = {
    maaibeheer: '#7a8b3a',
    rietoogst: '#b07a2a',
    petgat: '#2a6f8b',
    waterpeil: '#3a6ea8',
  };
  var NEUTRAAL = '#8b8d83';

  var Ingrepen = {
    data: null,

    /** Laadt het bestand; ontbreken is geen fout, de functie valt stil weg. */
    load: function (url) {
      return fetch(url)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          Ingrepen.data = (j && Array.isArray(j.ingrepen)) ? j : null;
          return Ingrepen.data;
        })
        .catch(function () { Ingrepen.data = null; return null; });
    },

    get voorbeeld() {
      return !!(Ingrepen.data && Ingrepen.data.voorbeeld);
    },

    /** Ingrepen die op dit punt van toepassing zijn, op datum gesorteerd. */
    near: function (lon, lat) {
      if (!Ingrepen.data) return [];
      return Ingrepen.data.ingrepen.filter(function (g) {
        if (!g.bbox) return true;   // geen bbox = gebiedsbreed
        return lon >= g.bbox[0] && lon <= g.bbox[2]
            && lat >= g.bbox[1] && lat <= g.bbox[3];
      }).map(function (g) {
        var start = new Date((g.start || g.datum) + 'T00:00:00Z');
        var eind = g.eind ? new Date(g.eind + 'T00:00:00Z') : null;
        return {
          start: start, eind: eind,
          type: g.type || 'ingreep',
          omschrijving: g.omschrijving || '',
          kleur: KLEUR[g.type] || NEUTRAAL,
        };
      }).filter(function (g) {
        return !isNaN(g.start.getTime());
      }).sort(function (a, b) { return a.start - b.start; });
    },
  };

  global.Ingrepen = Ingrepen;
})(window);
