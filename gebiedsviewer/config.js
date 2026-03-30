// gebiedsviewer/config.js

const CONFIG = {
  title: 'Zuid-Holland Gebiedsviewer',
  initialView: {
    longitude: 4.48,
    latitude: 51.90,
    zoom: 9.5,
    pitch: 0,
    bearing: 0
  }
};

const CATALOG = [
  {
    id: 'grenzen',
    label: 'Grenzen',
    color: '#555555',
    services: [
      {
        id: 'grenzen_bestuurlijk',
        label: 'Bestuurlijke Grenzen',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Grenzen/Grenzen/MapServer/WMSServer',
        layers: [
          { id: '0',   label: 'Provinciegrens' },
          { id: '1',   label: 'Gemeentegrenzen' },
          { id: '8',   label: 'Zuid-Holland land' },
          { id: '9',   label: 'Gemeentegrenzen lijn' },
          { id: '10',  label: 'Gemeentennamen' },
          { id: '27',  label: 'Buurtgrenzen' },
          { id: '28',  label: 'Wijkgrenzen' },
          { id: '112', label: 'Gemeenten vlak NL 2025' },
          { id: '160', label: 'NOVEX gebieden' },
        ]
      },
      {
        id: 'grenzen_regios',
        label: "Regio's",
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Grenzen/Grenzen_regios/MapServer/WMSServer',
        layers: [
          { id: '0',   label: 'OmgevingsDiensten' },
          { id: '1',   label: 'Regios Arbeidsmarkt' },
          { id: '2',   label: 'Woonregios' },
          { id: '11',  label: 'Regios Gemeentelijke Gezondheidsdienst' },
          { id: '21',  label: 'Regios Veiligheid' },
          { id: '37',  label: 'Regionale Energie Strategie' },
          { id: '129', label: 'Economische regios' },
        ]
      }
    ]
  },

  {
    id: 'landelijk_gebied',
    label: 'Landelijk Gebied',
    color: '#4a7c59',
    services: [
      {
        id: 'lg_algemeen',
        label: 'Natuur & Recreatie',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_algemeen/MapServer/WMSServer',
        layers: [
          { id: '0',  label: 'Gebiedsnamen Natura 2000' },
          { id: '1',  label: 'Natura 2000' },
          { id: '21', label: 'Natura2000 Gebieden' },
          { id: '48', label: 'Natuurnetwerk Nederland' },
          { id: '25', label: 'Natuurbeschermingswet 1967' },
          { id: '7',  label: 'BRP Gewaspercelen' },
          { id: '18', label: 'Recreatief Fietsnetwerk' },
          { id: '32', label: 'Recreatie om de stad' },
          { id: '41', label: 'Telgebieden weidevogels 2001' },
          { id: '54', label: 'Ruiterpaden' },
          { id: '86', label: 'Waarnemingen otters' },
          { id: '87', label: 'Verkeerslachtoffers otters' },
        ]
      },
      {
        id: 'lg_zhplg',
        label: 'ZHPLG',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_ZHPLG/MapServer/WMSServer',
        layers: [
          { id: '125', label: 'ZHPLG kerngebieden' },
          { id: '126', label: 'ZHPLG deelgebieden' },
          { id: '2',   label: 'Gebiedsanalyse Landbouw Gebied 2021' },
          { id: '3',   label: 'Gebiedsanalyse Landbouw Gewassen 2021' },
          { id: '4',   label: 'Gebiedsanalyse Landbouw Verkaveling 2021' },
          { id: '127', label: 'Gebiedsanalyse Landbouw Bedrijven 2020' },
          { id: '128', label: 'Gebiedsanalyse Landbouw Bedrijven 2021' },
          { id: '5',   label: 'Methaan emissie per gemeente' },
          { id: '7',   label: 'GVE per ZHPLG-deelgebied' },
          { id: '9',   label: 'Methaanuitstoot per ZHPLG-deelgebied' },
          { id: '10',  label: 'GVE rundvee per ZHPLG-deelgebied' },
        ]
      },
      {
        id: 'lg_stikstof',
        label: 'Stikstof',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_stikstof/MapServer/WMSServer',
        layers: [
          { id: '9',  label: 'Percentage stikstofgevoelige natuur onder KDW' },
          { id: '17', label: 'Mate van overschrijding KDW' },
          { id: '13', label: 'Emissie NH3 totaal 2022' },
          { id: '14', label: 'Emissie NOx totaal 2022' },
          { id: '15', label: 'Emissie N2O per gemeente 2020' },
        ]
      },
      {
        id: 'lg_landbouw',
        label: 'Landbouw',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_landbouw/MapServer/WMSServer',
        layers: [
          { id: '2',  label: 'CO2 emissie per gemeente' },
          { id: '5',  label: 'Methaan emissie per gemeente' },
          { id: '11', label: 'Nutriënten verontreinigde gebieden' },
        ]
      },
      {
        id: 'lg_landschapselementen',
        label: 'Landschapselementen',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_landschapselementen/MapServer/WMSServer',
        layers: [
          { id: '0', label: 'Landschapselementen monitoringsgebieden' },
          { id: '1', label: 'Landschapselementen LBZH - punt' },
          { id: '3', label: 'Landschapselementen LBZH - lijn' },
          { id: '5', label: 'Landschapselementen LBZH - vlak' },
          { id: '7', label: 'Landschapselementen LASREG' },
        ]
      },
      {
        id: 'lg_bijen',
        label: 'Bijenlandschappen',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_bijen_campagne_landschap/MapServer/WMSServer',
        layers: [
          { id: '1',  label: 'Help de bij in je wijk' },
          { id: '6',  label: 'Gidsbijen per gemeente' },
          { id: '17', label: 'Bijenlandschap - Goeree-Overflakkee en Voorne aan Zee' },
          { id: '18', label: 'Bijenlandschap - Rotterdam' },
          { id: '19', label: 'Bijenlandschap - Eiland IJsselmonde' },
          { id: '20', label: 'Bijzonder provinciaal landschap Midden-Delfland' },
          { id: '21', label: 'Bijenlandschap - Groene Cirkel Bijenlandschap' },
          { id: '22', label: 'Bijenlandschap - Midden-Holland' },
          { id: '23', label: 'Bijenlandschap - Den Haag en Rijswijk' },
        ]
      },
      {
        id: 'lg_projecten',
        label: 'LEADER Projecten',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_projecten_leadergebieden/MapServer/WMSServer',
        layers: [
          { id: '1',  label: 'Alle projecten' },
          { id: '5',  label: 'Alle projecten NSP' },
          { id: '4',  label: 'Alle projecten POP3' },
          { id: '33', label: 'NSP Leadergebieden 2023-2027' },
          { id: '32', label: 'POP3 Leadergebieden 2014-2022' },
        ]
      },
      {
        id: 'lg_nbp_2026',
        label: 'Natuur Beheer Plan 2026',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_NBP_2026/MapServer/WMSServer',
        layers: [
          { id: '0', label: 'Kaart 1 Beheertypenkaart' },
          { id: '1', label: 'Kaart 2 Ambitiekaart' },
          { id: '2', label: 'Kaart 3 Toeslagen vaarland' },
          { id: '3', label: 'Kaart 4 Leefgebied Open Grasland' },
          { id: '4', label: 'Kaart 5 Leefgebied Open Akkerland' },
          { id: '5', label: 'Kaart 6 Leefgebied Dooradering' },
          { id: '6', label: 'Kaart 7 Leefgebied Water' },
          { id: '7', label: 'Kaart 8 Zoekgebied Klimaat' },
        ]
      },
      {
        id: 'lg_nbp_2025',
        label: 'Natuur Beheer Plan 2025',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_NBP_2025/MapServer/WMSServer',
        layers: [
          { id: '0', label: 'Kaart 1 Beheertypenkaart' },
          { id: '1', label: 'Kaart 2 Ambitiekaart' },
          { id: '2', label: 'Kaart 3 Toeslagen vaarland' },
          { id: '3', label: 'Kaart 4 Leefgebied Open Grasland' },
          { id: '4', label: 'Kaart 5 Leefgebied Open Akkerland' },
          { id: '5', label: 'Kaart 6 Leefgebied Dooradering' },
          { id: '6', label: 'Kaart 7 Leefgebied Water' },
          { id: '7', label: 'Kaart 8 Zoekgebied Klimaat' },
        ]
      },
      {
        id: 'lg_nbp_2024',
        label: 'Natuur Beheer Plan 2024',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_NBP_2024/MapServer/WMSServer',
        layers: [
          { id: '0', label: 'Kaart 1 Beheertypenkaart' },
          { id: '1', label: 'Kaart 2 Ambitiekaart' },
          { id: '2', label: 'Kaart 3 Toeslagen vaarland' },
          { id: '3', label: 'Kaart 4 Leefgebied Open Grasland' },
          { id: '4', label: 'Kaart 5 Leefgebied Open Akkerland' },
          { id: '5', label: 'Kaart 6 Leefgebied Dooradering' },
          { id: '6', label: 'Kaart 7 Leefgebied Water' },
          { id: '7', label: 'Kaart 8 Zoekgebied Klimaat' },
        ]
      },
      {
        id: 'lg_nbp_2023',
        label: 'Natuur Beheer Plan 2023',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_NBP_2023/MapServer/WMSServer',
        layers: [
          { id: '30', label: 'Kaart 1 Beheertypenkaart' },
          { id: '31', label: 'Kaart 2 Ambitiekaart' },
          { id: '32', label: 'Kaart 3 Toeslagen vaarland' },
          { id: '29', label: 'Kaart 4 Leefgebied Open Grasland' },
          { id: '28', label: 'Kaart 5 Leefgebied Open Akkerland' },
          { id: '27', label: 'Kaart 6 Leefgebied Dooradering' },
          { id: '33', label: 'Kaart 7 Leefgebied Water' },
          { id: '35', label: 'Kaart 8 Zoekgebied Klimaat' },
        ]
      },
      {
        id: 'lg_vegetatiekaart',
        label: 'Vegetatiekaart Nieuwkoopse Plassen',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Landelijk_gebied/Landelijk_gebied_natuur_vegetatiekaart_nieuwkoopse_plassen/MapServer/WMSServer',
        layers: [
          { id: '4', label: 'Vegetatie 2025' },
          { id: '5', label: 'SNL-structuur 2025' },
          { id: '3', label: 'Opnames vlakken 2025' },
          { id: '0', label: 'Opnames locaties water 2025' },
          { id: '1', label: 'Opnames locaties land 2025' },
        ]
      },
    ]
  },

  {
    id: 'bodem',
    label: 'Bodem',
    color: '#8b5e3c',
    services: [
      {
        id: 'bodem_algemeen',
        label: 'Bodemkaarten',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Bodem/Bodem_algemene_bodemkaarten/MapServer/WMSServer',
        layers: [
          { id: '31', label: 'Bodemkaart 2021' },
          { id: '2',  label: 'Bodemkaart' },
          { id: '3',  label: 'Bodemkaart - Veengronden' },
          { id: '30', label: 'Geologische kaart 2021' },
          { id: '33', label: 'Geomorfologische kaart 2023' },
          { id: '34', label: 'Geomorfologische kaart - Genese 2023' },
          { id: '26', label: 'Veendikte' },
          { id: '17', label: 'Dikte kleidek in meters' },
          { id: '18', label: 'Diepte top Pleistoceen beneden NAP' },
          { id: '19', label: 'Diepte top Pleistoceen beneden maaiveld' },
          { id: '0',  label: 'Afdekking bodem' },
          { id: '1',  label: 'Grens landelijk-stedelijk' },
          { id: '35', label: 'Detailkartering Krimpenerwaard' },
        ]
      },
      {
        id: 'bodem_bodemdaling',
        label: 'Bodemdaling',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Bodem/Bodem_bodemdaling/MapServer/WMSServer',
        layers: [
          { id: '0',   label: 'Dikte oxideerbaar veen' },
          { id: '1',   label: 'Stabiele bodem' },
          { id: '2',   label: 'Draagkracht' },
          { id: '3',   label: 'Dikte zettingsgevoelige lagen' },
          { id: '4',   label: 'Daling bij ontwateringsdiepte 0.5 m' },
          { id: '5',   label: 'Daling bij ontwateringsdiepte 1.0 m' },
          { id: '6',   label: 'Daling bij ontwateringsdiepte 1.5 m' },
          { id: '8',   label: 'Kleidek op veen' },
          { id: '9',   label: 'Drooglegging in percelen ZH 2021' },
          { id: '10',  label: 'CO2 Oxidatiesnelheid' },
          { id: '328', label: 'Kwelkaart Veenweidegebieden' },
          { id: '329', label: 'Drooglegging in veenweidegebieden 2016' },
          { id: '332', label: 'Drooglegging in veenweidegebieden 2021' },
          { id: '331', label: 'CO2 emissies uit veenweidegebieden 2021' },
        ]
      },
      {
        id: 'bodem_water',
        label: 'Bodemwater',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Bodem/Bodem_water/MapServer/WMSServer',
        layers: [
          { id: '2', label: 'Verzilting' },
          { id: '3', label: 'Zoet-zout grondwatervoorkomens' },
          { id: '6', label: 'Grondwatertrappenkaart 2017' },
          { id: '7', label: 'Ontwateringsdiepte huidig klimaat' },
          { id: '8', label: 'Bodemberging huidig klimaat' },
          { id: '9', label: 'Bodemberging klimaat 2050' },
          { id: '1', label: 'Kwel-infiltratie' },
          { id: '0', label: 'Gebieden met infiltratie' },
        ]
      },
      {
        id: 'bodem_energie',
        label: 'Bodemenergie & Geothermie',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Bodem/Bodem_energie/MapServer/WMSServer',
        layers: [
          { id: '0',   label: 'Gerealiseerde aardwarmteputten' },
          { id: '6',   label: 'Geothermie potentiekaarten' },
          { id: '8',   label: 'Potentieel Maassluis Formatie' },
          { id: '11',  label: 'Potentieel Oosterhout Formatie' },
          { id: '72',  label: 'Boringen' },
          { id: '835', label: 'Aardwarmte - vergunningen totaal' },
          { id: '5',   label: 'Vergunningen koolwaterstoffen' },
        ]
      },
      {
        id: 'bodem_ecologie',
        label: 'Landbouwgeschiktheid',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Bodem/Bodem_ecologie/MapServer/WMSServer',
        layers: [
          { id: '1', label: 'Landbouwkundige geschiktheid - Veeteelt' },
          { id: '3', label: 'Landbouwkundige geschiktheid - Akkerbouw' },
          { id: '2', label: 'Risico ondergrondverdichting' },
        ]
      },
      {
        id: 'bodem_schoon',
        label: 'Schone Bodem',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Bodem/Bodem_schone_bodem/MapServer/WMSServer',
        layers: [
          { id: '5',  label: 'Voormalige stortplaatsen' },
          { id: '8',  label: 'Locaties stortplaatsen' },
          { id: '10', label: 'Bodemsanering vervuilde bedrijfsterreinen' },
          { id: '14', label: 'Spoedlocaties' },
          { id: '13', label: 'Slootdempingen' },
          { id: '4',  label: 'Herontwikkelingskans' },
          { id: '15', label: 'Werkgebied Stichting Bodembeheer Krimpenerwaard' },
        ]
      },
      {
        id: 'bodem_signalering',
        label: 'Signaleringskaarten',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Bodem/Bodem_signaleringskaarten/MapServer/WMSServer',
        layers: [
          { id: '0',  label: 'Totaalkaart' },
          { id: '1',  label: 'Stabiliteit' },
          { id: '2',  label: 'Veenoxidatie' },
          { id: '3',  label: 'Draagkracht' },
          { id: '4',  label: 'WKO-beperkingen' },
          { id: '5',  label: 'WKO-potentie' },
          { id: '6',  label: 'Geothermiepotentie' },
          { id: '20', label: 'Diepte zoet-brak grensvlak' },
        ]
      },
      {
        id: 'bodem_identiteit',
        label: 'Aardkundige Waarden',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Bodem/Bodem_identiteit/MapServer/WMSServer',
        layers: [
          { id: '0', label: 'Aardkundige waarden' },
        ]
      },
    ]
  },

  {
    id: 'klimaat',
    label: 'Klimaat',
    color: '#1a6aaa',
    services: [
      {
        id: 'klimaat_algemeen',
        label: 'Klimaatstresstest',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Klimaat/Klimaat/MapServer/WMSServer',
        layers: [
          { id: '57', label: 'Hitte - Hittestress UHI 2020' },
          { id: '28', label: 'Hitte - Ouderen en hitte' },
          { id: '30', label: 'Hitte - Somatische aandoening en hitte' },
          { id: '0',  label: 'Bodemdaling - Bodemdaling 2017-2050' },
          { id: '5',  label: 'Bodemdaling - Bodemdaling wegen' },
          { id: '6',  label: 'Bodemdaling - Kwetsbaarheid panden' },
          { id: '58', label: 'Overstromingen - Overstromingsbeeld dijkdoorbraak 2020' },
          { id: '14', label: 'Overstromingen - Kwetsbaarheid panden na dijkdoorbraak' },
          { id: '59', label: 'Wateroverlast - Klimaatstresstest 2018' },
        ]
      },
      {
        id: 'klimaat_buffers',
        label: 'Klimaatbuffers',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Klimaat/Klimaat_Klimaatbuffers/MapServer/WMSServer',
        layers: [
          { id: '2',  label: 'Natuurlijke Spons - Huidig' },
          { id: '1',  label: 'Natuurlijke Spons - Kansrijk' },
          { id: '0',  label: 'Natuurlijke Spons - Uitdaging' },
          { id: '5',  label: 'Levende Kust - Huidig' },
          { id: '4',  label: 'Levende Kust - Kansrijk' },
          { id: '3',  label: 'Levende Kust - Uitdaging' },
          { id: '8',  label: 'Koolstof Sink - Huidig' },
          { id: '7',  label: 'Koolstof Sink - Kansrijk' },
          { id: '11', label: 'Groene Airco - Huidig' },
          { id: '10', label: 'Groene Airco - Kansrijk' },
          { id: '14', label: 'Groenblauwe Ruimte - Huidig' },
          { id: '13', label: 'Groenblauwe Ruimte - Kansrijk' },
          { id: '17', label: 'Biobouwers - Huidig' },
        ]
      },
      {
        id: 'klimaat_onderlegger',
        label: 'Klimaatonderlegger',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Klimaat/Klimaat_Klimaatonderlegger/MapServer/WMSServer',
        layers: [
          { id: '0',  label: 'Klimaatonderlegger - Landbouw' },
          { id: '1',  label: 'Klimaatonderlegger - Verstedelijking' },
          { id: '7',  label: 'Landbouw: Hitte' },
          { id: '8',  label: 'Landbouw: Waterbeschikbaarheid en -kwaliteit' },
          { id: '9',  label: 'Landbouw: Waterveiligheid' },
          { id: '10', label: 'Landbouw: Regenwateroverlast' },
          { id: '11', label: 'Landbouw: Bodemdaling' },
          { id: '2',  label: 'Verstedelijking: Regenwateroverlast' },
          { id: '3',  label: 'Verstedelijking: Hitte' },
          { id: '4',  label: 'Verstedelijking: Bodemdaling' },
          { id: '17', label: 'Externe verzilting' },
          { id: '19', label: 'Interne verzilting' },
          { id: '22', label: 'Risicogebieden wateroverlast' },
          { id: '27', label: 'Overstroombare gebieden' },
          { id: '23', label: 'Primaire keringen en versterkingszones' },
        ]
      },
      {
        id: 'klimaat_raster',
        label: 'Klimaatrasters & Wateroverlast',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Klimaat/Klimaat_raster/MapServer/WMSServer',
        layers: [
          { id: '4',  label: 'Bomen in Zuid-Holland' },
          { id: '8',  label: 'Klimaatstresstest 2023 - Waterdiepte bij Hevige Neerslag' },
          { id: '25', label: 'Grootschalige Wateroverlast - 150mm / 48uur (droog)' },
          { id: '26', label: 'Grootschalige Wateroverlast - 200mm / 48uur (droog)' },
          { id: '9',  label: 'Veiligheid - Waterdiepte - 35mm' },
          { id: '10', label: 'Veiligheid - Waterdiepte - 70mm' },
        ]
      },
      {
        id: 'klimaat_warmte',
        label: 'Warmteprofielen',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Klimaat/Klimaat_Warmteprofielen/MapServer/WMSServer',
        layers: [
          { id: '0',  label: 'Panden - Energielabels' },
          { id: '15', label: 'Heatmap huidige warmtevraag' },
          { id: '14', label: 'Heatmap toekomstige warmtevraag' },
          { id: '16', label: 'Warmteprofielen huidig' },
          { id: '4',  label: 'Woningen' },
          { id: '2',  label: 'Kantoren' },
        ]
      },
      {
        id: 'klimaat_transitie',
        label: 'Warmtetransitie',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Klimaat/Klimaat_Warmtetransitie/MapServer/WMSServer',
        layers: [
          { id: '3', label: 'Energielabels woningen' },
          { id: '2', label: 'Energielabels kantoren' },
          { id: '0', label: 'Energielabels overige utiliteit' },
          { id: '5', label: 'Bouwjaren woningen' },
          { id: '6', label: 'Bouwjaren kantoren' },
          { id: '4', label: 'Industrie' },
        ]
      },
      {
        id: 'klimaat_waterbodem',
        label: 'Water & Bodem Sturend',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Klimaat/Klimaat_WaterBodemSturend/MapServer/WMSServer',
        layers: [
          { id: '472', label: 'Waterveiligheidssysteem - huidig' },
          { id: '483', label: 'Beschermingsgebieden grondwater' },
          { id: '0',   label: 'Drinkwater bestaand systeem' },
          { id: '13',  label: 'Drinkwater 6-uur zones' },
          { id: '497', label: 'Oppervlaktewater' },
          { id: '493', label: 'Waterschappen' },
          { id: '507', label: 'Grondwaterlichamen duingebieden' },
        ]
      },
    ]
  },

  {
    id: 'water',
    label: 'Water',
    color: '#1e7fb5',
    services: [
      {
        id: 'water_leggers',
        label: 'Peilgebieden',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Water/Water_leggers/MapServer/WMSServer',
        layers: [
          { id: '0', label: 'Peilgebieden' },
          { id: '1', label: 'Peilbesluiten vast peil' },
          { id: '2', label: 'Peilbesluiten bovenpeil (zomerpeil)' },
          { id: '3', label: 'Peilbesluiten onderpeil (winterpeil)' },
          { id: '8', label: 'Drooglegging per peilgebied 2025' },
          { id: '9', label: 'Drooglegging binnen gewaspercelen' },
        ]
      },
      {
        id: 'water_krw2022',
        label: 'Kaderrichtlijn Water 2022',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Water/Water_krw2022/MapServer/WMSServer',
        layers: [
          { id: '38', label: 'KRW 2022 - lijn' },
          { id: '39', label: 'KRW 2022 - vlak' },
          { id: '0',  label: 'KRW status - lijn' },
          { id: '17', label: 'KRW doel 2027 - vlak' },
          { id: '18', label: 'Ecologie - vlak' },
          { id: '7',  label: 'Fosfaat - lijn' },
          { id: '8',  label: 'Stikstof - lijn' },
          { id: '34', label: 'KRW maatregelen - lijn' },
          { id: '35', label: 'KRW maatregelen - vlak' },
        ]
      },
      {
        id: 'water_krw2021',
        label: 'Kaderrichtlijn Water 2021',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Water/Water_krw2021/MapServer/WMSServer',
        layers: [
          { id: '0',  label: 'KRW status - lijn' },
          { id: '17', label: 'KRW doel 2027 - vlak' },
          { id: '7',  label: 'Fosfaat - lijn' },
          { id: '8',  label: 'Stikstof - lijn' },
        ]
      },
      {
        id: 'water_kwantiteit',
        label: 'Grondwater',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Water/Water_kwantiteit_kwaliteit/MapServer/WMSServer',
        layers: [
          { id: '0',  label: 'Grondwaterlichamen KRW' },
          { id: '3',  label: 'Toplijst verdroogde gebieden' },
          { id: '11', label: 'Grondwaterlichamen' },
          { id: '16', label: 'Oppervlaktewaterkwaliteit' },
          { id: '18', label: 'Grondwaterlichamen algemeen eindoordeel' },
          { id: '13', label: 'SNO milieubelasting 2022' },
        ]
      },
      {
        id: 'water_drinkwater',
        label: 'Drinkwater',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Water/Water_drinkwater/MapServer/WMSServer',
        layers: [
          { id: '9',  label: 'Drinkwaterinfrastructuur' },
          { id: '11', label: 'Drinkwaterbedrijven' },
          { id: '12', label: 'Drinkwaterproductieketen' },
          { id: '10', label: 'Zoekgebieden drinkwater' },
          { id: '14', label: 'Beschermingszones Rijkswaterstaat' },
          { id: '15', label: 'Drinkwateronttrekking uit oppervlaktewater' },
          { id: '0',  label: 'Drinkwater gebiedsdossiers' },
        ]
      },
      {
        id: 'water_veiligheid',
        label: 'Waterveiligheid',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Water/Water_veiligheid/MapServer/WMSServer',
        layers: [
          { id: '0', label: 'Deltawerken Nederland' },
          { id: '9', label: 'Veiligheidsnorm - Regionale keringen 2018' },
          { id: '3', label: 'Veiligheidsnorm - ROR - prov Utrecht' },
          { id: '4', label: 'Veiligheidsnorm - ROR - prov Noord-Holland' },
        ]
      },
      {
        id: 'water_zoet',
        label: 'Zoetwatervoorziening',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Water/Water_zoetwatervoorziening/MapServer/WMSServer',
        layers: [
          { id: '6', label: 'Strategische drinkwaterreserves' },
          { id: '7', label: 'Grondwaterbeschermingsgebieden' },
          { id: '4', label: 'Verziltinglijn - oppervlaktewater' },
          { id: '5', label: 'Inlaatgebieden - oppervlaktewater' },
          { id: '3', label: 'Type hoofdinlaatpunten - oppervlaktewater' },
          { id: '8', label: 'Waterbassins zonder kassen' },
          { id: '9', label: 'Waterbassins met kassen' },
        ]
      },
    ]
  },

  {
    id: 'milieu',
    label: 'Milieu',
    color: '#7b3fa0',
    services: [
      {
        id: 'milieu_geluid',
        label: 'Geluid',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Milieu/Milieu_geluid/MapServer/WMSServer',
        layers: [
          { id: '0',  label: 'Geluidscontouren per etmaal 2022' },
          { id: '35', label: 'Geluidscontouren per nacht 2022' },
          { id: '26', label: 'Geluidscontouren per etmaal 2013' },
          { id: '17', label: 'Geluidscontouren per etmaal 2006' },
          { id: '1',  label: 'Milieubeschermingsgebieden voor stilte' },
          { id: '3',  label: '20 Ke-contour Luchthaven Schiphol' },
          { id: '5',  label: 'Geluidszonering Rotterdam Airport' },
          { id: '7',  label: '20 Ke-contour Rotterdam The Hague Airport' },
        ]
      },
      {
        id: 'milieu_gpp',
        label: 'Geluidproductieplafonds',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Milieu/Milieu_geluidproductieplafonds/MapServer/WMSServer',
        layers: [
          { id: '0', label: 'Geluidproductieplafonds' },
        ]
      },
      {
        id: 'milieu_lucht',
        label: 'Luchtkwaliteit',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Milieu/Milieu_luchtkwaliteit/MapServer/WMSServer',
        layers: [
          { id: '95',  label: 'NO2 2026' },
          { id: '87',  label: 'NO2 2025' },
          { id: '17',  label: 'NO2 2017' },
          { id: '13',  label: 'NO2 2016' },
          { id: '0',   label: 'NO2 2009' },
          { id: '48',  label: 'PM10 2025' },
          { id: '46',  label: 'PM10 2024' },
          { id: '38',  label: 'PM10 2022' },
          { id: '30',  label: 'PM10 2019' },
          { id: '4',   label: 'PM10 2009' },
          { id: '102', label: 'PM2.5 2025' },
          { id: '89',  label: 'PM2.5 2024' },
          { id: '60',  label: 'PM2.5 2022' },
          { id: '37',  label: 'PM2.5 2019' },
          { id: '99',  label: 'EC 2025' },
          { id: '91',  label: 'EC 2024' },
          { id: '82',  label: 'EC 2023' },
          { id: '93',  label: 'Fietspaden NO2 2019' },
          { id: '94',  label: 'Fietspaden PM10 2019' },
        ]
      },
      {
        id: 'milieu_luchtvaart',
        label: 'Luchtvaart',
        wmsUrl: 'https://geoservices.zuid-holland.nl/arcgis/rest/services/Milieu/Milieu_luchtvaart/MapServer/WMSServer',
        layers: [
          { id: '1',  label: 'Luchthavens' },
          { id: '0',  label: 'Luchthavens vergund door PZH' },
          { id: '4',  label: 'RTHA - Plaatsgebonden risico' },
          { id: '9',  label: 'LIB 1: Sloopzone woningen externe veiligheid' },
          { id: '10', label: 'LIB 2: Sloopzone woningen geluid' },
          { id: '11', label: 'LIB 3: Beperkingengebied kwetsbare objecten' },
          { id: '12', label: 'LIB 4: Beperkingengebied geluidgevoelige gebouwen' },
          { id: '13', label: 'LIB 5: Afwegingsgebied geluid en externe veiligheid' },
          { id: '14', label: 'Schiphol beperking bebouwing - LIB 1-5' },
          { id: '15', label: 'Schiphol hoogtebeperking maatgevende toetshoogte' },
        ]
      },
    ]
  },
];
