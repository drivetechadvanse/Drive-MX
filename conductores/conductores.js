import { ConductoresPanel } from './components/ConductoresPanel.js';
import * as ConductoresServices from './services/conductoresService.js';

export { ConductoresPanel, ConductoresServices };

globalThis.DriveMxConductores = {
  ConductoresPanel,
  services: ConductoresServices
};
