// shared/mca-criteria.js — Single source of truth for MCA criteria
// Used by both gebiedsviewer and multi-criteria-analysis

const MCA_CRITERIA = [
  { key: 'verzilting',       label: 'Verzilting',       color: [0, 150, 136],  weightKey: 'w_verzilting' },
  { key: 'bodemdaling',      label: 'Bodemdaling',      color: [239, 83, 80],  weightKey: 'w_bodemdaling' },
  { key: 'wateroverlast',    label: 'Wateroverlast',    color: [30, 136, 229], weightKey: 'w_wateroverlast' },
  { key: 'boerenlandvogels', label: 'Boerenlandvogels', color: [255, 179, 0],  weightKey: 'w_boerenlandvogels' },
  { key: 'peilgebieden',     label: 'Peilgebieden',     color: [142, 68, 173], weightKey: 'w_peilgebieden' },
];
